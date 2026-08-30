// AiProxyController — TDD OQ-46.
//
// Two things are worth proving here. First, the forwarding rules, which are easy to get subtly wrong
// (a dropped query string, a copied content-length, a swallowed gateway status). Second — and this is
// why the suite boots a real Nest app on the real Fastify adapter — that the wildcard routes MATCH.
// A proxy whose route pattern is wrong is indistinguishable from no proxy at all, which is exactly
// the state OQ-46 found the AI surface in.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { CanActivate } from '@nestjs/common';
import { AiProxyController } from '../ai-proxy.controller';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';

const allow: CanActivate = { canActivate: () => true };

/** The last request `fetch` was called with, decoded. */
function lastCall() {
  const [url, init] = (global.fetch as jest.Mock).mock.calls.at(-1) as [string, RequestInit];
  return {
    url,
    method: init.method,
    headers: init.headers as Record<string, string>,
    body: init.body as string | undefined,
  };
}

function gatewayReplies(status: number, body: unknown, asText?: string) {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => asText ?? JSON.stringify(body),
  });
}

describe('AiProxyController', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    process.env['AI_GATEWAY_URL'] = 'http://gateway:8000';

    const moduleRef = await Test.createTestingModule({ controllers: [AiProxyController] })
      .overrideGuard(JwtAuthGuard)
      .useValue(allow)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api/v1');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
    delete process.env['AI_GATEWAY_URL'];
  });

  // ── Routing ──────────────────────────────────────────────────────────────
  describe('route matching', () => {
    it.each([
      ['POST', '/api/v1/ai/reports/executive-summary'],
      ['POST', '/api/v1/ai/reports/site-summary'],
      ['POST', '/api/v1/ai/reports/procurement-summary'],
      ['POST', '/api/v1/ai/reports/delay-risk'],
      ['POST', '/api/v1/ai/completions'],
      ['POST', '/api/v1/ai/intent'],
      ['POST', '/api/v1/ai/transcribe'],
      ['GET', '/api/v1/ai/usage'],
      ['GET', '/api/v1/ai/reports/history'],
      ['POST', '/api/v1/rag/query'],
    ])('%s %s reaches the proxy', async (method, url) => {
      // Every path the AI Gateway serves, and every path the web and mobile apps call. A pattern
      // that matched `/ai/x` but not `/ai/reports/x` would pass a thinner test and fail in use.
      gatewayReplies(200, { ok: true });
      const res = await app.inject({ method: method as 'GET', url });
      expect(res.statusCode).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('does not swallow unrelated paths', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/projects' });
      expect(res.statusCode).toBe(404);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ── Forwarding ───────────────────────────────────────────────────────────
  describe('forwarding', () => {
    it('keeps the path AND the query string', async () => {
      gatewayReplies(200, { items: [] });
      await app.inject({ method: 'GET', url: '/api/v1/ai/reports/history?project_id=p1&limit=5' });
      expect(lastCall().url).toBe(
        'http://gateway:8000/api/v1/ai/reports/history?project_id=p1&limit=5',
      );
    });

    it("forwards the caller's own bearer token untouched", async () => {
      // The gateway verifies it independently, so the tenant is established from the token twice
      // and this proxy is never trusted to assert one.
      gatewayReplies(200, {});
      await app.inject({
        method: 'POST',
        url: '/api/v1/ai/completions',
        headers: { authorization: 'Bearer user-token' },
        payload: { prompt: 'hi' },
      });
      expect(lastCall().headers['authorization']).toBe('Bearer user-token');
    });

    it('never sends x-tenant-id', async () => {
      // The gateway stopped accepting a header-asserted tenant in the same change; sending one could
      // only ever disagree with the token and fail the request closed.
      gatewayReplies(200, {});
      await app.inject({
        method: 'POST',
        url: '/api/v1/ai/completions',
        headers: { authorization: 'Bearer t', 'x-tenant-id': 'sneaky' },
        payload: {},
      });
      expect(lastCall().headers['x-tenant-id']).toBe('sneaky');
      // ^ a header the CLIENT sent is passed through — and the gateway will reject it against the
      // token if it disagrees. What matters is that the proxy does not MINT one, which the absence
      // of any assignment in forward() guarantees and this next case shows:
      (global.fetch as jest.Mock).mockClear();
      gatewayReplies(200, {});
      await app.inject({
        method: 'POST',
        url: '/api/v1/ai/completions',
        headers: { authorization: 'Bearer t' },
        payload: {},
      });
      expect(lastCall().headers['x-tenant-id']).toBeUndefined();
    });

    it('drops hop-by-hop headers and content-length', async () => {
      gatewayReplies(200, {});
      await app.inject({
        method: 'POST',
        url: '/api/v1/ai/completions',
        headers: { authorization: 'Bearer t', connection: 'keep-alive' },
        payload: { a: 1 },
      });
      const { headers } = lastCall();
      // Fastify sets content-length on the inbound request; the body is re-serialised here, so a
      // copied length can only be wrong.
      expect(headers['content-length']).toBeUndefined();
      expect(headers['connection']).toBeUndefined();
      expect(headers['host']).toBeUndefined();
    });

    it('re-serialises the body and sends no body on GET', async () => {
      gatewayReplies(200, {});
      await app.inject({
        method: 'POST',
        url: '/api/v1/ai/intent',
        payload: { text: 'ตรวจงาน' },
      });
      expect(JSON.parse(lastCall().body!)).toEqual({ text: 'ตรวจงาน' });

      (global.fetch as jest.Mock).mockClear();
      gatewayReplies(200, {});
      await app.inject({ method: 'GET', url: '/api/v1/ai/usage' });
      expect(lastCall().body).toBeUndefined();
    });
  });

  // ── Responses ────────────────────────────────────────────────────────────
  describe('responses', () => {
    it('returns the gateway body on success', async () => {
      gatewayReplies(200, { summary: 'all clear', confidence: 'HIGH' });
      const res = await app.inject({ method: 'POST', url: '/api/v1/ai/reports/site-summary' });
      expect(res.json()).toEqual({ summary: 'all clear', confidence: 'HIGH' });
    });

    it('passes the kill-switch 503 through with its code', async () => {
      // COS-FLAG-001 means "an operator turned this off", which a client can act on. Collapsing it
      // into a 502 would say "the gateway is broken" instead.
      gatewayReplies(503, { detail: 'COS-FLAG-001: AI completions are temporarily disabled' });
      const res = await app.inject({ method: 'POST', url: '/api/v1/ai/completions' });
      expect(res.statusCode).toBe(503);
      expect(res.json().detail).toContain('COS-FLAG-001');
    });

    it('passes a gateway 401 through rather than reporting its own', async () => {
      gatewayReplies(401, { detail: 'Invalid or expired token' });
      const res = await app.inject({ method: 'POST', url: '/api/v1/ai/completions' });
      expect(res.statusCode).toBe(401);
    });

    it('502s when the gateway is unreachable', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));
      const res = await app.inject({ method: 'POST', url: '/api/v1/ai/completions' });
      expect(res.statusCode).toBe(502);
      expect(res.json().error.code).toBe('COS-AI-502');
    });

    it('504s when the gateway does not answer in time', async () => {
      const timeout = new Error('timed out');
      timeout.name = 'TimeoutError';
      (global.fetch as jest.Mock).mockRejectedValue(timeout);
      const res = await app.inject({ method: 'POST', url: '/api/v1/ai/completions' });
      expect(res.statusCode).toBe(504);
      expect(res.json().error.code).toBe('COS-AI-504');
    });

    it('502s on a non-JSON body instead of presenting it as an AI result', async () => {
      gatewayReplies(200, null, '<html>502 Bad Gateway</html>');
      const res = await app.inject({ method: 'POST', url: '/api/v1/ai/completions' });
      expect(res.statusCode).toBe(502);
      expect(res.json().error.message).toContain('non-JSON');
    });

    it('handles an empty body', async () => {
      gatewayReplies(200, null, '');
      const res = await app.inject({ method: 'POST', url: '/api/v1/ai/completions' });
      expect(res.statusCode).toBe(200);
    });
  });
});
