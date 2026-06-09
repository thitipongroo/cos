// DLQ consumer + retry middleware — Phase 8
// Pattern: failed messages → {original-topic}.dlq topic
// Retry: 3 attempts, exponential backoff (1s, 5s, 30s) — handled in KafkaConsumer
// DLQ monitoring: alert when DLQ topic message count > 0 (QM-8)

import { Kafka, Producer } from 'kafkajs';
import { createLogger } from '@cos/logger';

const logger = createLogger('dlq');

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

    const dlqTopic = `${msg.originalTopic}.dlq`;

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
}

/**
 * DLQ depth monitoring helper.
 * Used by Prometheus metric collection to track DLQ depth.
 * Alert rule: kafka_dlq_depth > 0 for 5 min (QM-8).
 */
export function getDlqTopicNames(domains: string[]): string[] {
  return domains.map((d) => `${d}.dlq`);
}
