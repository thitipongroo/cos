// Tests for auth, trace, security, and swagger plugins

import Fastify from 'fastify';
import { authPlugin } from '../plugins/auth';
import { tracePlugin } from '../plugins/trace';
import { securityPlugin } from '../plugins/security';
import { swaggerPlugin } from '../plugins/swagger';

// ── Trace plugin ────────────────────────────────────────────────────────────

describe('tracePlugin', () => {
  it('extracts trace-id from W3C traceparent header', async () => {
    const app = Fastify();
    await app.register(tracePlugin);
    app.get('/test', async (req) => ({ traceId: req.traceId }));

    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { traceparent: '00-aabbccddeeff00112233445566778899-0000000000000001-01' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).traceId).toBe('aabbccddeeff00112233445566778899');
  });

  it('generates a traceId when traceparent is absent', async () => {
    const app = Fastify();
    await app.register(tracePlugin);
    app.get('/test', async (req) => ({ traceId: req.traceId }));

    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).traceId).toMatch(/^[a-f0-9-]+$/);
  });

  it('sets traceparent response header', async () => {
    const app = Fastify();
    await app.register(tracePlugin);
    app.get('/test', async () => ({}));

    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.headers['traceparent']).toMatch(/^00-/);
  });

  it('falls back to generated id when traceparent has no second segment', async () => {
    const app = Fastify();
    await app.register(tracePlugin);
    app.get('/test', async (req) => ({ traceId: req.traceId }));

    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { traceparent: 'invalid' },
    });
    // 'invalid'.split('-')[1] is undefined → fallback uuid
    expect(JSON.parse(res.body).traceId).toMatch(/^[a-f0-9-]+$/);
  });
});

// ── Auth plugin ─────────────────────────────────────────────────────────────

describe('authPlugin', () => {
  it('passes when both tenant headers are present and reads userRole', async () => {
    const app = Fastify();
    await app.register(tracePlugin);
    await app.register(authPlugin);
    app.get('/test', async (req) => ({
      tenantId: req.tenantId,
      userId: req.userId,
      userRole: req.userRole,
    }));

    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-tenant-id': 'tid-1', 'x-user-id': 'uid-1', 'x-user-role': 'SYSTEM_ADMIN' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.tenantId).toBe('tid-1');
    expect(body.userId).toBe('uid-1');
    expect(body.userRole).toBe('SYSTEM_ADMIN');
  });

  it('sets userRole to empty string when x-user-role header is absent', async () => {
    const app = Fastify();
    await app.register(tracePlugin);
    await app.register(authPlugin);
    app.get('/test', async (req) => ({ userRole: req.userRole }));

    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-tenant-id': 'tid-1', 'x-user-id': 'uid-1' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).userRole).toBe('');
  });

  it('returns 401 when X-Tenant-ID is missing', async () => {
    const app = Fastify();
    await app.register(tracePlugin);
    await app.register(authPlugin);
    app.get('/test', async () => ({}));

    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-user-id': 'uid-1' },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('COS-FILE-001');
  });

  it('returns 401 when X-User-ID is missing', async () => {
    const app = Fastify();
    await app.register(tracePlugin);
    await app.register(authPlugin);
    app.get('/test', async () => ({}));

    const res = await app.inject({
      method: 'GET',
      url: '/test',
      headers: { 'x-tenant-id': 'tid-1' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when both headers are missing', async () => {
    const app = Fastify();
    await app.register(tracePlugin);
    await app.register(authPlugin);
    app.get('/test', async () => ({}));

    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(401);
  });

  it('uses "unknown" as traceId fallback when tracePlugin is not registered', async () => {
    // Covers the `request.traceId ?? 'unknown'` branch in auth.ts
    const app = Fastify();
    // Register auth WITHOUT trace — traceId will be undefined
    await app.register(authPlugin);
    app.get('/test', async () => ({}));

    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.traceId).toBe('unknown');
  });

  it('skips auth for /health/live — early return, no tenant headers required', async () => {
    // Covers the health-path early-return branch in auth.ts (left operand of the ||)
    const app = Fastify();
    await app.register(authPlugin);
    app.get('/health/live', async () => ({ status: 'ok' }));

    const res = await app.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('ok');
  });

  it('skips auth for /health/ready — covers the second health-path branch', async () => {
    // Covers the right operand of the || (url === '/health/ready')
    const app = Fastify();
    await app.register(authPlugin);
    app.get('/health/ready', async () => ({ status: 'ok' }));

    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
  });
});

// ── Security plugin ─────────────────────────────────────────────────────────

describe('securityPlugin', () => {
  it('adds HSTS and X-Content-Type-Options headers', async () => {
    const app = Fastify();
    await app.register(securityPlugin);
    app.get('/test', async () => ({ ok: true }));

    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.headers['strict-transport-security']).toMatch(/max-age=31536000/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('adds X-Frame-Options: DENY', async () => {
    const app = Fastify();
    await app.register(securityPlugin);
    app.get('/test', async () => ({ ok: true }));

    const res = await app.inject({ method: 'GET', url: '/test' });
    expect(res.headers['x-frame-options']).toBe('DENY');
  });
});

// ── Swagger plugin ──────────────────────────────────────────────────────────

describe('swaggerPlugin', () => {
  it('serves /docs route', async () => {
    const app = Fastify();
    await app.register(swaggerPlugin);

    const res = await app.inject({ method: 'GET', url: '/docs' });
    // Redirects to /docs/ or returns HTML
    expect(res.statusCode).toBeLessThan(400);
  });

  it('generates OpenAPI spec at /docs/json', async () => {
    const app = Fastify();
    await app.register(swaggerPlugin);

    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    const spec = JSON.parse(res.body);
    expect(spec.info.title).toBe('Construction OS — File Service');
  });
});
