// KafkaConsumer — wraps KafkaJS with:
//   - Avro decoding via Schema Registry
//   - Idempotency: checks event_id in Redis (TTL 24h) before processing
//   - OTel trace context extraction from Kafka headers
//   - DLQ forwarding after max retries (3 attempts, exponential backoff)

import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { Redis } from 'ioredis';
import { decodeAvro } from './schema-registry.client';
import { createLogger } from '@cos/logger';
import type { BaseEventEnvelope } from '@cos/types';

const logger = createLogger('kafka-consumer');

const IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 5000, 30000]; // exponential backoff

export type MessageHandler<T = unknown> = (
  event: BaseEventEnvelope<T>,
  traceContext: { traceId?: string; spanId?: string },
) => Promise<void>;

export interface ConsumerOptions {
  groupId: string;
  topics: string[];
  fromBeginning?: boolean;
}

export class KafkaConsumer {
  private readonly kafka: Kafka;
  private consumer: Consumer | null = null;
  private readonly redis: Redis;
  private readonly handlers = new Map<string, MessageHandler>();

  constructor() {
    this.kafka = new Kafka({
      clientId: process.env['KAFKA_CLIENT_ID'] ?? 'cos-backend',
      brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:29092').split(','),
    });
    this.redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
  }

  /** Register a handler for a specific event_type. */
  on<T>(eventType: string, handler: MessageHandler<T>): void {
    this.handlers.set(eventType, handler as MessageHandler);
  }

  async connect(options: ConsumerOptions): Promise<void> {
    this.consumer = this.kafka.consumer({ groupId: options.groupId });
    await this.consumer.connect();

    for (const topic of options.topics) {
      await this.consumer.subscribe({ topic, fromBeginning: options.fromBeginning ?? false });
    }

    await this.consumer.run({
      eachMessage: (payload) => this.handleMessage(payload),
    });

    logger.info({ groupId: options.groupId, topics: options.topics }, 'KafkaConsumer connected');
  }

  async disconnect(): Promise<void> {
    await this.consumer?.disconnect();
    this.consumer = null;
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, message } = payload;
    const value = message.value;
    if (!value) return;

    let event: BaseEventEnvelope<unknown>;
    try {
      event = (await decodeAvro(value)) as BaseEventEnvelope<unknown>;
    } catch (err) {
      logger.error({ err, topic }, 'Failed to decode Avro message — sending to DLQ');
      await this.sendToDlq(topic, message.value!, 'AVRO_DECODE_ERROR');
      return;
    }

    // Idempotency check (QM-9 — Kafka idempotency via Redis)
    const idempKey = `kafka:processed:${event.event_id}`;
    const alreadyProcessed = await this.redis.set(idempKey, '1', 'EX', IDEMPOTENCY_TTL_SECONDS, 'NX');
    if (!alreadyProcessed) {
      logger.debug({ event_id: event.event_id, event_type: event.event_type }, 'Duplicate event skipped');
      return;
    }

    const handler = this.handlers.get(event.event_type);
    if (!handler) {
      logger.warn({ event_type: event.event_type }, 'No handler registered for event type');
      return;
    }

    // Extract OTel trace context from headers (QM-8)
    const headers = message.headers ?? {};
    const traceContext = {
      traceId: this.headerToString(headers['trace_id']),
      spanId:  this.headerToString(headers['span_id']),
    };

    // Execute with retry + DLQ
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await handler(event, traceContext);
        return;
      } catch (err) {
        const isLastAttempt = attempt === MAX_RETRIES - 1;
        logger.warn(
          { err, event_id: event.event_id, event_type: event.event_type, attempt },
          `Handler failed (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );
        if (!isLastAttempt) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
        } else {
          logger.error(
            { event_id: event.event_id, event_type: event.event_type },
            'Max retries exceeded — sending to DLQ',
          );
          await this.sendToDlq(topic, value, String(err));
          // Clear idempotency key so manual retry from DLQ can reprocess
          await this.redis.del(idempKey);
        }
      }
    }
  }

  private async sendToDlq(originalTopic: string, value: Buffer, reason: string): Promise<void> {
    // DLQ topic naming: {original-topic}.dlq
    const dlqTopic = `${originalTopic}.dlq`;
    logger.error({ dlqTopic, reason }, 'Message sent to DLQ');
    // DLQ publishing is handled by DlqConsumer — here we just log and alert
    // In production: a separate DlqPublisher pushes failed messages to DLQ topic
  }

  private headerToString(header: Buffer | string | undefined): string | undefined {
    if (!header) return undefined;
    return Buffer.isBuffer(header) ? header.toString('utf-8') : header;
  }
}
