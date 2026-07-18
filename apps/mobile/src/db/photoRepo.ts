// Concrete, Drizzle-backed PhotoRepository — the DB half of PhotoUploadQueue (ADR-046 / §17.6).
// Lives in src/db (runtime DB wiring, coverage-excluded like database.ts); the queue logic that
// consumes it lives in src/sync and is unit-tested against the PhotoRepository interface with a mock.

import { eq } from 'drizzle-orm';
import { db } from './database';
import { localPhotos, localPhotoAnnotations } from './schema';
import type { PendingPhoto, PhotoRepository } from '../sync/PhotoUploadQueue';

export const photoRepo: PhotoRepository = {
  async getPendingPhotos(): Promise<PendingPhoto[]> {
    const rows = await db.select().from(localPhotos).where(eq(localPhotos.uploadStatus, 'PENDING'));
    return rows.map((r) => ({
      localId: r.id,
      localPath: r.localPath,
      entityType: r.entityType,
      entityId: r.entityId,
    }));
  },

  async markUploading(localId: string): Promise<void> {
    await db
      .update(localPhotos)
      .set({ uploadStatus: 'UPLOADING' })
      .where(eq(localPhotos.id, localId));
  },

  async markUploaded(localId: string, serverFileId: string): Promise<void> {
    await db
      .update(localPhotos)
      .set({ uploadStatus: 'UPLOADED', serverFileId })
      .where(eq(localPhotos.id, localId));
  },

  async markFailed(localId: string): Promise<void> {
    await db.update(localPhotos).set({ uploadStatus: 'FAILED' }).where(eq(localPhotos.id, localId));
  },
};

/** The server file_id for a local photo, or null if not yet uploaded. Used by the annotation flow. */
export async function serverFileIdFor(localPhotoId: string): Promise<string | null> {
  const rows = await db
    .select({ serverFileId: localPhotos.serverFileId })
    .from(localPhotos)
    .where(eq(localPhotos.id, localPhotoId));
  return rows[0]?.serverFileId ?? null;
}

/** Reverse of serverFileIdFor: the local photo id for a server file_id, or null. */
export async function findLocalPhotoByServerFileId(serverFileId: string): Promise<string | null> {
  const rows = await db
    .select({ id: localPhotos.id })
    .from(localPhotos)
    .where(eq(localPhotos.serverFileId, serverFileId));
  return rows[0]?.id ?? null;
}

/**
 * Delete a photo and its annotation from the device.
 *
 * Local-only by construction — the caller gates on `canDeletePhoto()`, which admits only photos whose
 * bytes never reached the server (see src/lib/photoGallery.ts for why). Nothing is enqueued: there is
 * no DELETE in `SyncOperation`, and no server row exists to remove.
 *
 * The annotation row goes first so a failure between the two statements leaves an annotation-less
 * photo (recoverable, the user can simply delete again) rather than an annotation orphaned from the
 * photo it describes. expo-sqlite has no cross-statement transaction in this codebase's Drizzle setup.
 */
export async function deletePhotoLocal(localPhotoId: string): Promise<void> {
  await db
    .delete(localPhotoAnnotations)
    .where(eq(localPhotoAnnotations.localPhotoId, localPhotoId));
  await db.delete(localPhotos).where(eq(localPhotos.id, localPhotoId));
}
