// Keeps OpenSearch in step with PostgreSQL by consuming the domain events the outbox already
// publishes (TDD OQ-22).
//
// WHAT THIS REPLACES
// ------------------
// ProjectService and SiteOpsService called OpenSearch inline, inside the request, and swallowed the
// failure. Product-owner decision 2026-08-22: route indexing through the outbox instead. That does
// three things the inline call could not —
//
//   Retry.    KafkaConsumer retries three times with exponential backoff before giving up.
//   Recover.  What it still cannot deliver goes to the DLQ, so a lost document is a message someone
//             can replay, not a warning in yesterday's logs. Before this there was no reindex path
//             of any kind — no job, no script, no runbook.
//   Rebuild.  Replaying a topic from the beginning rebuilds the index, because each handler reads
//             the CURRENT row rather than trusting the event's payload.
//
// The cost is that a document appears a moment after the write commits instead of during it. The
// read paths already tolerate that: ProjectService.searchProjects falls back to the paged database
// list when OpenSearch errors or returns nothing useful, and search is a filter over records the
// list endpoints serve from PostgreSQL regardless.
//
// NOT subscribed: `construction.project.archived.v1` and the deletion of anything. Neither service
// deletes rows — a finished project reaches COMPLETED through status_changed, which IS subscribed —
// so there is no document to remove.

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { KafkaConsumer } from '@cos/shared';
import { createLogger } from '@cos/logger';
import type { BaseEventEnvelope } from '@cos/types';
import { runInTenantContext } from '../../shared/context/run-in-tenant-context';
import { SearchIndexRepository } from './search-index.repository';
import { SearchIndexerService } from './search-indexer.service';

const logger = createLogger('search-indexer-consumer');

const PROJECT_EVENTS = [
  'construction.project.created.v1',
  'construction.project.updated.v1',
  'construction.project.status_changed.v1',
] as const;

const SUBSCRIBED_EVENT_TYPES = [
  ...PROJECT_EVENTS,
  'site.report.created.v1',
  'site.issue.created.v1',
];

type Envelope = BaseEventEnvelope<Record<string, unknown>>;

@Injectable()
export class SearchIndexerConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly kafka = new KafkaConsumer();

  constructor(
    private readonly repo: SearchIndexRepository,
    private readonly indexer: SearchIndexerService,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const eventType of PROJECT_EVENTS) {
      this.kafka.on<Record<string, unknown>>(eventType, (event) => this.handleProject(event));
    }
    this.kafka.on<Record<string, unknown>>('site.report.created.v1', (event) =>
      this.handleSiteReport(event),
    );
    this.kafka.on<Record<string, unknown>>('site.issue.created.v1', (event) =>
      this.handleIssue(event),
    );

    await this.kafka.connect({
      groupId: 'search-indexer.shared',
      eventTypes: SUBSCRIBED_EVENT_TYPES,
      fromBeginning: false,
    });
    logger.info({ eventTypes: SUBSCRIBED_EVENT_TYPES }, 'SearchIndexerConsumer started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.kafka
      .disconnect()
      .catch((err: unknown) => logger.error({ err }, 'SearchIndexerConsumer disconnect error'));
  }

  async handleProject(event: Envelope): Promise<void> {
    await this.withRow(event, 'project_id', async (id) => {
      const row = await this.repo.findProject(id);
      if (row) await this.indexer.indexProject(row);
      return row !== null;
    });
  }

  async handleSiteReport(event: Envelope): Promise<void> {
    await this.withRow(event, 'report_id', async (id) => {
      const row = await this.repo.findSiteReport(id);
      if (row) await this.indexer.indexSiteReport(row);
      return row !== null;
    });
  }

  async handleIssue(event: Envelope): Promise<void> {
    await this.withRow(event, 'issue_id', async (id) => {
      const row = await this.repo.findIssue(id);
      if (row) await this.indexer.indexIssue(row);
      return row !== null;
    });
  }

  /**
   * Shared shape: pull the id out of the payload, enter the event's tenant context, load and index.
   *
   * runInTenantContext is not optional. TenantPrismaService resolves its tenant from CLS and from
   * nowhere else, and a Kafka handler runs outside every request, so without it the first query
   * throws "Tenant context missing from request" (OQ-45).
   *
   * A row that is not found is NOT an error and must not reach the DLQ: a project cancelled and
   * hard-deleted before its event was delivered has nothing to index, and retrying will not conjure
   * one. Anything else — the read failing, OpenSearch refusing the write — propagates, which is the
   * whole point of moving off the inline call.
   */
  private async withRow(
    event: Envelope,
    idField: string,
    fn: (id: string) => Promise<boolean>,
  ): Promise<void> {
    const id = event.payload[idField];
    if (typeof id !== 'string' || id === '') {
      logger.warn(
        { event_type: event.event_type, tenant_id: event.tenant_id, idField },
        'search-indexer: event payload carries no id, skipping',
      );
      return;
    }

    const found = await runInTenantContext(
      { tenantId: event.tenant_id, userId: event.actor_id },
      () => fn(id),
    );

    if (!found) {
      logger.info(
        { event_type: event.event_type, tenant_id: event.tenant_id, id },
        'search-indexer: row no longer exists, nothing to index',
      );
    }
  }
}
