// Draining the offline mutation queue (spec §Phase 10 Web App Stack; master:3620).
//
// This module is imported by BOTH the Service Worker (on a `sync` event, after the tab is gone) and
// the page (the fallback for browsers without Background Sync). One implementation, so the two paths
// cannot drift into disagreeing about retries or about what counts as a permanent failure.
//
// It therefore must not touch `window` or `document` — nothing here may assume a DOM.
//
// Replay goes through the app's own `/api/sync/replay` route, never straight to the backend: that
// route is same-origin, so the httpOnly session cookie reaches it and the credential stays off the
// device. See the long note in app/api/sync/replay/route.ts.

import { getOfflineDb } from '../idb/schema';

/** master:3684 gives the mobile queue five attempts; the web queue matches it. */
export const MAX_RETRIES = 5;

/** Same-origin replay endpoint — see the note above. */
export const REPLAY_PATH = '/api/sync/replay';

export interface DrainResult {
  synced: number;
  failed: number;
  /** Items left PENDING because the session could not be recovered, not because they were rejected. */
  deferred: number;
}

/**
 * Send every PENDING item, oldest first, and record what the server said.
 *
 * A 401 does NOT spend a retry: the item is left PENDING and the drain stops. The session is gone
 * for every remaining item too, so continuing would burn all five attempts on each one for a reason
 * that has nothing to do with the data.
 */
export async function drainQueue(): Promise<DrainResult> {
  const db = await getOfflineDb();
  const pending = await db.getAllFromIndex('sync_queue', 'by_status', 'PENDING');
  const result: DrainResult = { synced: 0, failed: 0, deferred: 0 };

  for (const item of pending) {
    if (item.id == null) continue;

    await db.put('sync_queue', { ...item, status: 'SYNCING' });

    let response: Response;
    try {
      response = await fetch(REPLAY_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Same-origin, so the session cookie rides along. Explicit rather than relying on the
        // default, which differs between a window and a worker context.
        credentials: 'same-origin',
        body: JSON.stringify({
          entity_type: item.entity_type,
          entity_id: item.entity_id,
          operation: item.operation,
          payload: JSON.parse(item.payload),
          client_submitted_at: item.client_submitted_at,
        }),
      });
    } catch {
      // Still offline, or the request never left. Put it back untouched — a network failure is the
      // ordinary case for a queue that exists because the network is unreliable.
      await db.put('sync_queue', { ...item, status: 'PENDING' });
      result.deferred += 1;
      return result;
    }

    if (response.status === 401) {
      await db.put('sync_queue', { ...item, status: 'PENDING' });
      result.deferred += 1;
      return result;
    }

    if (response.ok) {
      await db.put('sync_queue', { ...item, status: 'SYNCED' });
      result.synced += 1;
      continue;
    }

    const retries = item.retry_count + 1;
    const exhausted = retries >= MAX_RETRIES;
    await db.put('sync_queue', {
      ...item,
      status: exhausted ? 'FAILED' : 'PENDING',
      retry_count: retries,
    });
    if (exhausted) result.failed += 1;
  }

  return result;
}
