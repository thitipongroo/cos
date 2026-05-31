// Prometheus metrics for Kafka producer, consumer, and DLQ — Phase 8
// Metric names aligned to QM-8 required metrics:
//   kafka_messages_produced_total
//   kafka_messages_consumed_total
//   kafka_consumer_lag (gauge)
//   kafka_dlq_depth (gauge — alert when > 0)
//   kafka_producer_error_total

import { Counter, Gauge, Registry } from 'prom-client';

let registry: Registry | null = null;
let messagesProduced: Counter | null = null;
let messagesConsumed: Counter | null = null;
let producerErrors: Counter | null = null;
let consumerLag: Gauge | null = null;
let dlqDepth: Gauge | null = null;

export function initKafkaMetrics(reg: Registry): void {
  registry = reg;

  messagesProduced = new Counter({
    name: 'kafka_messages_produced_total',
    help: 'Total Kafka messages successfully produced',
    labelNames: ['topic', 'event_type'],
    registers: [reg],
  });

  messagesConsumed = new Counter({
    name: 'kafka_messages_consumed_total',
    help: 'Total Kafka messages successfully consumed',
    labelNames: ['topic', 'consumer_group', 'event_type'],
    registers: [reg],
  });

  producerErrors = new Counter({
    name: 'kafka_producer_error_total',
    help: 'Total Kafka producer errors',
    labelNames: ['topic'],
    registers: [reg],
  });

  consumerLag = new Gauge({
    name: 'kafka_consumer_lag',
    help: 'Consumer group lag (number of messages behind)',
    labelNames: ['topic', 'consumer_group', 'partition'],
    registers: [reg],
  });

  dlqDepth = new Gauge({
    name: 'kafka_dlq_depth',
    help: 'Number of messages in DLQ topics (alert when > 0)',
    labelNames: ['dlq_topic'],
    registers: [reg],
  });
}

export function recordProduced(topic: string, eventType: string): void {
  messagesProduced?.labels(topic, eventType).inc();
}

export function recordConsumed(topic: string, groupId: string, eventType: string): void {
  messagesConsumed?.labels(topic, groupId, eventType).inc();
}

export function recordProducerError(topic: string): void {
  producerErrors?.labels(topic).inc();
}

export function setConsumerLag(topic: string, groupId: string, partition: number, lag: number): void {
  consumerLag?.labels(topic, groupId, String(partition)).set(lag);
}

export function setDlqDepth(dlqTopic: string, depth: number): void {
  dlqDepth?.labels(dlqTopic).set(depth);
}
