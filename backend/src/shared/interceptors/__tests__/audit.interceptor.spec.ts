// Unit tests for AuditInterceptor — auto-logs mutating operations

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { AuditInterceptor } from '../audit.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { PrismaClient } from '@prisma/client';

const makeCtx = (method: string, path: string, user?: object, tenantId?: string): ExecutionContext => ({
  switchToHttp: () => ({
    getRequest: () => ({ method, path, user, tenantId, ip: '127.0.0.1', headers: {} }),
  }),
  getHandler: jest.fn(),
  getClass: jest.fn(),
} as unknown as ExecutionContext);

const makeHandler = (): CallHandler => ({ handle: () => of({ result: 'ok' }) });

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let prismaMock: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    interceptor = new AuditInterceptor();
    prismaMock = (interceptor as unknown as { prisma: jest.Mocked<PrismaClient> }).prisma;
  });

  it('does NOT write audit log for GET requests', (done) => {
    const ctx = makeCtx('GET', '/api/v1/projects', { cos_user_id: 'u1' }, 'tenant-1');
    interceptor.intercept(ctx, makeHandler()).subscribe(() => {
      expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
      done();
    });
  });

  it('writes audit log for POST requests with user and tenant', (done) => {
    const ctx = makeCtx('POST', '/api/v1/projects', { cos_user_id: 'u1' }, 'tenant-1');
    interceptor.intercept(ctx, makeHandler()).subscribe(() => {
      // Audit write is async (fire-and-forget) — give it a tick
      setImmediate(() => {
        expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
        done();
      });
    });
  });

  it('writes audit log for PATCH requests', (done) => {
    const ctx = makeCtx('PATCH', '/api/v1/projects/p1', { cos_user_id: 'u1' }, 'tenant-1');
    interceptor.intercept(ctx, makeHandler()).subscribe(() => {
      setImmediate(() => {
        expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
        done();
      });
    });
  });

  it('does NOT write audit log when no user on request (auth endpoints)', (done) => {
    const ctx = makeCtx('POST', '/api/v1/auth/otp/request', undefined, undefined);
    interceptor.intercept(ctx, makeHandler()).subscribe(() => {
      expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
      done();
    });
  });

  it('extracts resourceType correctly from path', () => {
    const extract = (interceptor as unknown as { extractResourceType: (p: string) => string }).extractResourceType;
    expect(extract('/api/v1/projects/uuid/boq')).toBe('projects');
    expect(extract('/api/v1/procurement/po/123')).toBe('procurement');
  });
});
