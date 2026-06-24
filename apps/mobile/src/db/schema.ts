// WatermelonDB schema — Priority 0 Section F (Phase 10 authoritative spec)
// Tables: local_site_reports, local_issues, local_photos,
//         local_tasks, local_attendance, local_safety_checklists
// sync_queue is managed by expo-sqlite directly — NOT WatermelonDB (see sync-queue.ts)
//
// v2 (Phase 10 feature-UI, product-owner ruling): added local_tasks, local_attendance,
// local_safety_checklists to back the SITE_WORKER screens. See migrations.ts for the v1→v2 step.

import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const DB_VERSION = 2;

export const schema = appSchema({
  version: DB_VERSION,
  tables: [
    // ── local_site_reports ──────────────────────────────────────────────────
    // Mirrors server site_ops.site_reports — subset needed offline.
    tableSchema({
      name: 'local_site_reports',
      columns: [
        { name: 'report_id', type: 'string' }, // server UUID (empty until synced)
        { name: 'project_id', type: 'string' },
        { name: 'report_date', type: 'string' }, // ISO date yyyy-MM-dd
        { name: 'summary', type: 'string', isOptional: true },
        { name: 'status', type: 'string' }, // DRAFT | SUBMITTED | APPROVED
        { name: 'sync_status', type: 'string' }, // PENDING | SYNCED | CONFLICT
      ],
    }),

    // ── local_issues ────────────────────────────────────────────────────────
    // Mirrors server site_ops.issues — subset needed offline.
    tableSchema({
      name: 'local_issues',
      columns: [
        { name: 'issue_id', type: 'string' }, // server UUID (empty until synced)
        { name: 'project_id', type: 'string' },
        { name: 'report_id', type: 'string', isOptional: true },
        { name: 'title', type: 'string' },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'severity', type: 'string' }, // LOW | MEDIUM | HIGH | CRITICAL
        { name: 'status', type: 'string' }, // OPEN | IN_PROGRESS | RESOLVED | CLOSED
        { name: 'sync_status', type: 'string' }, // PENDING | SYNCED | CONFLICT
      ],
    }),

    // ── local_photos ────────────────────────────────────────────────────────
    // Tracks offline photo captures before upload.
    tableSchema({
      name: 'local_photos',
      columns: [
        { name: 'photo_id', type: 'string' }, // local UUID
        { name: 'entity_type', type: 'string' }, // site_report | issue | inspection
        { name: 'entity_id', type: 'string' }, // local WatermelonDB id
        { name: 'local_path', type: 'string' }, // expo-file-system URI
        { name: 'upload_status', type: 'string' }, // PENDING | UPLOADING | UPLOADED | FAILED
        { name: 'server_file_id', type: 'string', isOptional: true }, // populated after upload
      ],
    }),

    // ── local_tasks ───────────────────────────────────────────────────────────
    // Mirrors server tasks (phase6_tasks_permits) — subset needed offline.
    // Conflict: progress_percent uses Max-wins (§17.5) — resolved server-side on sync.
    tableSchema({
      name: 'local_tasks',
      columns: [
        { name: 'task_id', type: 'string' }, // server UUID (empty until synced)
        { name: 'project_id', type: 'string' },
        { name: 'task_name', type: 'string' },
        { name: 'status', type: 'string' }, // NOT_STARTED | IN_PROGRESS | DONE | BLOCKED
        { name: 'progress_percent', type: 'number' }, // 0–100, monotonic (Max-wins)
        { name: 'assigned_to', type: 'string', isOptional: true },
        { name: 'sync_status', type: 'string' }, // PENDING | SYNCED | CONFLICT
      ],
    }),

    // ── local_attendance ──────────────────────────────────────────────────────
    // Mirrors server workforce attendance logs — check-in/out.
    // Conflict: server-wins on check_in (§17.5) — prevents time manipulation.
    tableSchema({
      name: 'local_attendance',
      columns: [
        { name: 'log_id', type: 'string' }, // server UUID (empty until synced)
        { name: 'worker_id', type: 'string' },
        { name: 'project_id', type: 'string' },
        { name: 'check_in_at', type: 'string', isOptional: true }, // ISO 8601
        { name: 'check_out_at', type: 'string', isOptional: true }, // ISO 8601
        { name: 'hours_worked', type: 'number', isOptional: true },
        { name: 'sync_status', type: 'string' }, // PENDING | SYNCED | CONFLICT
      ],
    }),

    // ── local_safety_checklists ────────────────────────────────────────────────
    // Mirrors server safety_checklists template (checklist_name, version, items JSON) for
    // offline reference; `responses` holds the worker's answers (JSON) pending submission.
    tableSchema({
      name: 'local_safety_checklists',
      columns: [
        { name: 'checklist_id', type: 'string' }, // server UUID
        { name: 'project_id', type: 'string' },
        { name: 'checklist_name', type: 'string' },
        { name: 'version', type: 'number' },
        { name: 'items', type: 'string' }, // JSON array of checklist item definitions
        { name: 'responses', type: 'string', isOptional: true }, // JSON of worker answers
        { name: 'sync_status', type: 'string' }, // PENDING | SYNCED | CONFLICT
      ],
    }),
  ],
});
