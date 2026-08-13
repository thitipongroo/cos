// Local offline schema — Drizzle ORM on expo-sqlite (spec §17.10, approved 2026-07-04).
// Replaces the WatermelonDB appSchema. Tables: local_site_reports, local_issues, local_photos,
// local_tasks, local_attendance, local_safety_checklists, local_projects, local_incidents,
// local_material_consumptions. sync_queue stays on its own expo-sqlite handle (sync-queue.ts).
//
// Column TS names intentionally match the old WatermelonDB model properties (projectId,
// offlineSyncStatus, …) so row objects are drop-in for the screens that render them.
// DDL lives in database.ts (versioned runtime DDL via PRAGMA user_version — §17.10).

import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';

export type SyncStatus = 'PENDING' | 'SYNCED' | 'CONFLICT';
export type UploadStatus = 'PENDING' | 'UPLOADING' | 'UPLOADED' | 'FAILED';
/**
 * What a queued photo is attached to. Sent verbatim as `entity_type` on the file upload
 * (PhotoUploadQueue), where it lands in `files.file_metadata.entity_type` — a plain VARCHAR(100)
 * with no CHECK constraint, so adding a value here needs no migration.
 *
 * 'permit' added 2026-08-13 for the permit request form. Unlike the other three, a permit's id does
 * not exist until the server creates it, so those photos are captured against a draft id and
 * re-keyed by `reassignPhotoEntity()` once the POST returns.
 */
export type PhotoEntityType = 'site_report' | 'issue' | 'inspection' | 'permit';

// ── local_site_reports — mirrors server site_ops.site_reports (offline subset) ──
export const localSiteReports = sqliteTable('local_site_reports', {
  id: text('id').primaryKey(),
  reportId: text('report_id').notNull(), // server UUID (client-generated UUID for offline creates, ADR-051)
  projectId: text('project_id').notNull(),
  reportDate: text('report_date').notNull(), // ISO date yyyy-MM-dd
  summary: text('summary'),
  blockers: text('blockers'), // spec 11 §474 (G-M5b)
  manpowerCount: integer('manpower_count'), // spec 11 §472 (G-M5a)
  status: text('status').notNull(), // DRAFT | SUBMITTED | APPROVED
  offlineSyncStatus: text('sync_status').notNull().$type<SyncStatus>(),
});

// ── local_issues — mirrors server site_ops.issues (offline subset) ──
export const localIssues = sqliteTable('local_issues', {
  id: text('id').primaryKey(),
  issueId: text('issue_id').notNull(), // server UUID (empty until synced)
  projectId: text('project_id').notNull(),
  reportId: text('report_id'),
  title: text('title').notNull(),
  description: text('description'),
  severity: text('severity').notNull(), // LOW | MEDIUM | HIGH | CRITICAL
  status: text('status').notNull(), // OPEN | IN_PROGRESS | RESOLVED | CLOSED
  // DEFECT | REWORK | PUNCH | GENERAL — site_ops.issues.issue_type, CHECK-constrained since
  // migration 20260619000002. The app has always SENT it on create (it is what the Phase 6
  // task-completion gate reads) and never kept it, so the issue board could not say what kind of
  // issue a card was. Nullable: rows cached before DDL v6 have no value until the next delta pull.
  issueType: text('issue_type'),
  // site_ops.issues.created_at (TIMESTAMPTZ NOT NULL) — when the issue was RAISED. The board prints
  // its age from this; nullable here for the same pre-v6 reason as `issueType`.
  createdAt: text('created_at'),
  offlineSyncStatus: text('sync_status').notNull().$type<SyncStatus>(),
});

// ── local_photos — offline photo captures pending upload (file stays in expo-file-system) ──
export const localPhotos = sqliteTable('local_photos', {
  id: text('id').primaryKey(),
  photoId: text('photo_id').notNull(), // local UUID
  entityType: text('entity_type').notNull().$type<PhotoEntityType>(),
  entityId: text('entity_id').notNull(), // local row id of the owning entity
  localPath: text('local_path').notNull(), // expo-file-system URI
  uploadStatus: text('upload_status').notNull().$type<UploadStatus>(),
  serverFileId: text('server_file_id'), // populated after upload
});

// ── local_photo_annotations — re-editable markup on a photo (ADR-056) ──
// Keyed by the LOCAL photo row (local_photos.id), because a photo has no server file_id until it is
// uploaded. On upload success (markUploaded), a dirty annotation is enqueued to /sync/push addressed
// to the now-known serverFileId — enqueue-after-parent, so SyncManager needs no dependency ordering.
// `strokes` is the retained-mode stroke list as JSON (normalised 0..1 coords), never a raster.
// `baseVersion` is the optimistic-concurrency token the client read; the server bumps it and flags a
// mismatch as CONFLICT_FLAGGED (§17.5). `dirty` = has unsynced local edits.
export const localPhotoAnnotations = sqliteTable('local_photo_annotations', {
  localPhotoId: text('local_photo_id').primaryKey(), // FK → local_photos.id (one annotation per photo)
  strokes: text('strokes').notNull(), // JSON: AnnotationStroke[]
  baseVersion: integer('base_version').notNull(), // last server version the client saw (0 = never synced)
  dirty: integer('dirty').notNull(), // 0/1 — has local edits not yet pushed
  updatedAt: text('updated_at').notNull(), // ISO 8601
});

// ── local_tasks — offline subset; progress_percent is Max-wins (§17.5) ──
export const localTasks = sqliteTable('local_tasks', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(), // server UUID (empty until synced)
  projectId: text('project_id').notNull(),
  taskName: text('task_name').notNull(),
  status: text('status').notNull(), // NOT_STARTED | IN_PROGRESS | DONE | BLOCKED
  progressPercent: real('progress_percent').notNull(), // 0–100, monotonic (Max-wins)
  assignedTo: text('assigned_to'),
  // Cached from projects.tasks via /sync/delta (DDL v4). Nullable: a task may have no planned dates,
  // and rows cached before v4 stay empty until the next delta pull refreshes them.
  workType: text('work_type'), // FOUNDATION | STRUCTURE | MEP | … (the trade, shown on the card)
  plannedStart: text('planned_start'), // ISO date yyyy-MM-dd
  plannedEnd: text('planned_end'), // ISO date yyyy-MM-dd
  // The planned working window within those days (DDL v5), from the TIME columns migration
  // 20260811000001 added. "HH:MM:SS" as Postgres renders a TIME. Null where none was recorded.
  plannedStartTime: text('planned_start_time'),
  plannedEndTime: text('planned_end_time'),
  offlineSyncStatus: text('sync_status').notNull().$type<SyncStatus>(),
});

// ── local_attendance — check-in/out; server-wins on check_in (§17.5) ──
export const localAttendance = sqliteTable('local_attendance', {
  id: text('id').primaryKey(),
  logId: text('log_id').notNull(), // server UUID (empty until synced)
  workerId: text('worker_id').notNull(),
  projectId: text('project_id').notNull(),
  checkInAt: text('check_in_at'), // ISO 8601
  checkOutAt: text('check_out_at'), // ISO 8601
  hoursWorked: real('hours_worked'),
  offlineSyncStatus: text('sync_status').notNull().$type<SyncStatus>(),
});

// ── local_safety_checklists — template (items JSON) + worker responses (JSON) ──
export const localSafetyChecklists = sqliteTable('local_safety_checklists', {
  id: text('id').primaryKey(),
  checklistId: text('checklist_id').notNull(), // server UUID
  projectId: text('project_id').notNull(),
  checklistName: text('checklist_name').notNull(),
  version: integer('version').notNull(),
  itemsJson: text('items').notNull(), // JSON array of checklist item definitions
  responsesJson: text('responses'), // JSON of worker answers
  offlineSyncStatus: text('sync_status').notNull().$type<SyncStatus>(),
});

// ── local_projects — read-only project cache (§17.4 stale-while-revalidate) ──
export const localProjects = sqliteTable('local_projects', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(), // server UUID
  projectCode: text('project_code').notNull(),
  projectName: text('project_name').notNull(),
  status: text('status').notNull(),
});

// ── local_incidents — read cache of site_ops.incidents (delta entity `safety`) ──
export const localIncidents = sqliteTable('local_incidents', {
  id: text('id').primaryKey(),
  incidentId: text('incident_id').notNull(), // server UUID (empty until synced)
  projectId: text('project_id').notNull(),
  incidentType: text('incident_type').notNull(),
  severity: text('severity').notNull(), // LOW | MEDIUM | HIGH | CRITICAL
  status: text('status').notNull(),
  createdAt: text('created_at'), // ISO timestamp
  offlineSyncStatus: text('sync_status').notNull().$type<SyncStatus>(),
});

// ── local_material_consumptions — read cache (delta entity `material`, append-only) ──
export const localMaterialConsumptions = sqliteTable('local_material_consumptions', {
  id: text('id').primaryKey(),
  consumptionId: text('consumption_id').notNull(), // server UUID
  projectId: text('project_id').notNull(),
  materialName: text('material_name').notNull(),
  quantity: real('quantity').notNull(),
  unit: text('unit').notNull(),
  consumedAt: text('consumed_at'), // ISO timestamp
  offlineSyncStatus: text('sync_status').notNull().$type<SyncStatus>(),
});

// Row types — named after the old WatermelonDB models so existing type imports keep working.
export type SiteReport = typeof localSiteReports.$inferSelect;
export type Issue = typeof localIssues.$inferSelect;
export type Photo = typeof localPhotos.$inferSelect;
export type PhotoAnnotationRow = typeof localPhotoAnnotations.$inferSelect;
export type Task = typeof localTasks.$inferSelect;
export type Attendance = typeof localAttendance.$inferSelect;
export type SafetyChecklist = typeof localSafetyChecklists.$inferSelect;
export type Project = typeof localProjects.$inferSelect;
export type Incident = typeof localIncidents.$inferSelect;
export type MaterialConsumption = typeof localMaterialConsumptions.$inferSelect;
