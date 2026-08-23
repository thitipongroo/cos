// Integration tests: full-text search — Phases 3 and 6
//
// §35.13 ESC-31 closes two cases that had sat as PLANNED precisely because the OpenSearch client is
// stubbed for every other integration spec:
//   TC-P03-INT-004  Full-text search over `project_name` and `project_code`
//   TC-P06-INT-002  Site reports and issues are indexed for full-text search
//
// A stub cannot answer either question. The value of these cases is whether the QUERY the service
// builds actually matches the DOCUMENT the service indexed — analyzer behaviour, field boosting and
// term-vs-match semantics all live inside OpenSearch. So this spec un-mocks the client, points it
// at a real container, and drives the real services: only the repository is stubbed, because these
// cases are about the search index, not about SQL.
//
// It runs its own OpenSearch container rather than adding one to startIntegrationInfra, so the
// other 13 integration suites stay as fast as they are.

jest.unmock('@opensearch-project/opensearch');

import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

import { ProjectService } from '../src/modules/project/project.service';
import type { ProjectRepository, ProjectRow } from '../src/modules/project/project.repository';
import { SiteOpsService } from '../src/modules/site-ops/site-ops.service';
import type {
  SiteOpsRepository,
  SiteReportRow,
  IssueRow,
} from '../src/modules/site-ops/site-ops.repository';

const TENANT_A = 'aaaaaaaa-0001-4000-8000-000000000001';
const TENANT_B = 'bbbbbbbb-0001-4000-8000-000000000001';
const PROJECT_ID = 'cccccccc-0001-4000-8000-000000000001';

/** OpenSearch is near-real-time: a document is not searchable until the index is refreshed. */
async function refresh(index: string, node: string): Promise<void> {
  const res = await fetch(`${node}/${index}/_refresh`, { method: 'POST' });
  if (!res.ok) throw new Error(`refresh ${index} failed: ${res.status}`);
}

/**
 * Both indexProject and indexSiteReport swallow their errors by design (a search-index failure
 * must not block the primary write). That makes a silent indexing failure look exactly like a
 * search that found nothing, so every fixture load asserts the documents actually landed.
 */
async function assertIndexed(index: string, node: string, expected: number): Promise<void> {
  const res = await fetch(`${node}/${index}/_count`);
  if (!res.ok) throw new Error(`count ${index} failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { count: number };
  if (body.count !== expected) {
    throw new Error(`${index}: indexed ${body.count} docs, expected ${expected}`);
  }
}

describe('Full-text search (Testcontainers — OpenSearch)', () => {
  let container: StartedTestContainer;
  let node: string;

  beforeAll(async () => {
    container = await new GenericContainer('opensearchproject/opensearch:2.17.1')
      .withEnvironment({
        'discovery.type': 'single-node',
        // The demo security plugin forces TLS + credentials; disabling it keeps the client config
        // identical to the one the services build (plain http, no auth).
        DISABLE_SECURITY_PLUGIN: 'true',
        DISABLE_INSTALL_DEMO_CONFIG: 'true',
        OPENSEARCH_JAVA_OPTS: '-Xms512m -Xmx512m',
      })
      .withExposedPorts(9200)
      .withWaitStrategy(Wait.forHttp('/_cluster/health', 9200).forStatusCode(200))
      .withStartupTimeout(180_000)
      .start();

    node = `http://${container.getHost()}:${container.getMappedPort(9200)}`;
    // The services read this at construction time.
    process.env['OPENSEARCH_URL'] = node;
  }, 300_000);

  afterAll(async () => {
    delete process.env['OPENSEARCH_URL'];
    await container?.stop();
  });

  // ── TC-P03-INT-004 ────────────────────────────────────────────────────────

  describe('TC-P03-INT-004 — projects are searchable by name and by code', () => {
    const rows: Record<string, ProjectRow> = {};

    const makeProject = (id: string, code: string, name: string): ProjectRow =>
      ({
        project_id: id,
        tenant_id: TENANT_A,
        project_code: code,
        project_name: name,
        project_type: 'COMMERCIAL',
        status: 'ACTIVE',
        updated_at: new Date('2026-06-08T00:00:00Z'),
      }) as unknown as ProjectRow;

    let service: ProjectService;
    let repo: jest.Mocked<Pick<ProjectRepository, 'findById' | 'list'>>;

    beforeAll(async () => {
      rows['p1'] = makeProject(PROJECT_ID, 'PROJ-BKK-001', 'Bangkok Riverside Tower');
      rows['p2'] = makeProject(
        'cccccccc-0002-4000-8000-000000000001',
        'PROJ-CNX-002',
        'Chiang Mai Logistics Hub',
      );
      // Same searchable words, different tenant — must never surface for tenant A.
      const otherTenant = {
        ...makeProject(
          'cccccccc-0003-4000-8000-000000000001',
          'PROJ-BKK-999',
          'Bangkok Rival Tower',
        ),
        tenant_id: TENANT_B,
      };

      repo = {
        findById: jest.fn(
          async (id: string) =>
            rows[Object.keys(rows).find((k) => rows[k]!.project_id === id) ?? ''] ?? null,
        ),
        list: jest.fn(async () => ({ items: [], nextCursor: null })),
      } as unknown as jest.Mocked<Pick<ProjectRepository, 'findById' | 'list'>>;

      service = new ProjectService(
        repo as unknown as ProjectRepository,
        {
          tenantId: TENANT_A,
        } as never,
      );

      // Index through the service's own private path — the whole point is that the document the
      // service writes is the document its query later has to match.
      const indexProject = (
        service as unknown as { indexProject(p: ProjectRow): Promise<void> }
      ).indexProject.bind(service);
      await indexProject(rows['p1']!);
      await indexProject(rows['p2']!);
      await indexProject(otherTenant as ProjectRow);
      await refresh('cos_projects', node);
      await assertIndexed('cos_projects', node, 3);
    }, 120_000);

    it('finds a project by a partial name', async () => {
      const result = await service.list({ q: 'Riverside' } as never);
      expect(result.items.map((p) => p.project_id)).toEqual([PROJECT_ID]);
    });

    it('finds a project by its code', async () => {
      const result = await service.list({ q: 'PROJ-CNX-002' } as never);
      expect(result.items.map((p) => p.project_code)).toContain('PROJ-CNX-002');
    });

    it('is case-insensitive on the name', async () => {
      const result = await service.list({ q: 'bangkok' } as never);
      expect(result.items.map((p) => p.project_id)).toContain(PROJECT_ID);
    });

    it('never returns another tenant’s project', async () => {
      // "Bangkok" matches a tenant B document too; the tenant_id term filter must exclude it.
      const result = await service.list({ q: 'Bangkok' } as never);
      for (const p of result.items) {
        expect(p.tenant_id).toBe(TENANT_A);
      }
      expect(result.items.map((p) => p.project_id)).not.toContain(
        'cccccccc-0003-4000-8000-000000000001',
      );
    });

    it('returns nothing for a term that matches no document', async () => {
      const result = await service.list({ q: 'zzzznomatchzzzz' } as never);
      expect(result.items).toEqual([]);
      // The empty-hit branch returns early; it must not fall through to the DB list.
      expect(repo.list).not.toHaveBeenCalled();
    });

    it('falls back to the DB list when the search backend is unreachable', async () => {
      // The documented degradation: search is best-effort, the list endpoint must still answer.
      const broken = new ProjectService(
        repo as unknown as ProjectRepository,
        {
          tenantId: TENANT_A,
        } as never,
      );
      (broken as unknown as { openSearch: { search: () => Promise<never> } }).openSearch = {
        search: async () => {
          throw new Error('connection refused');
        },
      } as never;

      await broken.list({ q: 'Riverside' } as never);
      expect(repo.list).toHaveBeenCalled();
    });
  });

  // ── TC-P06-INT-002 ────────────────────────────────────────────────────────

  describe('TC-P06-INT-002 — site reports and issues are indexed for full-text search', () => {
    let service: SiteOpsService;
    let repo: { listSiteReports: jest.Mock; listIssues: jest.Mock };

    const report = (id: string, summary: string, weather: string): SiteReportRow =>
      ({
        report_id: id,
        project_id: PROJECT_ID,
        tenant_id: TENANT_A,
        report_date: new Date('2026-06-08'),
        submitted_by: 'user-1',
        status: 'DRAFT',
        summary,
        weather,
        manpower_count: 10,
        client_submitted_at: null,
        server_received_at: new Date(),
        modified_at: new Date(),
      }) as unknown as SiteReportRow;

    const issue = (id: string, title: string, description: string): IssueRow =>
      ({
        issue_id: id,
        project_id: PROJECT_ID,
        tenant_id: TENANT_A,
        report_id: null,
        title,
        description,
        severity: 'HIGH',
        status: 'OPEN',
        assigned_to: null,
        resolution_note: null,
        client_submitted_at: null,
        modified_at: new Date(),
        created_at: new Date(),
      }) as unknown as IssueRow;

    const REPORT_A = 'dddddddd-0001-4000-8000-000000000001';
    const ISSUE_A = 'eeeeeeee-0001-4000-8000-000000000001';

    beforeAll(async () => {
      const reports = [
        report(REPORT_A, 'Concrete pour completed on level 3', 'sunny'),
        report('dddddddd-0002-4000-8000-000000000001', 'Rebar delivery delayed', 'rainy'),
      ];
      const issues = [
        issue(ISSUE_A, 'Crack in foundation wall', 'Hairline crack observed near column C4'),
        issue('eeeeeeee-0002-4000-8000-000000000001', 'Scaffold missing guardrail', 'North face'),
      ];

      repo = {
        listSiteReports: jest.fn(async () => ({ rows: reports, total: reports.length })),
        listIssues: jest.fn(async () => ({ rows: issues, total: issues.length })),
      };

      service = new SiteOpsService(
        repo as unknown as SiteOpsRepository,
        {
          tenantId: TENANT_A,
          userId: 'user-1',
          correlationId: 'corr-1',
        } as never,
      );

      const s = service as unknown as {
        indexSiteReport(r: SiteReportRow): Promise<void>;
        indexIssue(i: IssueRow): Promise<void>;
      };
      for (const r of reports) await s.indexSiteReport(r);
      for (const i of issues) await s.indexIssue(i);
      await refresh('site-reports', node);
      await refresh('site-issues', node);
      await assertIndexed('site-reports', node, 2);
      await assertIndexed('site-issues', node, 2);
    }, 120_000);

    it('finds a site report by a word in its summary', async () => {
      const result = await service.listSiteReports({ q: 'Concrete', page: 1, limit: 20 });
      expect(result.items.map((r) => r.report_id)).toEqual([REPORT_A]);
    });

    it('finds a site report by its weather field', async () => {
      const result = await service.listSiteReports({ q: 'rainy', page: 1, limit: 20 });
      expect(result.items.map((r) => r.report_id)).toEqual([
        'dddddddd-0002-4000-8000-000000000001',
      ]);
    });

    it('finds an issue by a word in its title', async () => {
      const result = await service.listIssues({ q: 'foundation', page: 1, limit: 20 });
      expect(result.items.map((i) => i.issue_id)).toEqual([ISSUE_A]);
    });

    it('finds an issue by a word only present in its description', async () => {
      // description is a searched field; a title-only index would miss this.
      const result = await service.listIssues({ q: 'Hairline', page: 1, limit: 20 });
      expect(result.items.map((i) => i.issue_id)).toEqual([ISSUE_A]);
    });

    it('returns nothing for a term present in neither index', async () => {
      const reports = await service.listSiteReports({ q: 'zzzznomatchzzzz', page: 1, limit: 20 });
      expect(reports.items).toEqual([]);
      const issues = await service.listIssues({ q: 'zzzznomatchzzzz', page: 1, limit: 20 });
      expect(issues.items).toEqual([]);
    });
  });
});
