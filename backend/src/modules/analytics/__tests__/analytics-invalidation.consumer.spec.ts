// AnalyticsInvalidationConsumer — TDD OQ-42.

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
  it('the registered callback is the one that invalidates', async () => {
    // `on` is handed a closure per event type. Asserting only the NAMES it subscribed to cannot see
    // a closure wired to nothing — the subscription would look right and no cache would ever be
    // dropped, which is exactly the shape of the fault this consumer exists to fix.
    const { consumer, invalidate } = build();
    await consumer.onModuleInit();
    const kafka = (consumer as unknown as { kafka: { on: jest.Mock } }).kafka;
    const [, callback] = kafka.on.mock.calls[0] as [string, (e: unknown) => Promise<void>];

    await callback(event());
    expect(invalidate).toHaveBeenCalledWith('tenant-1', 'proj-1');
  });

  it('disconnects on shutdown, and a failing disconnect does not throw out of it', async () => {
    // onModuleDestroy runs while Nest tears the app down. Throwing here aborts the rest of the
    // shutdown — other modules' destroy hooks never run — to report a broker we are leaving anyway.
    const { consumer } = build();
    await consumer.onModuleInit();
    const kafka = (consumer as unknown as { kafka: { disconnect: jest.Mock } }).kafka;

    await expect(consumer.onModuleDestroy()).resolves.toBeUndefined();
    expect(kafka.disconnect).toHaveBeenCalled();

    kafka.disconnect.mockRejectedValueOnce(new Error('broker already gone'));
    await expect(consumer.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('covers exactly the events feeding the analytics warehouse', () => {
    // Read from the Go worker's dispatch, not from 02-kafka-tables.sql: the Kafka engine tables that
    // file used to hold were deleted when ingestion moved to services/analytics-worker (2026-08-23),
    // so the DDL this test used to parse now contains only the note explaining their absence.
    const dispatch = readFileSync(
      join(__dirname, '../../../../../services/analytics-worker/internal/metrics/consumer.go'),
      'utf8',
    );
    const body = dispatch.slice(dispatch.indexOf('switch envelope.EventType {'));
    const events = [...body.matchAll(/^	case "([a-z0-9_.]+)":$/gm)].map((m) => m[1]!);

    expect(events.length).toBeGreaterThan(0);
    expect([...INVALIDATING_EVENT_TYPES].sort()).toEqual([...events].sort());
  });
});
