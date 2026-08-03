import { CloudflareWafMiddleware } from '../cloudflare-waf.middleware';
import type { IncomingMessage, ServerResponse } from 'http';

function makeReq(
  headers: Record<string, string | undefined> = {},
  remoteAddress?: string,
): IncomingMessage {
  return {
    headers,
    url: '/api/v1/test',
    socket: { remoteAddress },
  } as unknown as IncomingMessage;
}

function makeRes(): { res: ServerResponse; statusCode: number; body: string } {
  const ctx = { statusCode: 0, body: '' };
  const res = {
    statusCode: 200,
    setHeader: jest.fn(),
    end: jest.fn((b: string) => {
      ctx.body = b;
      ctx.statusCode = (res as unknown as { statusCode: number }).statusCode;
    }),
  } as unknown as ServerResponse;
  return { res, ...ctx };
}

describe('CloudflareWafMiddleware', () => {
  let middleware: CloudflareWafMiddleware;
  const next = jest.fn();
  const originalEnv = process.env['NODE_ENV'];
  const originalEnforce = process.env['WAF_ORIGIN_ENFORCE'];
  const originalCidrs = process.env['TRUSTED_PROXY_CIDRS'];

  beforeEach(() => {
    middleware = new CloudflareWafMiddleware();
  });

  afterEach(() => {
    process.env['NODE_ENV'] = originalEnv;
    if (originalEnforce === undefined) delete process.env['WAF_ORIGIN_ENFORCE'];
    else process.env['WAF_ORIGIN_ENFORCE'] = originalEnforce;
    if (originalCidrs === undefined) delete process.env['TRUSTED_PROXY_CIDRS'];
    else process.env['TRUSTED_PROXY_CIDRS'] = originalCidrs;
    jest.clearAllMocks();
  });

  // ── Layer 1: CF-Ray presence ──────────────────────────────────────────────

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

  // ── Layer 2: peer-address allowlist ───────────────────────────────────────
  // Default OFF (staged rollout, as with MFA_ENFORCE / WEBHOOK_REPLAY_PROTECTION).

  it('does not enforce the allowlist unless WAF_ORIGIN_ENFORCE=true', () => {
    process.env['NODE_ENV'] = 'test';
    process.env['TRUSTED_PROXY_CIDRS'] = '173.245.48.0/20';
    const { res } = makeRes();
    middleware.use(makeReq({}, '8.8.8.8'), res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('passes a peer inside a trusted range when enforcing', () => {
    process.env['NODE_ENV'] = 'test';
    process.env['WAF_ORIGIN_ENFORCE'] = 'true';
    process.env['TRUSTED_PROXY_CIDRS'] = '173.245.48.0/20,2400:cb00::/32';
    const { res } = makeRes();
    middleware.use(makeReq({}, '173.245.48.9'), res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('accepts an IPv4 peer surfaced in dual-stack mapped form', () => {
    process.env['NODE_ENV'] = 'test';
    process.env['WAF_ORIGIN_ENFORCE'] = 'true';
    process.env['TRUSTED_PROXY_CIDRS'] = '173.245.48.0/20';
    const { res } = makeRes();
    middleware.use(makeReq({}, '::ffff:173.245.48.9'), res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('blocks a peer outside every trusted range', () => {
    process.env['NODE_ENV'] = 'test';
    process.env['WAF_ORIGIN_ENFORCE'] = 'true';
    process.env['TRUSTED_PROXY_CIDRS'] = '173.245.48.0/20';
    const { res } = makeRes();
    middleware.use(makeReq({}, '8.8.8.8'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect((res as unknown as { statusCode: number }).statusCode).toBe(403);
  });

  // A forged CF-Ray is exactly the bypass layer 1 cannot see; the peer check is what stops it.
  it('blocks a forged CF-Ray from an untrusted peer', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['WAF_ORIGIN_ENFORCE'] = 'true';
    process.env['TRUSTED_PROXY_CIDRS'] = '173.245.48.0/20';
    const { res } = makeRes();
    middleware.use(makeReq({ 'cf-ray': 'forged-by-attacker' }, '8.8.8.8'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect((res as unknown as { statusCode: number }).statusCode).toBe(403);
  });

  it('fails closed when enforcement is on but no ranges are configured', () => {
    process.env['NODE_ENV'] = 'test';
    process.env['WAF_ORIGIN_ENFORCE'] = 'true';
    delete process.env['TRUSTED_PROXY_CIDRS'];
    const { res } = makeRes();
    middleware.use(makeReq({}, '173.245.48.9'), res, next);
    expect(next).not.toHaveBeenCalled();
    expect((res as unknown as { statusCode: number }).statusCode).toBe(403);
  });

  it('fails closed when the peer address is unavailable', () => {
    process.env['NODE_ENV'] = 'test';
    process.env['WAF_ORIGIN_ENFORCE'] = 'true';
    process.env['TRUSTED_PROXY_CIDRS'] = '173.245.48.0/20';
    const { res } = makeRes();
    middleware.use(makeReq({}, undefined), res, next);
    expect(next).not.toHaveBeenCalled();
  });
});
