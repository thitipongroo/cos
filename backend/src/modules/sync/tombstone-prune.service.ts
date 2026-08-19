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
import { ScheduledJobLockService } from '../../shared/scheduling/scheduled-job-lock.service';
import { tombstoneRetentionCutoff, tombstoneRetentionDays } from './tombstone-retention';

const logger = createLogger('tombstone-prune-service');

/** @Cron name and the lease key in platform.scheduled_job_locks — the same string on purpose. */
export const TOMBSTONE_PRUNE_JOB = 'sync-tombstone-prune';

/**
 * Lease length. Fifteen minutes covers a large DELETE with room to spare on a daily schedule.
 */
export const TOMBSTONE_PRUNE_LEASE_SECONDS = 900;

@Injectable()
export class TombstonePruneService implements OnModuleDestroy {
  private readonly prisma = createPrismaClient();

  constructor(private readonly locks: ScheduledJobLockService) {}

  /**
   * Delete tombstones older than the retention window. Returns the number of rows removed, or null
   * when another replica holds the lease.
   *
   * The DELETE is idempotent, so three replicas running it was not a correctness bug the way the
   * notification jobs were — but three concurrent full-table DELETEs over the same rows is three
   * times the lock contention and WAL for one job's worth of work, and the row count each one logs
   * is then a fraction of the truth. Leasing it makes the logged number mean what it says.
   */
  @Cron('0 3 * * *', { timeZone: 'UTC', name: TOMBSTONE_PRUNE_JOB })
  async pruneOldTombstones(): Promise<number | null> {
    return this.locks.runExclusively(
      TOMBSTONE_PRUNE_JOB,
      TOMBSTONE_PRUNE_LEASE_SECONDS,
      async () => {
        // Window shared with SyncService.delta() (see tombstone-retention.ts) — the prune is only
        // safe because the delta endpoint refuses cursors older than this same cutoff.
        const days = tombstoneRetentionDays();
        const cutoff = tombstoneRetentionCutoff().toISOString();
        const deleted = await this.prisma.$executeRaw`
          DELETE FROM platform.sync_tombstones WHERE deleted_at < ${cutoff}::timestamptz
        `;
        logger.info({ deleted, cutoff, retentionDays: days }, 'sync.tombstone.prune');
        return deleted;
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
