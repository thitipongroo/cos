// Integration test — full HTTP layer with all services mocked.
// Verifies the complete request/response cycle for every route.

import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import FormData from 'form-data';
import { tracePlugin } from '../../plugins/trace';
import { authPlugin } from '../../plugins/auth';
import { filesRoutes } from '../../routes/files.routes';
import type { DbService } from '../../services/db.service';
import type { MinioService } from '../../services/minio.service';
import type { AntivirusService } from '../../services/antivirus.service';
import type { OpenSearchService } from '../../services/opensearch.service';
import type { KafkaService } from '../../services/kafka.service';
import type { FileServiceConfig } from '../../config';

// ── Shared mocks ─────────────────────────────────────────────────────────────

const TENANT = 'tid-test';
const USER = 'uid-test';
const FILE_ID = 'fid-00000000-0000-0000-0000-000000000001';

const FILE_ROW = {
  file_id: FILE_ID,
  tenant_id: TENANT,
  original_filename: 'photo.jpg',
  stored_key: '2026/01/fid-1/photo.jpg',
  bucket_name: 'cos-tid-test',
  mime_type: 'image/jpeg',
  file_size_bytes: '1024',
  file_status: 'PENDING_SCAN' as const,
  uploaded_by: USER,
  uploaded_at: new Date('2026-01-01'),
  deleted_at: null,
};

function buildMockServices() {
  const db: Partial<DbService> = {
    insertFile: jest.fn().mockResolvedValue(FILE_ROW),
    insertMetadata: jest.fn().mockResolvedValue(undefined),
    findFileById: jest.fn().mockResolvedValue(FILE_ROW),
    softDeleteFile: jest.fn().mockResolvedValue(true),
    listFiles: jest.fn().mockResolvedValue([FILE_ROW]),
    listFilesByEntity: jest.fn().mockResolvedValue([FILE_ROW]),
    updateFileStatus: jest.fn().mockResolvedValue(undefined),
  };
  const minio: Partial<MinioService> = {
    bucketName: jest.fn().mockReturnValue('cos-tid-test'),
    uploadFile: jest.fn().mockResolvedValue(undefined),
    getSignedUrl: jest.fn().mockResolvedValue('https://minio/signed-url'),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  };
  const antivirus: Partial<AntivirusService> = {
    scan: jest.fn().mockResolvedValue({ clean: true }),
  };
  const opensearch: Partial<OpenSearchService> = {
    indexFile: jest.fn().mockResolvedValue(undefined),
  };
  const kafka: Partial<KafkaService> = {
    publishFileUploaded: jest.fn().mockResolvedValue(undefined),
    publishFileQuarantined: jest.fn().mockResolvedValue(undefined),
  };
  const config = { signedUrlTtlSeconds: 3600 } as FileServiceConfig;

  return { db, minio, antivirus, opensearch, kafka, config };
}

async function buildTestApp() {
  const app = Fastify({ ignoreTrailingSlash: true });
  const { db, minio, antivirus, opensearch, kafka, config } = buildMockServices();

  await app.register(multipart, { limits: { fileSize: 1024 * 1024 * 1024 } });
  await app.register(tracePlugin);
  await app.register(authPlugin);

  app.decorate('config', config);
  app.decorate('db', db as DbService);
  app.decorate('minio', minio as MinioService);
  app.decorate('antivirus', antivirus as AntivirusService);
  app.decorate('opensearch', opensearch as OpenSearchService);
  app.decorate('kafka', kafka as KafkaService);

  // Route plugins must NOT be wrapped with fp() — fp() removes encapsulation
  await app.register(filesRoutes, { prefix: '/api/v1/files' });
  return { app, mocks: { db, minio, antivirus, opensearch, kafka } };
}

const AUTH_HEADERS = { 'x-tenant-id': TENANT, 'x-user-id': USER };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Files routes (integration)', () => {
  describe('POST /api/v1/files/upload', () => {
    it('201 — uploads a valid image and returns file metadata', async () => {
      const { app } = await buildTestApp();
      const form = new FormData();
      form.append('file', Buffer.from('fake-image-data'), {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/files/upload',
        headers: { ...AUTH_HEADERS, ...form.getHeaders() },
        payload: form.getBuffer(),
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.mime_type).toBe('image/jpeg');
      expect(body.file_status).toBe('PENDING_SCAN');
    });

    it('422 — rejects blocked .exe extension', async () => {
      const { app } = await buildTestApp();
      const form = new FormData();
      form.append('file', Buffer.from('evil'), {
        filename: 'malware.exe',
        contentType: 'application/octet-stream',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/files/upload',
        headers: { ...AUTH_HEADERS, ...form.getHeaders() },
        payload: form.getBuffer(),
      });
      expect(res.statusCode).toBe(422);
      expect(JSON.parse(res.body).error.code).toBe('COS-FILE-004');
    });

    it('422 — rejects disallowed MIME type', async () => {
      const { app } = await buildTestApp();
      const form = new FormData();
      form.append('file', Buffer.from('data'), {
        filename: 'file.xyz',
        contentType: 'application/unknown',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/files/upload',
        headers: { ...AUTH_HEADERS, ...form.getHeaders() },
        payload: form.getBuffer(),
      });
      expect(res.statusCode).toBe(422);
      expect(JSON.parse(res.body).error.code).toBe('COS-FILE-002');
    });

    it('500 — returns UPLOAD_FAILED when MinIO throws', async () => {
      const { app, mocks } = await buildTestApp();
      (mocks.minio.uploadFile as jest.Mock).mockRejectedValue(new Error('minio down'));

      const form = new FormData();
      form.append('file', Buffer.from('data'), {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/files/upload',
        headers: { ...AUTH_HEADERS, ...form.getHeaders() },
        payload: form.getBuffer(),
      });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).error.code).toBe('COS-FILE-007');
    });

    it('401 — returns 401 with no auth headers', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({ method: 'POST', url: '/api/v1/files/upload' });
      expect(res.statusCode).toBe(401);
    });

    it('422 — returns error when no file part in multipart body', async () => {
      const { app } = await buildTestApp();
      // Send a multipart request with no file field — request.file() returns undefined
      const form = new FormData();
      form.append('metadata', 'value'); // not a file field

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/files/upload',
        headers: { ...AUTH_HEADERS, ...form.getHeaders() },
        payload: form.getBuffer(),
      });
      expect(res.statusCode).toBe(422);
    });

    it('uploads with entity_type and entity_id query params', async () => {
      const { app, mocks } = await buildTestApp();
      const form = new FormData();
      form.append('file', Buffer.from('data'), {
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/files/upload?entity_type=site_report&entity_id=eid-1',
        headers: { ...AUTH_HEADERS, ...form.getHeaders() },
        payload: form.getBuffer(),
      });
      expect(res.statusCode).toBe(201);
      expect(mocks.db.insertMetadata).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/files/:fileId/url', () => {
    it('200 — returns signed URL for existing file', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/files/${FILE_ID}/url`,
        headers: AUTH_HEADERS,
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).url).toBe('https://minio/signed-url');
    });

    it('404 — returns FILE_NOT_FOUND when file missing', async () => {
      const { app, mocks } = await buildTestApp();
      (mocks.db.findFileById as jest.Mock).mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/files/missing-id/url`,
        headers: AUTH_HEADERS,
      });
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).error.code).toBe('COS-FILE-005');
    });

    it('404 — returns FILE_DELETED when deleted_at is set', async () => {
      const { app, mocks } = await buildTestApp();
      (mocks.db.findFileById as jest.Mock).mockResolvedValue({
        ...FILE_ROW,
        deleted_at: new Date(),
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/files/${FILE_ID}/url`,
        headers: AUTH_HEADERS,
      });
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).error.code).toBe('COS-FILE-006');
    });

    it('500 — returns SIGNED_URL_FAILED when MinIO presign fails', async () => {
      const { app, mocks } = await buildTestApp();
      (mocks.minio.getSignedUrl as jest.Mock).mockRejectedValue(new Error('presign error'));

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/files/${FILE_ID}/url`,
        headers: AUTH_HEADERS,
      });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).error.code).toBe('COS-FILE-008');
    });
  });

  describe('GET /api/v1/files/:fileId', () => {
    it('200 — returns file metadata', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/files/${FILE_ID}`,
        headers: AUTH_HEADERS,
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).file_id).toBe(FILE_ID);
    });

    it('404 — returns FILE_NOT_FOUND when missing', async () => {
      const { app, mocks } = await buildTestApp();
      (mocks.db.findFileById as jest.Mock).mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/files/missing`,
        headers: AUTH_HEADERS,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/files/:fileId', () => {
    it('204 — soft-deletes existing file', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/files/${FILE_ID}`,
        headers: AUTH_HEADERS,
      });
      expect(res.statusCode).toBe(204);
    });

    it('404 — returns FILE_NOT_FOUND when file missing or already deleted', async () => {
      const { app, mocks } = await buildTestApp();
      (mocks.db.softDeleteFile as jest.Mock).mockResolvedValue(false);

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/files/missing`,
        headers: AUTH_HEADERS,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/files', () => {
    it('200 — returns paginated file list with explicit limit and offset', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/files?limit=10&offset=0',
        headers: AUTH_HEADERS,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toHaveLength(1);
      expect(body.limit).toBe(10);
    });

    it('200 — uses default limit and offset when query params absent', async () => {
      // Covers the `?? '20'` and `?? '0'` branches in files.routes.ts
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/files',
        headers: AUTH_HEADERS,
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).limit).toBe(20);
      expect(JSON.parse(res.body).offset).toBe(0);
    });

    it('200 — caps limit at 100 when above maximum', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/files?limit=999',
        headers: AUTH_HEADERS,
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).limit).toBe(100);
    });
  });

  describe('GET /api/v1/files/by-entity/:entityType/:entityId', () => {
    it('200 — returns files for the entity', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/files/by-entity/site_report/eid-1',
        headers: AUTH_HEADERS,
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data).toHaveLength(1);
    });

    it('200 — serializes uploaded_at as string when pg returns it as string (not Date)', async () => {
      // Covers the `String(file.uploaded_at)` branch in toFileDto
      const { app, mocks } = await buildTestApp();
      const rowWithStringDate = {
        ...FILE_ROW,
        uploaded_at: '2026-01-01T00:00:00.000Z' as unknown as Date,
      };
      (mocks.db.listFilesByEntity as jest.Mock).mockResolvedValue([rowWithStringDate]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/files/by-entity/site_report/eid-1',
        headers: AUTH_HEADERS,
      });
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body).data[0];
      expect(typeof data.uploaded_at).toBe('string');
    });
  });
});
