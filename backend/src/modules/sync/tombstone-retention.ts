// Tombstone retention window — the single source of truth for BOTH sides of the offline-sync
// deletion contract:
//
//   TombstonePruneService  deletes tombstones older than this window.
//   SyncService.delta()    refuses an incremental pull whose cursor predates it.
//
// These two MUST agree. The prune ran without the delta-side guard, so a client that had been
// offline longer than the window received a delta with no tombstone for anything deleted-and-then-
// pruned in the meantime: the deletion was gone from the server's outbox and the client had never
// seen it, so the row stayed on that device forever. Keeping the number in one place is the fix —
// a second copy of `?? 90` somewhere else is how the gap reopens.

const DEFAULT_RETENTION_DAYS = 90;
export const MS_PER_DAY = 86_400_000;

/** Retention window in days. Falls back to the default for unset, non-numeric or non-positive input. */
export function tombstoneRetentionDays(): number {
  const raw = process.env['SYNC_TOMBSTONE_RETENTION_DAYS'];
  const parsed = raw ? Number(raw) : DEFAULT_RETENTION_DAYS;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS;
}

/** Oldest `deleted_at` still guaranteed to be retained — the prune cutoff and the delta floor. */
export function tombstoneRetentionCutoff(now: number = Date.now()): Date {
  return new Date(now - tombstoneRetentionDays() * MS_PER_DAY);
}
