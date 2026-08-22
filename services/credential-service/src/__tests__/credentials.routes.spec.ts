// TDD OQ-46 — these requests now carry the credential the backend actually sends: a bearer token for
// the `cos-backend` service account, with the principal in the identity headers. They used to send
// headers alone, which registerAuth honoured; that was the hole. verifyBearer is mocked because this
// suite tests routes, not JWKS.
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { jest } from '@jest/globals';

// unstable_mockModule only takes effect for modules loaded AFTER it runs, so every local module here
// is imported dynamically below. A static `import` is hoisted above the mock registration and would
// silently load the real plugins/jwt-verify.js — which returns null for a request with no token, so
// every request in this file would 401 and the failures would read as route bugs.
const mockVerifyBearer = jest.fn<(h: unknown) => Promise<unknown>>();
jest.unstable_mockModule('../plugins/jwt-verify.js', () => ({
  verifyBearer: mockVerifyBearer,
  InvalidTokenError: class InvalidTokenError extends Error {},
}));
mockVerifyBearer.mockResolvedValue({ kind: 'service', clientId: 'cos-backend' });

/** The backend's service token — every authenticated request in this file carries it. */
const SERVICE_AUTH = { authorization: 'Bearer service-token' };

const Fastify = (await import('fastify')).default;
const { credentialRoutes } = await import('../routes/credentials.routes.js');
const { registerTrace } = await import('../plugins/trace.js');
const { registerAuth } = await import('../plugins/auth.js');
const { buildDidKeySuite, issueCredential, verifyCredential } = await import('../vc-service.js');
const { generateEphemeralSignerKey } = await import('../key-manager.js');
const { isRevoked } = await import('../status-list.js');

interface FakeOpts {
  issuerRows?: unknown[];
  revokeCount?: number;
  /** Status-list position returned by the revoke UPDATE; null = a non-revocable contract-signature VC. */
  revokedEntry?: { status_list_id: string; status_list_index: number } | null;
}
interface StatusListRow {
  status_list_id: string;
  encoded_list: string;
  capacity: number;
  next_index: number;
  version: number;
  status_list_credential: unknown;
}
interface FakePool {
  connect: unknown;
  calls: Array<{ sql: string; params?: unknown[] }>;
  statusLists: Map<string, StatusListRow>;
}
/**
 * In-memory stand-in for the `credentials` schema. The status-list tables are modelled with real state
 * (allocation increments, bitstring replacement, version bumps) rather than canned rows, so the CS-6
 * allocate/flip logic is genuinely exercised — the SQL itself is covered by the integration suite.
 */
function fakePool(opts: FakeOpts = {}): FakePool {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const statusLists = new Map<string, StatusListRow>();
  const query = jest.fn(async (sql: unknown, params: unknown[] = []) => {
    const s = String(sql);
    calls.push({ sql: s, params });
    if (s.includes('SELECT did')) return { rows: opts.issuerRows ?? [] };
    if (s.includes('INSERT INTO credentials.revocation_status_lists')) {
      statusLists.set(params[0] as string, {
        status_list_id: params[0] as string,
        status_list_credential: JSON.parse(params[2] as string),
        encoded_list: params[3] as string,
        capacity: params[4] as number,
        next_index: 0,
        version: 1,
      });
      return { rows: [] };
    }
    if (s.includes('FROM credentials.revocation_status_lists')) {
      const rows = [...statusLists.values()].filter((r) =>
        s.includes('status_list_id = $2')
          ? r.status_list_id === params[1]
          : r.next_index < r.capacity,
      );
      return { rows: rows.slice(0, 1) };
    }
    if (s.includes('UPDATE credentials.revocation_status_lists')) {
      const row = statusLists.get(params[1] as string);
      if (!row) return { rows: [] };
      if (s.includes('next_index = next_index + 1')) {
        if (row.next_index >= row.capacity) return { rows: [] };
        row.next_index += 1;
        return { rows: [{ allocated_index: row.next_index - 1 }] };
      }
      row.encoded_list = params[2] as string;
      row.status_list_credential = JSON.parse(params[3] as string);
      row.version += 1;
      return { rows: [] };
    }
    if (s.includes('INSERT INTO credentials.verifiable_credentials'))
      return { rows: [{ vc_id: 'vc-1' }] };
    if (s.includes('UPDATE credentials.verifiable_credentials')) {
      if ((opts.revokeCount ?? 0) === 0) return { rows: [] };
      const nothing = { status_list_id: null, status_list_index: null };
      if (opts.revokedEntry !== undefined) return { rows: [opts.revokedEntry ?? nothing] };
      // Default: the VC being revoked is the one this fake just issued — bit 0 of the tenant's list.
      const first = [...statusLists.keys()][0];
      return {
        rows: [first ? { status_list_id: first, status_list_index: 0 } : nothing],
      };
    }
    return { rows: [] };
  });
  return { connect: jest.fn(async () => ({ query, release: jest.fn() })), calls, statusLists };
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
const ADMIN = {
  ...SERVICE_AUTH,
  'x-tenant-id': 't1',
  'x-user-id': 'u1',
  'x-user-role': 'TENANT_ADMIN',
};
const PM = {
  ...SERVICE_AUTH,
  'x-tenant-id': 't1',
  'x-user-id': 'u2',
  'x-user-role': 'PROJECT_MANAGER',
};

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

  // ── Status List 2021 (CS-6) ────────────────────────────────────────────────

  it('issues a revocable worker VC carrying credentialStatus, publishes the list, and revocation flips the bit', async () => {
    const pool = fakePool({ issuerRows: [], revokeCount: 1 });
    const app = await appAuthed(pool);

    const issued = await app.inject({
      method: 'POST',
      url: '/credentials/issue',
      headers: ADMIN,
      payload: {
        credentialType: 'LICENCE',
        subjectId: 'did:example:worker',
        claims: { licenceNumber: 'L-1' },
      },
    });
    expect(issued.statusCode).toBe(201);
    const status = issued.json().credential.credentialStatus;
    expect(status.type).toBe('StatusList2021Entry');
    expect(status.statusPurpose).toBe('revocation');
    expect(status.statusListIndex).toBe('0');
    const listId = [...pool.statusLists.keys()][0]!;
    expect(status.statusListCredential).toBe(`https://cos.dev/tenants/t1/status-lists/${listId}`);

    // The list is publicly resolvable at exactly that URL — an offline verifier can fetch it.
    const published = await app.inject({
      method: 'GET',
      url: `/tenants/t1/status-lists/${listId}`,
    });
    expect(published.statusCode).toBe(200);
    expect(published.json().type).toContain('StatusList2021Credential');

    // Revoking flips the published bit and re-signs the list. (Verifying this VC end-to-end needs the
    // issuer's did:web document fetched over HTTPS — @digitalbazaar/vc checks the proof before it ever
    // calls checkStatus — so proof+status together are asserted in the integration suite instead.)
    const versionBefore = pool.statusLists.get(listId)!.version;
    const revoked = await app.inject({
      method: 'POST',
      url: '/credentials/vc-1/revoke',
      headers: ADMIN,
    });
    expect(revoked.json().revoked).toBe(true);
    expect(pool.statusLists.get(listId)!.version).toBe(versionBefore + 1);
    expect(auditAction(pool)).toBe('CREDENTIAL_ISSUED'); // issuance audited in-tx (QM-4)
    // The republished list actually carries the revocation for this VC's index.
    expect(await isRevoked(pool.statusLists.get(listId)!.encoded_list, 0)).toBe(true);
    await app.close();
  });

  it('revokes a non-revocable contract-signature VC without touching any status list', async () => {
    const pool = fakePool({ revokeCount: 1, revokedEntry: null });
    const app = await appAuthed(pool);
    const res = await app.inject({
      method: 'POST',
      url: '/credentials/vc-1/revoke',
      headers: ADMIN,
    });
    expect(res.json().revoked).toBe(true);
    expect(pool.statusLists.size).toBe(0);
    expect(auditAction(pool)).toBe('CREDENTIAL_REVOKED');
    await app.close();
  });

  it('returns 404 for an unknown status list', async () => {
    const app = await appPublic(fakePool());
    const res = await app.inject({ method: 'GET', url: '/tenants/t1/status-lists/sl-nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('STATUS_LIST_NOT_FOUND');
    await app.close();
  });
});
