// OutboxPollerService — owns the Phase 8 OutboxPoller lifecycle inside Nest DI.
//
// The poller reads unpublished rows from platform.outbox_events every 500ms and relays them to
// Kafka. It is started once per deployable and stopped on shutdown so SIGTERM during a Kubernetes
// rolling deploy does not sever an in-flight poll (Rule 39 / ADR-034 — every long-lived handle
// closes on shutdown; main.ts calls app.enableShutdownHooks()).
//
// §35.13 ESC-22 — ONE POLLER PER DATASOURCE, not one per deployable.
//   `TenantPrismaService` routes an ENTERPRISE tenant to its dedicated database (ADR-008,
//   spec §7.1), and `runMigrationsActivity` runs the full migration set there — so that database
//   has its own `platform.outbox_events` and the in-transaction write succeeds. A single poller
//   bound to `DATABASE_URL` would never read those rows: every event for a dedicated-DB tenant
//   would sit unpublished forever, silently and without an error. Writing the outbox to the shared
//   database instead was rejected: it would put the outbox row in a different transaction from the
//   business row, which is precisely the dual-write the pattern exists to eliminate.
//
//   So this service polls the shared database AND every active dedicated database, refreshing the
//   set periodically so a tenant provisioned while the process is running is picked up without a
//   restart.
//
// Source: context/00_master_construction_os.md §Phase 8 (Outbox Pattern, OutboxPoller);
// docs/specifications/35-test-design.md §35.13 ESC-13, ESC-22.

import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { KafkaProducer, OutboxPoller } from '@cos/kafka';
import { createLogger } from '@cos/logger';
import { createPrismaClient } from '../prisma/create-prisma-client';

const logger = createLogger('outbox-poller');

/**
 * How often the dedicated-database set is re-read from `platform.tenants`.
 *
 * Not a spec value — an operational tunable. 60s is chosen to be far longer than the 500ms poll
 * (so it adds no meaningful load) yet short enough that a tenant provisioned mid-deployment starts
 * relaying within a minute rather than at the next restart. Override with
 * `OUTBOX_POLLER_TENANT_REFRESH_MS`.
 */
const DEFAULT_TENANT_REFRESH_MS = 60_000;

/** The shared datasource is keyed by this sentinel rather than by its URL, which may be empty. */
const SHARED_DATASOURCE = '__shared__';

interface PollerHandle {
  poller: OutboxPoller;
  prisma: ReturnType<typeof createPrismaClient>;
}

@Injectable()
export class OutboxPollerService implements OnApplicationBootstrap, OnApplicationShutdown {
  /** One entry per datasource: the shared DB plus each active dedicated DB, keyed by URL. */
  private readonly pollers = new Map<string, PollerHandle>();
  private producer: KafkaProducer | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  async onApplicationBootstrap(): Promise<void> {
    // OUTBOX_POLLER_ENABLED=false lets a deployable (e.g. a worker replica set that must not relay)
    // opt out without a code change. Default is enabled — the pattern is mandatory (QM-9).
    if (process.env['OUTBOX_POLLER_ENABLED'] === 'false') {
      logger.warn('OutboxPoller disabled via OUTBOX_POLLER_ENABLED=false');
      return;
    }

    this.producer = new KafkaProducer();
    await this.producer.connect();

    // The shared database always gets a poller — it holds every STARTER/PROFESSIONAL tenant.
    this.startPoller(SHARED_DATASOURCE, createPrismaClient());
    logger.info('OutboxPoller started');

    await this.refreshDedicatedPollers();

    const refreshMs = Number(
      process.env['OUTBOX_POLLER_TENANT_REFRESH_MS'] ?? DEFAULT_TENANT_REFRESH_MS,
    );
    this.refreshTimer = setInterval(() => {
      void this.refreshDedicatedPollers();
    }, refreshMs);
    // Do not hold the event loop open on this timer alone (Rule 39 / ADR-034).
    this.refreshTimer.unref?.();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    for (const { poller, prisma } of this.pollers.values()) {
      poller.stop();
      await prisma.$disconnect();
    }
    this.pollers.clear();
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }
    logger.info('OutboxPoller stopped');
  }

  /**
   * Reads the active dedicated-database URLs and starts a poller for any that has none yet.
   *
   * Never throws: a tenant database that is unreachable, or a shared database that is briefly
   * unavailable, must not take the whole relay down — the next refresh retries. Pollers are only
   * ever added here; one is removed when a tenant is deactivated, so its remaining rows are not
   * stranded by the deactivation itself.
   */
  private async refreshDedicatedPollers(): Promise<void> {
    const shared = this.pollers.get(SHARED_DATASOURCE);
    if (!shared) return;

    let rows: Array<{ dedicated_db_url: string }>;
    try {
      rows = await shared.prisma.$queryRaw<Array<{ dedicated_db_url: string }>>`
        SELECT dedicated_db_url FROM platform.tenants
        WHERE dedicated_db_url IS NOT NULL AND is_active = true
      `;
    } catch (err) {
      logger.error({ err }, 'outbox.dedicated_poller.refresh_failed');
      return;
    }

    for (const { dedicated_db_url: url } of rows) {
      if (this.pollers.has(url)) continue;
      try {
        this.startPoller(url, createPrismaClient(url));
        logger.info({ datasource_count: this.pollers.size }, 'outbox.dedicated_poller.started');
      } catch (err) {
        // Log the failure without the URL — it carries the database password.
        logger.error({ err }, 'outbox.dedicated_poller.start_failed');
      }
    }
  }

  private startPoller(key: string, prisma: ReturnType<typeof createPrismaClient>): void {
    const poller = new OutboxPoller(prisma, this.producer!);
    poller.start();
    this.pollers.set(key, { poller, prisma });
  }
}
