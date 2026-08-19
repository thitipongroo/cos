// Local offline DB — Drizzle ORM on expo-sqlite (spec §17.10, approved 2026-07-04).
// Replaces the WatermelonDB Database singleton. `enableChangeListener` powers useLiveQuery
// (reactive reads). Schema is created with versioned runtime DDL (PRAGMA user_version),
// following the sync_queue precedent — no drizzle-kit build tooling (§17.10 implementation note).
//
// Fresh DB file (cos_offline_v2.db): read caches repopulate from delta sync / GET /projects on
// first entry; queued mutations live in sync_queue (cos_sync_queue.db) and are unaffected.

import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { eq, inArray } from 'drizzle-orm';
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

const DDL_VERSION = 8;

// ── Schema, expressed as it should END UP, not as a chain of upgrade steps ──────────────────────
//
// WHY THIS IS NOT A LADDER OF `if (current === n)` BRANCHES ANY MORE. It was, and on 2026-08-19 a
// review found that the ladder had no rung for v5: a device on v5 matched none of the v1–v4 branches
// and fell through to the fresh-install block, whose `CREATE TABLE IF NOT EXISTS` no-ops on tables
// that already exist — so `local_issues.issue_type` / `created_at` were never added, while
// `user_version` was still stamped to 6. Every read of that table then failed with "no such column",
// which `runDeltaSync`'s caller swallows, so sync died silently and permanently on those devices.
//
// A ladder needs one correct rung per released version and stays correct only while nobody forgets
// one. What follows cannot forget: the CREATE block declares the FINAL shape of every table, and
// ADDED_COLUMNS declares every column added after a table's first release. Both are applied
// idempotently — `IF NOT EXISTS` for tables, a `PRAGMA table_info` check for columns — so the same
// code takes a fresh install, a v1 install and a v5 install to exactly the same schema. Adding a
// column from here on is two edits (the CREATE block and ADDED_COLUMNS) plus a DDL_VERSION bump, and
// no new branch.

// The whole schema at DDL_VERSION. Safe to run against any prior version: existing tables are left
// alone and only genuinely missing ones are created.
const CREATE_TABLES_DDL = `
  CREATE TABLE IF NOT EXISTS local_site_reports (
    id TEXT PRIMARY KEY NOT NULL, report_id TEXT NOT NULL, project_id TEXT NOT NULL,
    report_date TEXT NOT NULL, summary TEXT, blockers TEXT, manpower_count INTEGER,
    status TEXT NOT NULL, sync_status TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS local_issues (
    id TEXT PRIMARY KEY NOT NULL, issue_id TEXT NOT NULL, project_id TEXT NOT NULL,
    report_id TEXT, title TEXT NOT NULL, description TEXT, severity TEXT NOT NULL,
    status TEXT NOT NULL, issue_type TEXT, created_at TEXT, sync_status TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS local_photos (
    id TEXT PRIMARY KEY NOT NULL, photo_id TEXT NOT NULL, entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL, local_path TEXT NOT NULL, upload_status TEXT NOT NULL,
    server_file_id TEXT, upload_retry_count INTEGER);
  CREATE TABLE IF NOT EXISTS local_tasks (
    id TEXT PRIMARY KEY NOT NULL, task_id TEXT NOT NULL, project_id TEXT NOT NULL,
    task_name TEXT NOT NULL, status TEXT NOT NULL, progress_percent REAL NOT NULL,
    assigned_to TEXT, work_type TEXT, planned_start TEXT, planned_end TEXT,
    planned_start_time TEXT, planned_end_time TEXT,
    sync_status TEXT NOT NULL);
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
  CREATE TABLE IF NOT EXISTS local_photo_annotations (
    local_photo_id TEXT PRIMARY KEY NOT NULL, strokes TEXT NOT NULL,
    base_version INTEGER NOT NULL, dirty INTEGER NOT NULL, updated_at TEXT NOT NULL);
`;

/**
 * Every column added to a table AFTER that table's first release, with the version that added it
 * recorded for the reader. Order does not matter — each is applied only if genuinely absent — but
 * keeping them grouped by the release that introduced them keeps the history legible.
 *
 * Identifiers are fixed literals in this file, never user input; `PRAGMA table_info` takes no bound
 * parameters, so interpolation is the only form available and is safe here.
 */
const ADDED_COLUMNS: ReadonlyArray<{ table: string; column: string; type: string }> = [
  // v1→v2 (G-M5a/G-M5b): site-report blockers + manpower.
  { table: 'local_site_reports', column: 'blockers', type: 'TEXT' },
  { table: 'local_site_reports', column: 'manpower_count', type: 'INTEGER' },
  // v3→v4: the task fields the Tasks screen shows on each card — trade and the planned window. The
  // server has always sent them (`/sync/delta` runs `SELECT *` over projects.tasks); the client
  // simply dropped them, so a card could show nothing but a name and a percentage.
  { table: 'local_tasks', column: 'work_type', type: 'TEXT' },
  { table: 'local_tasks', column: 'planned_start', type: 'TEXT' },
  { table: 'local_tasks', column: 'planned_end', type: 'TEXT' },
  // v4→v5: the PLANNED WORKING WINDOW ("08:00 - 12:00"), cached from the two TIME columns migration
  // 20260811000001 added to projects.tasks. A worker looking at a card at 09:00 wants to know
  // whether this is the morning job, which a date range cannot tell them.
  { table: 'local_tasks', column: 'planned_start_time', type: 'TEXT' },
  { table: 'local_tasks', column: 'planned_end_time', type: 'TEXT' },
  // v5→v6: what KIND of issue it is and when it was raised, for the Site Engineer's issue board.
  // Both have existed on `site_ops.issues` all along and `/sync/delta` selects the whole row.
  { table: 'local_issues', column: 'issue_type', type: 'TEXT' },
  { table: 'local_issues', column: 'created_at', type: 'TEXT' },
  // v7->v8: the photo upload attempt counter. It lives on the row because PhotoUploadQueue is
  // reconstructed every sync cycle, so the in-memory counter it used to keep reset to zero each time
  // and its retry ceiling was unreachable (see sync/PhotoUploadQueue.ts).
  { table: 'local_photos', column: 'upload_retry_count', type: 'INTEGER' },
];

// None of the added columns are backfilled: a row already cached has no value for one until the next
// delta pull refreshes it, and a card with no age shows none rather than an invented one.

/** Whether `table` already has `column` — the idempotence check that replaces version branching. */
function columnExists(table: string, column: string): boolean {
  const rows = sqlite.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

function ddl(): void {
  const row = sqlite.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= DDL_VERSION) return;

  sqlite.execSync(CREATE_TABLES_DDL);
  for (const { table, column, type } of ADDED_COLUMNS) {
    // SQLite has no ADD COLUMN IF NOT EXISTS, hence the explicit check rather than a try/catch —
    // swallowing the error would also swallow a genuinely malformed ALTER.
    if (!columnExists(table, column)) {
      sqlite.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }
  // Stamped LAST and separately, so a failure part-way leaves the version behind and the next launch
  // retries from where it stopped rather than declaring a half-applied schema current.
  sqlite.execSync(`PRAGMA user_version = ${DDL_VERSION}`);
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

/**
 * Delete every row whose key is in `keyValues` (delta tombstones).
 *
 * Replaced a one-id-at-a-time `deleteByKey`, which was removed with its last caller rather than left
 * exported for a hypothetical one.
 *
 * `/sync/delta` returns `deleted` as a FLAT list of ids with no entity type attached, so the only way
 * to apply it is to try each id against each table. Done one id at a time that is 6 statements per
 * tombstone; a delta carrying 500 deletions cost 3,000 sequential round-trips on the handle the UI
 * thread also draws from. This makes it 6 statements per PAGE regardless of how many ids it holds.
 */
export async function deleteByKeys(
  table: TableName,
  keyColumn: string,
  keyValues: string[],
): Promise<void> {
  if (keyValues.length === 0) return;
  const t = TABLES[table];
  const col = t[keyColumn as keyof typeof t] as never;
  await db.delete(t).where(inArray(col, keyValues));
}

/**
 * Which of `keyValues` already exist in `table` — one query instead of one SELECT per row.
 *
 * Lets the delta applier decide insert-vs-update for a whole page up front, rather than re-asking
 * the database the same question once per row (`upsertByKey` does exactly that, and is kept for the
 * single-row callers that are not in a hot loop).
 */
export async function existingKeys(
  table: TableName,
  keyColumn: string,
  keyValues: string[],
): Promise<Set<string>> {
  if (keyValues.length === 0) return new Set();
  const t = TABLES[table];
  const col = t[keyColumn as keyof typeof t] as never;
  const rows = await db.select({ key: col }).from(t).where(inArray(col, keyValues));
  return new Set(rows.map((r) => String((r as { key: unknown }).key)));
}

/** Insert many rows in one statement (each still gets its own local id). */
export async function insertMany(
  table: TableName,
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  if (rows.length === 0) return;
  const t = TABLES[table];
  await db.insert(t).values(rows.map((values) => ({ id: newLocalId(), ...values })) as never);
}

/**
 * Write a sync status onto the local row a pushed mutation came from.
 *
 * The write-back half of the /sync/push loop — see sync/resolutionTargets.ts for how `keyValue`
 * locates the row and why some entity types have no row to locate.
 */
export async function setSyncStatusByKey(
  table: TableName,
  keyColumn: string,
  keyValue: string,
  status: string,
): Promise<void> {
  const t = TABLES[table];
  const col = t[keyColumn as keyof typeof t] as never;
  await db
    .update(t)
    .set({ offlineSyncStatus: status } as never)
    .where(eq(col, keyValue));
}

/**
 * Empty a table completely.
 *
 * Used only for `full_resync_required`: when the client's cursor predates the server's tombstone
 * retention window, the `deleted` list it receives is knowingly incomplete, so rows deleted on the
 * server while this device was away would otherwise live on it forever. The server documents this
 * as the client's obligation (SyncService.delta); the client had never implemented it.
 */
export async function clearTable(table: TableName): Promise<void> {
  await db.delete(TABLES[table]);
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
