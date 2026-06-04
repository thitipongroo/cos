// File Service Integration Stub — Phase 6
// Photo upload for site reports and issues goes through File Service (separate deployable).
// Communication: REST API call from SiteOpsService → File Service (services/file-service/).
// NOT direct S3 upload from SiteOps module.
// Implemented in Phase 9 when File Service is built.

export interface PhotoUploadResult {
  file_id: string; // UUID assigned by File Service
  storage_url: string; // Presigned or CDN URL
  content_type: string;
  size_bytes: number;
  uploaded_at: string; // ISO 8601 UTC
}

export interface FileServiceClient {
  uploadPhoto(params: {
    tenantId: string;
    entityType: 'site_report' | 'issue';
    entityId: string;
    fileName: string;
    contentType: string;
    buffer: Buffer;
  }): Promise<PhotoUploadResult>;

  deletePhoto(fileId: string, tenantId: string): Promise<void>;
}

// STUB — not implemented until Phase 9 (File Service)
export class FileServiceStub implements FileServiceClient {
  async uploadPhoto(params: {
    tenantId: string;
    entityType: 'site_report' | 'issue';
    entityId: string;
    fileName: string;
    contentType: string;
    buffer: Buffer;
  }): Promise<PhotoUploadResult> {
    throw new Error(
      `FileService.uploadPhoto not implemented. ` +
        `Implemented in Phase 9 (File Service — services/file-service/). ` +
        `Entity: ${params.entityType}/${params.entityId}, tenant: ${params.tenantId}.`,
    );
  }

  async deletePhoto(_fileId: string, _tenantId: string): Promise<void> {
    throw new Error(
      'FileService.deletePhoto not implemented. Implemented in Phase 9 (File Service).',
    );
  }
}
