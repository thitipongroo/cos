// Tests for auth, trace, security, and swagger plugins

import Fastify from 'fastify';
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
//
// Covered by auth.plugin.spec.ts, which is the only home for it. The six cases that lived here
// asserted identity headers with no bearer token — the behaviour TDD OQ-46 removed — and keeping a
// second, thinner copy of an authorisation suite is how one of them gets updated and the other
// does not.

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
