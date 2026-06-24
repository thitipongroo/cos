// Unit tests for TenantPrismaService — assertSafeTenantId, run(), onModuleDestroy

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $transaction: jest.fn(),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@cos/database', () => ({
  withRetry: jest.fn((fn: () => unknown) => fn()),
}));

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));

import { UnauthorizedException } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { PrismaClient } from '@prisma/client';

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeService(tenantId: string): TenantPrismaService {
  // resolveContext() reads the tenant id from the authenticated JWT user (req.user.tenant_id), ADR-031.
  const request = { user: { tenant_id: tenantId } } as never;
  return new TenantPrismaService(request);
}

describe('TenantPrismaService', () => {
  // Tenant context is validated LAZILY in run() (ADR-031), not the constructor. resolveContext()
  // is the first statement of run() and throws before any DB client is created, so invalid/missing
  // tenant ids reject the run() promise rather than throwing at construction time.
  describe('tenant validation (lazy, in run())', () => {
    const noop = async (): Promise<undefined> => undefined;

    it('rejects with UnauthorizedException when tenantId is missing', async () => {
      await expect(new TenantPrismaService({} as never).run(noop)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects with UnauthorizedException for non-UUID string (uppercase word)', async () => {
      await expect(makeService('INVALID').run(noop)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects with UnauthorizedException for tenant code format (not a UUID)', async () => {
      await expect(makeService('acme_corp').run(noop)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects with UnauthorizedException for alphanumeric non-UUID', async () => {
      await expect(makeService('tenant123').run(noop)).rejects.toThrow(UnauthorizedException);
    });

    it('constructs without throwing (validation deferred to run)', () => {
      expect(() => makeService(VALID_UUID)).not.toThrow();
    });

    it('constructs successfully for UUID with uppercase hex', () => {
      expect(() => makeService('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).not.toThrow();
    });
  });

  describe('run', () => {
    it('executes fn inside a transaction with SET LOCAL app.current_tenant_id', async () => {
      const executeRawUnsafe = jest.fn().mockResolvedValue(undefined);
      const txMock = { $executeRawUnsafe: executeRawUnsafe };
      // Set up BEFORE constructing service so the new PrismaClient() picks it up
      (PrismaClient as jest.Mock).mockImplementationOnce(() => ({
        $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
        $disconnect: jest.fn().mockResolvedValue(undefined),
      }));

      const service = makeService(VALID_UUID);
      const fn = jest.fn().mockResolvedValue('result');
      const result = await service.run(fn);

      expect(executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.current_tenant_id = '${VALID_UUID}'`,
      );
      expect(fn).toHaveBeenCalledWith(txMock);
      expect(result).toBe('result');
    });
  });

  describe('onModuleDestroy', () => {
    it('disconnects the Prisma client', async () => {
      const disconnectMock = jest.fn().mockResolvedValue(undefined);
      (PrismaClient as jest.Mock).mockImplementationOnce(() => ({
        $transaction: jest.fn(),
        $disconnect: disconnectMock,
      }));
      const service = makeService(VALID_UUID);
      await service.run(async () => undefined); // lazily creates + caches the client (getClient)
      await service.onModuleDestroy();
      expect(disconnectMock).toHaveBeenCalledTimes(1);
    });
  });
});
