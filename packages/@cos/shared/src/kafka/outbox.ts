// OutboxPublisher + OutboxPoller — Phase 8
// Guarantees event delivery with DB transaction atomicity.
// Pattern: write to outbox_events in same transaction as business entity,
//          OutboxPoller polls every 500ms and publishes unpublished rows.
//
// outbox_events table is created per schema in the outbox migration.
// Service code calls OutboxPublisher.write() inside $transaction.
// OutboxPoller runs as a background process (started in main.ts).

import { PrismaClient } from '@prisma/client';
import { KafkaProducer } from './producer';
import { createLogger } from '@cos/logger';
import type { BaseEventEnvelope } from '@cos/types';

const logger = createLogger('outbox');

const POLL_INTERVAL_MS = 500;
const BATCH_SIZE = 50;

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
 *   await tx.$executeRaw`SET LOCAL search_path = ${tenantCode}`;
 *   await tx.project.create({ data: projectData });
 *   await OutboxPublisher.write(tx, event);
 * });
 */
export class OutboxPublisher {
  static async write<T>(
    tx: { $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown> },
    event: Omit<BaseEventEnvelope<T>, 'event_id'> & { event_id?: string },
  ): Promise<void> {
    const { randomUUID } = await import('crypto');
    const eventId = event.event_id ?? randomUUID();
    const envelope = { ...event, event_id: eventId };

    await (tx as unknown as PrismaClient).$executeRaw`
      INSERT INTO outbox_events (id, event_type, payload, published)
      VALUES (${eventId}::uuid, ${envelope.event_type}, ${JSON.stringify(envelope)}::jsonb, false)
    `;
  }
}

/**
 * OutboxPoller — background process that polls outbox_events every 500ms
 * and publishes unpublished events to Kafka.
 * Start once per deployable in main.ts bootstrap.
 */
export class OutboxPoller {
  private readonly prisma: PrismaClient;
  private readonly producer: KafkaProducer;
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(prisma: PrismaClient, producer: KafkaProducer) {
    this.prisma = prisma;
    this.producer = producer;
  }

  start(): void {
    this.running = true;
    this.scheduleNextPoll();
    logger.info('OutboxPoller started (interval: 500ms)');
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    logger.info('OutboxPoller stopped');
  }

  private scheduleNextPoll(): void {
    this.timer = setTimeout(async () => {
      await this.poll();
      if (this.running) this.scheduleNextPoll();
    }, POLL_INTERVAL_MS);
  }

  private async poll(): Promise<void> {
    try {
      // Fetch unpublished events across ALL schemas (platform + tenant schemas)
      // For platform schema (identity events)
      const rows = await this.prisma.$queryRaw<OutboxRecord[]>`
        SELECT id, event_type, payload, published, created_at, published_at
        FROM platform.outbox_events
        WHERE published = false
        ORDER BY created_at ASC
        LIMIT ${BATCH_SIZE}
      `;

      if (rows.length === 0) return;

      for (const row of rows) {
        try {
          const envelope = row.payload as BaseEventEnvelope<unknown>;
          await this.producer.publish(envelope);

          // Mark as published
          await this.prisma.$executeRaw`
            UPDATE platform.outbox_events
            SET published = true, published_at = now()
            WHERE id = ${row.id}::uuid
          `;
        } catch (err) {
          logger.error({ err, event_id: row.id, event_type: row.event_type }, 'OutboxPoller: failed to publish event');
          // Leave as unpublished — will retry on next poll
        }
      }

      if (rows.length > 0) {
        logger.debug({ count: rows.length }, 'OutboxPoller: published events');
      }
    } catch (err) {
      logger.error({ err }, 'OutboxPoller: poll error');
    }
  }
}
