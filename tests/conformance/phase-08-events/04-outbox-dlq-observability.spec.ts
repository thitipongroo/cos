/**
 * Phase 8 — outbox pattern, DLQ retry and observability
 * (master:3115-3134, 3165-3167), plus the boundary with Phase 17 (master:3142-3149).
 */
import { read } from '../helpers';

const outboxWriter = read('packages/@cos/shared/src/kafka/outbox.ts');
// The poller is NOT in @cos/shared — Rule 34(c) forbids it there, and until 2026-08-27 a duplicate
// lived in the SDK anyway. This file used to read that duplicate for all three poller assertions,
// so they were describing a class no deployment ever ran while the one in EventsModule went
// unchecked. See tests/conformance/phase-08-events/06-rule-34.spec.ts.
const poller = read('backend/src/shared/events/outbox-poller.service.ts');
const outboxMigration = read(
  'backend/prisma/migrations/20260531000002_outbox_events/migration.sql',
);
const dlq = read('packages/@cos/shared/src/kafka/dlq.ts');
const consumer = read('packages/@cos/shared/src/kafka/consumer.ts');
const metrics = read('packages/@cos/shared/src/kafka/metrics.ts');

describe('Phase 8 · outbox pattern (master:3115-3124)', () => {
  it('the poller runs every 500ms (master:3158)', () => {
    expect(poller).toMatch(/\b500\b/);
  });

  it('it publishes only unpublished rows and marks them afterwards (master:3158-3159)', () => {
    // Reading the SQL, not the word: master:3159 is "marks published=true after successful Kafka
    // produce", and a file merely containing the string "published" satisfied nothing.
    expect(poller).toMatch(/published\s*=\s*(true|TRUE)/);
    expect(poller).toMatch(/published\s*=\s*(false|FALSE)/);
  });

  it('the writer and the poller address the same table (master:3157-3158)', () => {
    // Cross-source: two files that must name one table and are never loaded together.
    expect(outboxWriter).toContain('platform.outbox_events');
    expect(poller).toContain('platform.outbox_events');
  });

  it('the table carries the columns master declares (master:3155-3156)', () => {
    // Against the MIGRATION, which is what actually creates the table. The previous version of this
    // case read a TypeScript file and passed on any occurrence of the words anywhere in it —
    // including in a comment.
    for (const column of ['event_type', 'payload', 'published', 'created_at', 'published_at']) {
      expect(outboxMigration).toMatch(
        new RegExp(`^\\s*${column}\\s+(UUID|VARCHAR|JSONB|BOOLEAN|TIMESTAMPTZ)`, 'im'),
      );
    }
  });
});

describe('Phase 8 · DLQ retry (master:3126-3129)', () => {
  it('retries three times with 1s / 5s / 30s backoff', () => {
    // The exact ladder master states. A retry policy that is merely "exponential" would satisfy a
    // vaguer test while waiting minutes on the third attempt.
    const source = `${dlq}\n${consumer}`;
    expect(source).toMatch(/1000/);
    expect(source).toMatch(/5000/);
    expect(source).toMatch(/30000/);
  });

  it('publishes to the DLQ after the retries are exhausted', () => {
    expect(dlq).toMatch(/dlq/i);
  });
});

describe('Phase 8 · OpenTelemetry propagation (master:3166)', () => {
  it('the producer writes W3C traceparent into the Kafka headers', () => {
    // Without it a trace stops at the publish and resumes as a new, unrelated trace in the consumer.
    expect(read('packages/@cos/shared/src/kafka/producer.ts')).toContain('traceparent');
  });
});

describe('Phase 8 · Prometheus metrics (master:3131-3134, 3167)', () => {
  it('counts producer errors (master:3133)', () => {
    expect(metrics).toContain('kafka_producer_error_total');
  });

  it('gauges DLQ depth so it can alert above zero (master:3134)', () => {
    expect(metrics).toMatch(/kafka_dlq_depth/);
  });

  it('gauges consumer lag (master:4316)', () => {
    // master states this metric TWICE and disagrees with itself: 3132 calls it
    // `consumer_group_lag`, while 4316 — in Phase 15, which owns the observability metric
    // catalogue — calls it `kafka_consumer_lag`. Everything that actually runs uses the latter:
    // @cos/tracing, this module, both Grafana dashboards and the Prometheus alert rule. The odd
    // line out is 3132, and it is reported rather than encoded here.
    expect(metrics).toContain('kafka_consumer_lag');
  });
});

describe('Phase 8 · Debezium belongs to Phase 17, not here (master:3142-3149)', () => {
  it('no CDC connector is wired into the event SDK', () => {
    // "Path 2 — Data Replication to Data Lake (FUTURE — Debezium CDC, implement with Phase 17)".
    // master:3145 is explicit that Debezium reads the WAL independently and is NOT the outbox
    // mechanism; a half-built connector here would blur two paths the spec keeps apart on purpose.
    // The poller is included since 2026-08-27: it moved to backend/ under Rule 34(c), and an
    // absence check that stops covering the file where the connector would most plausibly be
    // added is worse than none, because it still reports green.
    const sdk = `${outboxWriter}\n${poller}\n${dlq}\n${consumer}\n${metrics}`;
    expect(sdk).not.toMatch(/debezium/i);
  });
});
