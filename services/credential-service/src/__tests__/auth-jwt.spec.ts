// Unit tests — authPlugin identity resolution with in-service JWT verify. verifyBearer is mocked so
// each branch (token path, token/header agreement, invalid token) is driven without real tokens.

import { jest } from '@jest/globals';

const mockVerifyBearer =
  jest.fn<(h: unknown) => Promise<{ tenantId: string; userId: string; role: string } | null>>();

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
    mockVerifyBearer.mockResolvedValue({ tenantId: 't1', userId: 'u1', role: 'FINANCE' });
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
    mockVerifyBearer.mockResolvedValue({ tenantId: 't1', userId: 'u1', role: 'R' });
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

  it('fills userId/role from headers when the token omits them', async () => {
    mockVerifyBearer.mockResolvedValue({ tenantId: 't1', userId: '', role: '' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/secure',
      headers: { authorization: 'Bearer tok', 'x-user-id': 'uH', 'x-user-role': 'VIEWER' },
    });
    expect(res.json()).toEqual({ tenantId: 't1', userId: 'uH', role: 'VIEWER' });
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
    mockVerifyBearer.mockResolvedValue({ tenantId: 't1', userId: 'u1', role: 'R' });
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
