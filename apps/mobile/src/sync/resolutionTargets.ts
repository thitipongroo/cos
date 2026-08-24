// Where a pushed mutation's LOCAL row lives, so the server's verdict can be written back to it.
//
// `/sync/push` answers per queue item with a status. Until 2026-08-19 nothing acted on it: the local
// row that produced the mutation kept `sync_status = 'PENDING'` forever, whether the server accepted
// it, overrode it, or flagged it for review. A worker's issue therefore stayed visibly unsynced after
// it had synced, and a change the server had overridden still showed the worker's own version with
// nothing to say it had not won.
//
// THE MAPPING IS ONLY POSSIBLE BECAUSE THE QUEUE KEY IS THE LOCAL KEY. Every offline create in this
// app generates a client UUID, writes it into the local row's server-id column, and enqueues under
// the same value (ADR-051 / G-M11) — `issues.tsx` draftId → `issueId`, `report.tsx` clientId →
// `reportId`, a task update under its own `taskId`. So `entity_id` locates the row directly.
//
// Types absent from this map are skipped rather than guessed at:
//   material  — reports.tsx enqueues under the parent REPORT's id and writes no local consumption
//               row, so there is nothing here to update.
//   inspection — has no local table at all.
//   photo_annotation — reconciled by its own ADR-056 path in runPushSync, which needs the server's
//               version number, not just a status.

import type { TableName } from '../db/database';

export interface ResolutionTarget {
  table: TableName;
  /** Drizzle column TS name holding the id the queue item was enqueued under. */
  keyColumn: string;
}

const TARGETS: Record<string, ResolutionTarget> = {
  issue: { table: 'local_issues', keyColumn: 'issueId' },
  site_report: { table: 'local_site_reports', keyColumn: 'reportId' },
  task: { table: 'local_tasks', keyColumn: 'taskId' },
  safety: { table: 'local_incidents', keyColumn: 'incidentId' },
};

/**
 * The local row a pushed `entityType` came from, or null when there is nothing to write back.
 *
 * `Object.hasOwn`, not truthiness: a plain-object lookup walks the prototype chain, so `constructor`
 * / `toString` / `__proto__` would each resolve to a truthy value and be treated as a mapping. The
 * server hit exactly this on its own entity registry (SyncService.delta) with an `entity_types`
 * parameter, and `entity_type` reaches here from the same queue those values are written into.
 */
export function resolutionTarget(entityType: string): ResolutionTarget | null {
  return Object.hasOwn(TARGETS, entityType) ? TARGETS[entityType]! : null;
}
