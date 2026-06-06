// WatermelonDB schema — Priority 0 Section F (Phase 10 authoritative spec)
// Tables: local_site_reports, local_issues, local_photos
// sync_queue is managed by expo-sqlite directly — NOT WatermelonDB (see sync-queue.ts)

import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const DB_VERSION = 1;

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
  ],
});
