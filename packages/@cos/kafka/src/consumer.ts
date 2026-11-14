// KafkaConsumer — wraps KafkaJS with:
//   - Avro decoding via Schema Registry
//   - Idempotency: checks {consumer group, event_id} in Redis (TTL 24h) before processing
//   - OTel trace context extraction from Kafka headers
//   - DLQ forwarding after max retries (3 attempts, exponential backoff)

import { Kafka, Admin, Consumer, EachMessagePayload, logLevel } from 'kafkajs';
import { Redis } from 'ioredis';
import { decodeAvro } from './schema-registry.client';
import { DlqPublisher } from './dlq';
import { createLogger } from '@cos/logger';
import type { BaseEventEnvelope } from '@cos/types';
import {
  isPlatformEvent,
  tenantTopicPattern,
  exactTopicPattern,
  PLATFORM_EVENTS_TOPIC,
} from './topic-catalog';

const logger = createLogger('kafka-consumer');

const IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours
const MAX_RETRIES = 3;
/**
 * master:3164 — "3 attempts with exponential backoff (1s, 5s, 30s)".
 *
 * Exported so the values can be asserted rather than trusted. They were neither exported nor tested
 * until 2026-08-26: shortening them to [1] would have kept every suite green while removing the
 * backoff that exists to let a downstream service recover before the message is written off to the
 * DLQ.
 *
 * The LENGTH is load-bearing too. The loop waits BETWEEN attempts, so there is one fewer delay than
 * there are attempts. If the two drift apart, `RETRY_DELAYS_MS[attempt]` is `undefined`,
 * `setTimeout(fn, undefined)` fires on the next tick, and the retries collapse into an instant
 * triple-tap — no error, no warning, and a transient failure becomes a DLQ entry.
 */
export const RETRY_DELAYS_MS = [1000, 5000, 30000]; // exponential backoff

/** How often a running consumer looks for new topics matching its subscriptions — see refreshTopics(). */
export const DEFAULT_TOPIC_REFRESH_MS = 30_000;

/** `KAFKA_TOPIC_REFRESH_MS` as a positive whole number of milliseconds; anything else gives the default. */
export function topicRefreshIntervalMs(raw = process.env['KAFKA_TOPIC_REFRESH_MS']): number {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return DEFAULT_TOPIC_REFRESH_MS;
  const ms = Number(raw.trim());
  return Number.isSafeInteger(ms) && ms > 0 ? ms : DEFAULT_TOPIC_REFRESH_MS;
}

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
  /** One pattern per subscribed event type; re-applied to the topic list by refreshTopics(). */
  private patterns: RegExp[] = [];
  /** The topics this consumer has subscribed — by name, so this is exactly what KafkaJS holds. */
  private readonly subscribedTopics = new Set<string>();
  private admin: Admin | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  /** Every stop() / subscribe() / run() after connect() runs on this chain, one at a time. */
  private lane: Promise<void> = Promise.resolve();
  private refreshQueued = false;
  /** Set by the restartOnFailure hook, which KafkaJS calls only for a retriable crash. */
  private restartAfterCrash = false;
  /** A crash KafkaJS would not have restarted from: the refresh leaves the consumer down too. */
  private crashedForGood = false;
  private closing = false;

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
    if (this.consumer) throw new Error('KafkaConsumer is already connected');
    this.closing = false;
    this.crashedForGood = false;
    await this.dlqPublisher.connect();
    this.groupId = options.groupId;
    const consumer = this.kafka.consumer({
      groupId: options.groupId,
      // KafkaJS restarts a crashed consumer from a timer of its own, armed only after its crash
      // handler has disconnected, and its start() does not check whether something else ran the
      // consumer in the meantime (kafkajs/src/consumer/index.js:246-300). A refresh landing in that
      // window would leave two runners, one of them unreachable by stop() or disconnect(). So KafkaJS
      // is told not to restart, and the restart goes through the same lane as the refresh. KafkaJS
      // calls restartOnFailure only for a retriable error (index.js:266-268), the same condition its
      // own restart uses. `retries: 5` is KafkaJS's default, which passing `retry` would replace.
      retry: {
        retries: 5,
        restartOnFailure: async () => {
          this.restartAfterCrash = true;
          return false;
        },
      },
    });
    consumer.on(consumer.events.CRASH, (event) => this.onCrash(event.payload.error));
    this.consumer = consumer;

    try {
      await consumer.connect();

      // Platform events live on the shared platform.events topic; all other events are per-tenant,
      // matched across tenants by pattern (§7.3). KafkaJS 2.2.4 resolves a RegExp subscription ONCE,
      // inside subscribe(), against the topics that exist then (consumer/index.js:157-185), and
      // nothing re-evaluates it. Topics are created on first publish (KafkaProducer.ensureTopic), so
      // most of a tenant's topics appear after this runs — refreshTopics() is what picks them up.
      this.patterns = options.eventTypes.map((eventType) =>
        isPlatformEvent(eventType)
          ? exactTopicPattern(PLATFORM_EVENTS_TOPIC)
          : tenantTopicPattern(eventType),
      );

      // Subscribe by NAME, from the same listing the refresh compares against. Subscribing by RegExp
      // would have KafkaJS resolve it against its own metadata request, possibly to another broker
      // with a different view; a topic in one listing and not the other would then be recorded here
      // without being subscribed, and never consumed. With nothing to subscribe yet, run() joins the
      // group with no topics — what a RegExp matching nothing did.
      this.admin = this.kafka.admin();
      await this.admin.connect();
      const existing = this.matching(await this.admin.listTopics());
      if (existing.length > 0) {
        await consumer.subscribe({
          topics: existing,
          fromBeginning: options.fromBeginning ?? false,
        });
      }
      for (const topic of existing) this.subscribedTopics.add(topic);

      await this.startRunning(consumer);
    } catch (err) {
      await this.disconnect().catch(() => undefined);
      throw err;
    }

    const intervalMs = topicRefreshIntervalMs();
    this.refreshTimer = setInterval(() => void this.refreshTopicsOnce(), intervalMs);
    this.refreshTimer.unref();

    logger.info(
      { groupId: options.groupId, eventTypes: options.eventTypes, topicRefreshMs: intervalMs },
      'KafkaConsumer connected',
    );
  }

  /**
   * Does not wait for a refresh or restart in progress: each of those checks `closing` after every
   * await and never calls run() once it is set, and disconnecting the clients ends the call it is in.
   * Waiting would hold shutdown for as long as an admin retry or a group rejoin takes.
   */
  async disconnect(): Promise<void> {
    this.closing = true;
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.refreshTimer = null;
    this.restartTimer = null;
    const { admin, consumer } = this;
    this.admin = null;
    this.consumer = null;
    this.subscribedTopics.clear();
    try {
      await admin?.disconnect();
    } catch (err) {
      logger.warn({ err, groupId: this.groupId }, 'Kafka admin disconnect failed');
    }
    try {
      await consumer?.disconnect();
    } finally {
      await this.dlqPublisher.disconnect();
    }
  }

  private startRunning(consumer: Consumer): Promise<void> {
    return consumer.run({
      eachMessage: (payload) => this.handleMessage(payload),
    });
  }

  private matching(topics: string[]): string[] {
    return topics.filter((topic) => this.patterns.some((pattern) => pattern.test(topic)));
  }

  private inLane(op: () => Promise<void>): Promise<void> {
    const next = this.lane.then(op);
    this.lane = next.catch(() => undefined);
    return next;
  }

  /** At most one refresh waiting behind the one running; a failure is logged, the next tick retries. */
  private refreshTopicsOnce(): Promise<void> {
    if (this.refreshQueued) return this.lane;
    this.refreshQueued = true;
    return this.inLane(async () => {
      this.refreshQueued = false;
      await this.refreshTopics();
    }).catch((err: unknown) => {
      if (!this.closing) logger.error({ err, groupId: this.groupId }, 'Kafka topic refresh failed');
    });
  }

  /**
   * Subscribe to topics that match a pattern and appeared since the last look.
   *
   * KafkaJS refuses subscribe() while running (consumer/index.js:136), so the consumer is stopped,
   * subscribed to the new topics and run again — a group rebalance, which happens only when a topic
   * is new, i.e. on a tenant's first event of a type. Each replica does this on its own timer.
   *
   * New topics are read FROM THE BEGINNING. Everything in them was written after this consumer
   * started, and none of it has been read: the group has no committed offset there, so the
   * caller's `fromBeginning: false` would start at the latest offset and skip exactly the events
   * that created the topic. KafkaJS uses `fromBeginning` where the group has no committed offset,
   * and when a committed offset is out of range (a recreated topic) — a replay, not a skip.
   */
  private async refreshTopics(): Promise<void> {
    const { consumer, admin } = this;
    if (!consumer || !admin || this.closing || this.crashedForGood) return;

    const fresh = this.matching(await admin.listTopics()).filter(
      (topic) => !this.subscribedTopics.has(topic),
    );
    if (fresh.length === 0 || this.closing) return;

    await consumer.stop();
    if (this.closing) return;
    try {
      await consumer.subscribe({ topics: fresh, fromBeginning: true });
      for (const topic of fresh) this.subscribedTopics.add(topic);
      logger.info({ groupId: this.groupId, topics: fresh }, 'Subscribed to new Kafka topics');
    } finally {
      // Resume the topics already held even if the subscribe failed; the new ones stay missing from
      // subscribedTopics, so the next tick tries them again.
      if (!this.closing) await this.startRunning(consumer);
    }
  }

  /**
   * KafkaJS has crashed the consumer and disconnected it. Restart it after KafkaJS's own delay
   * (`e.retryTime || initialRetryTime`, 300 ms; index.js:293) when the error is retriable — on the
   * lane, so it cannot overlap a refresh. A refresh that ran it during the crash is stopped first.
   */
  private onCrash(error: Error & { retryTime?: number }): void {
    const restart = this.restartAfterCrash;
    this.restartAfterCrash = false;
    if (this.closing) return;
    if (!restart) {
      this.crashedForGood = true;
      logger.error({ err: error, groupId: this.groupId }, 'Kafka consumer crashed; not restarting');
      return;
    }
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.inLane(async () => {
        const consumer = this.consumer;
        if (!consumer || this.closing) return;
        await consumer.stop();
        if (this.closing) return;
        await this.startRunning(consumer);
        logger.info({ groupId: this.groupId }, 'Kafka consumer restarted after a crash');
      }).catch((err: unknown) => {
        logger.error({ err, groupId: this.groupId }, 'Kafka consumer restart failed');
      });
    }, error.retryTime || 300);
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
