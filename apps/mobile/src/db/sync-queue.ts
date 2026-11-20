// sync_queue — expo-sqlite infrastructure table (NOT WatermelonDB)
// Per spec §Phase 10: sync_queue uses expo-sqlite directly, not WatermelonDB.
// This module owns the DDL, insert, and query operations for the sync queue.

import * as SQLite from 'expo-sqlite';
import { syncPriorityCaseSql } from '../sync/syncPriority';
import { getOwner, LEGACY_OWNER } from './owner';

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
  /** The user who queued it (fix/mobile-queue-per-user); null on rows queued before the column existed. */
  owner_user_id: string | null;
}

/**
 * Listeners notified whenever the queue's contents change.
 *
 * WHY THE QUEUE PUSHES INSTEAD OF THE UI POLLING. `<SyncPill />` has to show a live outbox depth, and
 * this table is the only thing that knows it. A subscription here means the count is recomputed
 * exactly when it can have changed — no interval, and no chance of the store and the table
 * disagreeing, which is how `pendingCount` came to sit at 0 while the queue filled up.
 *
 * The store is NOT imported from here: src/db must not depend on src/store. The wiring lives in
 * sync/queueObserver.ts, which owns both ends.
 */
const changeListeners = new Set<() => void>();

export function subscribeQueueChanged(cb: () => void): () => void {
  changeListeners.add(cb);
  return () => {
    changeListeners.delete(cb);
  };
}

function notifyChanged(): void {
  changeListeners.forEach((cb) => cb());
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
  // fix/mobile-queue-per-user: who queued each item. SQLite has no ADD COLUMN IF NOT EXISTS, hence the check.
  const columns = db.getAllSync<{ name: string }>(`PRAGMA table_info(sync_queue)`);
  if (!columns.some((c) => c.name === 'owner_user_id')) {
    // One transaction: a process killed between the two would leave the column added and the old rows unmarked,
    // never claimed and never sent.
    db.withTransactionSync(() => {
      db.execSync(`ALTER TABLE sync_queue ADD COLUMN owner_user_id TEXT`);
      // Only the rows that exist NOW predate owners; marked so, they are the only ones a claim takes.
      db.runSync(`UPDATE sync_queue SET owner_user_id = ?`, LEGACY_OWNER);
    });
  }
}

/** Recount for the badge when the signed-in user changes: the count is per user. */
export function notifyQueueOwnerChanged(): void {
  notifyChanged();
}

/**
 * Give the rows queued before `owner_user_id` existed (marked LEGACY_OWNER at migration) to `userId` — the first
 * user to sign in after the update. Until then they were sent by whoever was signed in, so this is the behaviour
 * they had, applied once: afterwards no row is LEGACY_OWNER. A row with no owner at all is never claimed.
 */
export function claimUnownedQueueItems(userId: string): void {
  getDb().runSync(
    `UPDATE sync_queue SET owner_user_id = ? WHERE owner_user_id = ?`,
    userId,
    LEGACY_OWNER,
  );
  notifyChanged();
}

// Enqueue a new item. Returns the inserted row ID.
export function enqueue(
  entityType: string,
  entityId: string,
  operation: SyncOperation,
  payload: unknown,
  /**
   * Whose work it is. Defaults to the signed-in user; a caller acting for a user who may have signed out since
   * (a request that failed after its sign-out, an annotation whose photo finished uploading) passes that user.
   * Null leaves the row unowned: never sent, never claimed — better than sent as someone else.
   */
  owner: string | null = getOwner(),
): number {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.runSync(
    `INSERT INTO sync_queue
       (entity_type, entity_id, operation, payload, status, client_submitted_at, owner_user_id)
     VALUES (?, ?, ?, ?, 'PENDING', ?, ?)`,
    entityType,
    entityId,
    operation,
    JSON.stringify(payload),
    now,
    owner,
  );
  notifyChanged();
  return result.lastInsertRowId;
}

// Fetch up to `limit` PENDING items in §17.6 priority order (safety → attendance → inspection →
// task → site_report → material → equipment → others), oldest-first within each priority tier.
// The signed-in user's only (fix/mobile-queue-per-user): another user's items wait for that user.
export function fetchPending(limit = 20): SyncQueueItem[] {
  const owner = getOwner();
  if (!owner) return [];
  const db = getDb();
  return db.getAllSync<SyncQueueItem>(
    `SELECT * FROM sync_queue WHERE status = 'PENDING' AND owner_user_id = ?
     ORDER BY ${syncPriorityCaseSql()} ASC, id ASC LIMIT ?`,
    owner,
    limit,
  );
}

// Mark an item as SYNCING (prevents duplicate processing).
export function markSyncing(id: number): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.runSync(`UPDATE sync_queue SET status = 'SYNCING', last_attempt_at = ? WHERE id = ?`, now, id);
  notifyChanged();
}

// Mark an item as SYNCED.
export function markSynced(id: number): void {
  const db = getDb();
  db.runSync(`UPDATE sync_queue SET status = 'SYNCED' WHERE id = ?`, id);
  notifyChanged();
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
  notifyChanged();
}

/**
 * Mark an item FAILED with its retry budget spent, so `requeueFailed` will never pick it up again.
 *
 * For failures that repeating cannot fix — a 4xx from `/sync/push` (see sync/httpFailure.ts). The
 * alternative was five identical rejections spread over five sync cycles before reaching the same
 * discard, which delays the §17.2 notification the user needs by hours of field time.
 */
export function markPermanentlyFailed(id: number, errorMessage: string, maxRetries = 5): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.runSync(
    `UPDATE sync_queue
     SET status = 'FAILED', retry_count = ?, error_message = ?, last_attempt_at = ?
     WHERE id = ?`,
    maxRetries,
    errorMessage,
    now,
    id,
  );
  notifyChanged();
}

// Reset FAILED items to PENDING for retry (if retry_count < maxRetries).
export function requeueFailed(maxRetries = 5): void {
  const owner = getOwner();
  if (!owner) return;
  const db = getDb();
  db.runSync(
    `UPDATE sync_queue SET status = 'PENDING'
     WHERE status = 'FAILED' AND retry_count < ? AND owner_user_id = ?`,
    maxRetries,
    owner,
  );
  notifyChanged();
}

/**
 * Return items stranded in SYNCING to PENDING.
 *
 * `markSyncing` is written before the request goes out, and nothing writes over it if the process
 * dies in between — the app is killed, the OS reclaims it, the device is switched off in a site hut.
 * Those rows then match neither `fetchPending` (PENDING only) nor `requeueFailed` (FAILED only), so
 * before this existed a mutation caught mid-flight by a kill was stranded on the device forever.
 *
 * Safe to run at the start of every cycle because a cycle is the only thing that writes SYNCING, and
 * `processQueue` is not re-entered while one is in flight: any SYNCING row seen at the start of a
 * cycle is by definition left over from a previous one.
 */
export function resetStale(): void {
  const owner = getOwner();
  if (!owner) return;
  const db = getDb();
  db.runSync(
    `UPDATE sync_queue SET status = 'PENDING' WHERE status = 'SYNCING' AND owner_user_id = ?`,
    owner,
  );
  notifyChanged();
}

/**
 * How many mutations are still waiting to reach the server — PENDING plus FAILED-but-retryable.
 *
 * This is the number `<SyncPill />` shows. FAILED rows below the retry ceiling are counted because
 * from the user's side they are indistinguishable from pending: the change is on the device, not on
 * the server, and the next cycle will try again.
 */
export function countPending(maxRetries = 5): number {
  const owner = getOwner();
  if (!owner) return 0;
  const row = getDb().getFirstSync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM sync_queue
     WHERE owner_user_id = ?
       AND (status IN ('PENDING', 'SYNCING') OR (status = 'FAILED' AND retry_count < ?))`,
    owner,
    maxRetries,
  );
  return row?.c ?? 0;
}

// Return queue depth by status — used for sync metrics (QM observability).
export function getQueueDepth(): Record<QueueStatus, number> {
  const depth: Record<QueueStatus, number> = { PENDING: 0, SYNCING: 0, SYNCED: 0, FAILED: 0 };
  const owner = getOwner();
  if (!owner) return depth;
  const db = getDb();
  const rows = db.getAllSync<{ status: QueueStatus; count: number }>(
    `SELECT status, COUNT(*) AS count FROM sync_queue WHERE owner_user_id = ? GROUP BY status`,
    owner,
  );
  for (const row of rows) {
    depth[row.status] = row.count;
  }
  return depth;
}
