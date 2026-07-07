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
export type PhotoEntityType = 'site_report' | 'issue' | 'inspection';

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

// ── local_tasks — offline subset; progress_percent is Max-wins (§17.5) ──
export const localTasks = sqliteTable('local_tasks', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull(), // server UUID (empty until synced)
  projectId: text('project_id').notNull(),
  taskName: text('task_name').notNull(),
  status: text('status').notNull(), // NOT_STARTED | IN_PROGRESS | DONE | BLOCKED
  progressPercent: real('progress_percent').notNull(), // 0–100, monotonic (Max-wins)
  assignedTo: text('assigned_to'),
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
export type Task = typeof localTasks.$inferSelect;
export type Attendance = typeof localAttendance.$inferSelect;
export type SafetyChecklist = typeof localSafetyChecklists.$inferSelect;
export type Project = typeof localProjects.$inferSelect;
export type Incident = typeof localIncidents.$inferSelect;
export type MaterialConsumption = typeof localMaterialConsumptions.$inferSelect;
