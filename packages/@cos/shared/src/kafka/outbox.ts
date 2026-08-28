// OutboxPublisher — Phase 8.
// Guarantees event delivery with DB transaction atomicity: the event row is written in the SAME
// transaction as the business entity, so it cannot be lost if the process dies before publishing.
//
// outbox_events lives in the platform schema (single table, no per-tenant schema — ADR-008).
// Service code calls OutboxPublisher.write() inside $transaction.
//
// The DRAINING half of the pattern is deliberately NOT here. Rule 34(c) (master:5847) names this
// exact class — "e.g., OutboxPoller which polls a DB" — as the kind that must live in backend/src/
// rather than in @cos/shared, because a polling loop needs a Node runtime while this package is
// meant to be importable from React Native and a Service Worker. An OutboxPoller was nevertheless
// defined and exported from here until 2026-08-27, duplicating
// backend/src/shared/events/outbox-poller.service.ts — which is the one registered in EventsModule,
// and the only one that has ever run. The package README had stated the rule correctly the whole
// time, a few lines from the code breaking it. The duplicate was deleted rather than kept in sync.
// Add nothing to this file that needs a DB handle or a timer.

// Minimal Prisma-compatible interface — avoids importing @prisma/client at the package level.
// @cos/shared must remain framework-agnostic (Rule 34): no Node.js-only runtime imports.
interface OutboxPrismaClient {
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}
import { randomUUID } from 'crypto';
import type { BaseEventEnvelope } from '@cos/types';

export interface OutboxRecord {
  id: string;
  event_type: string;
  payload: unknown;
  published: boolean;
  created_at: Date;
  published_at: Date | null;
}

/**
 * OutboxPublisher — write to outbox_events inside a DB transaction.
 * Call this instead of KafkaProducer.publish() when DB atomicity is required.
 *
 * @example
 * await prisma.$transaction(async (tx) => {
 *   await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
 *   await tx.$executeRaw`INSERT INTO projects.projects (...) VALUES (...)`;
 *   await OutboxPublisher.write(tx, event);
 * });
 */
export class OutboxPublisher {
  static async write<T>(
    tx: { $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown> },
    event: Omit<BaseEventEnvelope<T>, 'event_id'> & { event_id?: string },
  ): Promise<void> {
    const eventId = event.event_id ?? randomUUID();
    const envelope = { ...event, event_id: eventId };

    // MUST stay schema-qualified. This INSERT was unqualified while the poller reads and
    // updates `platform.outbox_events`, so writer and reader did not necessarily address the same
    // table: nothing in the application sets search_path, and `public.outbox_events` was moved to
    // the `projects` schema by 20260605000004_db_refactor_global_schemas. The failure mode is the
    // bad kind — events accepted into a table the poller never reads, so they are never published
    // and nothing errors. (QM-4 / spec §11.0 rule 2; found by the Semgrep SQL audit, ADR-011.)
    await (tx as unknown as OutboxPrismaClient).$executeRaw`
      INSERT INTO platform.outbox_events (id, event_type, payload, published)
      VALUES (${eventId}::uuid, ${envelope.event_type}, ${JSON.stringify(envelope)}::jsonb, false)
    `;
  }
}
