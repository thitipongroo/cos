// File Service — shared types and Fastify request augmentation

import { FileServiceConfig } from './config';
import { DbService } from './services/db.service';
import { MinioService } from './services/minio.service';
import { AntivirusService } from './services/antivirus.service';
import { OpenSearchService } from './services/opensearch.service';
import { KafkaService } from './services/kafka.service';

declare module 'fastify' {
  interface FastifyInstance {
    config: FileServiceConfig;
    db: DbService;
    minio: MinioService;
    antivirus: AntivirusService;
    opensearch: OpenSearchService;
    kafka: KafkaService;
  }

  interface FastifyRequest {
    tenantId: string;
    userId: string;
    traceId: string;
  }
}

export type FileStatus = 'PENDING_SCAN' | 'CLEAN' | 'QUARANTINED';

export interface StoredFileRow {
  file_id: string;
  tenant_id: string;
  original_filename: string;
  stored_key: string;
  bucket_name: string;
  mime_type: string;
  file_size_bytes: string; // pg returns BIGINT as string
  file_status: FileStatus;
  uploaded_by: string;
  uploaded_at: Date;
  deleted_at: Date | null;
}

export interface FileMetadataRow {
  metadata_id: string;
  file_id: string;
  tenant_id: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata_key: string;
  metadata_value: string | null;
}

export interface UploadedFileResult {
  file_id: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: string;
  file_status: FileStatus;
  uploaded_at: string;
}

export interface ScanResult {
  clean: boolean;
  threat?: string;
}
