// runDeltaSync — pulls server changes since the last sync cursor and applies them to the local
// Drizzle/expo-sqlite tables, then advances the cursor (syncStore.lastSyncAt). Triggered from
// (app)/_layout on entry.
//
// All six server entity types are applied: task/site_report/issue/attendance/safety/material, each
// to its local table. The server tags each updated row with `entity_type`; `deleted` is a flat id
// list (matched across tables via each table's server-key column). Writes go through the
// upsertByKey/deleteByKey seams in db/database.ts (also the unit-test mock point).

import { upsertByKey, deleteByKey, TableName } from '../db/database';
import { fetchDelta } from '../api/client';
import { useSyncStore } from '../store/syncStore';

const EPOCH = '1970-01-01T00:00:00.000Z';

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
  const since = useSyncStore.getState().lastSyncAt ?? EPOCH;
  const { updated, deleted, server_timestamp } = await fetchDelta<Record<string, unknown>>(
    DELTA_TYPES,
    since,
  );

  for (const row of updated) {
    const spec = APPLY[String(row['entity_type'])];
    if (!spec) continue;
    const id = String(row[spec.idColumn] ?? '');
    if (!id) continue;

    const values: Record<string, unknown> = { offlineSyncStatus: 'SYNCED' };
    for (const [serverKey, tsName] of Object.entries(spec.fields)) {
      values[tsName] = row[serverKey] ?? null;
    }
    await upsertByKey(spec.table, KEY_TS[spec.idColumn]!, id, values);
  }

  for (const id of deleted) {
    for (const spec of Object.values(APPLY)) {
      await deleteByKey(spec.table, KEY_TS[spec.idColumn]!, id);
    }
  }

  useSyncStore.getState().setLastSyncAt(server_timestamp);
}
