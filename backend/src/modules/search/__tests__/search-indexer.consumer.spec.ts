// SearchIndexerConsumer — TDD OQ-22 (indexing moved onto the outbox) and OQ-45 (a Kafka handler
// must enter CLS itself, or every tenant-scoped read inside it throws).

jest.mock('@cos/kafka', () => ({
  KafkaConsumer: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import type { BaseEventEnvelope } from '@cos/types';
import { SearchIndexerConsumer } from '../search-indexer.consumer';
import type { SearchIndexRepository, ProjectIndexRow } from '../search-index.repository';
import type { SearchIndexerService } from '../search-indexer.service';
import { clsTenantId, clsUserId } from '../../../shared/context/cls-context';

const TENANT = 'tenant-uuid-001';
const ACTOR = 'user-uuid-001';

const projectRow: ProjectIndexRow = {
  project_id: 'proj-uuid-001',
  tenant_id: TENANT,
  project_code: 'P-001',
  project_name: 'Riverside Tower',
  project_type: 'COMMERCIAL',
  status: 'ACTIVE',
  updated_at: new Date('2026-08-22T00:00:00Z'),
};

function event(overrides: Partial<BaseEventEnvelope<Record<string, unknown>>> = {}) {
  return {
    event_id: 'evt-1',
    event_type: 'construction.project.created.v1',
    event_version: '1.0',
    tenant_id: TENANT,
    actor_id: ACTOR,
    occurred_at: '2026-08-22T00:00:00Z',
    correlation_id: 'corr-1',
    payload: { project_id: 'proj-uuid-001' },
    ...overrides,
  } as BaseEventEnvelope<Record<string, unknown>>;
}

function build(
  repo: Partial<SearchIndexRepository> = {},
  indexer: Partial<SearchIndexerService> = {},
) {
  const repoDouble = {
    findProject: jest.fn().mockResolvedValue(projectRow),
    findSiteReport: jest.fn().mockResolvedValue(null),
    findIssue: jest.fn().mockResolvedValue(null),
    ...repo,
  } as unknown as SearchIndexRepository;
  const indexerDouble = {
    indexProject: jest.fn().mockResolvedValue(undefined),
    indexSiteReport: jest.fn().mockResolvedValue(undefined),
    indexIssue: jest.fn().mockResolvedValue(undefined),
    ...indexer,
  } as unknown as SearchIndexerService;
  return {
    consumer: new SearchIndexerConsumer(repoDouble, indexerDouble),
    repo: repoDouble,
    indexer: indexerDouble,
  };
}

describe('SearchIndexerConsumer', () => {
  // ── OQ-45 ────────────────────────────────────────────────────────────────
  // The guard that matters most. TenantPrismaService resolves its tenant from CLS and from nowhere
  // else — `moduleRef.registerRequestByContextId({ tenantId })` does NOT reach it — so a handler
  // that does not enter CLS throws "Tenant context missing from request" on its first query. There
  // is no request here to inherit a context from, and the consumer's own tests cannot notice the
  // difference unless they assert on the context the repository actually sees.
  describe('tenant context', () => {
    it('runs the repository read inside the EVENT tenant CLS context', async () => {
      let seenTenant: string | undefined;
      let seenUser: string | undefined;
      const { consumer } = build({
        findProject: jest.fn().mockImplementation(async () => {
          seenTenant = clsTenantId();
          seenUser = clsUserId();
          return projectRow;
        }),
      });

      await consumer.handleProject(event());

      expect(seenTenant).toBe(TENANT);
      expect(seenUser).toBe(ACTOR);
    });

    it('leaves no context behind after the handler returns', async () => {
      const { consumer } = build();
      await consumer.handleProject(event());
      // cls.run scopes the context to the callback. enterWith would leak this tenant into the
      // consumer's polling loop, where the NEXT event — another tenant's — would inherit it.
      expect(clsTenantId()).toBe('');
    });

    it('processes two tenants concurrently without either seeing the other', async () => {
      const seen: string[] = [];
      let release: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let first = true;

      const { consumer } = build({
        findProject: jest.fn().mockImplementation(async () => {
          const isFirst = first;
          first = false;
          // Hold the first event open across the second one's whole handler.
          if (isFirst) await gate;
          seen.push(clsTenantId());
          return projectRow;
        }),
      });

      const a = consumer.handleProject(event({ tenant_id: 'tenant-A' }));
      const b = consumer.handleProject(event({ tenant_id: 'tenant-B' }));
      await b;
      release?.();
      await a;

      expect(seen).toEqual(['tenant-B', 'tenant-A']);
    });
  });

  // ── OQ-22 ────────────────────────────────────────────────────────────────
  describe('indexing', () => {
    it('indexes the CURRENT row, not the event payload', async () => {
      const { consumer, repo, indexer } = build();
      // The payload carries an id and nothing else; a stale name in an old event must not be able
      // to overwrite the index with what the project used to be called.
      await consumer.handleProject(event({ payload: { project_id: 'proj-uuid-001' } }));
      expect(repo.findProject).toHaveBeenCalledWith('proj-uuid-001');
      expect(indexer.indexProject).toHaveBeenCalledWith(projectRow);
    });

    it('PROPAGATES an OpenSearch failure so KafkaConsumer can retry and then DLQ it', async () => {
      const { consumer } = build(
        {},
        { indexProject: jest.fn().mockRejectedValue(new Error('OpenSearch down')) },
      );
      // Swallowing this is exactly what the inline call in ProjectService used to do, and why a
      // failed index write was unrecoverable.
      await expect(consumer.handleProject(event())).rejects.toThrow('OpenSearch down');
    });

    it('does not throw when the row is gone — a retry cannot conjure one', async () => {
      const { consumer, indexer } = build({ findProject: jest.fn().mockResolvedValue(null) });
      await expect(consumer.handleProject(event())).resolves.toBeUndefined();
      expect(indexer.indexProject).not.toHaveBeenCalled();
    });

    it('skips an event whose payload carries no id', async () => {
      const { consumer, repo } = build();
      await consumer.handleProject(event({ payload: {} }));
      expect(repo.findProject).not.toHaveBeenCalled();
    });

    it('routes site reports and issues to their own index', async () => {
      const report = { report_id: 'rep-1' } as never;
      const issue = { issue_id: 'iss-1' } as never;
      const { consumer, indexer } = build({
        findSiteReport: jest.fn().mockResolvedValue(report),
        findIssue: jest.fn().mockResolvedValue(issue),
      });

      await consumer.handleSiteReport(
        event({ event_type: 'site.report.created.v1', payload: { report_id: 'rep-1' } }),
      );
      await consumer.handleIssue(
        event({ event_type: 'site.issue.created.v1', payload: { issue_id: 'iss-1' } }),
      );

      expect(indexer.indexSiteReport).toHaveBeenCalledWith(report);
      expect(indexer.indexIssue).toHaveBeenCalledWith(issue);
    });
  });

  describe('subscription', () => {
    it('subscribes to every event that changes an indexed row', async () => {
      const { consumer } = build();
      await consumer.onModuleInit();

      const kafka = (consumer as unknown as { kafka: { on: jest.Mock; connect: jest.Mock } }).kafka;
      expect(kafka.on.mock.calls.map((c) => c[0])).toEqual([
        'construction.project.created.v1',
        'construction.project.updated.v1',
        'construction.project.status_changed.v1',
        'site.report.created.v1',
        'site.issue.created.v1',
      ]);
      // A group of its own: sharing finance.shared would make one consumer's offset commits hide
      // events from the other.
      expect(kafka.connect).toHaveBeenCalledWith(
        expect.objectContaining({ groupId: 'search-indexer.shared' }),
      );
    });

    it('each registered callback routes to the handler for its event', async () => {
      // `on` is given a closure per event type, and a closure wired to the wrong handler subscribes
      // correctly and then indexes the wrong document — the subscription assertion above cannot see
      // that. So each closure is invoked and followed to the repository call it should make.
      const { consumer, repo } = build();
      await consumer.onModuleInit();
      const kafka = (consumer as unknown as { kafka: { on: jest.Mock } }).kafka;
      const routed = Object.fromEntries(
        kafka.on.mock.calls.map((c) => [c[0] as string, c[1] as (e: unknown) => Promise<void>]),
      );

      await routed['construction.project.created.v1']!(event({ payload: { project_id: 'p-1' } }));
      expect(repo.findProject).toHaveBeenCalledWith('p-1');

      await routed['site.report.created.v1']!(event({ payload: { report_id: 'r-1' } }));
      expect(repo.findSiteReport).toHaveBeenCalledWith('r-1');

      await routed['site.issue.created.v1']!(event({ payload: { issue_id: 'i-1' } }));
      expect(repo.findIssue).toHaveBeenCalledWith('i-1');
    });

    it('disconnects on shutdown, and a failing disconnect does not throw out of it', async () => {
      // onModuleDestroy runs while Nest is tearing the app down. Throwing here aborts the rest of
      // the shutdown — other modules' destroy hooks never run — to report a broker we are leaving
      // anyway.
      const { consumer } = build();
      await consumer.onModuleInit();
      const kafka = (consumer as unknown as { kafka: { disconnect: jest.Mock } }).kafka;

      await expect(consumer.onModuleDestroy()).resolves.toBeUndefined();
      expect(kafka.disconnect).toHaveBeenCalled();

      kafka.disconnect.mockRejectedValueOnce(new Error('broker already gone'));
      await expect(consumer.onModuleDestroy()).resolves.toBeUndefined();
    });
  });
});
