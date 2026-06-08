import { CloudflareWafMiddleware } from '../cloudflare-waf.middleware';
import type { IncomingMessage, ServerResponse } from 'http';

function makeReq(headers: Record<string, string | undefined> = {}): IncomingMessage {
  return { headers, url: '/api/v1/test' } as unknown as IncomingMessage;
}

function makeRes(): { res: ServerResponse; statusCode: number; body: string } {
  const ctx = { statusCode: 0, body: '' };
  const res = {
    statusCode: 200,
    end: jest.fn((b: string) => {
      ctx.body = b;
      ctx.statusCode = (res as unknown as { statusCode: number }).statusCode;
    }),
  } as unknown as ServerResponse;
  return { res, ...ctx };
}

describe('CloudflareWafMiddleware', () => {
  const middleware = new CloudflareWafMiddleware();
  const next = jest.fn();
  const originalEnv = process.env['NODE_ENV'];

  afterEach(() => {
    process.env['NODE_ENV'] = originalEnv;
    jest.clearAllMocks();
  });

  it('passes request with CF-Ray header in production', () => {
    process.env['NODE_ENV'] = 'production';
    const { res } = makeRes();
    middleware.use(makeReq({ 'cf-ray': '7d3b9abc-SIN' }), res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('blocks request without CF-Ray in production (WAF bypass detection)', () => {
    process.env['NODE_ENV'] = 'production';
    const { res } = makeRes();
    middleware.use(makeReq({}), res, next);
    expect(next).not.toHaveBeenCalled();
    expect((res as unknown as { statusCode: number }).statusCode).toBe(403);
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('COS-SEC-001'));
  });

  it('passes request without CF-Ray in development (no enforcement)', () => {
    process.env['NODE_ENV'] = 'development';
    const { res } = makeRes();
    middleware.use(makeReq({}), res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('passes request without CF-Ray in test environment', () => {
    process.env['NODE_ENV'] = 'test';
    const { res } = makeRes();
    middleware.use(makeReq({}), res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
