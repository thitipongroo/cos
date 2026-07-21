import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { jest } from '@jest/globals';
import { credentialRoutes } from '../routes/credentials.routes.js';
import { registerTrace } from '../plugins/trace.js';
import { registerAuth } from '../plugins/auth.js';
import { buildDidKeySuite, issueCredential, verifyCredential } from '../vc-service.js';
import { generateEphemeralSignerKey } from '../key-manager.js';

interface FakeOpts {
  issuerRows?: unknown[];
  revokeCount?: number;
}
interface FakePool {
  connect: unknown;
  calls: Array<{ sql: string; params?: unknown[] }>;
}
function fakePool(opts: FakeOpts = {}): FakePool {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const query = jest.fn(async (sql: unknown, params?: unknown[]) => {
    const s = String(sql);
    calls.push({ sql: s, params });
    if (s.includes('SELECT did')) return { rows: opts.issuerRows ?? [] };
    if (s.includes('INSERT INTO credentials.verifiable_credentials'))
      return { rows: [{ vc_id: 'vc-1' }] };
    if (s.includes('UPDATE credentials.verifiable_credentials'))
      return { rowCount: opts.revokeCount ?? 0 };
    return { rows: [] };
  });
  return { connect: jest.fn(async () => ({ query, release: jest.fn() })), calls };
}
/** Find the audit-log INSERT and return its action param (or undefined if none was written). */
function auditAction(pool: FakePool): string | undefined {
  const call = pool.calls.find((c) => c.sql.includes('INSERT INTO credentials.audit_log'));
  return call?.params?.[2] as string | undefined;
}
const CONFIG = {
  port: 0,
  nodeEnv: 'test',
  database: { url: '' },
  issuer: { didWebBaseDomain: 'cos.dev' },
};
const ADMIN = { 'x-tenant-id': 't1', 'x-user-id': 'u1', 'x-user-role': 'TENANT_ADMIN' };
const PM = { 'x-tenant-id': 't1', 'x-user-id': 'u2', 'x-user-role': 'PROJECT_MANAGER' };

async function appPublic(pool: unknown): Promise<FastifyInstance> {
  const app = Fastify();
  app.decorate('pool', pool as Pool);
  await credentialRoutes(app);
  await app.ready();
  return app;
}
async function appAuthed(pool: unknown): Promise<FastifyInstance> {
  const app = Fastify();
  app.decorate('pool', pool as Pool);
  app.decorate('config', CONFIG);
  registerTrace(app);
  registerAuth(app);
  await credentialRoutes(app);
  await app.ready();
  return app;
}

describe('credentials.routes (CS-8)', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.APP_SECRET_ENCRYPTION_KEY;
  });

  it('serves the issuer DID document (public did:web)', async () => {
    const doc = {
      id: 'did:web:cos.dev:tenants:t1',
      verificationMethod: [{ publicKeyMultibase: 'z6MkPub' }],
    };
    const app = await appPublic(
      fakePool({ issuerRows: [{ did: doc.id, did_document: doc, encrypted_private_key: 'x' }] }),
    );
    const res = await app.inject({ method: 'GET', url: '/tenants/t1/did.json' });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe('did:web:cos.dev:tenants:t1');
    await app.close();
  });

  it('returns 404 when the tenant has no issuer', async () => {
    const app = await appPublic(fakePool({ issuerRows: [] }));
    expect((await app.inject({ method: 'GET', url: '/tenants/t1/did.json' })).statusCode).toBe(404);
    await app.close();
  });

  it('verifies a valid VC and rejects a missing/absent body (400)', async () => {
    const { suite, did } = await buildDidKeySuite(await generateEphemeralSignerKey());
    const vc = await issueCredential({
      suite,
      issuerDid: did,
      subjectId: 'did:example:c',
      issuanceDate: '2026-07-20T00:00:00Z',
    });
    const app = await appAuthed(fakePool());
    const ok = await app.inject({
      method: 'POST',
      url: '/credentials/verify',
      payload: { credential: vc },
      headers: ADMIN,
    });
    expect(ok.json().verified).toBe(true);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/credentials/verify',
          payload: {},
          headers: ADMIN,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'POST', url: '/credentials/verify', headers: ADMIN })).statusCode,
    ).toBe(400);
    await app.close();
  });

  it('issues a CONTRACT_SIGNATURE (ephemeral) with documentHash + claims → 201, verifiable + audited', async () => {
    const pool = fakePool();
    const app = await appAuthed(pool);
    const res = await app.inject({
      method: 'POST',
      url: '/credentials/issue',
      headers: PM,
      payload: {
        credentialType: 'CONTRACT_SIGNATURE',
        subjectId: 'did:example:client',
        documentHash: 'sha256:h',
        claims: { signerParty: 'CLIENT' },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().vcId).toBe('vc-1');
    expect((await verifyCredential(res.json().credential)).verified).toBe(true);
    expect(auditAction(pool)).toBe('CREDENTIAL_ISSUED'); // immutable audit written in-tx (QM-4)
    await app.close();
  });

  it('issues a CONTRACT_SIGNATURE with no documentHash/claims → 201', async () => {
    const app = await appAuthed(fakePool());
    const res = await app.inject({
      method: 'POST',
      url: '/credentials/issue',
      headers: PM,
      payload: { credentialType: 'CONTRACT_SIGNATURE', subjectId: 'did:example:client' },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it('issues a worker LICENCE as TENANT_ADMIN (provisions issuer) → 201', async () => {
    const app = await appAuthed(fakePool({ issuerRows: [] })); // no issuer → provision
    const res = await app.inject({
      method: 'POST',
      url: '/credentials/issue',
      headers: ADMIN,
      payload: {
        credentialType: 'LICENCE',
        subjectId: 'did:example:worker',
        claims: { licenceNumber: 'L-1' },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().credential.type).toContain('LicenceVC');
    // worker VC with no claims → 201 (exercises the `claims ?? {}` default)
    const bare = await app.inject({
      method: 'POST',
      url: '/credentials/issue',
      headers: ADMIN,
      payload: { credentialType: 'EQUIPMENT_CERT', subjectId: 'did:example:crane' },
    });
    expect(bare.statusCode).toBe(201);
    await app.close();
  });

  it('rejects a worker credential from a non-admin (403)', async () => {
    const app = await appAuthed(fakePool());
    const res = await app.inject({
      method: 'POST',
      url: '/credentials/issue',
      headers: PM,
      payload: { credentialType: 'LICENCE', subjectId: 'did:example:worker' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('rejects invalid issue bodies (400): no body, missing type/subject, bad type', async () => {
    const app = await appAuthed(fakePool());
    expect(
      (await app.inject({ method: 'POST', url: '/credentials/issue', headers: ADMIN })).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/credentials/issue',
          headers: ADMIN,
          payload: { subjectId: 'x' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/credentials/issue',
          headers: ADMIN,
          payload: { credentialType: 'LICENCE' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/credentials/issue',
          headers: ADMIN,
          payload: { credentialType: 'NOPE', subjectId: 'x' },
        })
      ).statusCode,
    ).toBe(400);
    await app.close();
  });

  it('revokes a VC as TENANT_ADMIN (200), 404 when absent, 403 for non-admin', async () => {
    const foundPool = fakePool({ revokeCount: 1 });
    const found = await appAuthed(foundPool);
    expect(
      (
        await found.inject({ method: 'POST', url: '/credentials/vc-1/revoke', headers: ADMIN })
      ).json().revoked,
    ).toBe(true);
    expect(auditAction(foundPool)).toBe('CREDENTIAL_REVOKED'); // audited only on a successful revoke
    await found.close();
    const absentPool = fakePool({ revokeCount: 0 });
    const absent = await appAuthed(absentPool);
    expect(
      (await absent.inject({ method: 'POST', url: '/credentials/vc-9/revoke', headers: ADMIN }))
        .statusCode,
    ).toBe(404);
    expect(auditAction(absentPool)).toBeUndefined(); // no row updated → no audit
    await absent.close();
    const forbidden = await appAuthed(fakePool({ revokeCount: 1 }));
    expect(
      (await forbidden.inject({ method: 'POST', url: '/credentials/vc-1/revoke', headers: PM }))
        .statusCode,
    ).toBe(403);
    await forbidden.close();
  });
});
