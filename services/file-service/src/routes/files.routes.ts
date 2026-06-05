// Files routes — all 6 endpoints from spec §Phase 9.
// POST   /api/v1/files/upload
// GET    /api/v1/files/:fileId/url
// GET    /api/v1/files/:fileId
// DELETE /api/v1/files/:fileId
// GET    /api/v1/files
// GET    /api/v1/files/by-entity/:entityType/:entityId

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { validateFile, readMultipartBuffer } from '../middleware/validation';
import { buildError } from '../errors';
import { createLogger } from '@cos/logger';

const logger = createLogger('file-service.routes');

function buildStoredKey(fileId: string, filename: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}/${month}/${fileId}/${filename}`;
}

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
      return reply
        .status(validationError.httpStatus)
        .send({
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

    // Persist metadata (PENDING_SCAN)
    const row = await app.db.insertFile({
      fileId,
      tenantId: request.tenantId,
      originalFilename: filename,
      storedKey,
      bucketName,
      mimeType,
      fileSizeBytes: size,
      uploadedBy: request.userId,
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

    // Async antivirus scan — fire and forget (upload response is immediate)
    setImmediate(() => {
      void runAntivirusScan(app, fileId, request.tenantId, request.userId, request.traceId, buffer);
    });

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
}

// ── Helpers ────────────────────────────────────────────────────────────────

export async function runAntivirusScan(
  app: FastifyInstance,
  fileId: string,
  tenantId: string,
  actorId: string,
  traceId: string,
  buffer: Buffer,
): Promise<void> {
  try {
    const result = await app.antivirus.scan(buffer);
    if (result.clean) {
      await app.db.updateFileStatus(fileId, 'CLEAN');
      const file = await app.db.findFileById(fileId, tenantId);
      if (file) {
        await app.opensearch.indexFile(file);
      }
      logger.info({ file_id: fileId, traceId }, 'file.scan.clean');
    } else {
      await app.db.updateFileStatus(fileId, 'QUARANTINED');
      await app.kafka.publishFileQuarantined({
        tenantId,
        actorId,
        traceId,
        payload: { file_id: fileId, tenant_id: tenantId, threat_type: result.threat ?? null },
      });
      logger.warn({ file_id: fileId, threat: result.threat, traceId }, 'file.scan.quarantined');
    }
  } catch (err) {
    logger.error({ err, file_id: fileId, traceId }, 'file.scan.error');
  }
}

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
