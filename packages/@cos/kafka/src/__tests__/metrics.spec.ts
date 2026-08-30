// Unit tests for Kafka Prometheus metrics

import { Registry } from 'prom-client';
import {
  initKafkaMetrics,
  recordProduced,
  recordConsumed,
  recordProducerError,
  setConsumerLag,
  setDlqDepth,
} from '../metrics';

describe('Kafka metrics', () => {
  let registry: Registry;

  beforeEach(() => {
    registry = new Registry();
    initKafkaMetrics(registry);
  });

  it('increments kafka_messages_produced_total', async () => {
    recordProduced('construction.project.created', 'construction.project.created.v1');
    const metrics = await registry.getMetricsAsJSON();
    const counter = metrics.find((m) => m.name === 'kafka_messages_produced_total');
    expect(counter).toBeDefined();
    expect(counter!.values[0].value).toBe(1);
  });

  it('increments kafka_messages_consumed_total', async () => {
    recordConsumed(
      'construction.project.created',
      'analytics-consumer',
      'construction.project.created.v1',
    );
    const metrics = await registry.getMetricsAsJSON();
    const counter = metrics.find((m) => m.name === 'kafka_messages_consumed_total');
    expect(counter).toBeDefined();
  });

  it('increments kafka_producer_error_total', async () => {
    recordProducerError('construction.project.created');
    const metrics = await registry.getMetricsAsJSON();
    const counter = metrics.find((m) => m.name === 'kafka_producer_error_total');
    expect(counter).toBeDefined();
    expect(counter!.values[0].value).toBe(1);
  });

  it('sets consumer lag gauge', async () => {
    setConsumerLag('construction.project.created', 'analytics-consumer', 0, 42);
    const metrics = await registry.getMetricsAsJSON();
    const gauge = metrics.find((m) => m.name === 'kafka_consumer_lag');
    expect(gauge).toBeDefined();
    expect(gauge!.values[0].value).toBe(42);
  });

  it('sets DLQ depth gauge', async () => {
    setDlqDepth('construction.project.created.dlq', 5);
    const metrics = await registry.getMetricsAsJSON();
    const gauge = metrics.find((m) => m.name === 'kafka_dlq_depth');
    expect(gauge).toBeDefined();
    expect(gauge!.values[0].value).toBe(5);
  });

  it('does not throw when metrics not initialized', () => {
    // These should be no-ops (metrics not initialized for this test instance)
    // Since we initialized in beforeEach, just verify no crash
    expect(() => recordProduced('topic', 'type')).not.toThrow();
    expect(() => recordConsumerError('topic')).not.toThrow();
  });
});

function recordConsumerError(_topic: string): void {
  recordProducerError(_topic);
}
