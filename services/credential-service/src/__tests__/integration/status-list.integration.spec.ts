// Status List 2021 end-to-end (CS-6) — the loop the unit suite cannot close: a revocable worker VC is
// issued against a real Postgres (RLS enforced as app_user), published at its public URL, verified
// with BOTH the Data Integrity proof and the revocation bit (ADR-019 §Verification), then revoked and
// re-verified. Only the HTTPS transport is stubbed (@digitalbazaar/did-method-web rejects http:), the
// same way did-web-verify.integration.spec.ts does — it serves exactly the document our own
// GET /tenants/:id/did.json returns.
import { jest } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { startInfra, stopInfra, type Infra } from './infra.js';

let didDocumentToServe: unknown = null;

jest.unstable_mockModule('@digitalbazaar/http-client', () => ({
  httpClient: { get: async () => ({ data: didDocumentToServe }) },
}));

// Import AFTER the mock so did-method-web picks up the stubbed transport.
const { credentialRoutes } = await import('../../routes/credentials.routes.js');
const { registerTrace } = await import('../../plugins/trace.js');
const { registerAuth } = await import('../../plugins/auth.js');
const { withTenant } = await import('../../db.js');
const { getStatusListById } = await import('../../credential-repository.js');
const { isRevoked, statusListUrl } = await import('../../status-list.js');

const TENANT = 'dddddddd-0001-4000-8000-000000000001';
const OTHER_TENANT = 'dddddddd-0002-4000-8000-000000000002';
const BASE_DOMAIN = 'cos.dev';
const ADMIN = { 'x-tenant-id': TENANT, 'x-user-id': 'u1', 'x-user-role': 'TENANT_ADMIN' };

describe('Status List 2021 (integration — real Postgres + RLS)', () => {
  let infra: Infra;
  let app: FastifyInstance;
  let vcId: string;
  let credential: Record<string, unknown>;
  let statusListId: string;

  beforeAll(async () => {
    delete process.env.APP_SECRET_ENCRYPTION_KEY; // deterministic dev key
    infra = await startInfra();
    app = Fastify();
    app.decorate('pool', infra.appPool as unknown as Pool);
    app.decorate('config', {
      port: 0,
      nodeEnv: 'test',
      database: { url: '' },
      issuer: { didWebBaseDomain: BASE_DOMAIN },
    });
    registerTrace(app);
    registerAuth(app);
    await credentialRoutes(app);
    await app.ready();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await stopInfra(infra ?? {});
  });

  it('issues a revocable LICENCE that claims a status-list bit', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/credentials/issue',
      headers: ADMIN,
      payload: {
        credentialType: 'LICENCE',
        subjectId: 'did:key:z6MkWorkerSubject',
        claims: { licenceNumber: 'L-2026-77' },
      },
    });
    expect(res.statusCode).toBe(201);
    vcId = res.json().vcId;
    credential = res.json().credential;

    const status = credential.credentialStatus as Record<string, string>;
    expect(status.type).toBe('StatusList2021Entry');
    expect(status.statusPurpose).toBe('revocation');
    expect(status.statusListIndex).toBe('0'); // first VC for this tenant
    statusListId = status.statusListCredential.split('/status-lists/')[1]!;
    expect(status.statusListCredential).toBe(statusListUrl(BASE_DOMAIN, TENANT, statusListId));

    // The issuer DID document is now in the DB — serve it over the stubbed HTTPS transport, exactly
    // as the public did.json route would.
    const didJson = await app.inject({ method: 'GET', url: `/tenants/${TENANT}/did.json` });
    expect(didJson.statusCode).toBe(200);
    didDocumentToServe = didJson.json();
  });

  it('persists the position on the VC row and links it to the list (real FK)', async () => {
    const { rows } = await infra.adminPool.query(
      'SELECT status_list_id, status_list_index, status FROM credentials.verifiable_credentials WHERE vc_id = $1',
      [vcId],
    );
    expect(rows[0].status_list_id).toBe(statusListId);
    expect(rows[0].status_list_index).toBe(0);
    expect(rows[0].status).toBe('ACTIVE');
  });

  it('publishes the signed status-list credential at its URL, with no authentication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/tenants/${TENANT}/status-lists/${statusListId}`,
    }); // deliberately no identity headers — a third-party verifier has none
    expect(res.statusCode).toBe(200);
    expect(res.json().type).toContain('StatusList2021Credential');
    expect(res.json().id).toBe(statusListUrl(BASE_DOMAIN, TENANT, statusListId));
    expect(res.json().proof.type).toBe('Ed25519Signature2020');
    expect(res.json().credentialSubject.statusPurpose).toBe('revocation');
  });

  it('verifies the live credential — proof AND status together', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/credentials/verify',
      headers: ADMIN,
      payload: { credential },
    });
    expect(res.json()).toEqual({ verified: true, revoked: false });
  });

  it('revoking flips the published bit and re-signs the list', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/credentials/${vcId}/revoke`,
      headers: ADMIN,
    });
    expect(res.statusCode).toBe(200);

    const list = await withTenant(infra.appPool as unknown as Pool, TENANT, (client) =>
      getStatusListById(client, TENANT, statusListId),
    );
    expect(await isRevoked(list!.encodedList, 0)).toBe(true);
    expect(await isRevoked(list!.encodedList, 1)).toBe(false); // neighbours untouched
    expect(list!.version).toBe(2); // republished

    // The freshly published credential is still a valid VC, not a hand-patched blob.
    const published = await app.inject({
      method: 'GET',
      url: `/tenants/${TENANT}/status-lists/${statusListId}`,
    });
    expect(published.json().proof.type).toBe('Ed25519Signature2020');
  });

  it('the same credential now fails verification, and the reason is revocation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/credentials/verify',
      headers: ADMIN,
      payload: { credential },
    });
    expect(res.json()).toEqual({ verified: false, revoked: true });
  });

  it('writes an immutable audit row for the revocation (QM-4)', async () => {
    const { rows } = await infra.adminPool.query(
      `SELECT action, metadata FROM credentials.audit_log
        WHERE tenant_id = $1 AND action = 'CREDENTIAL_REVOKED'`,
      [TENANT],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata.statusListId).toBe(statusListId);
  });

  it('RLS: another tenant cannot read this tenant’s status list', async () => {
    const leaked = await withTenant(infra.appPool as unknown as Pool, OTHER_TENANT, (client) =>
      getStatusListById(client, OTHER_TENANT, statusListId),
    );
    expect(leaked).toBeNull();
    const res = await app.inject({
      method: 'GET',
      url: `/tenants/${OTHER_TENANT}/status-lists/${statusListId}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('the next issuance reuses the same list and takes the next index', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/credentials/issue',
      headers: ADMIN,
      payload: { credentialType: 'EQUIPMENT_CERT', subjectId: 'did:key:z6MkCrane' },
    });
    expect(res.statusCode).toBe(201);
    const status = res.json().credential.credentialStatus as Record<string, string>;
    expect(status.statusListIndex).toBe('1');
    expect(status.statusListCredential).toBe(statusListUrl(BASE_DOMAIN, TENANT, statusListId));
    // …and it verifies: a revoked neighbour does not taint it.
    const verified = await app.inject({
      method: 'POST',
      url: '/credentials/verify',
      headers: ADMIN,
      payload: { credential: res.json().credential },
    });
    expect(verified.json()).toEqual({ verified: true, revoked: false });
  });
});
