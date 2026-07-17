// Concrete, Drizzle-backed annotation repository (ADR-056). DB half of the photo-annotation flow;
// lives in src/db (coverage-excluded runtime wiring). The strokes are stored as JSON text in the
// local_photo_annotations table, keyed by the LOCAL photo id (a photo has no server file_id until
// uploaded). `baseVersion` is the optimistic-concurrency token; `dirty` = has unpushed local edits.

import { eq } from 'drizzle-orm';
import { db } from './database';
import { localPhotoAnnotations, type PhotoAnnotationRow } from './schema';

export interface LocalAnnotation {
  localPhotoId: string;
  strokes: unknown[];
  baseVersion: number;
  dirty: boolean;
}

function toLocal(row: PhotoAnnotationRow): LocalAnnotation {
  return {
    localPhotoId: row.localPhotoId,
    strokes: JSON.parse(row.strokes) as unknown[],
    baseVersion: row.baseVersion,
    dirty: row.dirty === 1,
  };
}

/** The annotation for a photo (parsed), or null. */
export async function getAnnotation(localPhotoId: string): Promise<LocalAnnotation | null> {
  const rows = await db
    .select()
    .from(localPhotoAnnotations)
    .where(eq(localPhotoAnnotations.localPhotoId, localPhotoId));
  return rows[0] ? toLocal(rows[0]) : null;
}

/** Save the strokes for a photo and mark the row dirty (unsynced). Preserves the existing baseVersion. */
export async function upsertAnnotation(localPhotoId: string, strokes: unknown[]): Promise<void> {
  const existing = await getAnnotation(localPhotoId);
  const now = new Date().toISOString();
  const strokesJson = JSON.stringify(strokes);
  if (existing) {
    await db
      .update(localPhotoAnnotations)
      .set({ strokes: strokesJson, dirty: 1, updatedAt: now })
      .where(eq(localPhotoAnnotations.localPhotoId, localPhotoId));
  } else {
    await db.insert(localPhotoAnnotations).values({
      localPhotoId,
      strokes: strokesJson,
      baseVersion: 0, // never synced yet
      dirty: 1,
      updatedAt: now,
    });
  }
}

/** After a successful push: clear dirty and record the server's new version as the next base. */
export async function markAnnotationSynced(
  localPhotoId: string,
  serverVersion: number,
): Promise<void> {
  await db
    .update(localPhotoAnnotations)
    .set({ dirty: 0, baseVersion: serverVersion })
    .where(eq(localPhotoAnnotations.localPhotoId, localPhotoId));
}
