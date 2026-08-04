// Unit tests for AuditInterceptor — auto-logs mutating operations as the app role (RLS-bound).

process.env['APP_DATABASE_URL'] = 'postgresql://app_user@localhost/db';

const txExecuteRaw = jest.fn().mockResolvedValue(undefined);
const txExecuteRawUnsafe = jest.fn().mockResolvedValue(undefined);
const transaction = jest
  .fn()
  .mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({ $executeRaw: txExecuteRaw, $executeRawUnsafe: txExecuteRawUnsafe }),
  );

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $transaction: transaction,
    $disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Captured so the skip-warning can be asserted. That warning is the only signal that an
// AUTHENTICATED mutation produced no audit row — i.e. that this compliance control (QM-4) silently
// stopped working. Previously untested, and the real logger also made this suite print an error
// stack on every run for the deliberately-failing write below.
const loggerWarn = jest.fn();
const loggerError = jest.fn();
jest.mock('@cos/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: (...args: unknown[]) => loggerWarn(...args),
    error: (...args: unknown[]) => loggerError(...args),
    debug: jest.fn(),
  }),
}));

import { AuditInterceptor } from '../audit.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

const TENANT = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const makeCtx = (
  method: string,
  path: string,
  user?: object,
  tenantId?: string,
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ method, path, user, tenantId, ip: '127.0.0.1', headers: {} }),
    }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
  }) as unknown as ExecutionContext;

const makeHandler = (): CallHandler => ({ handle: () => of({ result: 'ok' }) });

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;

  beforeEach(() => {
    txExecuteRaw.mockClear();
    txExecuteRawUnsafe.mockClear();
    transaction.mockClear();
    loggerWarn.mockClear();
    loggerError.mockClear();
    interceptor = new AuditInterceptor();
  });

  it('does NOT write audit log for GET requests', (done) => {
    interceptor
      .intercept(makeCtx('GET', '/api/v1/projects', { user_id: 'u1' }, TENANT), makeHandler())
      .subscribe(() => {
        expect(transaction).not.toHaveBeenCalled();
        done();
      });
  });

  it('writes an audit log for POST (SET LOCAL + INSERT in one transaction)', (done) => {
    interceptor
      .intercept(makeCtx('POST', '/api/v1/projects', { user_id: 'u1' }, TENANT), makeHandler())
      .subscribe(() => {
        setImmediate(() => {
          expect(transaction).toHaveBeenCalledTimes(1);
          expect(txExecuteRawUnsafe).toHaveBeenCalledWith(
            `SET LOCAL app.current_tenant_id = '${TENANT}'`,
          );
          expect(txExecuteRaw).toHaveBeenCalledTimes(1);
          done();
        });
      });
  });

  it('writes an audit log for PATCH requests', (done) => {
    interceptor
      .intercept(makeCtx('PATCH', '/api/v1/projects/p1', { user_id: 'u1' }, TENANT), makeHandler())
      .subscribe(() => {
        setImmediate(() => {
          expect(txExecuteRaw).toHaveBeenCalledTimes(1);
          done();
        });
      });
  });

  it('does NOT write audit log when no user on request (auth endpoints)', (done) => {
    interceptor
      .intercept(makeCtx('POST', '/api/v1/auth/otp/request', undefined, undefined), makeHandler())
      .subscribe(() => {
        expect(transaction).not.toHaveBeenCalled();
        done();
      });
  });

  it('extracts resourceType correctly from path', () => {
    const extract = (interceptor as unknown as { extractResourceType: (p: string) => string })
      .extractResourceType;
    expect(extract('/api/v1/projects/uuid/boq')).toBe('projects');
    expect(extract('/api/v1/procurement/po/123')).toBe('procurement');
  });

  it('writes with null ipAddress when ip is missing (covers ?? null branch)', (done) => {
    const ctx: ExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          path: '/api/v1/projects',
          user: { user_id: 'u1' },
          tenantId: TENANT,
          ip: undefined,
          headers: {},
        }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
    interceptor.intercept(ctx, makeHandler()).subscribe(() => {
      setImmediate(() => {
        expect(txExecuteRaw).toHaveBeenCalledTimes(1);
        done();
      });
    });
  });

  it('logs error when the audit write throws (covers the .catch branch)', (done) => {
    transaction.mockRejectedValueOnce(new Error('DB write failed'));
    interceptor
      .intercept(makeCtx('POST', '/api/v1/projects', { user_id: 'u1' }, TENANT), makeHandler())
      .subscribe(() => {
        setImmediate(() => {
          expect(transaction).toHaveBeenCalledTimes(1);
          expect(loggerError).toHaveBeenCalledWith(
            expect.objectContaining({ actorId: 'u1' }),
            'Failed to write audit log',
          );
          done();
        });
      });
  });

  // The skip-warning path. A mutating request with no actor/tenant is normal on the genuinely
  // anonymous endpoints (login, webhooks) and must stay quiet; the SAME shape carrying a bearer
  // token means an authenticated mutation produced no audit row, which is how this control would
  // disappear unnoticed if tenant context ever stopped reaching interceptors.
  const makeRawCtx = (req: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    }) as unknown as ExecutionContext;

  it('warns when a bearer token is present but actor/tenant context is missing', (done) => {
    interceptor
      .intercept(
        makeRawCtx({
          method: 'POST',
          originalUrl: '/api/v1/projects?x=1',
          ip: '127.0.0.1',
          headers: { authorization: 'Bearer abc' },
        }),
        makeHandler(),
      )
      .subscribe(() => {
        expect(transaction).not.toHaveBeenCalled();
        expect(loggerWarn).toHaveBeenCalledWith(
          {
            method: 'POST',
            // Query string stripped — the audit action records a path, not a URL.
            path: '/api/v1/projects',
            hasActor: false,
            hasTenant: false,
          },
          'audit.skipped — bearer token present but no actor/tenant context',
        );
        done();
      });
  });

  it('warns with an empty path when the request exposes neither originalUrl nor url', (done) => {
    // The last `?? ''` in the warning. The point of the warning is that the control silently
    // stopped working, so it must still fire on a request shape it cannot name.
    interceptor
      .intercept(
        makeRawCtx({ method: 'POST', ip: '1.2.3.4', headers: { authorization: 'Bearer abc' } }),
        makeHandler(),
      )
      .subscribe(() => {
        expect(loggerWarn).toHaveBeenCalledWith(
          expect.objectContaining({ path: '' }),
          expect.any(String),
        );
        done();
      });
  });

  it('stays SILENT for an anonymous mutation (no bearer token)', (done) => {
    interceptor
      .intercept(
        makeRawCtx({ method: 'POST', url: '/api/v1/auth/otp/request', ip: '1.2.3.4', headers: {} }),
        makeHandler(),
      )
      .subscribe(() => {
        // Warning on every login would bury the real signal above.
        expect(loggerWarn).not.toHaveBeenCalled();
        done();
      });
  });

  it('tolerates a request with no headers object at all', (done) => {
    // Some adapter paths hand over a raw ServerResponse-style request; the skip-warning must never
    // itself throw.
    interceptor
      .intercept(
        makeRawCtx({ method: 'DELETE', url: '/api/v1/files/1', ip: '1.2.3.4' }),
        makeHandler(),
      )
      .subscribe(() => {
        expect(loggerWarn).not.toHaveBeenCalled();
        done();
      });
  });

  it('reports hasActor/hasTenant independently when only one is present', (done) => {
    interceptor
      .intercept(
        makeRawCtx({
          method: 'PATCH',
          url: '/api/v1/users/me',
          user: { user_id: 'u9' },
          ip: '1.2.3.4',
          headers: { authorization: 'Bearer abc' },
        }),
        makeHandler(),
      )
      .subscribe(() => {
        expect(loggerWarn).toHaveBeenCalledWith(
          expect.objectContaining({ hasActor: true, hasTenant: false }),
          expect.any(String),
        );
        done();
      });
  });

  it('prefers originalUrl over url when both are present', (done) => {
    // Fastify exposes `url`; other adapters set `originalUrl`. The action string must be stable.
    interceptor
      .intercept(
        makeRawCtx({
          method: 'POST',
          originalUrl: '/api/v1/projects',
          url: '/different',
          user: { user_id: 'u1' },
          tenantId: TENANT,
          ip: '1.2.3.4',
          headers: {},
        }),
        makeHandler(),
      )
      .subscribe(() => {
        setImmediate(() => {
          const values = txExecuteRaw.mock.calls[0]!.slice(1);
          expect(values).toContain('POST /api/v1/projects');
          done();
        });
      });
  });
});

describe('AuditInterceptor onModuleDestroy', () => {
  it('disconnects Prisma on shutdown', async () => {
    const i = new AuditInterceptor();
    await i.onModuleDestroy();
    expect(
      (i as unknown as { prisma: { $disconnect: jest.Mock } }).prisma.$disconnect,
    ).toHaveBeenCalledTimes(1);
  });
});
