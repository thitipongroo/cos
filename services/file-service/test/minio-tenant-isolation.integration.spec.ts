// Integration test: object-storage tenant isolation — Phase 9
//
// §35.13 ESC-30 closes TC-P09-ISO-001 ("A Tenant A signed URL cannot read a Tenant B object"),
// which had sat as PLANNED because no test ran against real object storage.
//
// The isolation model is one bucket per tenant (`cos-{tenant_id}`, MinioService.bucketName), so
// the property under test is twofold: a presigned URL is cryptographically bound to the exact
// bucket AND key it was issued for, and a tenant's bucket is not readable by addressing another
// tenant's. Neither can be shown with a mock — a stub would happily return whatever it was told
// to. This drives a real MinIO server.

import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

import type { FileServiceConfig } from '../src/config';
import { MinioService } from '../src/services/minio.service';

const TENANT_A = 'aaaaaaaa-0001-4000-8000-000000000001';
const TENANT_B = 'bbbbbbbb-0001-4000-8000-000000000001';
const ROOT_USER = 'cos_test_root';
const ROOT_PASSWORD = 'cos_test_password';

const SECRET_A = 'tenant A contract — confidential';
const SECRET_B = 'tenant B contract — confidential';

describe('TC-P09-ISO-001 — object storage is tenant-isolated (Testcontainers — MinIO)', () => {
  let container: StartedTestContainer;
  let minio: MinioService;
  let baseUrl: string;

  beforeAll(async () => {
    container = await new GenericContainer('minio/minio:RELEASE.2024-09-13T20-26-02Z')
      .withEnvironment({
        MINIO_ROOT_USER: ROOT_USER,
        MINIO_ROOT_PASSWORD: ROOT_PASSWORD,
      })
      .withCommand(['server', '/data'])
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forListeningPorts())
      .start();

    const host = container.getHost();
    const port = container.getMappedPort(9000);
    baseUrl = `http://${host}:${port}`;

    const config = {
      minio: {
        endPoint: host,
        port,
        useSSL: false,
        accessKey: ROOT_USER,
        secretKey: ROOT_PASSWORD,
      },
      signedUrlTtlSeconds: 3600,
    } as unknown as FileServiceConfig;

    minio = new MinioService(config);

    await minio.uploadFile({
      tenantId: TENANT_A,
      storedKey: 'contracts/a.txt',
      buffer: Buffer.from(SECRET_A),
      mimeType: 'text/plain',
    });
    await minio.uploadFile({
      tenantId: TENANT_B,
      storedKey: 'contracts/b.txt',
      buffer: Buffer.from(SECRET_B),
      mimeType: 'text/plain',
    });
  }, 180_000);

  afterAll(async () => {
    await container?.stop();
  });

  it('gives each tenant its own bucket', () => {
    expect(minio.bucketName(TENANT_A)).toBe(`cos-${TENANT_A}`);
    expect(minio.bucketName(TENANT_B)).toBe(`cos-${TENANT_B}`);
    expect(minio.bucketName(TENANT_A)).not.toBe(minio.bucketName(TENANT_B));
  });

  it('a tenant can read its own object through its signed URL', async () => {
    const url = await minio.getSignedUrl(TENANT_A, 'contracts/a.txt');
    const res = await fetch(url);
    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toBe(SECRET_A);
  });

  // The core assertion: rewriting the bucket segment of A's signed URL to B's bucket must fail.
  // The v4 signature covers the canonical request, so the tampered path no longer verifies.
  it("tenant A's signed URL cannot be repointed at tenant B's bucket", async () => {
    const urlA = await minio.getSignedUrl(TENANT_A, 'contracts/a.txt');
    const tampered = urlA.replace(`/cos-${TENANT_A}/`, `/cos-${TENANT_B}/`);
    expect(tampered).not.toBe(urlA);

    const res = await fetch(tampered);
    expect(res.status).toBeGreaterThanOrEqual(400);

    const body = await res.text();
    expect(body).not.toContain(SECRET_B);
  });

  it("tenant A's signed URL cannot be repointed at another key in its own bucket", async () => {
    const urlA = await minio.getSignedUrl(TENANT_A, 'contracts/a.txt');
    const tampered = urlA.replace('contracts/a.txt', 'contracts/other.txt');

    const res = await fetch(tampered);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("tenant B's bucket is not readable without a signature", async () => {
    // Buckets are private by default; an unsigned GET must not serve the object.
    const res = await fetch(`${baseUrl}/cos-${TENANT_B}/contracts/b.txt`);
    expect(res.status).toBeGreaterThanOrEqual(400);
    await expect(res.text()).resolves.not.toContain(SECRET_B);
  });

  it('each tenant reads only its own bytes through the service API', async () => {
    await expect(minio.downloadToBuffer(TENANT_A, 'contracts/a.txt')).resolves.toEqual(
      Buffer.from(SECRET_A),
    );
    await expect(minio.downloadToBuffer(TENANT_B, 'contracts/b.txt')).resolves.toEqual(
      Buffer.from(SECRET_B),
    );
  });

  it("a tenant cannot reach another tenant's key through its own bucket", async () => {
    // Same key name, wrong bucket — the object simply is not there, which is the isolation.
    await expect(minio.downloadToBuffer(TENANT_A, 'contracts/b.txt')).rejects.toThrow();
  });

  it('quarantine buckets are per-tenant too', () => {
    expect(minio.quarantineBucketName(TENANT_A)).toBe(`cos-quarantine-${TENANT_A}`);
    expect(minio.quarantineBucketName(TENANT_A)).not.toBe(minio.quarantineBucketName(TENANT_B));
  });
});
