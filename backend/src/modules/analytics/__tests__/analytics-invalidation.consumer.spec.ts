// AnalyticsInvalidationConsumer — TDD OQ-42.

jest.mock('@cos/shared', () => ({
  KafkaConsumer: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import type { BaseEventEnvelope } from '@cos/types';
import {
  AnalyticsInvalidationConsumer,
  INVALIDATING_EVENT_TYPES,
} from '../analytics-invalidation.consumer';
import type { AnalyticsService } from '../analytics.service';

function event(overrides: Partial<BaseEventEnvelope<Record<string, unknown>>> = {}) {
  return {
    event_id: 'evt-1',
    event_type: 'procurement.po.created.v1',
    event_version: '1.0',
    tenant_id: 'tenant-1',
    actor_id: 'user-1',
    occurred_at: '2026-08-22T00:00:00Z',
    correlation_id: 'corr-1',
    payload: { project_id: 'proj-1' },
    ...overrides,
  } as BaseEventEnvelope<Record<string, unknown>>;
}

function build(invalidate = jest.fn().mockResolvedValue(3)) {
  const analytics = { invalidate } as unknown as AnalyticsService;
  return { consumer: new AnalyticsInvalidationConsumer(analytics), invalidate };
}

describe('AnalyticsInvalidationConsumer', () => {
  it('invalidates the event tenant + project', async () => {
    const { consumer, invalidate } = build();
    await consumer.handle(event());
    expect(invalidate).toHaveBeenCalledWith('tenant-1', 'proj-1');
  });

  it('skips an event with no project_id rather than dead-lettering it', async () => {
    const { consumer, invalidate } = build();
    // A business event that has already changed the database must not be retried into the DLQ
    // because a cache key could not be derived from it.
    await expect(consumer.handle(event({ payload: {} }))).resolves.toBeUndefined();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('subscribes with its own consumer group', async () => {
    const { consumer } = build();
    await consumer.onModuleInit();
    const kafka = (consumer as unknown as { kafka: { on: jest.Mock; connect: jest.Mock } }).kafka;
    expect(kafka.on.mock.calls.map((c) => c[0])).toEqual(INVALIDATING_EVENT_TYPES);
    expect(kafka.connect).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'analytics-invalidation.shared' }),
    );
  });

  // The list is not a judgement call — it is derived from the ClickHouse tables that feed the three
  // daily tables the dashboards read. If someone adds a ninth Kafka-engine table and forgets this
  // consumer, that dashboard goes stale for the whole TTL with nothing to say so. This test is what
  // says so.
  it('covers exactly the events feeding the analytics warehouse', () => {
    const ddl = readFileSync(
      join(__dirname, '../../../../../infrastructure/clickhouse/initdb.d/02-kafka-tables.sql'),
      'utf8',
    );

    // Since OQ-47 the DDL subscribes by PATTERN — `^[^.]+\.{event_type}$`, where the leading group
    // is the per-tenant prefix (§7.3). Unwrap it back to the canonical event type. Before OQ-47 these
    // were bare literal names that matched no real topic, which is why the warehouse was empty.
    const events = [...ddl.matchAll(/kafka_topic_list\s*=\s*'([^']+)'/g)]
      .map((m) => /^\^\[\^\.\]\+\\\.(.+)\$$/.exec(m[1]))
      .map((m) => {
        expect(m).not.toBeNull();
        return m![1].replaceAll('\\.', '.');
      });
    expect(events.length).toBeGreaterThan(0);

    expect([...INVALIDATING_EVENT_TYPES].sort()).toEqual([...events].sort());
  });
});
