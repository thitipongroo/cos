// EventOutboxService — where domain services publish events (ADR-094).
//
// WHAT THIS REPLACES
// ------------------
// Twelve services each held their own KafkaProducer and did connect → publish → disconnect INSIDE the
// request, wrapped in a try/catch whose comment claimed "outbox pattern picks up failures (Phase 8)".
// No outbox was ever wired, so the catch was the end of the road: a broker hiccup, a Schema Registry
// timeout, a partition leader election — and the event was gone, with one log line and a 200 OK
// already on its way to the client. Nothing downstream could tell that a project had been created
// but `construction.project.created.v1` never happened.
//
// It was also expensive per request. `connect()` performs a Schema Registry compatibility call and a
// full producer handshake, `ensureTopic()` an admin round trip, and because the services are
// Scope.REQUEST and built a NEW producer per request, the caches that exist to make those one-time
// (`knownTopics`, `schemaIds`) were empty every single time. Several of the twelve never called
// `disconnect()` at all, so the connection leaked with the request.
//
// WHAT HAPPENS NOW
// ----------------
// A publish is one INSERT into platform.outbox_events — local, fast, and DURABLE. OutboxPollerService
// delivers it to Kafka afterwards and retries until it lands. Kafka is out of the request path
// entirely, so a broker outage no longer costs events and no longer costs latency.
//
// HOW STRONG IS THE GUARANTEE
// ---------------------------
// Durable, not transactional. A true transactional outbox writes the event in the SAME transaction as
// the business row, which the classic pattern gets by threading `tx` from the repository into the
// publish call — this codebase's repositories own their transactions internally, so that is a
// refactor of every write path, not a change here. The gap that leaves is narrow and one-directional:
// if the process dies between the business write committing and this INSERT, the event is lost. That
// was ALSO true of the inline publish it replaces, and every other failure mode — broker down,
// registry down, publish timing out — is now recoverable where before it was not. `write(tx, …)`
// below exists so a caller that DOES have a transaction can close even that gap.

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createLogger } from '@cos/logger';
import type { BaseEventEnvelope } from '@cos/types';
import { createPrismaClient } from '../prisma/create-prisma-client';

const logger = createLogger('event-outbox');

/** Minimal shape of a Prisma transaction client — enough for write(tx, …). */
export interface OutboxTx {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

@Injectable()
export class EventOutboxService implements OnModuleDestroy {
  // The privileged DATABASE_URL connection, as for every other platform-schema table. Shares its pg
  // pool with the rest of the process (shared/prisma/create-prisma-client.ts).
  private readonly prisma = createPrismaClient();

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  /**
   * Queue an event for delivery. Returns the event_id, which is also the outbox row id and the key
   * KafkaConsumer dedupes on — one identity for the event from here to the consumer, so a retried
   * delivery is recognisably the same event and not a second one.
   *
   * Never throws. A domain event is a side effect of an operation that has already succeeded and been
   * committed; failing the caller's request because the queue insert failed would turn a delivery
   * problem into a user-visible error and, worse, into a business operation the client believes did
   * not happen when it did. The insert failing at all means the database is unavailable, in which case
   * the caller is about to find that out on its own.
   */
  async publish<T>(event: Omit<BaseEventEnvelope<T>, 'event_id'>): Promise<string | null> {
    const eventId = randomUUID();
    try {
      await this.insert(this.prisma, eventId, event);
      return eventId;
    } catch (err) {
      logger.error(
        { err, event_type: event.event_type, tenant_id: event.tenant_id },
        'outbox.write.failed — event will NOT be delivered',
      );
      return null;
    }
  }

  /**
   * Queue an event inside a caller-supplied transaction — the fully atomic form: the event and the
   * business row commit together or not at all.
   *
   * Unlike publish() this DOES propagate a failure, and must: it is running inside the caller's
   * transaction, so swallowing the error would commit the business row while silently dropping the
   * event, which is precisely the outcome the transactional form exists to make impossible.
   */
  async write<T>(tx: OutboxTx, event: Omit<BaseEventEnvelope<T>, 'event_id'>): Promise<string> {
    const eventId = randomUUID();
    await this.insert(tx, eventId, event);
    return eventId;
  }

  private async insert<T>(
    tx: OutboxTx,
    eventId: string,
    event: Omit<BaseEventEnvelope<T>, 'event_id'>,
  ): Promise<void> {
    // The stored payload is the COMPLETE envelope, event_id included, because that is exactly what
    // the poller hands to KafkaProducer.publish(). Storing the parts separately would mean rebuilding
    // the envelope at delivery time from a row that may be days old.
    const envelope: BaseEventEnvelope<T> = { ...event, event_id: eventId };
    await tx.$executeRaw`
      INSERT INTO platform.outbox_events (id, tenant_id, event_type, payload, published)
      VALUES (
        ${eventId}::uuid,
        ${event.tenant_id},
        ${event.event_type},
        ${JSON.stringify(envelope)}::jsonb,
        false
      )
    `;
  }
}
