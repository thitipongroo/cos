// Unit tests for TenantPrismaService — assertSafeTenantCode, run(), onModuleDestroy

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

function makeService(tenantCode: string): TenantPrismaService {
  const request = { tenantCode } as never;
  return new TenantPrismaService(request);
}

describe('TenantPrismaService', () => {
  describe('constructor', () => {
    it('throws UnauthorizedException when tenantCode is missing', () => {
      expect(() => new TenantPrismaService({} as never)).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for invalid tenant code (uppercase)', () => {
      expect(() => makeService('INVALID')).toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for tenant code with special chars', () => {
      expect(() => makeService('tenant-code!')).toThrow(UnauthorizedException);
    });

    it('constructs successfully for valid tenant code', () => {
      expect(() => makeService('acme_corp')).not.toThrow();
    });

    it('constructs successfully for alphanumeric tenant code', () => {
      expect(() => makeService('tenant123')).not.toThrow();
    });
  });

  describe('run', () => {
    it('executes fn inside a transaction with SET LOCAL search_path', async () => {
      const executeRawUnsafe = jest.fn().mockResolvedValue(undefined);
      const txMock = { $executeRawUnsafe: executeRawUnsafe };
      // Set up BEFORE constructing service so the new PrismaClient() picks it up
      (PrismaClient as jest.Mock).mockImplementationOnce(() => ({
        $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
        $disconnect: jest.fn().mockResolvedValue(undefined),
      }));

      const service = makeService('acme');
      const fn = jest.fn().mockResolvedValue('result');
      const result = await service.run(fn);

      expect(executeRawUnsafe).toHaveBeenCalledWith('SET LOCAL search_path = "acme", public');
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
      const service = makeService('acme');
      await service.onModuleDestroy();
      expect(disconnectMock).toHaveBeenCalledTimes(1);
    });
  });
});
