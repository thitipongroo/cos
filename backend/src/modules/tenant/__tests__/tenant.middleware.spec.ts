// Unit tests for TenantMiddleware — tenant context injection

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $queryRaw: jest.fn(),
  })),
}));

import { TenantMiddleware, TenantRequest } from '../tenant.middleware';
import { PrismaClient } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import { Response, NextFunction } from 'express';

const noop = jest.fn() as NextFunction;
const res = {} as Response;

describe('TenantMiddleware', () => {
  let middleware: TenantMiddleware;
  let prismaMock: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    middleware = new TenantMiddleware();
    prismaMock = (middleware as unknown as { platformPrisma: jest.Mocked<PrismaClient> }).platformPrisma;
    jest.clearAllMocks();
  });

  it('bypasses tenant lookup for /api/v1/auth/* paths', async () => {
    const req = { path: '/api/v1/auth/otp/request', user: undefined } as TenantRequest;
    await middleware.use(req, res, noop);
    expect(noop).toHaveBeenCalledTimes(1);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('bypasses tenant lookup for /api/v1/health/* paths', async () => {
    const req = { path: '/api/v1/health/live', user: undefined } as TenantRequest;
    await middleware.use(req, res, noop);
    expect(noop).toHaveBeenCalledTimes(1);
  });

  it('bypasses tenant lookup for /api/v1/admin/* paths', async () => {
    const req = { path: '/api/v1/admin/tenants', user: undefined } as TenantRequest;
    await middleware.use(req, res, noop);
    expect(noop).toHaveBeenCalledTimes(1);
  });

  it('throws UnauthorizedException when no tenantId in JWT', async () => {
    const req = {
      path: '/api/v1/projects',
      user: { userId: 'user-1', role: 'PROJECT_MANAGER' }, // no tenantId
    } as unknown as TenantRequest;
    await expect(middleware.use(req, res, noop)).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when tenant not found or inactive', async () => {
    (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([]);
    const req = {
      path: '/api/v1/projects',
      user: { tenantId: 'tenant-x', userId: 'user-1', role: 'PROJECT_MANAGER' },
    } as unknown as TenantRequest;
    await expect(middleware.use(req, res, noop)).rejects.toThrow(UnauthorizedException);
  });

  it('injects tenantCode and userId into request', async () => {
    (prismaMock.$queryRaw as jest.Mock).mockResolvedValue([{ tenant_code: 'acme_corp' }]);
    const req = {
      path: '/api/v1/projects',
      user: { tenantId: 'tenant-1', userId: 'user-1', role: 'PROJECT_MANAGER' },
    } as unknown as TenantRequest;
    await middleware.use(req, res, noop);
    expect(req.tenantCode).toBe('acme_corp');
    expect(req.userId).toBe('user-1');
    expect(noop).toHaveBeenCalledTimes(1);
  });
});
