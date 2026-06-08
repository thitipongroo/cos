// File cleanup Temporal activities.
// Activities have full access to I/O: DB, MinIO, OpenSearch.
// Each activity is idempotent — safe to retry on failure.

import type { DbService } from '../services/db.service';
import type { MinioService } from '../services/minio.service';
import type { OpenSearchService } from '../services/opensearch.service';
import { createLogger } from '@cos/logger';

const logger = createLogger('file-service.cleanup');

export interface FileCleanupActivities {
  findExpiredFiles(): Promise<string[]>;
  hardDeleteFile(fileId: string): Promise<void>;
  findExpiredQuarantinedFiles(): Promise<string[]>;
  purgeQuarantinedFile(fileId: string): Promise<void>;
}

export function createFileCleanupActivities(
  db: DbService,
  minio: MinioService,
  opensearch: OpenSearchService,
): FileCleanupActivities {
  return {
    async findExpiredFiles(): Promise<string[]> {
      const rows = await db.findExpiredFiles();
      return rows.map((r) => r.file_id);
    },

    async hardDeleteFile(fileId: string): Promise<void> {
      const rows = await db.findExpiredFiles();
      const file = rows.find((r) => r.file_id === fileId);
      if (!file) {
        return; // Already deleted or not found — idempotent no-op
      }
      try {
        await minio.deleteFile(file.tenant_id, file.stored_key);
      } catch (err) {
        logger.warn({ err, file_id: fileId }, 'file.cleanup.minio_delete_failed');
      }
      try {
        await opensearch.deleteFileIndex(file.tenant_id, fileId);
      } catch (err) {
        logger.warn({ err, file_id: fileId }, 'file.cleanup.opensearch_delete_failed');
      }
      await db.hardDeleteFile(fileId);
      logger.info({ file_id: fileId }, 'file.cleanup.hard_deleted');
    },

    async findExpiredQuarantinedFiles(): Promise<string[]> {
      const rows = await db.findExpiredQuarantinedFiles();
      return rows.map((r) => r.file_id);
    },

    async purgeQuarantinedFile(fileId: string): Promise<void> {
      const rows = await db.findExpiredQuarantinedFiles();
      const file = rows.find((r) => r.file_id === fileId);
      if (!file) {
        return; // Already purged or not found — idempotent no-op
      }
      try {
        await minio.deleteFromQuarantine(file.tenant_id, file.stored_key);
      } catch (err) {
        logger.warn({ err, file_id: fileId }, 'file.cleanup.quarantine_minio_delete_failed');
      }
      try {
        await opensearch.deleteFileIndex(file.tenant_id, fileId);
      } catch (err) {
        logger.warn({ err, file_id: fileId }, 'file.cleanup.quarantine_opensearch_delete_failed');
      }
      await db.hardDeleteFile(fileId);
      logger.info({ file_id: fileId }, 'file.cleanup.quarantine_purged');
    },
  };
}
