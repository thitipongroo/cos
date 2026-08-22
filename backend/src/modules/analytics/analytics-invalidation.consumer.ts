// Drops a project's cached dashboards when something changes the figures behind them (TDD OQ-42).
//
// WHAT THIS REPLACES
// ------------------
// `AnalyticsService.invalidate()` was implemented, correct, and called by nothing. Its own docstring
// records that it had already been fixed once — an earlier version passed the literal `*` to
// `cache.del()` and deleted nothing, ever — so the method has been rewritten for a caller that never
// existed. The 5-minute TTL was the only bound on staleness: approve an invoice and the executive
// dashboard kept showing the old committed cost for up to five more minutes, with no way to force it.
//
// WHICH EVENTS
// ------------
// Not "everything with a project_id". Exactly the events that feed the ClickHouse tables the
// dashboards read — `analytics.project_cost_daily`, `analytics.procurement_activity_daily` and
// `analytics.site_activity_daily`. That list is not a judgement call: it is the eight Kafka-engine
// tables in `infrastructure/clickhouse/initdb.d/02-kafka-tables.sql`, each feeding one of those three
// through a materialized view. An event that changes nothing in those tables cannot make a cached
// dashboard wrong, and invalidating on it would just cost a Redis SCAN.
//
// > **This does not, on its own, make a dashboard correct.** Those eight ClickHouse tables subscribe
// > to exact topic names — `construction.project.created` — while the producer publishes to
// > `{tenant_id}.construction.project.created.v1` (`KafkaProducer.publish` → `topicForEvent`). A
// > `kafka_topic_list` is an exact list, not a pattern, so none of them has ever received a message
// > and the three daily tables are empty. Recorded as OQ-47; invalidating a cache over an empty
// > warehouse is still the right behaviour, and is what makes the fix visible the day OQ-47 lands.
//
// WHY NO CLS
// ----------
// Unlike the other consumers (OQ-45), this one needs none: `AnalyticsService` is a singleton and
// `invalidate(tenantId, projectId)` takes both explicitly, reaching Redis rather than a tenant-scoped
// table. Nothing here resolves a tenant from ambient context, so there is no context to enter.

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { KafkaConsumer } from '@cos/shared';
import { createLogger } from '@cos/logger';
import type { BaseEventEnvelope } from '@cos/types';
import { AnalyticsService } from './analytics.service';

const logger = createLogger('analytics-invalidation-consumer');

/**
 * The events behind `analytics.project_cost_daily`, `analytics.procurement_activity_daily` and
 * `analytics.site_activity_daily`. Keep this list and `02-kafka-tables.sql` in step: an event added
 * there and not here leaves a dashboard stale for the whole TTL, which is exactly the state this
 * consumer exists to end.
 */
export const INVALIDATING_EVENT_TYPES = [
  'construction.project.created.v1',
  'procurement.po.created.v1',
  'procurement.vendor_invoice.approved.v1',
  'procurement.rfq.created.v1',
  'site.report.submitted.v1',
  'site.inspection.failed.v1',
  'site.issue.created.v1',
  'workforce.checkin.created.v1',
];

type Envelope = BaseEventEnvelope<Record<string, unknown>>;

@Injectable()
export class AnalyticsInvalidationConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly kafka = new KafkaConsumer();

  constructor(private readonly analytics: AnalyticsService) {}

  async onModuleInit(): Promise<void> {
    for (const eventType of INVALIDATING_EVENT_TYPES) {
      this.kafka.on<Record<string, unknown>>(eventType, (event) => this.handle(event));
    }
    await this.kafka.connect({
      groupId: 'analytics-invalidation.shared',
      eventTypes: INVALIDATING_EVENT_TYPES,
      fromBeginning: false,
    });
    logger.info({ eventTypes: INVALIDATING_EVENT_TYPES }, 'AnalyticsInvalidationConsumer started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.kafka
      .disconnect()
      .catch((err: unknown) =>
        logger.error({ err }, 'AnalyticsInvalidationConsumer disconnect error'),
      );
  }

  async handle(event: Envelope): Promise<void> {
    const projectId = event.payload['project_id'];
    if (typeof projectId !== 'string' || projectId === '') {
      // Every event in the list above carries one — the ClickHouse tables declare `project_id` in
      // their payload tuple. A missing one means the payload has drifted from the schema, which is
      // worth a line but is not worth failing and dead-lettering a business event over.
      logger.warn(
        { event_type: event.event_type, tenant_id: event.tenant_id },
        'analytics-invalidation: event carries no project_id, skipping',
      );
      return;
    }

    // invalidate() never throws — it catches its own Redis errors and returns what it managed to
    // remove — so nothing here reaches the DLQ. That is deliberate and matches the read path: a cache
    // store outage must not dead-letter an event that has already changed the database. The entries
    // it could not drop still expire on the 5-minute TTL, which is the behaviour this consumer
    // improves on rather than replaces.
    const removed = await this.analytics.invalidate(event.tenant_id, projectId);
    logger.debug(
      { event_type: event.event_type, tenant_id: event.tenant_id, projectId, removed },
      'analytics-invalidation: cache dropped',
    );
  }
}
