// PhotoUploadQueue — uploads locally-captured photos to the File Service.
// Reads from local_photos (WatermelonDB) and uploads one at a time.
// Upload target: POST /api/v1/files/upload (multipart) — File Service Phase 9.
// Retry: up to 3 attempts per photo; marks FAILED on exhaustion (spec §Phase 10 Media Cache).

// Expo SDK 54+ moved the classic FileSystem API (uploadAsync / FileSystemUploadType) to the
// `expo-file-system/legacy` subpath; the new `expo-file-system` root no longer exports them (ADR-046).
import * as FileSystem from 'expo-file-system/legacy';

const MAX_RETRIES = 3;
const UPLOAD_URL = '/api/v1/files/upload';

export interface PendingPhoto {
  localId: string;
  localPath: string;
  entityType: string;
  entityId: string;
}

export interface PhotoRepository {
  getPendingPhotos(): Promise<PendingPhoto[]>;
  markUploading(localId: string): Promise<void>;
  markUploaded(localId: string, serverFileId: string): Promise<void>;
  markFailed(localId: string): Promise<void>;
}

export class PhotoUploadQueue {
  private readonly retryMap = new Map<string, number>();

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

  private async uploadPhoto(photo: PendingPhoto): Promise<void> {
    const retries = this.retryMap.get(photo.localId) ?? 0;
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

      const body = JSON.parse(result.body) as { file_id?: string };
      const serverFileId = body.file_id ?? '';
      await this.photoRepo.markUploaded(photo.localId, serverFileId);
      if (serverFileId && this.onUploaded) {
        // A dirty annotation for this photo can now be addressed to its server file_id. Best-effort:
        // a failure here leaves the annotation dirty for the next cycle, it must not fail the upload.
        try {
          await this.onUploaded(photo.localId, serverFileId);
        } catch {
          /* annotation stays dirty; retried next sync */
        }
      }
      this.retryMap.delete(photo.localId);
    } catch {
      this.retryMap.set(photo.localId, retries + 1);
      if (retries + 1 >= MAX_RETRIES) {
        await this.photoRepo.markFailed(photo.localId);
        this.retryMap.delete(photo.localId);
      }
    }
  }
}
