// SyncManager — core offline sync engine (spec §Phase 10 Sync Engine Architecture)
// Processes the sync_queue and handles conflict responses from the server.

import {
  fetchPending,
  markSyncing,
  markSynced,
  markFailed,
  markPermanentlyFailed,
  requeueFailed,
  resetStale,
} from '../db/sync-queue';
import type { SyncQueueItem } from '../db/sync-queue';
import { ConflictHandler } from './ConflictHandler';
import type { ServerSyncStatus, LocalSyncStatus } from './ConflictHandler';
import { isNetworkError, isPermanentFailure } from './httpFailure';

const MAX_RETRIES = 5;
const BATCH_SIZE = 20;

// Per spec §17.2 — entity types that emit platform.sync.exhausted event on retry exhaustion
const EXHAUSTED_NOTIFY_TYPES = new Set([
  'safety_incidents',
  'workforce_attendance',
  'inspection_results',
  'material_consumption',
]);

// Per spec §17.2 — discard + notify user in-app on exhaustion
const DISCARD_NOTIFY_TYPES = new Set(['task_progress_updates', 'site_report_drafts']);

// Per spec §17.2 — silent discard on exhaustion
const SILENT_DISCARD_TYPES = new Set(['equipment_usage_logs']);

export interface SyncServerResponse {
  status: ServerSyncStatus;
  server_payload?: unknown;
}

export interface HttpClient {
  post<R>(
    url: string,
    data: unknown,
    config?: { headers?: Record<string, string> },
  ): Promise<{ data: R }>;
}

export interface SyncResult {
  synced: number;
  failed: number;
  exhausted: number;
  /**
   * True when the batch was cut short because the network went away mid-cycle.
   *
   * The caller uses it to decide whether to run the photo queue at all (no point) and whether to
   * show the queue as errored (it is not — nothing is wrong with the items).
   */
  interrupted: boolean;
}

export interface SyncManagerCallbacks {
  onConflict?: (entityType: string, entityId: string, serverPayload: unknown) => void;
  onRejected?: (entityType: string, entityId: string, serverPayload: unknown) => void;
  onAccepted?: (entityType: string, entityId: string, serverPayload: unknown) => Promise<void>;
  /**
   * The verdict, applied. Fires for EVERY processed item, whatever the status, with what the local
   * row should now be — see ConflictHandler for why the server's payload is authoritative.
   *
   * This is what closes the loop that used to be open: `ConflictHandler.apply()` returned a
   * resolution and SyncManager read only its message off it, so a rejected change was never written
   * back to the device and a flagged one was never marked. The local row kept the stale value, with
   * no PENDING flag left to indicate it had not won.
   */
  onResolved?: (
    entityType: string,
    entityId: string,
    resolution: { localSyncStatus: LocalSyncStatus; payload: unknown },
  ) => Promise<void>;
  onExhausted?: (entityType: string, entityId: string, operation: string) => Promise<void>;
  /** Receives a translation KEY (see ConflictHandler.userMessageKey), never a finished sentence. */
  onUserNotify?: (messageKey: string) => void;
}

export class SyncManager {
  private readonly conflictHandler: ConflictHandler;

  constructor(
    private readonly httpClient: HttpClient,
    private readonly getToken: () => string | null,
    private readonly callbacks: SyncManagerCallbacks = {},
    conflictHandler?: ConflictHandler,
  ) {
    this.conflictHandler = conflictHandler ?? new ConflictHandler();
  }

  async processQueue(): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, failed: 0, exhausted: 0, interrupted: false };

    // Recover the queue BEFORE reading it. `resetStale` returns rows a previous run left in SYNCING
    // when the process died mid-request; `requeueFailed` returns rows that failed but still have
    // retry budget. Neither had a caller anywhere in the app before 2026-08-19, which meant
    // `fetchPending` (PENDING only) could never see either — one failure, or one kill, and a field
    // worker's queued mutation was stranded on the device permanently. It also meant `retry_count`
    // never passed 1, so MAX_RETRIES and the whole §17.2 exhaustion policy below were unreachable.
    resetStale();
    requeueFailed(MAX_RETRIES);

    const items = fetchPending(BATCH_SIZE);

    for (const item of items) {
      markSyncing(item.id);
      try {
        await this.processItem(item);
        result.synced++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown error';

        // THE NETWORK DROPPED — stop, and spend nothing. Every remaining item in this batch would
        // fail for the same reason, and the old code let them: one walk out of coverage burned a
        // retry on all 20, so four such walks discarded the lot under §17.2. The item is put back to
        // PENDING (it was marked SYNCING a moment ago) and the cycle ends.
        if (isNetworkError(err)) {
          resetStale();
          result.interrupted = true;
          break;
        }

        // The server refused it and will refuse it identically forever (a 4xx). Retrying five times
        // only delays the discard the user needs to hear about.
        if (isPermanentFailure(err)) {
          markPermanentlyFailed(item.id, msg, MAX_RETRIES);
          await this.handleExhaustion(item);
          result.exhausted++;
          continue;
        }

        markFailed(item.id, msg);

        // +1 because markFailed already incremented retry_count in DB
        if (item.retry_count + 1 >= MAX_RETRIES) {
          await this.handleExhaustion(item);
          result.exhausted++;
        } else {
          result.failed++;
        }
      }
    }

    return result;
  }

  private async processItem(item: SyncQueueItem): Promise<void> {
    const token = this.getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const { data } = await this.httpClient.post<SyncServerResponse>(
      '/api/v1/sync/push',
      {
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        operation: item.operation,
        payload: JSON.parse(item.payload),
        client_submitted_at: item.client_submitted_at,
      },
      { headers },
    );

    const localPayload = JSON.parse(item.payload) as unknown;
    const resolution = this.conflictHandler.apply(
      data.status,
      localPayload,
      data.server_payload ?? null,
    );

    // All server responses result in the queue item being acknowledged as processed.
    markSynced(item.id);

    // Write the verdict back to the local row first, so anything the callbacks below trigger (a
    // re-render, a conflict-review screen opening) already sees the resolved state.
    if (this.callbacks.onResolved) {
      await this.callbacks.onResolved(item.entity_type, item.entity_id, {
        localSyncStatus: resolution.localSyncStatus,
        payload: resolution.payload,
      });
    }

    if (data.status === 'CONFLICT_FLAGGED') {
      if (this.callbacks.onConflict) {
        this.callbacks.onConflict(item.entity_type, item.entity_id, data.server_payload ?? null);
      }
    } else if (data.status === 'CONFLICT_REJECTED') {
      if (this.callbacks.onRejected) {
        this.callbacks.onRejected(item.entity_type, item.entity_id, data.server_payload ?? null);
      }
    } else if (this.callbacks.onAccepted) {
      // ACCEPTED — let a caller reconcile local state with the server payload (e.g. clear an
      // annotation's dirty flag and adopt the server's new version so a later re-edit is not
      // wrongly flagged as a conflict; ADR-056).
      await this.callbacks.onAccepted(
        item.entity_type,
        item.entity_id,
        data.server_payload ?? null,
      );
    }

    if (resolution.userMessageKey) {
      if (this.callbacks.onUserNotify) {
        this.callbacks.onUserNotify(resolution.userMessageKey);
      }
    }
  }

  private async handleExhaustion(item: SyncQueueItem): Promise<void> {
    if (EXHAUSTED_NOTIFY_TYPES.has(item.entity_type)) {
      if (this.callbacks.onExhausted) {
        await this.callbacks.onExhausted(item.entity_type, item.entity_id, item.operation);
      }
    } else if (DISCARD_NOTIFY_TYPES.has(item.entity_type)) {
      if (this.callbacks.onUserNotify) {
        this.callbacks.onUserNotify('sync.exhausted.discarded');
      }
    } else if (SILENT_DISCARD_TYPES.has(item.entity_type)) {
      // Preserve on device, no notification (spec §17.2)
    }
    // Unknown entity types: no action — not in spec §17.2
  }
}
