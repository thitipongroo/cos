// KafkaConsumer — wraps KafkaJS with:
//   - Avro decoding via Schema Registry
//   - Idempotency: checks {consumer group, event_id} in Redis (TTL 24h) before processing
//   - OTel trace context extraction from Kafka headers
//   - DLQ forwarding after max retries (3 attempts, exponential backoff)

import { Kafka, Consumer, EachMessagePayload, logLevel } from 'kafkajs';
import { Redis } from 'ioredis';
import { decodeAvro } from './schema-registry.client';
import { DlqPublisher } from './dlq';
import { createLogger } from '@cos/logger';
import type { BaseEventEnvelope } from '@cos/types';
import { isPlatformEvent, tenantTopicPattern, PLATFORM_EVENTS_TOPIC } from './topic-catalog';

const logger = createLogger('kafka-consumer');

const IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 5000, 30000]; // exponential backoff

export type MessageHandler<T = unknown> = (
  event: BaseEventEnvelope<T>,
  traceContext: { traceId?: string; spanId?: string },
) => Promise<void>;

export interface ConsumerOptions {
  /** Consumer group — shared-cluster services use `{service}.shared` (spec §7.3). */
  groupId: string;
  /**
   * Canonical event types to consume (CloudEvents `type`, e.g. `site.inspection.failed.v1`).
   * Domain events are subscribed via a per-tenant topic RegExp (`{tenant_id}.{event_type}`)
   * so one shared group reads every tenant's topics; platform events subscribe to the
   * shared `platform.events` topic. The tenant_id header is validated before processing.
   */
  eventTypes: string[];
  fromBeginning?: boolean;
}

export class KafkaConsumer {
  private readonly kafka: Kafka;
  private consumer: Consumer | null = null;
  /** Set by connect(); part of the idempotency key — see idempotencyKey(). */
  private groupId: string | null = null;
  private readonly redis: Redis;
  private readonly dlqPublisher: DlqPublisher;
  private readonly handlers = new Map<string, MessageHandler>();

  constructor() {
    this.kafka = new Kafka({
      clientId: process.env['KAFKA_CLIENT_ID'] ?? 'cos-backend',
      brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:29092').split(','),
      logLevel: process.env['NODE_ENV'] === 'test' ? logLevel.NOTHING : logLevel.WARN,
    });
    this.redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
    this.dlqPublisher = new DlqPublisher();
  }

  /** Register a handler for a specific event_type. */
  on<T>(eventType: string, handler: MessageHandler<T>): void {
    this.handlers.set(eventType, handler as MessageHandler);
  }

  async connect(options: ConsumerOptions): Promise<void> {
    await this.dlqPublisher.connect();
    this.groupId = options.groupId;
    this.consumer = this.kafka.consumer({ groupId: options.groupId });
    await this.consumer.connect();

    const fromBeginning = options.fromBeginning ?? false;
    for (const eventType of options.eventTypes) {
      // Platform events live on the shared platform.events topic; all other events
      // are per-tenant, matched across tenants by RegExp (§7.3). RegExp subscription
      // also picks up topics provisioned for tenants onboarded after startup, and
      // never throws when no topic exists yet (unlike a literal-name subscription).
      const topic = isPlatformEvent(eventType)
        ? PLATFORM_EVENTS_TOPIC
        : tenantTopicPattern(eventType);
      await this.consumer.subscribe({ topic, fromBeginning });
    }

    await this.consumer.run({
      eachMessage: (payload) => this.handleMessage(payload),
    });

    logger.info(
      { groupId: options.groupId, eventTypes: options.eventTypes },
      'KafkaConsumer connected',
    );
  }

  async disconnect(): Promise<void> {
    await this.consumer?.disconnect();
    await this.dlqPublisher.disconnect();
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

    const headers = message.headers ?? {};

    // Tenant isolation guard (§7.3): the tenant_id header is a secondary check against
    // the decoded envelope. A missing or mismatched header indicates a misrouted or
    // tampered message — never process it; route to the DLQ for investigation.
    const headerTenantId = this.headerToString(headers['tenant_id']);
    if (!headerTenantId || headerTenantId !== event.tenant_id) {
      logger.error(
        { topic, header_tenant_id: headerTenantId, event_tenant_id: event.tenant_id },
        'tenant_id header missing or does not match envelope — sending to DLQ',
      );
      await this.sendToDlq(topic, value, 'TENANT_ID_MISMATCH');
      return;
    }

    // Idempotency check (QM-9 — Kafka idempotency via Redis)
    const idempKey = this.idempotencyKey(event.event_id);
    const alreadyProcessed = await this.redis.set(
      idempKey,
      '1',
      'EX',
      IDEMPOTENCY_TTL_SECONDS,
      'NX',
    );
    if (!alreadyProcessed) {
      logger.debug(
        { event_id: event.event_id, event_type: event.event_type },
        'Duplicate event skipped',
      );
      return;
    }

    const handler = this.handlers.get(event.event_type);
    if (!handler) {
      logger.warn({ event_type: event.event_type }, 'No handler registered for event type');
      return;
    }

    // Extract OTel trace context from headers (QM-8)
    const traceContext = {
      traceId: this.headerToString(headers['trace_id']),
      spanId: this.headerToString(headers['span_id']),
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
    await this.dlqPublisher.publish({
      originalTopic,
      originalValue: value,
      reason,
      failedAt: new Date().toISOString(),
      retryCount: MAX_RETRIES,
    });
  }

  /**
   * The Redis key that claims one event for ONE consumer group.
   *
   * The group is part of the key, and that is the whole point. Until 2026-08-23 the key was
   * `kafka:processed:{event_id}` with no group in it, against a single shared Redis — and eight event
   * types are subscribed by two or three different groups (`procurement.po.created.v1` by both
   * finance and analytics-invalidation, `site.issue.created.v1` by three). Whichever group reached
   * SET NX first claimed the event; every other group logged `Duplicate event skipped` at DEBUG and
   * returned. So a purchase order created a cost transaction OR invalidated the analytics cache,
   * nondeterministically, never both — and nothing above DEBUG said so (TDD OQ-49).
   *
   * `libs/go/coskafka/idempotency.go` builds the same key and used to document the collision as
   * intentional ("an event processed by either side is not reprocessed by the other"). Sharing a
   * keyspace across LANGUAGES is only correct when the consumers also share a group; across groups it
   * is not deduplication, it is dropping. Both sides now key on the group.
   *
   * DEPLOY NOTE: this changes the key namespace, so claims held under the old key are not seen. Their
   * only effect is that a redelivery arriving within the 24h TTL and across the deploy boundary can be
   * processed a second time. Handlers are idempotent by construction; the alternative — keeping the
   * old key — is the bug.
   */
  private idempotencyKey(eventId: string): string {
    // `unbound` cannot occur through connect(); it exists so a direct handleMessage() call in a test
    // produces a key that is obviously not a real group rather than one that silently reads as one.
    return `kafka:processed:${this.groupId ?? 'unbound'}:${eventId}`;
  }

  private headerToString(
    header: Buffer | string | (string | Buffer)[] | undefined,
  ): string | undefined {
    if (!header) return undefined;
    if (Array.isArray(header)) {
      const first = header[0];
      if (!first) return undefined;
      return Buffer.isBuffer(first) ? first.toString('utf-8') : first;
    }
    return Buffer.isBuffer(header) ? header.toString('utf-8') : header;
  }
}
