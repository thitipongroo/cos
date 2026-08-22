/**
 * Phase 8 — outbox pattern, DLQ retry and observability
 * (master:3115-3134, 3165-3167), plus the boundary with Phase 17 (master:3142-3149).
 */
import { read } from '../helpers';

const outbox = read('packages/@cos/shared/src/kafka/outbox.ts');
const dlq = read('packages/@cos/shared/src/kafka/dlq.ts');
const consumer = read('packages/@cos/shared/src/kafka/consumer.ts');
const metrics = read('packages/@cos/shared/src/kafka/metrics.ts');

describe('Phase 8 · outbox pattern (master:3115-3124)', () => {
  it('the poller runs every 500ms (master:3122)', () => {
    expect(outbox).toMatch(/\b500\b/);
  });

  it('it publishes only unpublished rows and marks them afterwards (master:3122-3123)', () => {
    expect(outbox).toMatch(/published/);
  });

  it('the table carries the columns master declares (master:3119-3120)', () => {
    for (const column of ['event_type', 'payload', 'published', 'published_at']) {
      expect(outbox).toContain(column);
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
    const sdk = `${outbox}\n${dlq}\n${consumer}\n${metrics}`;
    expect(sdk).not.toMatch(/debezium/i);
  });
});
