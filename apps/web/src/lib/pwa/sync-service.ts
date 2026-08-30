// PWA sync service — Background Sync API + IndexedDB queue (spec §Phase 10 Web App Stack).
//
// Enqueues a mutation and asks the Service Worker to replay it. The worker owns the draining (see
// app/sw.ts), which is what lets a queued write reach the server after the tab is closed; this file
// keeps the immediate-flush path for browsers that lack Background Sync, running the SAME drain so
// the two cannot disagree.
//
// Neither path handles a credential: replay goes through the app's same-origin /api/sync/replay
// route, which reads the httpOnly session server-side. See that route's header for why.

import { getOfflineDb } from '../idb/schema';
import type { OfflineSyncQueueItem } from '../idb/schema';
import { SYNC_TAG } from './sync-tag';
import { drainQueue, MAX_RETRIES } from './replay-queue';

export { SYNC_TAG, MAX_RETRIES };

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

// ── Flush pending items (fallback where Background Sync is unavailable) ──────

/**
 * Drain the queue from the page.
 *
 * Used when the browser has no Background Sync API, and available to the app for an explicit
 * "sync now". The Service Worker path is preferred because it survives the tab closing.
 */
export async function flushQueue(): Promise<void> {
  await drainQueue();
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export async function getPendingCount(): Promise<number> {
  const db = await getOfflineDb();
  return db.countFromIndex('sync_queue', 'by_status', 'PENDING');
}
