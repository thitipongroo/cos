// File Service — shared types and Fastify request augmentation

import { FileServiceConfig } from './config';
import { DbService } from './services/db.service';
import { MinioService } from './services/minio.service';
import { AntivirusService } from './services/antivirus.service';
import { OpenSearchService } from './services/opensearch.service';
import { KafkaService } from './services/kafka.service';
import { ExtractionClient } from './extraction/extraction-client';

declare module 'fastify' {
  interface FastifyInstance {
    config: FileServiceConfig;
    db: DbService;
    minio: MinioService;
    antivirus: AntivirusService;
    opensearch: OpenSearchService;
    kafka: KafkaService;
    extraction: ExtractionClient;
  }

  interface FastifyRequest {
    tenantId: string;
    userId: string;
    userRole: string;
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
  quarantined_at: Date | null;
  is_archive: boolean;
  extracted_at: Date | null;
  parent_file_id: string | null;
  category: string | null;
  legal_hold: boolean;
  legal_hold_reason: string | null;
  legal_hold_by: string | null;
  legal_hold_at: Date | null;
}

// One validated entry extracted from a ZIP archive, ready to be stored as a child file.
export interface ExtractedEntry {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export interface RetentionPolicyRow {
  policy_id: string;
  tenant_id: string;
  category: string;
  retention_days: number;
  created_at: Date;
  updated_at: Date;
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
