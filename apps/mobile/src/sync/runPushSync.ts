// runPushSync — the outbound half of sync (device → server), the counterpart to runDeltaSync's pull.
// Triggered on entering the app / on reconnect (see (app)/_layout), gated on being online.
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
import { enqueue } from '../db/sync-queue';
import { photoRepo, findLocalPhotoByServerFileId } from '../db/photoRepo';
import { getAnnotation, markAnnotationSynced } from '../db/annotationRepo';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useOfflineStore } from '../store/offlineStore';

const API_BASE = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000/api/v1';

const getToken = (): string | null => useAuthStore.getState().accessToken;

export async function runPushSync(): Promise<void> {
  const manager = new SyncManager(apiClient as unknown as HttpClient, getToken, {
    onConflict: (entityType, entityId, serverPayload) => {
      useOfflineStore
        .getState()
        .addConflict({ itemId: 0, entityType, entityId, localPayload: null, serverPayload });
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
  });

  // 1. Drain the mutation queue (includes annotations enqueued on a previous cycle's upload).
  await manager.processQueue();

  // 2. Upload photo binaries last; each success enqueues its dirty annotation for the next cycle.
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
