// runPushSync — the outbound half of sync (device → server), the counterpart to runDeltaSync's pull.
// Triggered by runSyncCycle (see ./syncRunner) on entering the app, on reconnect, from the manual
// "Force System Sync" action, and from the OS background job.
//
// Order (§17.6): drain the sync_queue FIRST via SyncManager — safety/attendance/…/photo_annotation,
// already priority-ordered by fetchPending — THEN upload photo binaries LAST via PhotoUploadQueue,
// because media is the largest payload and must not block critical data. An annotation enqueued as a
// side effect of a photo upload this cycle is pushed on the NEXT cycle; that one-cycle deferral is
// the price of keeping photos last, and is fine for an offline-first, eventually-consistent flow.
//
// Pure orchestration over injected/mocked modules (src/sync is under the 100% gate).

import { SyncManager, type HttpClient } from './SyncManager';
import { PhotoUploadQueue } from './PhotoUploadQueue';
import { enqueueAnnotationForUploadedPhoto } from './enqueueAnnotation';
import { resolutionTarget } from './resolutionTargets';
import { enqueue } from '../db/sync-queue';
import { photoRepo, findLocalPhotoByServerFileId } from '../db/photoRepo';
import { getAnnotation, markAnnotationSynced } from '../db/annotationRepo';
import { setSyncStatusByKey } from '../db/database';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useOfflineStore } from '../store/offlineStore';
import { useSyncStore } from '../store/syncStore';

const API_BASE = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000/api/v1';

const getToken = (): string | null => useAuthStore.getState().accessToken;

export async function runPushSync(): Promise<void> {
  const manager = new SyncManager(apiClient as unknown as HttpClient, getToken, {
    onConflict: (entityType, entityId, serverPayload) => {
      useOfflineStore
        .getState()
        .addConflict({ itemId: 0, entityType, entityId, localPayload: null, serverPayload });
    },
    // The server's verdict, written back to the row it came from. Without this the local row stayed
    // PENDING whatever the server said — see sync/resolutionTargets.ts.
    onResolved: async (entityType, entityId, resolution) => {
      const target = resolutionTarget(entityType);
      if (!target) return;
      await setSyncStatusByKey(
        target.table,
        target.keyColumn,
        entityId,
        resolution.localSyncStatus,
      );
    },
    onAccepted: async (entityType, entityId, serverPayload) => {
      // Reconcile an accepted photo_annotation push: entityId is the server file_id, so map it back
      // to the local photo and adopt the server's new version (clears dirty; a later re-edit then
      // bases its conflict check on the correct version). ADR-056.
      if (entityType !== 'photo_annotation') return;
      const version = (serverPayload as { version?: number } | null)?.version;
      if (typeof version !== 'number') return;
      const localPhotoId = await findLocalPhotoByServerFileId(entityId);
      if (localPhotoId) await markAnnotationSynced(localPhotoId, version);
    },
    // A REJECTED change is a conflict from the user's side — the server kept its own version and
    // discarded theirs — so it goes to the same list <ConflictBadge /> already counts, rather than to
    // a notification surface that does not exist. Before this it went nowhere at all.
    onRejected: (entityType, entityId, serverPayload) => {
      useOfflineStore
        .getState()
        .addConflict({ itemId: 0, entityType, entityId, localPayload: null, serverPayload });
    },
    // The remaining copy — a flagged conflict, a discarded-after-exhaustion item — reaches the user
    // through the sync pill's ERROR state, which the palette and the accessibility label already
    // define (components/SyncPill.tsx) and which nothing could previously trigger, because nothing
    // ever wrote `syncStore.status` or `errorMessage`. Keys, not sentences: ConflictHandler stopped
    // returning finished English on 2026-08-19, so this cannot ship untranslated copy to a
    // Thai-language tenant.
    onUserNotify: (messageKey) => {
      useSyncStore.getState().setError(messageKey);
    },
    // §17.2: safety incidents, attendance, inspection results and material consumption go to the
    // tenant-admin review queue after 5 failed retries, and the first three raise a push alert.
    // SyncManager routed those four here correctly — and nothing supplied this callback, so a safety
    // incident that failed to sync escalated to NOBODY. The record survived on the device and the
    // person who filed it had no way to learn it never arrived (TDD OQ-38, wired 2026-08-22).
    //
    // Best-effort by design. The device has already exhausted its retries for the mutation itself,
    // so the network is likely still down; failing loudly here would turn "we could not tell the
    // admin yet" into a crash, and the record is preserved on the device either way. The next sync
    // cycle re-reports, and the server is idempotent on (tenant, entity_type, entity_id).
    onExhausted: async (item) => {
      try {
        await apiClient.post('/sync/exhausted', {
          entity_type: item.entity_type,
          entity_id: item.entity_id,
          operation: item.operation,
          // Stored as a JSON string in sync_queue; the server column is jsonb.
          payload: JSON.parse(item.payload) as Record<string, unknown>,
          client_submitted_at: item.client_submitted_at,
          last_error: item.error_message,
        });
      } catch {
        useSyncStore.getState().setError('sync.exhausted.report_failed');
      }
    },
  });

  // 1. Drain the mutation queue (includes annotations enqueued on a previous cycle's upload).
  const result = await manager.processQueue();

  // 2. Upload photo binaries last; each success enqueues its dirty annotation for the next cycle.
  //    Skipped when the queue pass was cut short by the network going away — the uploads would fail
  //    for the same reason, and each failure spends one of a photo's three attempts.
  if (result.interrupted) return;

  const photos = new PhotoUploadQueue(
    photoRepo,
    API_BASE,
    getToken,
    async (localPhotoId, serverFileId) => {
      await enqueueAnnotationForUploadedPhoto(localPhotoId, serverFileId, {
        getAnnotation,
        enqueue,
      });
    },
  );
  await photos.processAll();
}
