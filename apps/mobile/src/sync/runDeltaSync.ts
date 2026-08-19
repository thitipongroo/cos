// runDeltaSync — pulls server changes since the last sync cursor and applies them to the local
// Drizzle/expo-sqlite tables, then advances the cursor (syncStore.lastSyncAt). Triggered from
// (app)/_layout on entry.
//
// All six server entity types are applied: task/site_report/issue/attendance/safety/material, each
// to its local table. The server tags each updated row with `entity_type`; `deleted` is a flat id
// list (matched across tables via each table's server-key column). Writes go through the
// existingKeys/insertMany/upsertByKey/deleteByKeys/clearTable seams in db/database.ts (also the
// unit-test mock point).
//
// PAGED, because the server pages. /sync/delta caps each entity type at 500 rows and answers with
// `has_more` plus the cursor to resume from; this read the first page and stopped, silently dropping
// everything behind it. It also ignored `full_resync_required`, the server's way of saying its
// tombstone list is incomplete for a cursor this old — see the loop below for both.

import {
  deleteByKeys,
  existingKeys,
  insertMany,
  upsertByKey,
  clearTable,
  TableName,
} from '../db/database';
import { fetchDelta } from '../api/client';
import { useSyncStore } from '../store/syncStore';

const EPOCH = '1970-01-01T00:00:00.000Z';

/**
 * Hard stop on the paging loop.
 *
 * The server pages at 500 rows per entity type and advances the cursor to the lowest truncated
 * watermark, so a normal catch-up converges in a handful of passes. The cap is a guard against the
 * one case the server itself documents as unpageable — 500 rows sharing an identical microsecond
 * timestamp, where the cursor cannot advance — which without it would spin forever on a device in
 * someone's pocket. Reaching it leaves the cursor where it got to; the next sync resumes there.
 */
const MAX_PAGES = 50;

interface ApplySpec {
  table: TableName;
  idColumn: string; // server-key column (snake_case, as sent by the server)
  // server payload key (snake_case) → Drizzle column TS name
  fields: Record<string, string>;
}

const APPLY: Record<string, ApplySpec> = {
  task: {
    table: 'local_tasks',
    idColumn: 'task_id',
    fields: {
      task_id: 'taskId',
      project_id: 'projectId',
      task_name: 'taskName',
      status: 'status',
      progress_percent: 'progressPercent',
      assigned_to: 'assignedTo',
      // Shown on the task card (DDL v4). The server already sent these — /sync/delta selects the
      // whole row — and the client dropped them, so a card had only a name and a percentage.
      work_type: 'workType',
      planned_start: 'plannedStart',
      planned_end: 'plannedEnd',
      // The working window the dashboard card is headed by (DDL v5).
      planned_start_time: 'plannedStartTime',
      planned_end_time: 'plannedEndTime',
    },
  },
  site_report: {
    table: 'local_site_reports',
    idColumn: 'report_id',
    fields: {
      report_id: 'reportId',
      project_id: 'projectId',
      report_date: 'reportDate',
      summary: 'summary',
      status: 'status',
    },
  },
  issue: {
    table: 'local_issues',
    idColumn: 'issue_id',
    fields: {
      issue_id: 'issueId',
      project_id: 'projectId',
      report_id: 'reportId',
      title: 'title',
      description: 'description',
      severity: 'severity',
      status: 'status',
      // Kept from the delta since DDL v6. The server has always sent both — /sync/delta selects the
      // whole site_ops.issues row — and the client dropped them, so the issue board could say
      // neither what kind of issue a card was nor how old it is.
      issue_type: 'issueType',
      created_at: 'createdAt',
    },
  },
  attendance: {
    table: 'local_attendance',
    idColumn: 'log_id',
    fields: {
      log_id: 'logId',
      worker_id: 'workerId',
      project_id: 'projectId',
      check_in_at: 'checkInAt',
      check_out_at: 'checkOutAt',
      hours_worked: 'hoursWorked',
    },
  },
  safety: {
    table: 'local_incidents',
    idColumn: 'incident_id',
    fields: {
      incident_id: 'incidentId',
      project_id: 'projectId',
      incident_type: 'incidentType',
      severity: 'severity',
      status: 'status',
      created_at: 'createdAt',
    },
  },
  material: {
    table: 'local_material_consumptions',
    idColumn: 'consumption_id',
    fields: {
      consumption_id: 'consumptionId',
      project_id: 'projectId',
      material_name: 'materialName',
      quantity: 'quantity',
      unit: 'unit',
      consumed_at: 'consumedAt',
    },
  },
};

const DELTA_TYPES = Object.keys(APPLY);

// Drizzle column TS name of each table's server-key column (for upsert/delete matching).
const KEY_TS: Record<string, string> = {
  task_id: 'taskId',
  report_id: 'reportId',
  issue_id: 'issueId',
  log_id: 'logId',
  incident_id: 'incidentId',
  consumption_id: 'consumptionId',
};

export async function runDeltaSync(): Promise<void> {
  let since = useSyncStore.getState().lastSyncAt ?? EPOCH;
  let wiped = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await fetchDelta<Record<string, unknown>>(DELTA_TYPES, since);
    const { updated, deleted, server_timestamp, has_more, full_resync_required } = response;

    // THE SERVER SAYS OUR CURSOR IS TOO OLD TO TRUST. Its `deleted` list cannot include rows that
    // were deleted and then pruned while this device was away, so anything of that kind is still
    // sitting in the local cache and no future delta will ever mention it. Dropping the cached rows
    // first — once, before the first page is applied — is what the server's contract asks for. The
    // pages that follow repopulate them.
    //
    // Only read caches are cleared. The outbox (sync_queue, a different database) is untouched: a
    // stale cursor says nothing about mutations this device has not yet pushed.
    if (full_resync_required && !wiped) {
      for (const spec of Object.values(APPLY)) {
        await clearTable(spec.table);
      }
      wiped = true;
    }

    await applyUpdated(updated);
    await applyDeleted(deleted);

    // Persisted per page, not once at the end: a pull interrupted half way (the app is backgrounded,
    // the signal drops) then resumes from the last page it actually applied instead of starting over.
    await useSyncStore.getState().setLastSyncAt(server_timestamp);
    since = server_timestamp;

    if (!has_more) return;
  }
}

/** Apply one page's `updated` rows, grouped by table so each table costs a constant few statements. */
async function applyUpdated(updated: Array<Record<string, unknown>>): Promise<void> {
  // Group first: the rows arrive interleaved by entity type, and applying them in arrival order was
  // what forced a SELECT + an INSERT/UPDATE per row.
  const byType = new Map<string, Array<Record<string, unknown>>>();
  for (const row of updated) {
    const type = String(row['entity_type']);
    // `Object.hasOwn`, not truthiness — `APPLY['constructor']` is truthy and would be treated as a
    // spec. The server guards its own registry the same way and says why (SyncService.delta).
    if (!Object.hasOwn(APPLY, type)) continue;
    const bucket = byType.get(type);
    if (bucket) bucket.push(row);
    else byType.set(type, [row]);
  }

  for (const [type, rows] of byType) {
    const spec = APPLY[type]!;
    const keyTs = KEY_TS[spec.idColumn]!;

    // Last occurrence wins if a page carries the same id twice — the rows are ordered by the delta
    // column, so the later one is the newer state.
    const values = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      const id = String(row[spec.idColumn] ?? '');
      if (!id) continue;
      const mapped: Record<string, unknown> = { offlineSyncStatus: 'SYNCED' };
      for (const [serverKey, tsName] of Object.entries(spec.fields)) {
        mapped[tsName] = row[serverKey] ?? null;
      }
      values.set(id, mapped);
    }
    if (values.size === 0) continue;

    const ids = [...values.keys()];
    const present = await existingKeys(spec.table, keyTs, ids);

    // New rows go in one statement; rows that already exist still need their own UPDATE, because
    // each carries different values.
    const inserts: Array<Record<string, unknown>> = [];
    for (const [id, mapped] of values) {
      if (present.has(id)) await upsertByKey(spec.table, keyTs, id, mapped);
      else inserts.push(mapped);
    }
    await insertMany(spec.table, inserts);
  }
}

/**
 * Apply one page's tombstones.
 *
 * `deleted` is a flat id list with no entity type, so every id is tried against every table — but
 * once per table for the whole page rather than once per table per id.
 */
async function applyDeleted(deleted: string[]): Promise<void> {
  if (deleted.length === 0) return;
  for (const spec of Object.values(APPLY)) {
    await deleteByKeys(spec.table, KEY_TS[spec.idColumn]!, deleted);
  }
}
