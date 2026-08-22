// Unit tests — authPlugin identity resolution. verifyBearer is mocked so each branch is driven
// without real tokens or JWKS.
//
// Rewritten 2026-08-22 for TDD OQ-46. The suite used to assert the behaviour that WAS the bug:
// "falls back to Kong headers when no bearer token is present" and "fills userId/role from headers
// when the token omits them" both described an unauthenticated caller supplying its own tenant and
// its own role. They passed because they matched the code, and the code was wrong — the Kong that
// justified it is deployed nowhere. Those two cases are now the 401 tests below.

const mockVerifyBearer = jest.fn();
jest.mock('../plugins/jwt-verify', () => ({
  verifyBearer: (...a: unknown[]) => mockVerifyBearer(...a),
}));

import Fastify, { type FastifyInstance } from 'fastify';
import { tracePlugin } from '../plugins/trace';
import { authPlugin } from '../plugins/auth';

async function buildApp(withTrace = true): Promise<FastifyInstance> {
  const app = Fastify();
  if (withTrace) await app.register(tracePlugin);
  await app.register(authPlugin);
  app.get('/x', async (req) => ({
    tenantId: req.tenantId,
    userId: req.userId,
    role: req.userRole,
  }));
  app.get('/health/live', async () => ({ ok: true }));
  return app;
}

const userToken = (over: Record<string, unknown> = {}) => ({
  kind: 'user',
  tenantId: 't1',
  userId: 'u1',
  role: 'FINANCE',
  ...over,
});
const serviceToken = { kind: 'service', clientId: 'cos-backend' };

beforeEach(() => mockVerifyBearer.mockReset());

describe('authPlugin', () => {
  it('skips auth for health probes', async () => {
    mockVerifyBearer.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(mockVerifyBearer).not.toHaveBeenCalled();
    await app.close();
  });

  // ── A user token ─────────────────────────────────────────────────────────
  describe('user token', () => {
    it('takes the identity from the claims', async () => {
      mockVerifyBearer.mockResolvedValue(userToken());
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/x',
        headers: { authorization: 'Bearer tok', 'x-tenant-id': 't1' },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ tenantId: 't1', userId: 'u1', role: 'FINANCE' });
      await app.close();
    });

    it('401s when a header disagrees with the token tenant', async () => {
      mockVerifyBearer.mockResolvedValue(userToken());
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/x',
        headers: { authorization: 'Bearer tok', 'x-tenant-id': 't2' },
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error.code).toBe('COS-FILE-018');
      await app.close();
    });

    it('IGNORES x-user-role — a user cannot upgrade their own role with a header', async () => {
      // The old code read `verified?.role || header`, so a token with an empty role handed the
      // caller whatever role they asked for. SYSTEM_ADMIN, for instance.
      mockVerifyBearer.mockResolvedValue(userToken({ userId: '', role: '' }));
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/x',
        headers: {
          authorization: 'Bearer tok',
          'x-user-id': 'uH',
          'x-user-role': 'SYSTEM_ADMIN',
        },
      });
      // No userId in the claims and none may be borrowed → the caller is not identified.
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error.code).toBe('COS-FILE-001');
      await app.close();
    });
  });

  // ── The backend's service token ──────────────────────────────────────────
  describe('service token', () => {
    it('takes the principal from the headers — the caller is authenticated as the backend', async () => {
      mockVerifyBearer.mockResolvedValue(serviceToken);
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/x',
        headers: {
          authorization: 'Bearer service-tok',
          'x-tenant-id': 'tH',
          'x-user-id': 'uH',
          'x-user-role': 'VIEWER',
        },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ tenantId: 'tH', userId: 'uH', role: 'VIEWER' });
      await app.close();
    });

    it('defaults the role to empty rather than inventing one', async () => {
      mockVerifyBearer.mockResolvedValue(serviceToken);
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/x',
        headers: {
          authorization: 'Bearer service-tok',
          'x-tenant-id': 'tH',
          'x-user-id': 'uH',
        },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).role).toBe('');
      await app.close();
    });

    it('401s when it names no principal', async () => {
      mockVerifyBearer.mockResolvedValue(serviceToken);
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/x',
        headers: { authorization: 'Bearer service-tok' },
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error.code).toBe('COS-FILE-001');
      await app.close();
    });
  });

  // ── No token at all — the OQ-46 hole ─────────────────────────────────────
  describe('no bearer token', () => {
    it('401s even with a full set of identity headers', async () => {
      // This is the case that used to return 200 with tenant tH and role VIEWER. Any pod in the
      // namespace could send it: ClusterIP, no NetworkPolicy, no mesh, and no gateway in front.
      mockVerifyBearer.mockResolvedValue(null);
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/x',
        headers: { 'x-tenant-id': 'tH', 'x-user-id': 'uH', 'x-user-role': 'VIEWER' },
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error.code).toBe('COS-FILE-018');
      await app.close();
    });

    it('401s when it claims SYSTEM_ADMIN', async () => {
      mockVerifyBearer.mockResolvedValue(null);
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/x',
        headers: {
          'x-tenant-id': 'victim-tenant',
          'x-user-id': 'attacker',
          'x-user-role': 'SYSTEM_ADMIN',
        },
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it('401s with no headers at all', async () => {
      mockVerifyBearer.mockResolvedValue(null);
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/x' });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error.code).toBe('COS-FILE-018');
      await app.close();
    });
  });

  it('401s with no token and no traceId — the unknown-traceId fallback', async () => {
    mockVerifyBearer.mockResolvedValue(null);
    const app = await buildApp(false);
    const res = await app.inject({ method: 'GET', url: '/x' });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.traceId).toBe('unknown');
    await app.close();
  });

  it('401 MISSING_TENANT_HEADER falls back to an unknown traceId too', async () => {
    mockVerifyBearer.mockResolvedValue(serviceToken);
    const app = await buildApp(false);
    const res = await app.inject({
      method: 'GET',
      url: '/x',
      headers: { authorization: 'Bearer service-tok' },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.traceId).toBe('unknown');
    await app.close();
  });

  it('401 INVALID_TOKEN when the token fails verification', async () => {
    mockVerifyBearer.mockRejectedValue(new Error('bad token'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/x',
      headers: { authorization: 'Bearer bad' },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('COS-FILE-018');
    await app.close();
  });

  // Without the trace plugin request.traceId is undefined → exercises the `?? 'unknown'` fallback on
  // both INVALID_TOKEN paths.
  it('handles a missing traceId on the invalid-token path', async () => {
    mockVerifyBearer.mockRejectedValue(new Error('bad'));
    const app = await buildApp(false);
    const res = await app.inject({
      method: 'GET',
      url: '/x',
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.traceId).toBe('unknown');
    await app.close();
  });

  it('handles a missing traceId on the tenant-mismatch path', async () => {
    mockVerifyBearer.mockResolvedValue(userToken({ role: 'R' }));
    const app = await buildApp(false);
    const res = await app.inject({
      method: 'GET',
      url: '/x',
      headers: { authorization: 'Bearer x', 'x-tenant-id': 't2' },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.traceId).toBe('unknown');
    await app.close();
  });
});
