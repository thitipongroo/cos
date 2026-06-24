// WatermelonDB schema migrations.
// v1 → v2: add local_tasks, local_attendance, local_safety_checklists (Phase 10 feature-UI).
// v2 → v3: add local_projects (read-only offline project cache).
// v3 → v4: add local_incidents, local_material_consumptions (delta-sync read cache for safety/material).
// Keep in lockstep with schema.ts DB_VERSION.

import { schemaMigrations, createTable } from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 4,
      steps: [
        createTable({
          name: 'local_incidents',
          columns: [
            { name: 'incident_id', type: 'string' },
            { name: 'project_id', type: 'string' },
            { name: 'incident_type', type: 'string' },
            { name: 'severity', type: 'string' },
            { name: 'status', type: 'string' },
            { name: 'created_at', type: 'string', isOptional: true },
            { name: 'sync_status', type: 'string' },
          ],
        }),
        createTable({
          name: 'local_material_consumptions',
          columns: [
            { name: 'consumption_id', type: 'string' },
            { name: 'project_id', type: 'string' },
            { name: 'material_name', type: 'string' },
            { name: 'quantity', type: 'number' },
            { name: 'unit', type: 'string' },
            { name: 'consumed_at', type: 'string', isOptional: true },
            { name: 'sync_status', type: 'string' },
          ],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        createTable({
          name: 'local_projects',
          columns: [
            { name: 'project_id', type: 'string' },
            { name: 'project_code', type: 'string' },
            { name: 'project_name', type: 'string' },
            { name: 'status', type: 'string' },
          ],
        }),
      ],
    },
    {
      toVersion: 2,
      steps: [
        createTable({
          name: 'local_tasks',
          columns: [
            { name: 'task_id', type: 'string' },
            { name: 'project_id', type: 'string' },
            { name: 'task_name', type: 'string' },
            { name: 'status', type: 'string' },
            { name: 'progress_percent', type: 'number' },
            { name: 'assigned_to', type: 'string', isOptional: true },
            { name: 'sync_status', type: 'string' },
          ],
        }),
        createTable({
          name: 'local_attendance',
          columns: [
            { name: 'log_id', type: 'string' },
            { name: 'worker_id', type: 'string' },
            { name: 'project_id', type: 'string' },
            { name: 'check_in_at', type: 'string', isOptional: true },
            { name: 'check_out_at', type: 'string', isOptional: true },
            { name: 'hours_worked', type: 'number', isOptional: true },
            { name: 'sync_status', type: 'string' },
          ],
        }),
        createTable({
          name: 'local_safety_checklists',
          columns: [
            { name: 'checklist_id', type: 'string' },
            { name: 'project_id', type: 'string' },
            { name: 'checklist_name', type: 'string' },
            { name: 'version', type: 'number' },
            { name: 'items', type: 'string' },
            { name: 'responses', type: 'string', isOptional: true },
            { name: 'sync_status', type: 'string' },
          ],
        }),
      ],
    },
  ],
});
