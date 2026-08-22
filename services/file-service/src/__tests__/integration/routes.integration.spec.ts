// Integration test — full HTTP layer with all services mocked.
// Verifies the complete request/response cycle for every route.
//
// AUTH (TDD OQ-46). This suite registers the REAL authPlugin, and every request used to carry
// `x-tenant-id` / `x-user-id` and nothing else — which passed, because the plugin accepted identity
// headers with no token at all. That is the hole OQ-46 closed. The requests now carry what the
// backend actually sends: a bearer token for the `cos-backend` service account, with the principal
// in the headers. `verifyBearer` is mocked so the suite still tests routes rather than JWKS.

const mockVerifyBearer = jest.fn();
jest.mock('../../plugins/jwt-verify', () => ({
  verifyBearer: (...a: unknown[]) => mockVerifyBearer(...a),
}));

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
  quarantined_at: null,
  sha256: 'b'.repeat(64),
};

const QUARANTINED_ROW = {
  ...FILE_ROW,
  file_id: 'fid-quarantined',
  file_status: 'QUARANTINED' as const,
  quarantined_at: new Date('2026-01-01'),
};

// A scanned-clean row — the signed-URL endpoint only serves CLEAN files (COS-FILE-016 gate).
const CLEAN_ROW = { ...FILE_ROW, file_status: 'CLEAN' as const };

// Valid magic-byte prefixes so uploads pass the server-side content check (magicByteMismatch).
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const ZIP_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

function buildMockServices() {
  const db: Partial<DbService> = {
    insertFile: jest.fn().mockResolvedValue(FILE_ROW),
    insertMetadata: jest.fn().mockResolvedValue(undefined),
    findFileById: jest.fn().mockResolvedValue(CLEAN_ROW),
    findFileByIdAdmin: jest.fn().mockResolvedValue(QUARANTINED_ROW),
    softDeleteFile: jest.fn().mockResolvedValue(true),
    listFiles: jest.fn().mockResolvedValue([FILE_ROW]),
    listFilesByEntity: jest.fn().mockResolvedValue([FILE_ROW]),
    updateFileStatus: jest.fn().mockResolvedValue(undefined),
    markFileQuarantined: jest.fn().mockResolvedValue(undefined),
    listRetentionPolicies: jest.fn().mockResolvedValue([{ category: 'image', retention_days: 90 }]),
    upsertRetentionPolicy: jest
      .fn()
      .mockResolvedValue({ policy_id: 'p1', category: 'image', retention_days: 90 }),
    setLegalHold: jest.fn().mockResolvedValue(true),
    releaseLegalHold: jest.fn().mockResolvedValue(true),
  };
  const minio: Partial<MinioService> = {
    bucketName: jest.fn().mockReturnValue('cos-tid-test'),
    uploadFile: jest.fn().mockResolvedValue(undefined),
    getSignedUrl: jest.fn().mockResolvedValue('https://minio/signed-url'),
    deleteFile: jest.fn().mockResolvedValue(undefined),
    moveToQuarantine: jest.fn().mockResolvedValue(undefined),
    moveFromQuarantine: jest.fn().mockResolvedValue(undefined),
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
  const extraction = { startExtraction: jest.fn().mockResolvedValue(undefined) };
  const config = { signedUrlTtlSeconds: 3600 } as FileServiceConfig;

  return { db, minio, antivirus, opensearch, kafka, extraction, config };
}

async function buildTestApp() {
  const app = Fastify({ ignoreTrailingSlash: true });
  const { db, minio, antivirus, opensearch, kafka, extraction, config } = buildMockServices();

  await app.register(multipart, { limits: { fileSize: 1024 * 1024 * 1024 } });
  await app.register(tracePlugin);
  await app.register(authPlugin);

  app.decorate('config', config);
  app.decorate('db', db as DbService);
  app.decorate('minio', minio as MinioService);
  app.decorate('antivirus', antivirus as AntivirusService);
  app.decorate('opensearch', opensearch as OpenSearchService);
  app.decorate('kafka', kafka as KafkaService);
  app.decorate(
    'extraction',
    extraction as unknown as import('fastify').FastifyInstance['extraction'],
  );

  // Route plugins must NOT be wrapped with fp() — fp() removes encapsulation
  await app.register(filesRoutes, { prefix: '/api/v1/files' });
  return { app, mocks: { db, minio, antivirus, opensearch, kafka, extraction } };
}

const AUTH_HEADERS = {
  authorization: 'Bearer service-token',
  'x-tenant-id': TENANT,
  'x-user-id': USER,
};

// The backend's service account: authenticated as the caller, silent on whose behalf — the headers
// above say that. A `null` here (no token) is a 401 now, which is the point of the change.
beforeEach(() => {
  mockVerifyBearer.mockReset();
  mockVerifyBearer.mockResolvedValue({ kind: 'service', clientId: 'cos-backend' });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Files routes (integration)', () => {
  describe('POST /api/v1/files/upload', () => {
    it('201 — uploads a valid image and returns file metadata', async () => {
      const { app, mocks } = await buildTestApp();
      const form = new FormData();
      form.append('file', JPEG_BYTES, {
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
      expect(body.sha256).toBe('b'.repeat(64)); // returned from the persisted row
      // The content SHA-256 is computed from the uploaded bytes and threaded to insertFile (ADR-058 CT-3).
      expect(mocks.db.insertFile).toHaveBeenCalledWith(
        expect.objectContaining({ sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
      );
    });

    it('201 — a ZIP upload starts the async extraction workflow (is_archive)', async () => {
      const { app, mocks } = await buildTestApp();
      const form = new FormData();
      form.append('file', ZIP_BYTES, {
        filename: 'bulk.zip',
        contentType: 'application/zip',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/files/upload',
        headers: { ...AUTH_HEADERS, ...form.getHeaders() },
        payload: form.getBuffer(),
      });

      expect(res.statusCode).toBe(201);
      expect(mocks.db.insertFile).toHaveBeenCalledWith(
        expect.objectContaining({ isArchive: true }),
      );
      expect(mocks.extraction.startExtraction).toHaveBeenCalledTimes(1);
    });

    it('201 — a ZIP upload still succeeds when starting extraction fails (logged)', async () => {
      const { app, mocks } = await buildTestApp();
      (mocks.extraction.startExtraction as jest.Mock).mockRejectedValue(new Error('temporal down'));
      const form = new FormData();
      form.append('file', ZIP_BYTES, {
        filename: 'bulk.zip',
        contentType: 'application/zip',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/files/upload',
        headers: { ...AUTH_HEADERS, ...form.getHeaders() },
        payload: form.getBuffer(),
      });

      expect(res.statusCode).toBe(201);
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
        filename: 'file.png',
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
      form.append('file', JPEG_BYTES, {
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

    it('422 — rejects a file whose bytes contradict the declared type (M7)', async () => {
      const { app, mocks } = await buildTestApp();
      const form = new FormData();
      form.append('file', Buffer.from('this is not a PNG'), {
        filename: 'evil.png',
        contentType: 'image/png',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/files/upload',
        headers: { ...AUTH_HEADERS, ...form.getHeaders() },
        payload: form.getBuffer(),
      });
      expect(res.statusCode).toBe(422);
      expect(JSON.parse(res.body).error.code).toBe('COS-FILE-017');
      expect(mocks.minio.uploadFile).not.toHaveBeenCalled();
    });

    it('422 — rejects an upload that exceeds the per-type size cap mid-stream (M6)', async () => {
      const { app, mocks } = await buildTestApp();
      const form = new FormData();
      // 21 MB declared as image/jpeg (20 MB cap) — readMultipartBuffer aborts and reports truncated.
      form.append('file', Buffer.alloc(21 * 1024 * 1024), {
        filename: 'huge.jpg',
        contentType: 'image/jpeg',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/files/upload',
        headers: { ...AUTH_HEADERS, ...form.getHeaders() },
        payload: form.getBuffer(),
      });
      expect(res.statusCode).toBe(422);
      expect(JSON.parse(res.body).error.code).toBe('COS-FILE-003');
      expect(mocks.minio.uploadFile).not.toHaveBeenCalled();
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
      form.append('file', JPEG_BYTES, {
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

    it('409 — refuses the signed URL until the scan clears (PENDING_SCAN)', async () => {
      const { app, mocks } = await buildTestApp();
      (mocks.db.findFileById as jest.Mock).mockResolvedValue(FILE_ROW); // PENDING_SCAN

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/files/${FILE_ID}/url`,
        headers: AUTH_HEADERS,
      });
      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body).error.code).toBe('COS-FILE-016');
      expect(mocks.minio.getSignedUrl).not.toHaveBeenCalled();
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

  describe('POST /api/v1/files/admin/:fileId/recover', () => {
    const ADMIN_HEADERS = { ...AUTH_HEADERS, 'x-user-role': 'SYSTEM_ADMIN' };

    it('200 — recovers a quarantined file as SYSTEM_ADMIN', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/files/admin/fid-quarantined/recover',
        headers: ADMIN_HEADERS,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.file_status).toBe('CLEAN');
    });

    it('403 — returns FORBIDDEN when caller is not SYSTEM_ADMIN', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/files/admin/fid-quarantined/recover',
        headers: AUTH_HEADERS,
      });
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).error.code).toBe('COS-FILE-011');
    });

    it('404 — returns FILE_NOT_FOUND when file does not exist', async () => {
      const { app, mocks } = await buildTestApp();
      (mocks.db.findFileByIdAdmin as jest.Mock).mockResolvedValue(null);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/files/admin/missing-id/recover',
        headers: ADMIN_HEADERS,
      });
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).error.code).toBe('COS-FILE-005');
    });

    it('422 — returns FILE_NOT_QUARANTINED when file is not in QUARANTINED status', async () => {
      const { app, mocks } = await buildTestApp();
      (mocks.db.findFileByIdAdmin as jest.Mock).mockResolvedValue({
        ...FILE_ROW,
        file_status: 'CLEAN',
      });
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/files/admin/${FILE_ID}/recover`,
        headers: ADMIN_HEADERS,
      });
      expect(res.statusCode).toBe(422);
      expect(JSON.parse(res.body).error.code).toBe('COS-FILE-010');
    });
  });

  describe('Retention policies', () => {
    const ADMIN = { ...AUTH_HEADERS, 'x-user-role': 'TENANT_ADMIN' };

    it('GET 200 — lists policies for a TENANT_ADMIN', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/files/retention-policies',
        headers: ADMIN,
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data).toHaveLength(1);
    });

    it('GET 403 — non-admin is forbidden', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/files/retention-policies',
        headers: AUTH_HEADERS,
      });
      expect(res.statusCode).toBe(403);
    });

    it('PUT 200 — upserts a valid policy', async () => {
      const { app, mocks } = await buildTestApp();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/files/retention-policies',
        headers: ADMIN,
        payload: { category: 'image', retention_days: 90 },
      });
      expect(res.statusCode).toBe(200);
      expect(mocks.db.upsertRetentionPolicy).toHaveBeenCalledWith('tid-test', 'image', 90);
    });

    it('PUT 422 — rejects an invalid category or retention_days', async () => {
      const { app } = await buildTestApp();
      const bad = await app.inject({
        method: 'PUT',
        url: '/api/v1/files/retention-policies',
        headers: ADMIN,
        payload: { category: 'nope', retention_days: 90 },
      });
      expect(bad.statusCode).toBe(422);
      expect(JSON.parse(bad.body).error.code).toBe('COS-FILE-014');

      const bad2 = await app.inject({
        method: 'PUT',
        url: '/api/v1/files/retention-policies',
        headers: ADMIN,
        payload: { category: 'image', retention_days: 0 },
      });
      expect(bad2.statusCode).toBe(422);

      // no body at all → request.body is undefined (?? {} branch) → invalid
      const bad3 = await app.inject({
        method: 'PUT',
        url: '/api/v1/files/retention-policies',
        headers: ADMIN,
      });
      expect(bad3.statusCode).toBe(422);
    });

    it('PUT 403 — non-admin is forbidden', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/files/retention-policies',
        headers: AUTH_HEADERS,
        payload: { category: 'image', retention_days: 90 },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Legal hold', () => {
    const ADMIN = { ...AUTH_HEADERS, 'x-user-role': 'TENANT_ADMIN' };

    it('POST 200 — places a legal hold', async () => {
      const { app, mocks } = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/files/fid-1/legal-hold',
        headers: ADMIN,
        payload: { reason: 'litigation' },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).legal_hold).toBe(true);
      expect(mocks.db.setLegalHold).toHaveBeenCalledWith('fid-1', 'tid-test', 'litigation', USER);
    });

    it('POST 404 — file not found (no body → empty reason default, ?? {} branch)', async () => {
      const { app, mocks } = await buildTestApp();
      (mocks.db.setLegalHold as jest.Mock).mockResolvedValue(false);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/files/missing/legal-hold',
        headers: ADMIN,
      });
      expect(res.statusCode).toBe(404);
      expect(mocks.db.setLegalHold).toHaveBeenCalledWith('missing', 'tid-test', '', USER);
    });

    it('POST 403 — non-admin is forbidden', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/files/fid-1/legal-hold',
        headers: AUTH_HEADERS,
        payload: { reason: 'x' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('DELETE 200 — releases a legal hold', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/files/fid-1/legal-hold',
        headers: ADMIN,
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).legal_hold).toBe(false);
    });

    it('DELETE 404 — file not found', async () => {
      const { app, mocks } = await buildTestApp();
      (mocks.db.releaseLegalHold as jest.Mock).mockResolvedValue(false);
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/files/missing/legal-hold',
        headers: ADMIN,
      });
      expect(res.statusCode).toBe(404);
    });

    it('DELETE 403 — non-admin is forbidden', async () => {
      const { app } = await buildTestApp();
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/files/fid-1/legal-hold',
        headers: AUTH_HEADERS,
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
