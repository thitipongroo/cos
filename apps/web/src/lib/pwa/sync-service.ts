// PWA sync service — Background Sync API + IndexedDB queue (spec §Phase 10 Web App Stack)
// Registers a sync tag with the Service Worker; SW replays mutations on reconnect.
// Falls back to immediate sync when Background Sync API is unavailable.

import { getOfflineDb } from '../idb/schema';
import type { OfflineSyncQueueItem } from '../idb/schema';

const SYNC_TAG = 'cos-sync';
const MAX_RETRIES = 5;

// ── Enqueue a mutation for background sync ────────────────────────────────────

export async function enqueueMutation(
  entityType: string,
  entityId: string,
  operation: 'CREATE' | 'UPDATE',
  payload: unknown,
): Promise<void> {
  const db = await getOfflineDb();
  const item: OfflineSyncQueueItem = {
    entity_type: entityType,
    entity_id: entityId,
    operation,
    payload: JSON.stringify(payload),
    status: 'PENDING',
    retry_count: 0,
    client_submitted_at: new Date().toISOString(),
  };
  await db.add('sync_queue', item);
  await requestBackgroundSync();
}

// ── Request a background sync via Service Worker ──────────────────────────────

async function requestBackgroundSync(): Promise<void> {
  if (typeof window === 'undefined') return;

  const registration = await navigator.serviceWorker?.ready;
  if (!registration) return;

  if ('sync' in registration) {
    await (
      registration as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } }
    ).sync.register(SYNC_TAG);
  } else {
    // Background Sync API not available — flush immediately
    await flushQueue();
  }
}

// ── Flush pending items (called by SW on sync event, or as fallback) ──────────

export async function flushQueue(token?: string): Promise<void> {
  const db = await getOfflineDb();
  const pending = await db.getAllFromIndex('sync_queue', 'by_status', 'PENDING');

  for (const item of pending) {
    if (!item.id) continue;
    await db.put('sync_queue', { ...item, status: 'SYNCING' });

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch('/api/v1/sync/push', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          entity_type: item.entity_type,
          entity_id: item.entity_id,
          operation: item.operation,
          payload: JSON.parse(item.payload),
          client_submitted_at: item.client_submitted_at,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      await db.put('sync_queue', { ...item, status: 'SYNCED' });
    } catch {
      const retries = item.retry_count + 1;
      const newStatus = retries >= MAX_RETRIES ? 'FAILED' : 'PENDING';
      await db.put('sync_queue', { ...item, status: newStatus, retry_count: retries });
    }
  }
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export async function getPendingCount(): Promise<number> {
  const db = await getOfflineDb();
  return db.countFromIndex('sync_queue', 'by_status', 'PENDING');
}
