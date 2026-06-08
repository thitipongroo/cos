// IndexedDB schema — Phase 10 Web App offline storage (spec §Phase 10 Web App Stack)
// Uses idb library (typed wrapper). Version-controlled; bump DB_VERSION on schema changes.

import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

export const DB_NAME = 'cos-offline';
export const DB_VERSION = 1;

// ── Entity shapes stored in IndexedDB ─────────────────────────────────────────

export interface OfflineSiteReport {
  report_id: string;
  project_id: string;
  report_date: string;
  summary?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED';
  sync_status: 'PENDING' | 'SYNCED' | 'CONFLICT';
  updated_at: string;
}

export interface OfflineIssue {
  issue_id: string;
  project_id: string;
  title: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  sync_status: 'PENDING' | 'SYNCED' | 'CONFLICT';
  updated_at: string;
}

export interface OfflineSyncQueueItem {
  id?: number; // auto-increment
  entity_type: string;
  entity_id: string;
  operation: 'CREATE' | 'UPDATE';
  payload: string; // JSON
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
  retry_count: number;
  client_submitted_at: string;
}

// ── DBSchema typing ────────────────────────────────────────────────────────────

export interface CosOfflineDB extends DBSchema {
  site_reports: {
    key: string;
    value: OfflineSiteReport;
    indexes: { by_project: string; by_sync_status: string };
  };
  issues: {
    key: string;
    value: OfflineIssue;
    indexes: { by_project: string; by_sync_status: string };
  };
  sync_queue: {
    key: number;
    value: OfflineSyncQueueItem;
    indexes: { by_status: string };
  };
}

// ── Singleton DB instance ──────────────────────────────────────────────────────

let _db: IDBPDatabase<CosOfflineDB> | null = null;

export async function getOfflineDb(): Promise<IDBPDatabase<CosOfflineDB>> {
  if (_db) return _db;

  _db = await openDB<CosOfflineDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // site_reports
      if (!db.objectStoreNames.contains('site_reports')) {
        const reportStore = db.createObjectStore('site_reports', { keyPath: 'report_id' });
        reportStore.createIndex('by_project', 'project_id');
        reportStore.createIndex('by_sync_status', 'sync_status');
      }

      // issues
      if (!db.objectStoreNames.contains('issues')) {
        const issueStore = db.createObjectStore('issues', { keyPath: 'issue_id' });
        issueStore.createIndex('by_project', 'project_id');
        issueStore.createIndex('by_sync_status', 'sync_status');
      }

      // sync_queue
      if (!db.objectStoreNames.contains('sync_queue')) {
        const queueStore = db.createObjectStore('sync_queue', {
          keyPath: 'id',
          autoIncrement: true,
        });
        queueStore.createIndex('by_status', 'status');
      }
    },
  });

  return _db;
}
