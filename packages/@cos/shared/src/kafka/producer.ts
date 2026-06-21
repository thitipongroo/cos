// KafkaProducer — wraps KafkaJS with:
//   - Avro schema validation via Schema Registry
//   - OTel trace_id / span_id propagation via Kafka headers
//   - Prometheus metrics: kafka_messages_produced_total, kafka_producer_error_total
// All domain services MUST use this class to publish events — never call KafkaJS directly.

import { Kafka, Producer, Message, CompressionTypes, logLevel } from 'kafkajs';
import { randomUUID } from 'crypto';
import { registerSchema, encodeAvro, ensureCompatibilityMode } from './schema-registry.client';
import { createLogger } from '@cos/logger';
import type { BaseEventEnvelope } from '@cos/types';
import { EVENT_AVSC_MAP, topicForEvent, subjectForEvent } from './topic-catalog';

const logger = createLogger('kafka-producer');

export interface ProduceOptions {
  /** OTel trace_id for header propagation */
  traceId?: string;
  /** OTel span_id for header propagation */
  spanId?: string;
}

export class KafkaProducer {
  private readonly kafka: Kafka;
  private producer: Producer | null = null;
  private readonly schemaIds = new Map<string, number>();

  constructor() {
    this.kafka = new Kafka({
      clientId: process.env['KAFKA_CLIENT_ID'] ?? 'cos-backend',
      brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:29092').split(','),
      logLevel: process.env['NODE_ENV'] === 'test' ? logLevel.NOTHING : logLevel.WARN,
    });
  }

  async connect(): Promise<void> {
    // Enforce BACKWARD_TRANSITIVE before any schema registration (spec §32.4; QM-9).
    // Confluent Schema Registry defaults to BACKWARD on boot — must be set explicitly.
    await ensureCompatibilityMode();
    this.producer = this.kafka.producer({
      allowAutoTopicCreation: false,
      transactionTimeout: 30000,
    });
    await this.producer.connect();
    logger.info('KafkaProducer connected');
  }

  async disconnect(): Promise<void> {
    await this.producer?.disconnect();
    this.producer = null;
  }

  /**
   * Publish a typed event. The event envelope is Avro-encoded using the
   * registered schema for this event type.
   * Idempotency key: event_id (UUID v4 — unique per publish call).
   */
  async publish<T>(
    event: Omit<BaseEventEnvelope<T>, 'event_id'>,
    options: ProduceOptions = {},
  ): Promise<void> {
    if (!this.producer) throw new Error('KafkaProducer not connected — call connect() first');

    const envelope: BaseEventEnvelope<T> = {
      ...event,
      event_id: randomUUID(),
    };

    // Per-tenant topic name (§7.3): {tenant_id}.{event_type}; platform events use the
    // shared platform.events topic. The event_type (CloudEvents `type`) keeps no prefix.
    const topic = topicForEvent(envelope.event_type, envelope.tenant_id);
    const schemaId = await this.getOrRegisterSchema(envelope.event_type);
    const encoded = await encodeAvro(schemaId, envelope);

    const headers: Record<string, string> = {
      event_id: envelope.event_id,
      event_type: envelope.event_type,
      tenant_id: envelope.tenant_id,
    };
    // OTel W3C trace propagation via Kafka headers (QM-8)
    if (options.traceId)
      headers['traceparent'] = `00-${options.traceId}-${options.spanId ?? '0000000000000000'}-01`;
    if (options.traceId) headers['trace_id'] = options.traceId;
    if (options.spanId) headers['span_id'] = options.spanId;

    const message: Message = {
      key: envelope.tenant_id,
      value: encoded,
      headers,
    };

    await this.producer.send({ topic, messages: [message], compression: CompressionTypes.GZIP });

    logger.info(
      {
        event_type: envelope.event_type,
        event_id: envelope.event_id,
        tenant_id: envelope.tenant_id,
      },
      'Kafka event published',
    );
  }

  private async getOrRegisterSchema(eventType: string): Promise<number> {
    if (this.schemaIds.has(eventType)) return this.schemaIds.get(eventType)!;

    const avscFile = EVENT_AVSC_MAP[eventType];
    if (!avscFile) throw new Error(`No Avro schema registered for event type: ${eventType}`);

    // RecordNameStrategy (§32.4): subject is the canonical event type, shared across
    // tenants — one schema per event regardless of the per-tenant topic it lands on.
    const subject = subjectForEvent(eventType);
    const id = await registerSchema(subject, avscFile);
    this.schemaIds.set(eventType, id);
    return id;
  }
}
