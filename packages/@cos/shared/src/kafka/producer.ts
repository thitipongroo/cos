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
import {
  EVENT_AVSC_MAP,
  topicForEvent,
  subjectForEvent,
  entityStateKeyField,
} from './topic-catalog';

const logger = createLogger('kafka-producer');

export interface ProduceOptions {
  /** OTel trace_id for header propagation */
  traceId?: string;
  /** OTel span_id for header propagation */
  spanId?: string;
}

/**
 * Partition/replication settings for topics created on first publish. Same env vars the
 * provisioner reads, so a topic created lazily is shaped identically to a pre-provisioned one.
 */
const TOPIC_PARTITIONS = parseInt(process.env['KAFKA_TOPIC_PARTITIONS'] ?? '3', 10);
const TOPIC_REPLICATION_FACTOR = parseInt(process.env['KAFKA_TOPIC_REPLICATION_FACTOR'] ?? '1', 10);

/**
 * The Kafka message key.
 *
 * `tenant_id` for ordinary topics: every event of a tenant lands in one partition, so a tenant's
 * events of a given type stay ordered relative to each other.
 *
 * For an entity state topic (master:3104) it is the ENTITY id instead, because those topics are
 * log-compacted and compaction keeps only the newest message per key. Keyed by tenant, compaction
 * would leave exactly one event per tenant and delete everything before it; keyed by entity, it
 * leaves the current state of each entity, which is the point.
 *
 * Missing id throws rather than defaulting. A message with no key is spread round-robin across
 * partitions, which makes compaction unable to pair old and new versions of the same entity — the
 * topic would keep growing while appearing to be compacted, and nothing would report it.
 */
function messageKeyFor(envelope: BaseEventEnvelope<unknown>): string {
  const field = entityStateKeyField(envelope.event_type);
  if (!field) return envelope.tenant_id;

  const payload = envelope.payload as Record<string, unknown> | null | undefined;
  const id = payload?.[field];
  if (typeof id !== 'string' || id === '') {
    throw new Error(
      `${envelope.event_type} is an entity state topic keyed by "${field}", but the payload carries no such id`,
    );
  }
  return id;
}

export class KafkaProducer {
  private readonly kafka: Kafka;
  private producer: Producer | null = null;
  private readonly schemaIds = new Map<string, number>();
  /**
   * Topics this process has already created or confirmed. Bounds the admin round-trip to once per
   * topic per process, not once per message.
   */
  private readonly knownTopics = new Set<string>();

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
   * Idempotency key: event_id (UUID v4). Supplied by the caller when the event has a durable
   * identity (the outbox), otherwise minted here.
   */
  async publish<T>(
    event: Omit<BaseEventEnvelope<T>, 'event_id'> & { event_id?: string },
    options: ProduceOptions = {},
  ): Promise<void> {
    if (!this.producer) throw new Error('KafkaProducer not connected — call connect() first');

    // Honour a caller-supplied event_id; mint one only when there is none.
    //
    // KafkaConsumer dedupes on event_id (a Redis key, 24h TTL — consumer.ts), so the id is the
    // IDENTITY of the event, not a per-attempt tag. Minting a fresh one on every publish made that
    // dedupe unreachable for anything republished: the outbox poller retries a delivery it is not
    // sure landed, and with a new id each time every retry looked like a brand-new event to every
    // consumer. Callers that pass no id (direct publishers) behave exactly as before.
    const envelope: BaseEventEnvelope<T> = {
      ...event,
      event_id: event.event_id ?? randomUUID(),
    };

    // Per-tenant topic name (§7.3): {tenant_id}.{event_type}; platform events use the
    // shared platform.events topic. The event_type (CloudEvents `type`) keeps no prefix.
    const topic = topicForEvent(envelope.event_type, envelope.tenant_id);
    // Resolved before anything is created: it is a pure check on the envelope, and letting it fail
    // afterwards would leave an empty compacted topic behind for a publish that never happened.
    const key = messageKeyFor(envelope);
    await this.ensureTopic(topic, envelope.event_type);
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
      key,
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

  /**
   * Create the topic if this process has not already seen it.
   *
   * Topics are created on first publish rather than eagerly at tenant onboarding: provisioning the
   * whole catalogue per tenant made the topic count scale with customer headcount instead of actual
   * usage (55 topics / 495 partition replicas per tenant, most of them never written to). Kafka
   * cannot do this for us — `auto.create.topics.enable` is false on both the MSK and Kubernetes
   * brokers, and the producer sets `allowAutoTopicCreation: false` — so it happens here.
   *
   * createTopics is idempotent: KafkaJS resolves false when the topic already exists, so two
   * services publishing a tenant's first event concurrently is safe. Failure is NOT swallowed —
   * publishing to a topic that does not exist would fail anyway, and the outbox poller retries.
   */
  private async ensureTopic(topic: string, eventType: string): Promise<void> {
    if (this.knownTopics.has(topic)) return;

    const admin = this.kafka.admin();
    try {
      await admin.connect();
      const created = await admin.createTopics({
        topics: [
          {
            topic,
            numPartitions: TOPIC_PARTITIONS,
            replicationFactor: TOPIC_REPLICATION_FACTOR,
            // Log compaction for entity state topics (master:3104). Set at creation, alongside the
            // entity key above — a compacted topic that is still tenant-keyed would collapse to one
            // event per tenant, so the two settings are read from the same declaration and can
            // never be applied one without the other.
            ...(entityStateKeyField(eventType)
              ? { configEntries: [{ name: 'cleanup.policy', value: 'compact' }] }
              : {}),
          },
        ],
        waitForLeaders: true,
      });
      if (created) logger.info({ topic }, 'Kafka topic created on first publish');
    } finally {
      await admin.disconnect();
    }
    this.knownTopics.add(topic);
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
