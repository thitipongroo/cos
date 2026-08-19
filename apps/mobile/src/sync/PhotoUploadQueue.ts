// PhotoUploadQueue — uploads locally-captured photos to the File Service.
// Reads from local_photos and uploads one at a time.
// Upload target: POST /api/v1/files/upload (multipart) — File Service Phase 9.
// Retry: up to 3 attempts per photo; marks FAILED on exhaustion (spec §Phase 10 Media Cache).

// Expo SDK 54+ moved the classic FileSystem API (uploadAsync / FileSystemUploadType) to the
// `expo-file-system/legacy` subpath; the new `expo-file-system` root no longer exports them (ADR-046).
import * as FileSystem from 'expo-file-system/legacy';
import { isPermanentFailure } from './httpFailure';

const MAX_RETRIES = 3;
const UPLOAD_URL = '/api/v1/files/upload';

export interface PendingPhoto {
  localId: string;
  localPath: string;
  entityType: string;
  entityId: string;
  /** Attempts already spent on this photo, read from the row rather than from memory — see below. */
  retryCount: number;
}

export interface PhotoRepository {
  getPendingPhotos(): Promise<PendingPhoto[]>;
  markUploading(localId: string): Promise<void>;
  markUploaded(localId: string, serverFileId: string): Promise<void>;
  /** Return a photo to the queue with its attempt count persisted, so the budget survives a restart. */
  markPending(localId: string, retryCount: number): Promise<void>;
  markFailed(localId: string): Promise<void>;
}

/**
 * A response that reached us but did not mean "uploaded".
 *
 * Thrown rather than returned so it lands in the same `catch` as a transport failure and gets the
 * same retry accounting — while carrying the status, so `isPermanentFailure` can still tell a 413
 * (this file will never be accepted) from a 502 (try again later).
 */
class UploadRejected extends Error {
  readonly response: { status: number };
  constructor(status: number, detail: string) {
    super(`upload rejected (${status}): ${detail}`);
    this.response = { status };
  }
}

export class PhotoUploadQueue {
  constructor(
    private readonly photoRepo: PhotoRepository,
    private readonly baseUrl: string,
    private readonly getToken: () => string | null,
    // Fired after a photo's file is uploaded and its server file_id is known. The annotation flow
    // uses this to enqueue a pending photo_annotation now that the parent has a server id
    // (enqueue-after-parent; ADR-056). Best-effort — a throw here must not fail the upload.
    private readonly onUploaded?: (localId: string, serverFileId: string) => Promise<void>,
  ) {}

  async processNext(): Promise<void> {
    const photos = await this.photoRepo.getPendingPhotos();
    if (photos.length === 0) return;

    const photo = photos[0];
    await this.uploadPhoto(photo);
  }

  async processAll(): Promise<void> {
    const photos = await this.photoRepo.getPendingPhotos();
    for (const photo of photos) {
      await this.uploadPhoto(photo);
    }
  }

  /**
   * Upload one photo, and leave the row in a state the NEXT cycle can act on.
   *
   * THE BUG THIS SHAPE EXISTS TO PREVENT (found 2026-08-19). The old version marked the row
   * UPLOADING before the request and, on failure, only bumped an in-memory Map. `getPendingPhotos`
   * filters on PENDING, so the row was never offered again — a single failed upload stranded a site
   * photo on the device permanently, invisible to the §17.7 queue cap (which counts PENDING) and
   * never reaching the FAILED state that would have told anyone. The Map made it worse: `runPushSync`
   * builds a new PhotoUploadQueue every cycle, so the count reset to zero each time and MAX_RETRIES
   * was unreachable from either direction.
   *
   * Both halves are now on the row: the status always returns to PENDING or FAILED, and the attempt
   * count is persisted so the budget means something across restarts.
   */
  private async uploadPhoto(photo: PendingPhoto): Promise<void> {
    const attempt = photo.retryCount + 1;
    await this.photoRepo.markUploading(photo.localId);
    try {
      const token = this.getToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const result = await FileSystem.uploadAsync(`${this.baseUrl}${UPLOAD_URL}`, photo.localPath, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        parameters: { entity_type: photo.entityType, entity_id: photo.entityId },
        headers,
      });

      // uploadAsync RESOLVES on a 4xx/5xx — it reports the status, it does not throw on it. Without
      // this check a rejected upload whose body happened to parse as JSON was marked UPLOADED with an
      // empty file_id: the bytes never left the device, and nothing was left to say so.
      if (result.status < 200 || result.status >= 300) {
        throw new UploadRejected(result.status, result.body.slice(0, 200));
      }

      const body = JSON.parse(result.body) as { file_id?: string };
      const serverFileId = body.file_id;
      // A 2xx with no file_id is not an upload either — there is nothing to attach the photo to.
      if (!serverFileId) {
        throw new UploadRejected(result.status, 'response carried no file_id');
      }

      await this.photoRepo.markUploaded(photo.localId, serverFileId);
      if (this.onUploaded) {
        // A dirty annotation for this photo can now be addressed to its server file_id. Best-effort:
        // a failure here leaves the annotation dirty for the next cycle, it must not fail the upload.
        try {
          await this.onUploaded(photo.localId, serverFileId);
        } catch {
          /* annotation stays dirty; retried next sync */
        }
      }
    } catch (err) {
      // A file the server will never accept (413 too large, 415 wrong type, 400 malformed) is failed
      // now rather than three cycles from now — the outcome is identical and the user hears sooner.
      if (attempt >= MAX_RETRIES || isPermanentFailure(err)) {
        await this.photoRepo.markFailed(photo.localId);
        return;
      }
      await this.photoRepo.markPending(photo.localId, attempt);
    }
  }
}
