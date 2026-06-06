// WatermelonDB Model — local_photos
// Maps to the local_photos table defined in schema.ts.

import { Model } from '@nozbe/watermelondb';
import { field, writer } from '@nozbe/watermelondb/decorators';

export type UploadStatus = 'PENDING' | 'UPLOADING' | 'UPLOADED' | 'FAILED';
export type PhotoEntityType = 'site_report' | 'issue' | 'inspection';

export default class Photo extends Model {
  static table = 'local_photos';

  @field('photo_id') photoId!: string;
  @field('entity_type') entityType!: PhotoEntityType;
  @field('entity_id') entityId!: string;
  @field('local_path') localPath!: string;
  @field('upload_status') uploadStatus!: UploadStatus;
  @field('server_file_id') serverFileId!: string | null;

  @writer
  async markUploaded(serverFileId: string): Promise<void> {
    await this.update((record) => {
      (record as Photo).serverFileId = serverFileId;
      (record as Photo).uploadStatus = 'UPLOADED';
    });
  }

  @writer
  async markFailed(): Promise<void> {
    await this.update((record) => {
      (record as Photo).uploadStatus = 'FAILED';
    });
  }
}
