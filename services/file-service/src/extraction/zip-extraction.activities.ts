// ZIP extraction Temporal activities.
// Activities have full I/O access: DB, MinIO, antivirus (via scan-runner). Idempotent-ish —
// a re-run re-extracts, but children carry fresh UUIDs, so Temporal retries stay safe.

import { randomUUID } from 'crypto';
import type { DbService } from '../services/db.service';
import type { MinioService } from '../services/minio.service';
import { ZipExtractionService } from '../services/zip-extraction.service';
import { runAntivirusScan, type ScanServices } from '../services/scan-runner';
import { buildStoredKey } from '../util/stored-key';
import { createLogger } from '@cos/logger';

const logger = createLogger('file-service.extraction');

export interface ZipExtractionActivities {
  extractArchive(archiveFileId: string): Promise<number>;
  markArchiveExtracted(archiveFileId: string): Promise<void>;
}

export interface ExtractionDeps {
  db: DbService;
  minio: MinioService;
  zip: ZipExtractionService;
  scanServices: ScanServices;
}

export function createZipExtractionActivities(deps: ExtractionDeps): ZipExtractionActivities {
  const { db, minio, zip, scanServices } = deps;
  return {
    async extractArchive(archiveFileId: string): Promise<number> {
      const archive = await db.findFileByIdAdmin(archiveFileId);
      if (!archive) {
        logger.warn({ archiveFileId }, 'extraction.archive_not_found');
        return 0;
      }

      const buffer = await minio.downloadToBuffer(archive.tenant_id, archive.stored_key);

      let entries;
      try {
        entries = await zip.extract(buffer);
      } catch (err) {
        // Extraction of a fixed buffer is deterministic — a zip-bomb, malformed archive, or
        // path-traversal entry (rejected by yauzl) will never succeed on retry. Reject: no children.
        logger.warn(
          { archiveFileId, reason: (err as Error).message },
          'extraction.archive_rejected',
        );
        return 0;
      }

      for (const entry of entries) {
        const childId = randomUUID();
        const storedKey = buildStoredKey(childId, entry.filename);
        await minio.uploadFile({
          tenantId: archive.tenant_id,
          storedKey,
          buffer: entry.buffer,
          mimeType: entry.mimeType,
        });
        await db.insertFile({
          fileId: childId,
          tenantId: archive.tenant_id,
          originalFilename: entry.filename,
          storedKey,
          bucketName: minio.bucketName(archive.tenant_id),
          mimeType: entry.mimeType,
          fileSizeBytes: entry.buffer.length,
          uploadedBy: archive.uploaded_by,
          parentFileId: archive.file_id,
        });
        // Per-entry antivirus re-validation (spec §Phase 9: re-validate each entry).
        await runAntivirusScan(
          scanServices,
          childId,
          storedKey,
          archive.tenant_id,
          archive.uploaded_by,
          `zip-extract-${archiveFileId}`,
        );
      }

      logger.info({ archiveFileId, children: entries.length }, 'extraction.completed');
      return entries.length;
    },

    async markArchiveExtracted(archiveFileId: string): Promise<void> {
      await db.markArchiveExtracted(archiveFileId);
    },
  };
}
