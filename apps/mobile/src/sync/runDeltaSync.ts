// runDeltaSync — pulls server changes since the last sync cursor and applies them to local
// WatermelonDB, then advances the cursor (syncStore.lastSyncAt). Wires the previously-unused
// delta endpoint (GET /sync/delta) into the app; triggered from (app)/_layout on entry.
//
// All six server entity types are applied: task/site_report/issue/attendance/safety/material, each
// to its local table. The server tags each updated row with `entity_type`; `deleted` is a flat id
// list (matched across tables).

import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import { fetchDelta } from '../api/client';
import { useSyncStore } from '../store/syncStore';

const EPOCH = '1970-01-01T00:00:00.000Z';

interface ApplySpec {
  table: string;
  idColumn: string;
  columns: string[];
}

const APPLY: Record<string, ApplySpec> = {
  task: {
    table: 'local_tasks',
    idColumn: 'task_id',
    columns: ['task_id', 'project_id', 'task_name', 'status', 'progress_percent', 'assigned_to'],
  },
  site_report: {
    table: 'local_site_reports',
    idColumn: 'report_id',
    columns: ['report_id', 'project_id', 'report_date', 'summary', 'status'],
  },
  issue: {
    table: 'local_issues',
    idColumn: 'issue_id',
    columns: ['issue_id', 'project_id', 'report_id', 'title', 'description', 'severity', 'status'],
  },
  attendance: {
    table: 'local_attendance',
    idColumn: 'log_id',
    columns: ['log_id', 'worker_id', 'project_id', 'check_in_at', 'check_out_at', 'hours_worked'],
  },
  safety: {
    table: 'local_incidents',
    idColumn: 'incident_id',
    columns: ['incident_id', 'project_id', 'incident_type', 'severity', 'status', 'created_at'],
  },
  material: {
    table: 'local_material_consumptions',
    idColumn: 'consumption_id',
    columns: ['consumption_id', 'project_id', 'material_name', 'quantity', 'unit', 'consumed_at'],
  },
};

const DELTA_TYPES = Object.keys(APPLY);

type RawSetter = { _setRaw: (column: string, value: unknown) => void };

export async function runDeltaSync(): Promise<void> {
  const since = useSyncStore.getState().lastSyncAt ?? EPOCH;
  const { updated, deleted, server_timestamp } = await fetchDelta<Record<string, unknown>>(
    DELTA_TYPES,
    since,
  );

  await database.write(async () => {
    for (const row of updated) {
      const spec = APPLY[String(row['entity_type'])];
      if (!spec) continue;
      const id = String(row[spec.idColumn] ?? '');
      if (!id) continue;

      const collection = database.get(spec.table);
      const existing = await collection.query(Q.where(spec.idColumn, id)).fetch();
      const applyFields = (record: RawSetter): void => {
        for (const column of spec.columns) record._setRaw(column, row[column] ?? null);
        record._setRaw('sync_status', 'SYNCED');
      };

      if (existing.length > 0) {
        await (
          existing[0] as unknown as { update: (fn: (r: RawSetter) => void) => Promise<void> }
        ).update(applyFields);
      } else {
        await (
          collection as unknown as { create: (fn: (r: RawSetter) => void) => Promise<void> }
        ).create(applyFields);
      }
    }

    for (const id of deleted) {
      for (const spec of Object.values(APPLY)) {
        const found = await database.get(spec.table).query(Q.where(spec.idColumn, id)).fetch();
        for (const record of found) {
          await (
            record as unknown as { destroyPermanently: () => Promise<void> }
          ).destroyPermanently();
        }
      }
    }
  });

  useSyncStore.getState().setLastSyncAt(server_timestamp);
}
