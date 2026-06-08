import { SecureHeadersMiddleware } from '../secure-headers.middleware';
import type { IncomingMessage, ServerResponse } from 'http';

function makeRes(): {
  res: Pick<ServerResponse, 'setHeader'>;
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: jest.fn((k: string, v: string) => {
      headers[k] = v;
    }),
  } as unknown as Pick<ServerResponse, 'setHeader'>;
  return { res, headers };
}

describe('SecureHeadersMiddleware', () => {
  const middleware = new SecureHeadersMiddleware();
  const next = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  it('sets Strict-Transport-Security', () => {
    const { res, headers } = makeRes();
    middleware.use({} as IncomingMessage, res as ServerResponse, next);
    expect(headers['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains');
  });

  it('sets X-Frame-Options: DENY', () => {
    const { res, headers } = makeRes();
    middleware.use({} as IncomingMessage, res as ServerResponse, next);
    expect(headers['X-Frame-Options']).toBe('DENY');
  });

  it('sets X-Content-Type-Options: nosniff', () => {
    const { res, headers } = makeRes();
    middleware.use({} as IncomingMessage, res as ServerResponse, next);
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });

  it("sets Content-Security-Policy: default-src 'self'", () => {
    const { res, headers } = makeRes();
    middleware.use({} as IncomingMessage, res as ServerResponse, next);
    expect(headers['Content-Security-Policy']).toBe("default-src 'self'");
  });

  it('sets Referrer-Policy: strict-origin-when-cross-origin', () => {
    const { res, headers } = makeRes();
    middleware.use({} as IncomingMessage, res as ServerResponse, next);
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('calls next()', () => {
    const { res } = makeRes();
    middleware.use({} as IncomingMessage, res as ServerResponse, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
