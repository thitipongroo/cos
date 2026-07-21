// DbService — PostgreSQL access for the files schema via pg.Pool.
// All queries use fully-qualified names (files.files, files.file_metadata).
// Tenant isolation enforced at application layer via tenant_id column.

import { Pool } from 'pg';
import type { FileServiceConfig } from '../config';
import type { StoredFileRow, FileStatus, RetentionPolicyRow } from '../types';
import { categoryFor } from '../util/category';

export class DbService {
  private readonly pool: Pool;

  constructor(config: FileServiceConfig) {
    this.pool = new Pool({ connectionString: config.database.url });
  }

  async insertFile(params: {
    fileId: string;
    tenantId: string;
    originalFilename: string;
    storedKey: string;
    bucketName: string;
    mimeType: string;
    fileSizeBytes: number;
    uploadedBy: string;
    isArchive?: boolean;
    parentFileId?: string | null;
    sha256?: string | null;
  }): Promise<StoredFileRow> {
    const { rows } = await this.pool.query<StoredFileRow>(
      `INSERT INTO files.files
         (file_id, tenant_id, original_filename, stored_key, bucket_name,
          mime_type, file_size_bytes, uploaded_by, is_archive, parent_file_id, category, sha256)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        params.fileId,
        params.tenantId,
        params.originalFilename,
        params.storedKey,
        params.bucketName,
        params.mimeType,
        params.fileSizeBytes,
        params.uploadedBy,
        params.isArchive ?? false,
        params.parentFileId ?? null,
        categoryFor(params.mimeType),
        params.sha256 ?? null,
      ],
    );
    return rows[0]!;
  }

  // Marks a ZIP archive as extracted (audit trail; PO decision: keep archive as extracted record).
  async markArchiveExtracted(fileId: string): Promise<void> {
    await this.pool.query(`UPDATE files.files SET extracted_at = now() WHERE file_id = $1`, [
      fileId,
    ]);
  }

  async updateFileStatus(fileId: string, status: FileStatus): Promise<void> {
    await this.pool.query(`UPDATE files.files SET file_status = $1 WHERE file_id = $2`, [
      status,
      fileId,
    ]);
  }

  async markFileQuarantined(fileId: string): Promise<void> {
    await this.pool.query(
      `UPDATE files.files SET file_status = 'QUARANTINED', quarantined_at = now() WHERE file_id = $1`,
      [fileId],
    );
  }

  async findFileByIdAdmin(fileId: string): Promise<StoredFileRow | null> {
    const { rows } = await this.pool.query<StoredFileRow>(
      `SELECT * FROM files.files WHERE file_id = $1`,
      [fileId],
    );
    return rows[0] ?? null;
  }

  async findFileById(fileId: string, tenantId: string): Promise<StoredFileRow | null> {
    const { rows } = await this.pool.query<StoredFileRow>(
      `SELECT * FROM files.files WHERE file_id = $1 AND tenant_id = $2`,
      [fileId, tenantId],
    );
    return rows[0] ?? null;
  }

  async softDeleteFile(fileId: string, tenantId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE files.files
       SET deleted_at = now()
       WHERE file_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [fileId, tenantId],
    );
    return (rowCount ?? 0) > 0;
  }

  async listFiles(params: {
    tenantId: string;
    limit: number;
    offset: number;
  }): Promise<StoredFileRow[]> {
    const { rows } = await this.pool.query<StoredFileRow>(
      `SELECT * FROM files.files
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY uploaded_at DESC
       LIMIT $2 OFFSET $3`,
      [params.tenantId, params.limit, params.offset],
    );
    return rows;
  }

  async listFilesByEntity(params: {
    tenantId: string;
    entityType: string;
    entityId: string;
  }): Promise<StoredFileRow[]> {
    const { rows } = await this.pool.query<StoredFileRow>(
      `SELECT f.* FROM files.files f
       JOIN files.file_metadata m ON m.file_id = f.file_id
       WHERE f.tenant_id = $1
         AND m.entity_type = $2
         AND m.entity_id = $3
         AND f.deleted_at IS NULL
       ORDER BY f.uploaded_at DESC`,
      [params.tenantId, params.entityType, params.entityId],
    );
    return rows;
  }

  async insertMetadata(params: {
    metadataId: string;
    fileId: string;
    tenantId: string;
    entityType: string | null;
    entityId: string | null;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO files.file_metadata
         (metadata_id, file_id, tenant_id, entity_type, entity_id,
          metadata_key, metadata_value)
       VALUES ($1,$2,$3,$4,$5,'entity_ref',$6)`,
      [
        params.metadataId,
        params.fileId,
        params.tenantId,
        params.entityType,
        params.entityId,
        params.entityId,
      ],
    );
  }

  // Hard-delete candidates: soft-deleted > 30 days ago. Legal hold blocks deletion (WORM).
  async findExpiredFiles(): Promise<StoredFileRow[]> {
    const { rows } = await this.pool.query<StoredFileRow>(
      `SELECT * FROM files.files
       WHERE deleted_at IS NOT NULL
         AND deleted_at + INTERVAL '30 days' < now()
         AND legal_hold = false`,
    );
    return rows;
  }

  async findExpiredQuarantinedFiles(): Promise<StoredFileRow[]> {
    const { rows } = await this.pool.query<StoredFileRow>(
      `SELECT * FROM files.files
       WHERE file_status = 'QUARANTINED'
         AND quarantined_at IS NOT NULL
         AND quarantined_at + INTERVAL '30 days' < now()
         AND legal_hold = false`,
    );
    return rows;
  }

  // Retention lifecycle: files older than their category's retention_days, not already deleted,
  // not under legal hold — eligible for auto soft-delete (then the 30-day hard-delete grace).
  async findFilesPastRetention(): Promise<StoredFileRow[]> {
    const { rows } = await this.pool.query<StoredFileRow>(
      `SELECT f.* FROM files.files f
       JOIN files.retention_policies rp
         ON rp.tenant_id = f.tenant_id AND rp.category = f.category
       WHERE f.deleted_at IS NULL
         AND f.legal_hold = false
         AND f.uploaded_at + (rp.retention_days || ' days')::interval < now()`,
    );
    return rows;
  }

  // System (worker) soft-delete — no tenant scoping (runs across tenants via BYPASSRLS role).
  async softDeleteFileAdmin(fileId: string): Promise<void> {
    await this.pool.query(
      `UPDATE files.files SET deleted_at = now() WHERE file_id = $1 AND deleted_at IS NULL`,
      [fileId],
    );
  }

  async setLegalHold(
    fileId: string,
    tenantId: string,
    reason: string,
    heldBy: string,
  ): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE files.files
       SET legal_hold = true, legal_hold_reason = $3, legal_hold_by = $4, legal_hold_at = now()
       WHERE file_id = $1 AND tenant_id = $2`,
      [fileId, tenantId, reason, heldBy],
    );
    return (rowCount ?? 0) > 0;
  }

  async releaseLegalHold(fileId: string, tenantId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE files.files
       SET legal_hold = false, legal_hold_reason = NULL, legal_hold_by = NULL, legal_hold_at = NULL
       WHERE file_id = $1 AND tenant_id = $2`,
      [fileId, tenantId],
    );
    return (rowCount ?? 0) > 0;
  }

  async upsertRetentionPolicy(
    tenantId: string,
    category: string,
    retentionDays: number,
  ): Promise<RetentionPolicyRow> {
    const { rows } = await this.pool.query<RetentionPolicyRow>(
      `INSERT INTO files.retention_policies (tenant_id, category, retention_days)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, category)
       DO UPDATE SET retention_days = EXCLUDED.retention_days, updated_at = now()
       RETURNING *`,
      [tenantId, category, retentionDays],
    );
    return rows[0]!;
  }

  async listRetentionPolicies(tenantId: string): Promise<RetentionPolicyRow[]> {
    const { rows } = await this.pool.query<RetentionPolicyRow>(
      `SELECT * FROM files.retention_policies WHERE tenant_id = $1 ORDER BY category`,
      [tenantId],
    );
    return rows;
  }

  async hardDeleteFile(fileId: string): Promise<void> {
    await this.pool.query(`DELETE FROM files.file_metadata WHERE file_id = $1`, [fileId]);
    await this.pool.query(`DELETE FROM files.files WHERE file_id = $1`, [fileId]);
  }

  async end(): Promise<void> {
    await this.pool.end();
  }
}
