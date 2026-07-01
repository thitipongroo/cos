// TombstonePruneService — bounds the growth of platform.sync_tombstones (anti-bloat).
//
// Deletion tombstones are only needed for the offline-sync retention window: a client whose delta
// cursor (`since`) is older than this window cannot be brought up to date incrementally (it may have
// missed deletions) and must do a FULL resync. So tombstones older than the window are useless and are
// pruned daily. Pair this with a delta-endpoint guard that forces a full resync when `since` is older
// than the window (otherwise pruning would silently drop deletions a stale client still needs).
//
// Runs as a singleton with a privileged (non-tenant) Prisma connection because the prune is a
// cross-tenant maintenance job; the `cos` role bypasses RLS, so it sweeps every tenant in one pass.

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createPrismaClient } from '../../shared/prisma/create-prisma-client';
import { createLogger } from '@cos/logger';

const logger = createLogger('tombstone-prune-service');
const DEFAULT_RETENTION_DAYS = 90;
const MS_PER_DAY = 86_400_000;

@Injectable()
export class TombstonePruneService implements OnModuleDestroy {
  private readonly prisma = createPrismaClient();

  private retentionDays(): number {
    const raw = process.env['SYNC_TOMBSTONE_RETENTION_DAYS'];
    const parsed = raw ? Number(raw) : DEFAULT_RETENTION_DAYS;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS;
  }

  /** Delete tombstones older than the retention window. Returns the number of rows removed. */
  @Cron('0 3 * * *', { timeZone: 'UTC', name: 'sync-tombstone-prune' })
  async pruneOldTombstones(): Promise<number> {
    const days = this.retentionDays();
    const cutoff = new Date(Date.now() - days * MS_PER_DAY).toISOString();
    const deleted = await this.prisma.$executeRaw`
      DELETE FROM platform.sync_tombstones WHERE deleted_at < ${cutoff}::timestamptz
    `;
    logger.info({ deleted, cutoff, retentionDays: days }, 'sync.tombstone.prune');
    return deleted;
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
