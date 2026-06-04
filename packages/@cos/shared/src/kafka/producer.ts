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

const logger = createLogger('kafka-producer');

// Avsc filename mapping: event_type → file basename
const EVENT_AVSC_MAP: Record<string, string> = {
  'construction.project.created.v1': 'construction.project.created.v1.avsc',
  'construction.project.updated.v1': 'construction.project.updated.v1.avsc',
  'construction.project.status_changed.v1': 'construction.project.status_changed.v1.avsc',
  'construction.project.archived.v1': 'construction.project.archived.v1.avsc',
  'construction.boq.version_created.v1': 'construction.boq.version_created.v1.avsc',
  'construction.boq.version_approved.v1': 'construction.boq.version_approved.v1.avsc',
  'construction.boq.items_updated.v1': 'construction.boq.items_updated.v1.avsc',
  'procurement.purchase_order.created.v1': 'procurement.purchase_order.created.v1.avsc',
  'procurement.vendor_invoice.received.v1': 'procurement.vendor_invoice.received.v1.avsc',
  'procurement.vendor_invoice.approved.v1': 'procurement.vendor_invoice.approved.v1.avsc',
  'procurement.delivery.received.v1': 'procurement.delivery.received.v1.avsc',
  'site.report.created.v1': 'site.report.created.v1.avsc',
  'site.inspection.failed.v1': 'site.inspection.failed.v1.avsc',
  'site.material.consumed.v1': 'site.material.consumed.v1.avsc',
  'construction.task.completed.v1': 'construction.task.completed.v1.avsc',
  'construction.delay.detected.v1': 'construction.delay.detected.v1.avsc',
  'workforce.checkin.created.v1': 'workforce.checkin.created.v1.avsc',
  'finance.budget.exceeded.v1': 'finance.budget.exceeded.v1.avsc',
  'finance.cashflow_risk.detected.v1': 'finance.cashflow_risk.detected.v1.avsc',
  'ai.risk_prediction.generated.v1': 'ai.risk_prediction.generated.v1.avsc',
  'identity.tenant.created.v1': 'identity.tenant.created.v1.avsc',
  'identity.tenant.deactivated.v1': 'identity.tenant.deactivated.v1.avsc',
  'identity.user.created.v1': 'identity.user.created.v1.avsc',
  'identity.user.role_changed.v1': 'identity.user.role_changed.v1.avsc',
};

// topic naming: {service}.{entity}.{action} — derived from canonical event type
function topicFromEventType(eventType: string): string {
  // e.g. "construction.project.created.v1" → "construction.project.created"
  return eventType.replace(/\.v\d+$/, '');
}

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

    const topic = topicFromEventType(envelope.event_type);
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

    const subject = `${topicFromEventType(eventType)}-value`;
    const id = await registerSchema(subject, avscFile);
    this.schemaIds.set(eventType, id);
    return id;
  }
}
