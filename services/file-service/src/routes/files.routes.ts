// Files routes — all 6 endpoints from spec §Phase 9.
// POST   /api/v1/files/upload
// GET    /api/v1/files/:fileId/url
// GET    /api/v1/files/:fileId
// DELETE /api/v1/files/:fileId
// GET    /api/v1/files
// GET    /api/v1/files/by-entity/:entityType/:entityId

import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { validateFile, readMultipartBuffer } from '../middleware/validation';
import { buildError } from '../errors';
import { runAntivirusScan } from '../services/scan-runner';
import { buildStoredKey } from '../util/stored-key';
import { isValidCategory } from '../util/category';
import { createLogger } from '@cos/logger';

const logger = createLogger('file-service.routes');

export async function filesRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/files/upload
  app.post('/upload', async (request: FastifyRequest, reply: FastifyReply) => {
    const part = await request.file();
    if (!part) {
      return reply.status(422).send(buildError('MIME_TYPE_NOT_ALLOWED', request.traceId));
    }

    const { buffer, size } = await readMultipartBuffer(part);
    const mimeType = part.mimetype;
    const filename = part.filename;
    const entityType = (request.query as Record<string, string>)['entity_type'] ?? null;
    const entityId = (request.query as Record<string, string>)['entity_id'] ?? null;

    const validationError = validateFile(filename, mimeType, size);
    if (validationError) {
      return reply.status(validationError.httpStatus).send({
        error: {
          code: validationError.code,
          message: validationError.message,
          traceId: request.traceId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const fileId = uuidv4();
    const storedKey = buildStoredKey(fileId, filename);
    const bucketName = app.minio.bucketName(request.tenantId);

    // Store to MinIO
    try {
      await app.minio.uploadFile({ tenantId: request.tenantId, storedKey, buffer, mimeType });
    } catch (err) {
      logger.error({ err, traceId: request.traceId }, 'file.upload.minio_error');
      return reply.status(500).send(buildError('UPLOAD_FAILED', request.traceId));
    }

    const isArchive = mimeType === 'application/zip';

    // Persist metadata (PENDING_SCAN)
    // SHA-256 of the content — the cryptographic anchor for document signing (ADR-058 CT-3).
    const sha256 = createHash('sha256').update(buffer).digest('hex');

    const row = await app.db.insertFile({
      fileId,
      tenantId: request.tenantId,
      originalFilename: filename,
      storedKey,
      bucketName,
      mimeType,
      fileSizeBytes: size,
      uploadedBy: request.userId,
      isArchive,
      sha256,
    });

    if (entityType && entityId) {
      await app.db.insertMetadata({
        metadataId: uuidv4(),
        fileId,
        tenantId: request.tenantId,
        entityType,
        entityId,
      });
    }

    // Emit file.uploaded event immediately (PENDING_SCAN — consumer knows to wait for CLEAN)
    await app.kafka.publishFileUploaded({
      tenantId: request.tenantId,
      actorId: request.userId,
      traceId: request.traceId,
      payload: {
        file_id: fileId,
        tenant_id: request.tenantId,
        entity_type: entityType,
        entity_id: entityId,
        mime_type: mimeType,
      },
    });

    // Async antivirus scan — fire and forget (upload response is immediate).
    // scan(fileId) re-fetches the stored bytes from MinIO (spec §Phase 9 decoupled contract).
    setImmediate(() => {
      void runAntivirusScan(
        app,
        fileId,
        storedKey,
        request.tenantId,
        request.userId,
        request.traceId,
      );
    });

    // Bulk ZIP upload → start the async sandboxed extraction workflow (PO decision, spec §Phase 9).
    if (isArchive) {
      await app.extraction.startExtraction(fileId).catch((err) => {
        logger.error(
          { err, file_id: fileId, traceId: request.traceId },
          'file.extraction.start_failed',
        );
      });
    }

    logger.info(
      { file_id: fileId, tenant_id: request.tenantId, traceId: request.traceId },
      'file.uploaded',
    );
    return reply.status(201).send({
      file_id: row.file_id,
      original_filename: row.original_filename,
      mime_type: row.mime_type,
      file_size_bytes: row.file_size_bytes.toString(),
      file_status: row.file_status,
      uploaded_at: row.uploaded_at.toISOString(),
      sha256: row.sha256,
    });
  });

  // GET /api/v1/files/:fileId/url
  app.get('/:fileId/url', async (request: FastifyRequest, reply: FastifyReply) => {
    const { fileId } = request.params as { fileId: string };
    const file = await app.db.findFileById(fileId, request.tenantId);

    if (!file) {
      return reply.status(404).send(buildError('FILE_NOT_FOUND', request.traceId));
    }
    if (file.deleted_at) {
      return reply.status(404).send(buildError('FILE_DELETED', request.traceId));
    }

    try {
      const url = await app.minio.getSignedUrl(request.tenantId, file.stored_key);
      return reply.send({ url, expires_in_seconds: app.config.signedUrlTtlSeconds });
    } catch (err) {
      logger.error({ err, file_id: fileId, traceId: request.traceId }, 'file.signed_url.error');
      return reply.status(500).send(buildError('SIGNED_URL_FAILED', request.traceId));
    }
  });

  // GET /api/v1/files/:fileId
  app.get('/:fileId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { fileId } = request.params as { fileId: string };
    const file = await app.db.findFileById(fileId, request.tenantId);

    if (!file) {
      return reply.status(404).send(buildError('FILE_NOT_FOUND', request.traceId));
    }

    return reply.send({
      file_id: file.file_id,
      original_filename: file.original_filename,
      mime_type: file.mime_type,
      file_size_bytes: file.file_size_bytes.toString(),
      file_status: file.file_status,
      uploaded_by: file.uploaded_by,
      uploaded_at: file.uploaded_at.toISOString(),
      deleted_at: file.deleted_at?.toISOString() ?? null,
      sha256: file.sha256,
    });
  });

  // DELETE /api/v1/files/:fileId  (soft delete)
  app.delete('/:fileId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { fileId } = request.params as { fileId: string };
    const deleted = await app.db.softDeleteFile(fileId, request.tenantId);

    if (!deleted) {
      return reply.status(404).send(buildError('FILE_NOT_FOUND', request.traceId));
    }

    logger.info(
      { file_id: fileId, tenant_id: request.tenantId, traceId: request.traceId },
      'file.soft_deleted',
    );
    return reply.status(204).send();
  });

  // GET /api/v1/files
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const limit = Math.min(parseInt(query['limit'] ?? '20', 10), 100);
    const offset = parseInt(query['offset'] ?? '0', 10);

    const files = await app.db.listFiles({ tenantId: request.tenantId, limit, offset });
    return reply.send({ data: files.map(toFileDto), limit, offset });
  });

  // GET /api/v1/files/by-entity/:entityType/:entityId
  app.get(
    '/by-entity/:entityType/:entityId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { entityType, entityId } = request.params as { entityType: string; entityId: string };
      const files = await app.db.listFilesByEntity({
        tenantId: request.tenantId,
        entityType,
        entityId,
      });
      return reply.send({ data: files.map(toFileDto) });
    },
  );

  // POST /api/v1/files/admin/:fileId/recover  — SYSTEM_ADMIN only
  // Moves a quarantined file back to the regular bucket and resets status to CLEAN.
  app.post('/admin/:fileId/recover', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.userRole !== 'SYSTEM_ADMIN') {
      return reply.status(403).send(buildError('FORBIDDEN', request.traceId));
    }

    const { fileId } = request.params as { fileId: string };
    const file = await app.db.findFileByIdAdmin(fileId);

    if (!file) {
      return reply.status(404).send(buildError('FILE_NOT_FOUND', request.traceId));
    }
    if (file.file_status !== 'QUARANTINED') {
      return reply.status(422).send(buildError('FILE_NOT_QUARANTINED', request.traceId));
    }

    await app.minio.moveFromQuarantine(file.tenant_id, file.stored_key);
    await app.db.updateFileStatus(fileId, 'CLEAN');

    logger.info(
      {
        file_id: fileId,
        tenant_id: file.tenant_id,
        actor_id: request.userId,
        traceId: request.traceId,
      },
      'file.quarantine.recovered',
    );
    return reply.send({ file_id: fileId, file_status: 'CLEAN' });
  });

  // ── Retention policies (TENANT_ADMIN) ──────────────────────────────────────
  // GET /api/v1/files/retention-policies — list per-category retention policies
  app.get('/retention-policies', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.userRole !== 'TENANT_ADMIN') {
      return reply.status(403).send(buildError('FORBIDDEN', request.traceId));
    }
    const policies = await app.db.listRetentionPolicies(request.tenantId);
    return reply.send({ data: policies });
  });

  // PUT /api/v1/files/retention-policies — upsert { category, retention_days }
  app.put('/retention-policies', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.userRole !== 'TENANT_ADMIN') {
      return reply.status(403).send(buildError('FORBIDDEN', request.traceId));
    }
    const body = (request.body ?? {}) as { category?: string; retention_days?: number };
    if (
      typeof body.category !== 'string' ||
      !isValidCategory(body.category) ||
      typeof body.retention_days !== 'number' ||
      !Number.isInteger(body.retention_days) ||
      body.retention_days <= 0
    ) {
      return reply.status(422).send(buildError('INVALID_RETENTION_POLICY', request.traceId));
    }
    const policy = await app.db.upsertRetentionPolicy(
      request.tenantId,
      body.category,
      body.retention_days,
    );
    return reply.send(policy);
  });

  // ── Legal hold (WORM; TENANT_ADMIN) ────────────────────────────────────────
  // POST /api/v1/files/:fileId/legal-hold — place a hold (blocks all deletion)
  app.post('/:fileId/legal-hold', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.userRole !== 'TENANT_ADMIN') {
      return reply.status(403).send(buildError('FORBIDDEN', request.traceId));
    }
    const { fileId } = request.params as { fileId: string };
    const body = (request.body ?? {}) as { reason?: string };
    const ok = await app.db.setLegalHold(
      fileId,
      request.tenantId,
      body.reason ?? '',
      request.userId,
    );
    if (!ok) {
      return reply.status(404).send(buildError('FILE_NOT_FOUND', request.traceId));
    }
    return reply.send({ file_id: fileId, legal_hold: true });
  });

  // DELETE /api/v1/files/:fileId/legal-hold — release a hold
  app.delete('/:fileId/legal-hold', async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.userRole !== 'TENANT_ADMIN') {
      return reply.status(403).send(buildError('FORBIDDEN', request.traceId));
    }
    const { fileId } = request.params as { fileId: string };
    const ok = await app.db.releaseLegalHold(fileId, request.tenantId);
    if (!ok) {
      return reply.status(404).send(buildError('FILE_NOT_FOUND', request.traceId));
    }
    return reply.send({ file_id: fileId, legal_hold: false });
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

// Re-exported so existing importers (and tests) keep the same path. Implementation lives in
// scan-runner so the ZIP extraction worker can reuse it with its own service instances.
export { runAntivirusScan };

function toFileDto(file: import('../types').StoredFileRow) {
  return {
    file_id: file.file_id,
    original_filename: file.original_filename,
    mime_type: file.mime_type,
    file_size_bytes: file.file_size_bytes.toString(),
    file_status: file.file_status,
    uploaded_by: file.uploaded_by,
    uploaded_at:
      file.uploaded_at instanceof Date ? file.uploaded_at.toISOString() : String(file.uploaded_at),
  };
}
