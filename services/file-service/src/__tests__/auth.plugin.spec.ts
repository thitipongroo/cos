// Unit tests — authPlugin identity resolution (in-service JWT verify + Kong-header agreement).
// verifyBearer is mocked so we drive each branch without real tokens/JWKS.

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

  it('uses the verified token identity (and it wins over headers when they agree)', async () => {
    mockVerifyBearer.mockResolvedValue({ tenantId: 't1', userId: 'u1', role: 'FINANCE' });
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

  it('401 INVALID_TOKEN when the token tenant disagrees with the Kong header', async () => {
    mockVerifyBearer.mockResolvedValue({ tenantId: 't1', userId: 'u1', role: 'R' });
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

  it('falls back to Kong headers when no bearer token is present', async () => {
    mockVerifyBearer.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/x',
      headers: { 'x-tenant-id': 'tH', 'x-user-id': 'uH', 'x-user-role': 'VIEWER' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ tenantId: 'tH', userId: 'uH', role: 'VIEWER' });
    await app.close();
  });

  it('fills userId/role from headers when the token omits them (tenant still from token)', async () => {
    mockVerifyBearer.mockResolvedValue({ tenantId: 't1', userId: '', role: '' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/x',
      headers: { authorization: 'Bearer tok', 'x-user-id': 'uH', 'x-user-role': 'VIEWER' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ tenantId: 't1', userId: 'uH', role: 'VIEWER' });
    await app.close();
  });

  it('defaults role to empty string when no x-user-role header is present', async () => {
    mockVerifyBearer.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/x',
      headers: { 'x-tenant-id': 'tH', 'x-user-id': 'uH' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).role).toBe('');
    await app.close();
  });

  it('401 MISSING_TENANT_HEADER when neither a token nor headers identify the caller', async () => {
    mockVerifyBearer.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/x' });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('COS-FILE-001');
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
    mockVerifyBearer.mockResolvedValue({ tenantId: 't1', userId: 'u1', role: 'R' });
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
