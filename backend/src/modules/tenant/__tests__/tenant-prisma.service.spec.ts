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
  const request = { tenantId } as never;
  return new TenantPrismaService(request);
}

describe('TenantPrismaService', () => {
  describe('constructor', () => {
    it('throws UnauthorizedException when tenantId is missing', () => {
      expect(() => new TenantPrismaService({} as never)).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for non-UUID string (uppercase word)', () => {
      expect(() => makeService('INVALID')).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for tenant code format (not a UUID)', () => {
      expect(() => makeService('acme_corp')).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for alphanumeric non-UUID', () => {
      expect(() => makeService('tenant123')).toThrow(UnauthorizedException);
    });

    it('constructs successfully for valid UUID tenant id', () => {
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
      await service.onModuleDestroy();
      expect(disconnectMock).toHaveBeenCalledTimes(1);
    });
  });
});
