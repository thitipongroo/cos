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
