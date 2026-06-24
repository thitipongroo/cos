// WatermelonDB schema migrations.
// v1 → v2: add local_tasks, local_attendance, local_safety_checklists (Phase 10 feature-UI).
// Keep in lockstep with schema.ts DB_VERSION.

import { schemaMigrations, createTable } from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
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
