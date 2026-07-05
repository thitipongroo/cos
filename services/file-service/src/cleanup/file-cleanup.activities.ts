// File cleanup Temporal activities.
// Activities have full access to I/O: DB, MinIO, OpenSearch.
// Each activity is idempotent — safe to retry on failure.

import type { DbService } from '../services/db.service';
import type { MinioService } from '../services/minio.service';
import type { OpenSearchService } from '../services/opensearch.service';
import { createLogger } from '@cos/logger';

const logger = createLogger('file-service.cleanup');

export interface FileCleanupActivities {
  autoSoftDeleteExpired(): Promise<number>;
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
    // Retention lifecycle: soft-delete files past their category's retention_days (legal hold
    // excluded at the query level). The 30-day hard-delete grace then applies as usual.
    async autoSoftDeleteExpired(): Promise<number> {
      const rows = await db.findFilesPastRetention();
      for (const f of rows) {
        await db.softDeleteFileAdmin(f.file_id);
        logger.info(
          { file_id: f.file_id, category: f.category },
          'file.retention.auto_soft_deleted',
        );
      }
      return rows.length;
    },

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
