// enqueue-on-upload (ADR-056; §17.5). When a photo's file finishes uploading and its server file_id
// becomes known, a dirty annotation for that photo can finally be pushed — addressed to the server
// file_id, carrying the base version for the CONFLICT_FLAGGED check. This is the enqueue-after-parent
// pattern (research-backed): the child is enqueued only once the parent has a server id, so
// SyncManager needs no dependency ordering.
//
// Pure orchestration over injected seams so it is unit-testable (src/sync is under the 100% gate).

export interface AnnotationEnqueueDeps {
  getAnnotation: (localPhotoId: string) => Promise<{
    strokes: unknown[];
    baseVersion: number;
    dirty: boolean;
  } | null>;
  enqueue: (
    entityType: string,
    entityId: string,
    operation: 'CREATE' | 'UPDATE',
    payload: unknown,
  ) => number;
}

/**
 * If the just-uploaded photo has a dirty annotation, enqueue it for /sync/push keyed to the server
 * file_id. Returns the queue row id, or null when there is nothing dirty to push.
 */
export async function enqueueAnnotationForUploadedPhoto(
  localPhotoId: string,
  serverFileId: string,
  deps: AnnotationEnqueueDeps,
): Promise<number | null> {
  const annotation = await deps.getAnnotation(localPhotoId);
  if (!annotation || !annotation.dirty) return null;

  return deps.enqueue('photo_annotation', serverFileId, 'UPDATE', {
    strokes: annotation.strokes,
    version: annotation.baseVersion,
  });
}
