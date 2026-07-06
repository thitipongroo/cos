// File Service Integration Stub — Phase 6
// Photo upload for site reports and issues goes through File Service (separate deployable).
// Communication: REST API call from SiteOpsService → File Service (services/file-service/).
// NOT direct S3 upload from SiteOps module.
// Implemented in Phase 9 when File Service is built.

import { NotImplementedException } from '@nestjs/common';
import { createLogger } from '@cos/logger';

const logger = createLogger('site-ops-file-service');

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
    logger.warn(
      { tenantId: params.tenantId, entityType: params.entityType, entityId: params.entityId },
      'FileService.uploadPhoto not activated — implemented in Phase 9 (services/file-service/)',
    );
    throw new NotImplementedException('FileService.uploadPhoto not yet activated');
  }

  async deletePhoto(fileId: string, tenantId: string): Promise<void> {
    logger.warn(
      { fileId, tenantId },
      'FileService.deletePhoto not activated — implemented in Phase 9 (services/file-service/)',
    );
    throw new NotImplementedException('FileService.deletePhoto not yet activated');
  }
}
