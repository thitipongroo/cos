// SyncManager — core offline sync engine (spec §Phase 10 Sync Engine Architecture)
// Processes the sync_queue and handles conflict responses from the server.

import { fetchPending, markSyncing, markSynced, markFailed } from '../db/sync-queue';
import type { SyncQueueItem } from '../db/sync-queue';
import { ConflictHandler } from './ConflictHandler';
import type { ServerSyncStatus } from './ConflictHandler';

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
}

export interface SyncManagerCallbacks {
  onConflict?: (entityType: string, entityId: string, serverPayload: unknown) => void;
  onRejected?: (entityType: string, entityId: string, serverPayload: unknown) => void;
  onExhausted?: (entityType: string, entityId: string, operation: string) => Promise<void>;
  onUserNotify?: (message: string) => void;
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
    const result: SyncResult = { synced: 0, failed: 0, exhausted: 0 };
    const items = fetchPending(BATCH_SIZE);

    for (const item of items) {
      markSyncing(item.id);
      try {
        await this.processItem(item);
        result.synced++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown error';
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

    if (data.status === 'CONFLICT_FLAGGED') {
      if (this.callbacks.onConflict) {
        this.callbacks.onConflict(item.entity_type, item.entity_id, data.server_payload ?? null);
      }
    } else if (data.status === 'CONFLICT_REJECTED') {
      if (this.callbacks.onRejected) {
        this.callbacks.onRejected(item.entity_type, item.entity_id, data.server_payload ?? null);
      }
    }

    if (resolution.userMessage) {
      if (this.callbacks.onUserNotify) {
        this.callbacks.onUserNotify(resolution.userMessage);
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
        this.callbacks.onUserNotify(
          `Sync failed for ${item.entity_type} — change could not be saved.`,
        );
      }
    } else if (SILENT_DISCARD_TYPES.has(item.entity_type)) {
      // Preserve on device, no notification (spec §17.2)
    }
    // Unknown entity types: no action — not in spec §17.2
  }
}
