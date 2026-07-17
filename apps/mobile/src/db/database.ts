// Local offline DB — Drizzle ORM on expo-sqlite (spec §17.10, approved 2026-07-04).
// Replaces the WatermelonDB Database singleton. `enableChangeListener` powers useLiveQuery
// (reactive reads). Schema is created with versioned runtime DDL (PRAGMA user_version),
// following the sync_queue precedent — no drizzle-kit build tooling (§17.10 implementation note).
//
// Fresh DB file (cos_offline_v2.db): read caches repopulate from delta sync / GET /projects on
// first entry; queued mutations live in sync_queue (cos_sync_queue.db) and are unaffected.

import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { eq } from 'drizzle-orm';
import { localDbStatus, type LocalDbStatus } from '../sync/localDbLimit';
import {
  localSiteReports,
  localIssues,
  localPhotos,
  localTasks,
  localAttendance,
  localSafetyChecklists,
  localProjects,
  localIncidents,
  localMaterialConsumptions,
} from './schema';

export const sqlite = openDatabaseSync('cos_offline_v2.db', { enableChangeListener: true });
sqlite.execSync('PRAGMA journal_mode = WAL');

const DDL_VERSION = 3;

// v2→v3 (ADR-056): the re-editable photo-annotation table. Idempotent (IF NOT EXISTS), so it is safe
// to run both as an upgrade step and — via the fresh CREATE block below — on a first install.
const ANNOTATIONS_DDL = `
  CREATE TABLE IF NOT EXISTS local_photo_annotations (
    local_photo_id TEXT PRIMARY KEY NOT NULL, strokes TEXT NOT NULL,
    base_version INTEGER NOT NULL, dirty INTEGER NOT NULL, updated_at TEXT NOT NULL);
`;

function ddl(): void {
  const row = sqlite.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= DDL_VERSION) return;

  // v1→v2 (G-M5a/G-M5b): add site-report blockers + manpower_count columns to existing installs.
  // Fresh installs (current < 1) get these columns from the CREATE TABLE below, so only ALTER when
  // upgrading from exactly v1 (SQLite has no ADD COLUMN IF NOT EXISTS).
  if (current === 1) {
    sqlite.execSync(`
      ALTER TABLE local_site_reports ADD COLUMN blockers TEXT;
      ALTER TABLE local_site_reports ADD COLUMN manpower_count INTEGER;
      ${ANNOTATIONS_DDL}
      PRAGMA user_version = ${DDL_VERSION};
    `);
    return;
  }

  // v2→v3: existing v2 installs already have every v2 table — only the annotations table is new.
  if (current === 2) {
    sqlite.execSync(`
      ${ANNOTATIONS_DDL}
      PRAGMA user_version = ${DDL_VERSION};
    `);
    return;
  }

  sqlite.execSync(`
    CREATE TABLE IF NOT EXISTS local_site_reports (
      id TEXT PRIMARY KEY NOT NULL, report_id TEXT NOT NULL, project_id TEXT NOT NULL,
      report_date TEXT NOT NULL, summary TEXT, blockers TEXT, manpower_count INTEGER,
      status TEXT NOT NULL, sync_status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS local_issues (
      id TEXT PRIMARY KEY NOT NULL, issue_id TEXT NOT NULL, project_id TEXT NOT NULL,
      report_id TEXT, title TEXT NOT NULL, description TEXT, severity TEXT NOT NULL,
      status TEXT NOT NULL, sync_status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS local_photos (
      id TEXT PRIMARY KEY NOT NULL, photo_id TEXT NOT NULL, entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL, local_path TEXT NOT NULL, upload_status TEXT NOT NULL,
      server_file_id TEXT);
    CREATE TABLE IF NOT EXISTS local_tasks (
      id TEXT PRIMARY KEY NOT NULL, task_id TEXT NOT NULL, project_id TEXT NOT NULL,
      task_name TEXT NOT NULL, status TEXT NOT NULL, progress_percent REAL NOT NULL,
      assigned_to TEXT, sync_status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS local_attendance (
      id TEXT PRIMARY KEY NOT NULL, log_id TEXT NOT NULL, worker_id TEXT NOT NULL,
      project_id TEXT NOT NULL, check_in_at TEXT, check_out_at TEXT, hours_worked REAL,
      sync_status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS local_safety_checklists (
      id TEXT PRIMARY KEY NOT NULL, checklist_id TEXT NOT NULL, project_id TEXT NOT NULL,
      checklist_name TEXT NOT NULL, version INTEGER NOT NULL, items TEXT NOT NULL,
      responses TEXT, sync_status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS local_projects (
      id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, project_code TEXT NOT NULL,
      project_name TEXT NOT NULL, status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS local_incidents (
      id TEXT PRIMARY KEY NOT NULL, incident_id TEXT NOT NULL, project_id TEXT NOT NULL,
      incident_type TEXT NOT NULL, severity TEXT NOT NULL, status TEXT NOT NULL,
      created_at TEXT, sync_status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS local_material_consumptions (
      id TEXT PRIMARY KEY NOT NULL, consumption_id TEXT NOT NULL, project_id TEXT NOT NULL,
      material_name TEXT NOT NULL, quantity REAL NOT NULL, unit TEXT NOT NULL,
      consumed_at TEXT, sync_status TEXT NOT NULL);
    ${ANNOTATIONS_DDL}
    PRAGMA user_version = ${DDL_VERSION};
  `);
}
ddl();

export const db = drizzle(sqlite);

// Table registry — useCollection('local_issues') etc. resolve through this map.
export const TABLES = {
  local_site_reports: localSiteReports,
  local_issues: localIssues,
  local_photos: localPhotos,
  local_tasks: localTasks,
  local_attendance: localAttendance,
  local_safety_checklists: localSafetyChecklists,
  local_projects: localProjects,
  local_incidents: localIncidents,
  local_material_consumptions: localMaterialConsumptions,
} as const;
export type TableName = keyof typeof TABLES;

// Local row ids (the old WatermelonDB autogenerated id role). Uniqueness within one device is
// sufficient — server UUIDs arrive via sync.
let idCounter = 0;
export function newLocalId(): string {
  idCounter += 1;
  return `${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// §17.7 photo queue limit — count photos still PENDING upload (policy in sync/photoQueueLimit.ts).
export function pendingPhotoCount(): number {
  const row = sqlite.getFirstSync<{ c: number }>(
    "SELECT COUNT(*) AS c FROM local_photos WHERE upload_status = 'PENDING'",
  );
  return row?.c ?? 0;
}

// §17.7 local DB size — on-disk bytes of cos_offline_v2.db (page_count × page_size).
export function localDbSizeBytes(): number {
  const pc = sqlite.getFirstSync<{ page_count: number }>('PRAGMA page_count');
  const ps = sqlite.getFirstSync<{ page_size: number }>('PRAGMA page_size');
  return (pc?.page_count ?? 0) * (ps?.page_size ?? 0);
}

// Measure the local DB and classify it against the §17.7 500 MB ceiling; logs on WARN/FULL.
export function checkLocalDbLimit(): LocalDbStatus {
  const status = localDbStatus(localDbSizeBytes());
  if (status !== 'OK') {
    console.warn(`[db] local DB size ${status} (§17.7 ceiling 500 MB)`);
  }
  return status;
}

// ── Delta-sync seams (used by runDeltaSync; mocked by its unit tests) ────────────────────────
// Upsert by a server-key column: update the first matching row or insert a new one.
export async function upsertByKey(
  table: TableName,
  keyColumn: string,
  keyValue: string,
  values: Record<string, unknown>,
): Promise<void> {
  const t = TABLES[table];
  const col = t[keyColumn as keyof typeof t] as never;
  const existing = await db.select().from(t).where(eq(col, keyValue));
  if (existing.length > 0) {
    await db
      .update(t)
      .set(values as never)
      .where(eq(col, keyValue));
  } else {
    await db.insert(t).values({ id: newLocalId(), ...values } as never);
  }
}

// Delete rows matching a server id in a given table's key column (delta tombstones).
export async function deleteByKey(
  table: TableName,
  keyColumn: string,
  keyValue: string,
): Promise<void> {
  const t = TABLES[table];
  const col = t[keyColumn as keyof typeof t] as never;
  await db.delete(t).where(eq(col, keyValue));
}

// Re-export row types so existing `import { Issue } from '../db/database'` call sites compile.
export type {
  SiteReport,
  Issue,
  Photo,
  Task,
  Attendance,
  SafetyChecklist,
  Project,
  Incident,
  MaterialConsumption,
  SyncStatus,
  UploadStatus,
  PhotoEntityType,
} from './schema';
