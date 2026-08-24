// §17.6 Sync Priority Order — the order the sync queue flushes on reconnect.
// Lower rank = flushed first. Safety incidents are most time-sensitive; photo/media
// (largest payload) are handled by PhotoUploadQueue, deferred last, and are not in this queue.
// Entity types not listed here (e.g. conflict resolution, payment approvals) flush after all
// ranked types, still oldest-first within the same rank.

// THE ORDER HAS TO NAME THE TYPES THE APP ACTUALLY ENQUEUES, and until 2026-08-19 it did not.
// `equipment` appears in §17.6 but nothing in this app enqueues it, while `issue` and
// `photo_annotation` — both genuinely enqueued (issues.tsx, sync/enqueueAnnotation.ts) — appeared
// nowhere, so they fell into the unranked tail and flushed BEHIND material consumption logs. A site
// defect raised at the start of a shift queued behind a materials tally is not what §17.6 orders;
// it is what happens when a list of names drifts from the code that produces them.
//
// The ranked set is now exactly the set /sync/push accepts (see PUSHABLE_ENTITY_TYPES in
// api/client.ts, itself the server's switch), with `equipment` kept last for the §17.6 category that
// exists in the spec but has no writer yet — a rank costs nothing and is there when one appears.
export const SYNC_PRIORITY_ORDER = [
  'safety', // 1. Safety incidents (critical — escalation may be time-sensitive)
  'attendance', // 2. Workforce attendance (payroll dependency)
  'inspection', // 3. Inspection results, incl. safety checklists (QC gate may block downstream tasks)
  'issue', // 4. Site defects — raised on site, and what a site report is usually raised ABOUT
  'task', // 5. Task progress updates
  'site_report', // 6. Site report drafts
  'material', // 7. Material consumption logs
  'delivery', // 8. Goods received at the gate (§17.4 amendment 2026-08-19)
  'purchase-request', // 9. Material shortage raised on site (§17.4 amendment 2026-08-19)
  'photo_annotation', // 10. Markup on an already-uploaded photo — meaningless without its parent
  'equipment', // 11. Equipment usage logs (§17.6 category; no writer in the app yet)
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
