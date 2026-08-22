// Unit tests — authPlugin identity resolution with in-service JWT verify. verifyBearer is mocked so
// each branch is driven without real tokens.
//
// Updated 2026-08-22 for TDD OQ-46. "fills userId/role from headers when the token omits them"
// asserted the behaviour that was the bug: a token with an empty role handed the caller whatever
// role the header asked for, and no token at all handed them everything. It is now a 401.

import { jest } from '@jest/globals';

type Verified =
  | { kind: 'user'; tenantId: string; userId: string; role: string }
  | { kind: 'service'; clientId: string };

const mockVerifyBearer = jest.fn<(h: unknown) => Promise<Verified | null>>();

const user = (over: Partial<Extract<Verified, { kind: 'user' }>> = {}): Verified => ({
  kind: 'user',
  tenantId: 't1',
  userId: 'u1',
  role: 'FINANCE',
  ...over,
});
const service: Verified = { kind: 'service', clientId: 'cos-backend' };

jest.unstable_mockModule('../plugins/jwt-verify.js', () => ({
  verifyBearer: mockVerifyBearer,
  InvalidTokenError: class InvalidTokenError extends Error {},
}));

const Fastify = (await import('fastify')).default;
const { registerTrace } = await import('../plugins/trace.js');
const { registerAuth } = await import('../plugins/auth.js');

type App = Awaited<ReturnType<typeof Fastify>>;

async function buildApp(withTrace = true): Promise<App> {
  const app = Fastify();
  if (withTrace) registerTrace(app);
  registerAuth(app);
  app.get('/secure', async (req) => ({
    tenantId: req.tenantId,
    userId: req.userId,
    role: req.userRole,
  }));
  await app.ready();
  return app;
}

beforeEach(() => mockVerifyBearer.mockReset());

describe('authPlugin — in-service JWT verify', () => {
  it('uses the verified token identity (agreeing header is accepted)', async () => {
    mockVerifyBearer.mockResolvedValue(user());
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: { authorization: 'Bearer tok', 'x-tenant-id': 't1' },
    });
    expect(res.json()).toEqual({ tenantId: 't1', userId: 'u1', role: 'FINANCE' });
    await app.close();
  });

  it('401 INVALID_TOKEN when the token tenant disagrees with the Kong header', async () => {
    mockVerifyBearer.mockResolvedValue(user({ role: 'R' }));
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: { authorization: 'Bearer tok', 'x-tenant-id': 't2' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_TOKEN');
    await app.close();
  });

  it('401 INVALID_TOKEN when token verification throws', async () => {
    mockVerifyBearer.mockRejectedValue(new Error('bad'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: { authorization: 'Bearer bad' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_TOKEN');
    await app.close();
  });

  it('IGNORES x-user-role on a user token — no self-service role upgrade', async () => {
    mockVerifyBearer.mockResolvedValue(user({ userId: '', role: '' }));
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: { authorization: 'Bearer tok', 'x-user-id': 'uH', 'x-user-role': 'VIEWER' },
    });
    // Claims name no user, and none may be borrowed from a header → not identified.
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('MISSING_TENANT_HEADER');
    await app.close();
  });

  // ── The backend's service token ──────────────────────────────────────────
  it('accepts the service token and takes the principal from the headers', async () => {
    mockVerifyBearer.mockResolvedValue(service);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: {
        authorization: 'Bearer service-tok',
        'x-tenant-id': 'tH',
        'x-user-id': 'uH',
        'x-user-role': 'VIEWER',
      },
    });
    expect(res.json()).toEqual({ tenantId: 'tH', userId: 'uH', role: 'VIEWER' });
    await app.close();
  });

  it('defaults the role to empty on a service token that names none', async () => {
    mockVerifyBearer.mockResolvedValue(service);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: { authorization: 'Bearer service-tok', 'x-tenant-id': 'tH', 'x-user-id': 'uH' },
    });
    expect(res.json().role).toBe('');
    await app.close();
  });

  it('401s a service token that names no principal', async () => {
    mockVerifyBearer.mockResolvedValue(service);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: { authorization: 'Bearer service-tok' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('MISSING_TENANT_HEADER');
    await app.close();
  });

  // ── No token — the OQ-46 hole ────────────────────────────────────────────
  it('401s identity headers sent with NO token, however complete they look', async () => {
    // This service holds every tenant's issuer key material, and it was ClusterIP with no
    // NetworkPolicy, no mesh and no gateway. This request used to be honoured.
    mockVerifyBearer.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: {
        'x-tenant-id': 'victim',
        'x-user-id': 'attacker',
        'x-user-role': 'TENANT_ADMIN',
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_TOKEN');
    await app.close();
  });

  it("defaults traceId to 'unknown' on the no-token path without trace", async () => {
    mockVerifyBearer.mockResolvedValue(null);
    const app = await buildApp(false);
    const res = await app.inject({ method: 'GET', url: '/secure' });
    expect(res.json().error.traceId).toBe('unknown');
    await app.close();
  });

  it("defaults traceId to 'unknown' on the missing-principal path without trace", async () => {
    mockVerifyBearer.mockResolvedValue(service);
    const app = await buildApp(false);
    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: { authorization: 'Bearer service-tok' },
    });
    expect(res.json().error.traceId).toBe('unknown');
    await app.close();
  });

  it("defaults traceId to 'unknown' on the invalid-token path without trace", async () => {
    mockVerifyBearer.mockRejectedValue(new Error('bad'));
    const app = await buildApp(false);
    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: { authorization: 'Bearer x' },
    });
    expect(res.json().error.traceId).toBe('unknown');
    await app.close();
  });

  it("defaults traceId to 'unknown' on the tenant-mismatch path without trace", async () => {
    mockVerifyBearer.mockResolvedValue(user({ role: 'R' }));
    const app = await buildApp(false);
    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: { authorization: 'Bearer x', 'x-tenant-id': 't2' },
    });
    expect(res.json().error.traceId).toBe('unknown');
    await app.close();
  });
});
