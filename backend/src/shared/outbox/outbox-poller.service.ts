// OutboxPollerService — owns the Phase 8 OutboxPoller lifecycle inside Nest DI.
//
// The poller reads unpublished rows from platform.outbox_events every 500ms and relays them to
// Kafka. It is started once per deployable and stopped on shutdown so SIGTERM during a Kubernetes
// rolling deploy does not sever an in-flight poll (Rule 39 / ADR-034 — every long-lived handle
// closes on shutdown; main.ts calls app.enableShutdownHooks()).
//
// Source: context/00_master_construction_os.md §Phase 8 (Outbox Pattern, OutboxPoller);
// docs/specifications/35-test-design.md §35.13 ESC-13.

import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { KafkaProducer, OutboxPoller } from '@cos/kafka';
import { createLogger } from '@cos/logger';
import { createPrismaClient } from '../prisma/create-prisma-client';

const logger = createLogger('outbox-poller');

@Injectable()
export class OutboxPollerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private poller: OutboxPoller | null = null;
  private producer: KafkaProducer | null = null;
  private prisma: ReturnType<typeof createPrismaClient> | null = null;

  async onApplicationBootstrap(): Promise<void> {
    // OUTBOX_POLLER_ENABLED=false lets a deployable (e.g. a worker replica set that must not relay)
    // opt out without a code change. Default is enabled — the pattern is mandatory (QM-9).
    if (process.env['OUTBOX_POLLER_ENABLED'] === 'false') {
      logger.warn('OutboxPoller disabled via OUTBOX_POLLER_ENABLED=false');
      return;
    }

    this.prisma = createPrismaClient();
    this.producer = new KafkaProducer();
    await this.producer.connect();
    this.poller = new OutboxPoller(this.prisma, this.producer);
    this.poller.start();
    logger.info('OutboxPoller started');
  }

  async onApplicationShutdown(): Promise<void> {
    this.poller?.stop();
    this.poller = null;
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }
    if (this.prisma) {
      await this.prisma.$disconnect();
      this.prisma = null;
    }
    logger.info('OutboxPoller stopped');
  }
}
