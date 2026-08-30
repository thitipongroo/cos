// DLQ consumer + retry middleware — Phase 8
// Pattern: failed messages → {original-topic}.dlq topic
// Retry: 3 attempts, exponential backoff (1s, 5s, 30s) — handled in KafkaConsumer
// DLQ monitoring: alert when DLQ topic message count > 0 (QM-8)

import { Kafka, Producer } from 'kafkajs';
import { createLogger } from '@cos/logger';
import { dlqTopicFor } from './topic-catalog';

const logger = createLogger('dlq');

/** Same shape as event topics — a DLQ created on demand matches a pre-provisioned one. */
const DLQ_PARTITIONS = parseInt(process.env['KAFKA_TOPIC_PARTITIONS'] ?? '3', 10);
const DLQ_REPLICATION_FACTOR = parseInt(process.env['KAFKA_TOPIC_REPLICATION_FACTOR'] ?? '1', 10);

export interface DlqMessage {
  originalTopic: string;
  originalValue: Buffer;
  reason: string;
  failedAt: string;
  retryCount: number;
}

/**
 * DlqPublisher — publishes failed messages to the DLQ topic.
 * Used by KafkaConsumer after max retries exceeded.
 */
export class DlqPublisher {
  private readonly kafka: Kafka;
  private producer: Producer | null = null;
  /** DLQ topics this process has already created or confirmed — see ensureTopic. */
  private readonly knownTopics = new Set<string>();

  constructor() {
    this.kafka = new Kafka({
      clientId: `${process.env['KAFKA_CLIENT_ID'] ?? 'cos-backend'}-dlq`,
      brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:29092').split(','),
    });
  }

  async connect(): Promise<void> {
    this.producer = this.kafka.producer();
    await this.producer.connect();
    logger.info('DlqPublisher connected');
  }

  async disconnect(): Promise<void> {
    await this.producer?.disconnect();
    this.producer = null;
  }

  async publish(msg: DlqMessage): Promise<void> {
    if (!this.producer) throw new Error('DlqPublisher not connected');

    // Tenant-scoped DLQ (§7.3): {tenant_id}.dlq — a tenant's DLQ never receives another tenant's
    // failed messages. One per tenant rather than one per tenant-and-domain; the domain is still
    // recoverable from the dlq.original_topic header below.
    const dlqTopic = dlqTopicFor(msg.originalTopic);
    await this.ensureTopic(dlqTopic);

    await this.producer.send({
      topic: dlqTopic,
      messages: [
        {
          value: msg.originalValue,
          headers: {
            'dlq.original_topic': msg.originalTopic,
            'dlq.reason': msg.reason,
            'dlq.failed_at': msg.failedAt,
            'dlq.retry_count': String(msg.retryCount),
          },
        },
      ],
    });

    logger.error(
      { dlqTopic, reason: msg.reason, retryCount: msg.retryCount },
      'Message published to DLQ — requires manual investigation',
    );
  }

  /**
   * Create the DLQ topic if this process has not already seen it.
   *
   * A tenant's DLQ is created on first failure, not at onboarding — most tenants never produce a
   * failed message, and eagerly creating a DLQ per tenant was part of the per-tenant topic cost.
   * `auto.create.topics.enable` is false on the real brokers, so without this the DLQ write would
   * fail and the message it was meant to preserve would be lost — the worst possible moment for an
   * unwritable topic.
   */
  private async ensureTopic(topic: string): Promise<void> {
    if (this.knownTopics.has(topic)) return;

    const admin = this.kafka.admin();
    try {
      await admin.connect();
      await admin.createTopics({
        topics: [
          {
            topic,
            numPartitions: DLQ_PARTITIONS,
            replicationFactor: DLQ_REPLICATION_FACTOR,
          },
        ],
        waitForLeaders: true,
      });
    } finally {
      await admin.disconnect();
    }
    this.knownTopics.add(topic);
  }
}

/**
 * DLQ depth monitoring helper — one DLQ topic per tenant (§7.3).
 * Used by Prometheus metric collection to track DLQ depth.
 * Alert rule: kafka_dlq_depth > 0 for 5 min (QM-8).
 *
 * Takes tenant ids, not domains: DLQs collapsed from `{tenant_id}.{domain}.dlq` to
 * `{tenant_id}.dlq`, so a tenant now has exactly one DLQ across all its domains.
 */
export function getDlqTopicNames(tenantIds: string[]): string[] {
  return tenantIds.map((tenantId) => `${tenantId}.dlq`);
}
