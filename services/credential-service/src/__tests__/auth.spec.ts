// TDD OQ-46. This suite exercises registerAuth with the REAL verifyBearer, which returns null for
// a request carrying no Authorization header. Two cases here used to pass BECAUSE of that: a
// protected route reached with identity headers alone was honoured. They are now 401s.
//
// The token paths — user token, service token, header disagreement — are in auth-jwt.spec.ts,
// which mocks verifyBearer. This file keeps what it can test without one: the public-path
// exemptions and the refusals.

import Fastify from 'fastify';
import { registerTrace } from '../plugins/trace.js';
import { registerAuth, isPublicPath } from '../plugins/auth.js';

async function appWithAuth() {
  const app = Fastify();
  registerTrace(app);
  registerAuth(app);
  app.get('/health', async () => ({ ok: true }));
  app.get('/tenants/:id/did.json', async () => ({ did: true }));
  app.get('/secure', async (req) => ({
    tenantId: req.tenantId,
    userId: req.userId,
    role: req.userRole,
  }));
  await app.ready();
  return app;
}

describe('auth (CS-8)', () => {
  it('isPublicPath allows health + did:web GET, blocks others', () => {
    expect(isPublicPath('GET', '/health')).toBe(true);
    expect(isPublicPath('GET', '/tenants/t1/did.json')).toBe(true);
    expect(isPublicPath('POST', '/tenants/t1/did.json')).toBe(false);
    expect(isPublicPath('GET', '/secure')).toBe(false);
  });

  it('lets public paths through without identity headers', async () => {
    const app = await appWithAuth();
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/tenants/t1/did.json' })).statusCode).toBe(200);
    await app.close();
  });

  it('rejects a protected route without a token (401)', async () => {
    const app = await appWithAuth();
    const res = await app.inject({ method: 'GET', url: '/secure' });
    expect(res.statusCode).toBe(401);
    // INVALID_TOKEN, not MISSING_TENANT_HEADER: the request fails at "no credential" now, before
    // anything looks at headers at all.
    expect(res.json().error.code).toBe('INVALID_TOKEN');
    await app.close();
  });

  it('rejects when a header is present but empty, or the user id is missing (401)', async () => {
    const app = await appWithAuth();
    const empty = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: { 'x-tenant-id': '', 'x-user-id': 'u1' },
    });
    expect(empty.statusCode).toBe(401);
    const noUser = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: { 'x-tenant-id': 't1' },
    });
    expect(noUser.statusCode).toBe(401);
    const emptyUser = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: { 'x-tenant-id': 't1', 'x-user-id': '' },
    });
    expect(emptyUser.statusCode).toBe(401);
    await app.close();
  });

  it('falls back to an unknown traceId when trace is not registered', async () => {
    const app = Fastify();
    registerAuth(app); // no registerTrace → request.traceId is undefined
    app.get('/secure', async () => ({ ok: true }));
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/secure' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.traceId).toBe('unknown');
    await app.close();
  });

  it('REFUSES identity headers with no token — the OQ-46 hole', async () => {
    // This returned 200 with tenant t1. credential-service holds every tenant's issuer key material
    // and was ClusterIP with no NetworkPolicy, no mesh, and no gateway in front of it.
    const app = await appWithAuth();
    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: { 'x-tenant-id': 't1', 'x-user-id': 'u1', traceparent: '00-abc-def-01' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_TOKEN');
    await app.close();
  });
});
