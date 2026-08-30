// OutboxPollerService — drains platform.outbox_events into Kafka (ADR-094).
//
// The delivery half of the outbox (see event-outbox.service.ts for the write half, and for why the
// inline publish it replaces was losing events). Runs in EVERY replica, deliberately: the claim
// statement uses FOR UPDATE SKIP LOCKED, so replicas divide the backlog instead of duplicating it,
// and three of them drain three times as fast. That is why this needs no ScheduledJobLockService
// lease, unlike the @Cron jobs — here the exclusion is per ROW, not per job.
//
// Delivery is at-least-once. A row is marked published only after Kafka accepts it, so a poller that
// dies mid-publish leaves the row to be retried, and that retry may be a second delivery of an event
// that did land. That is the correct trade — the alternative loses events — and it is safe because
// the envelope keeps ONE event_id for its whole life and KafkaConsumer dedupes on it.

import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { KafkaProducer } from '@cos/kafka';
import { createLogger } from '@cos/logger';
import type { BaseEventEnvelope } from '@cos/types';
import { createPrismaClient } from '../prisma/create-prisma-client';

const logger = createLogger('outbox-poller');

/** How often to look for work when the last poll found none. */
export const IDLE_INTERVAL_MS = 500;

/**
 * How long to wait after a poll that hit an infrastructure error (Kafka down, database unreachable).
 * Backing off matters: without it a broker outage becomes a 2 Hz retry loop against a dead broker,
 * from every replica, in the logs and on the network, for the whole outage.
 */
export const ERROR_INTERVAL_MS = 5_000;

/** Rows claimed per poll. Bounds both the claim statement and how much is in flight per replica. */
export const BATCH_SIZE = 50;

/**
 * Attempts before a row is left alone as a dead letter.
 *
 * Some failures never resolve — an event type with no registered Avro schema, a payload the schema
 * rejects. Retrying those forever costs a poll slot every 500ms that a healthy event queued behind
 * them could have used. Ten attempts under the backoff below spans roughly 25 minutes: long enough to
 * ride out any transient broker problem, short enough that a genuinely broken event stops consuming
 * capacity. Nothing is deleted — see the migration for the dead-letter and re-drive queries.
 */
export const MAX_ATTEMPTS = 10;

interface ClaimedRow {
  id: string;
  event_type: string;
  payload: unknown;
  attempts: number;
}

@Injectable()
export class OutboxPollerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly prisma = createPrismaClient();

  // ONE producer for the whole process, connected once. This is the other half of what made the old
  // inline publish expensive: a producer built per request has empty topic and schema caches, so it
  // paid an admin round trip and a registry lookup for every single event. Here those caches are
  // process-lifetime and warm after the first event of each type.
  private readonly producer = new KafkaProducer();

  private connected = false;
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  /** Resolves when the in-flight poll finishes — so shutdown does not cut a delivery in half. */
  private inFlight: Promise<void> = Promise.resolve();

  onApplicationBootstrap(): void {
    // Deliberately does NOT connect to Kafka here: a broker that is slow or down at boot must not
    // stop the API from serving. The first poll connects, and keeps trying.
    this.running = true;
    this.schedule(IDLE_INTERVAL_MS);
    logger.info({ intervalMs: IDLE_INTERVAL_MS, batchSize: BATCH_SIZE }, 'outbox.poller.started');
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // Let the current poll finish. Rows it already claimed are reserved for minutes, so abandoning
    // them mid-flight is safe — but it pointlessly delays events this replica could have delivered.
    await this.inFlight.catch(() => undefined);
    if (this.connected) await this.producer.disconnect().catch(() => undefined);
    await this.prisma.$disconnect();
  }

  private schedule(delayMs: number): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      this.inFlight = this.poll().then((nextDelay) => {
        this.schedule(nextDelay);
      });
    }, delayMs);
    // Never hold the process open for a poll. Without unref a Jest worker — and `node dist/main` on a
    // failed boot — stays alive forever waiting on a timer nobody is watching. Not optional-called:
    // testEnvironment is 'node', where setTimeout always returns a Timeout that has unref.
    this.timer.unref();
  }

  /**
   * One cycle. Returns how long to wait before the next one.
   *
   * Connecting BEFORE claiming is deliberate. Claiming spends an attempt from each row's budget, and
   * a row that runs out is left as a dead letter — so claiming while the broker is unreachable would
   * burn ten attempts on perfectly good events and retire them, purely because Kafka was down for
   * half an hour. Failing at connect() means nothing was claimed, so an outage of any length costs no
   * budget at all: the attempt counter then only ever measures what it is meant to, which is how many
   * times THIS event was actually offered to a broker that was listening.
   */
  async poll(): Promise<number> {
    try {
      if (!this.connected) {
        await this.producer.connect();
        this.connected = true;
      }

      const rows = await this.claim();
      if (rows.length === 0) return IDLE_INTERVAL_MS;

      for (const row of rows) await this.deliver(row);

      // A full batch means there is more behind it — come straight back rather than idling 500ms
      // between batches while a backlog drains.
      return rows.length === BATCH_SIZE ? 0 : IDLE_INTERVAL_MS;
    } catch (err) {
      // Reaching here means connect() or the claim statement failed, i.e. Kafka or PostgreSQL is
      // unavailable. Drop the connected flag so the next cycle rebuilds the producer rather than
      // publishing into a socket that is already gone.
      this.connected = false;
      logger.error({ err }, 'outbox.poll.failed — backing off');
      return ERROR_INTERVAL_MS;
    }
  }

  /**
   * Take up to BATCH_SIZE due rows for this replica.
   *
   * ONE statement, and it both claims and schedules: incrementing `attempts` and pushing
   * `next_attempt_at` forward is what hides the row from the other replicas' pollers while this one
   * publishes it. FOR UPDATE SKIP LOCKED inside the subquery is what lets three pollers run this
   * statement at the same instant and get three DISJOINT sets instead of three copies of one set.
   *
   * The attempt is counted at CLAIM time, not on failure. A poller killed mid-publish never reaches
   * any failure handler, so counting only clean failures would let a row that crashes the process
   * every time it is tried be retried forever.
   */
  private async claim(): Promise<ClaimedRow[]> {
    return this.prisma.$queryRaw<ClaimedRow[]>`
      UPDATE platform.outbox_events
         SET attempts        = attempts + 1,
             next_attempt_at = now() + (LEAST(300, 30 * (attempts + 1)) * interval '1 second')
       WHERE id IN (
         SELECT id
           FROM platform.outbox_events
          WHERE published = false
            AND attempts < ${MAX_ATTEMPTS}
            AND next_attempt_at <= now()
          ORDER BY created_at ASC
          LIMIT ${BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
       )
   RETURNING id, event_type, payload, attempts
    `;
  }

  private async deliver(row: ClaimedRow): Promise<void> {
    try {
      // The stored payload IS the envelope, event_id included — publish() honours that id rather than
      // minting a new one, which is what keeps a retry recognisable as the same event downstream.
      const envelope = row.payload as BaseEventEnvelope<unknown>;
      // Trace context comes OUT of the envelope and back into the Kafka headers (TDD OQ-2). It was
      // captured by EventOutboxService.publish() inside the request that raised the event; injecting
      // the active context here would stamp this poller's span on it instead, which points a reader
      // at the delivery rather than the cause. Passing nothing — which is what this did until
      // 2026-08-23 — set no trace header at all, so no backend domain event satisfied QM-8's "all
      // Kafka events must carry trace_id and span_id in headers".
      await this.producer.publish(envelope, {
        ...(envelope.trace_id ? { traceId: envelope.trace_id } : {}),
        ...(envelope.span_id ? { spanId: envelope.span_id } : {}),
      });
      await this.prisma.$executeRaw`
        UPDATE platform.outbox_events
           SET published = true, published_at = now(), last_error = NULL
         WHERE id = ${row.id}::uuid
      `;
      logger.debug({ event_id: row.id, event_type: row.event_type }, 'outbox.published');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.recordFailure(row.id, message);

      if (row.attempts >= MAX_ATTEMPTS) {
        // Terminal. ERROR, and it names the row, because nothing will retry it and no other signal
        // exists — a dead letter that only ever produced WARNs is a dropped event with extra steps.
        logger.error(
          { event_id: row.id, event_type: row.event_type, attempts: row.attempts, err },
          'outbox.dead-letter — giving up; this event will not be delivered without operator action',
        );
      } else {
        logger.warn(
          { event_id: row.id, event_type: row.event_type, attempts: row.attempts, err },
          'outbox.publish.failed — will retry',
        );
      }
    }
  }

  /** Best effort: the row retries on its own schedule whether or not the reason gets recorded. */
  private async recordFailure(id: string, message: string): Promise<void> {
    await this.prisma
      .$executeRaw`UPDATE platform.outbox_events SET last_error = ${message} WHERE id = ${id}::uuid`.catch(
      () => 0,
    );
  }
}
