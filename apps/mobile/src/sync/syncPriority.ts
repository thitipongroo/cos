// §17.6 Sync Priority Order — the order the sync queue flushes on reconnect.
// Lower rank = flushed first. Safety incidents are most time-sensitive; photo/media
// (largest payload) are handled by PhotoUploadQueue, deferred last, and are not in this queue.
// Entity types not listed here (e.g. conflict resolution, payment approvals) flush after all
// ranked types, still oldest-first within the same rank.

// entity_type values match those enqueued by the app (see src/api/client.ts callers):
//   safety · attendance · inspection · task · site_report · material · equipment
export const SYNC_PRIORITY_ORDER = [
  'safety', // 1. Safety incidents (critical — escalation may be time-sensitive)
  'attendance', // 2. Workforce attendance (payroll dependency)
  'inspection', // 3. Inspection results (QC gate may block downstream tasks)
  'task', // 4. Task progress updates
  'site_report', // 5. Site report drafts
  'material', // 6. Material consumption logs
  'equipment', // 7. Equipment usage logs
] as const;

/** Rank for an entity type (lower = higher priority). Unranked types sort after all ranked ones. */
export function syncPriorityRank(entityType: string): number {
  const idx = (SYNC_PRIORITY_ORDER as readonly string[]).indexOf(entityType);
  return idx === -1 ? SYNC_PRIORITY_ORDER.length : idx;
}

/**
 * SQL `CASE` expression mapping entity_type → its priority rank, for use in `ORDER BY`.
 * Built only from the fixed SYNC_PRIORITY_ORDER literals (no user input → injection-safe).
 */
export function syncPriorityCaseSql(column = 'entity_type'): string {
  const whens = SYNC_PRIORITY_ORDER.map((t, i) => `WHEN '${t}' THEN ${i}`).join(' ');
  return `CASE ${column} ${whens} ELSE ${SYNC_PRIORITY_ORDER.length} END`;
}
