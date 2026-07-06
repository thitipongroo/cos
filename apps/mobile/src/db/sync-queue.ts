// sync_queue — expo-sqlite infrastructure table (NOT WatermelonDB)
// Per spec §Phase 10: sync_queue uses expo-sqlite directly, not WatermelonDB.
// This module owns the DDL, insert, and query operations for the sync queue.

import * as SQLite from 'expo-sqlite';
import { syncPriorityCaseSql } from '../sync/syncPriority';

export type SyncOperation = 'CREATE' | 'UPDATE';
export type QueueStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';

export interface SyncQueueItem {
  id: number;
  entity_type: string;
  entity_id: string;
  operation: SyncOperation;
  payload: string; // JSON string
  status: QueueStatus;
  retry_count: number;
  client_submitted_at: string; // ISO 8601
  last_attempt_at: string | null;
  error_message: string | null;
}

let _db: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (!_db) {
    _db = SQLite.openDatabaseSync('cos_sync_queue.db');
  }
  return _db;
}

// Create sync_queue table if it does not exist.
export function initSyncQueue(): void {
  const db = getDb();
  db.execSync(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type          TEXT    NOT NULL,
      entity_id            TEXT    NOT NULL,
      operation            TEXT    NOT NULL,
      payload              TEXT    NOT NULL,
      status               TEXT    NOT NULL DEFAULT 'PENDING',
      retry_count          INTEGER NOT NULL DEFAULT 0,
      client_submitted_at  TEXT    NOT NULL,
      last_attempt_at      TEXT,
      error_message        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue (status);
  `);
}

// Enqueue a new item. Returns the inserted row ID.
export function enqueue(
  entityType: string,
  entityId: string,
  operation: SyncOperation,
  payload: unknown,
): number {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.runSync(
    `INSERT INTO sync_queue (entity_type, entity_id, operation, payload, status, client_submitted_at)
     VALUES (?, ?, ?, ?, 'PENDING', ?)`,
    entityType,
    entityId,
    operation,
    JSON.stringify(payload),
    now,
  );
  return result.lastInsertRowId;
}

// Fetch up to `limit` PENDING items in §17.6 priority order (safety → attendance → inspection →
// task → site_report → material → equipment → others), oldest-first within each priority tier.
export function fetchPending(limit = 20): SyncQueueItem[] {
  const db = getDb();
  return db.getAllSync<SyncQueueItem>(
    `SELECT * FROM sync_queue WHERE status = 'PENDING'
     ORDER BY ${syncPriorityCaseSql()} ASC, id ASC LIMIT ?`,
    limit,
  );
}

// Mark an item as SYNCING (prevents duplicate processing).
export function markSyncing(id: number): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.runSync(`UPDATE sync_queue SET status = 'SYNCING', last_attempt_at = ? WHERE id = ?`, now, id);
}

// Mark an item as SYNCED.
export function markSynced(id: number): void {
  const db = getDb();
  db.runSync(`UPDATE sync_queue SET status = 'SYNCED' WHERE id = ?`, id);
}

// Mark an item as FAILED and increment retry_count.
export function markFailed(id: number, errorMessage: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.runSync(
    `UPDATE sync_queue
     SET status = 'FAILED', retry_count = retry_count + 1, error_message = ?, last_attempt_at = ?
     WHERE id = ?`,
    errorMessage,
    now,
    id,
  );
}

// Reset FAILED items to PENDING for retry (if retry_count < maxRetries).
export function requeueFailed(maxRetries = 5): void {
  const db = getDb();
  db.runSync(
    `UPDATE sync_queue SET status = 'PENDING' WHERE status = 'FAILED' AND retry_count < ?`,
    maxRetries,
  );
}

// Return queue depth by status — used for sync metrics (QM observability).
export function getQueueDepth(): Record<QueueStatus, number> {
  const db = getDb();
  const rows = db.getAllSync<{ status: QueueStatus; count: number }>(
    `SELECT status, COUNT(*) AS count FROM sync_queue GROUP BY status`,
  );
  const depth: Record<QueueStatus, number> = { PENDING: 0, SYNCING: 0, SYNCED: 0, FAILED: 0 };
  for (const row of rows) {
    depth[row.status] = row.count;
  }
  return depth;
}
