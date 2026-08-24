// Unit tests for TenantPrismaService — assertSafeTenantId, getClient (URL resolution + caching),
// run(), onModuleDestroy. The service is a singleton that reads tenant context from CLS (nestjs-cls),
// so tests establish context via the real ClsService (ClsServiceManager.getClsService().run()).

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $transaction: jest.fn(),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Prisma 7 (ADR-041): the connection URL is passed to the pg driver adapter, not `datasources`.
jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation((cfg: { connectionString: string }) => ({
    __connectionString: cfg.connectionString,
  })),
}));

jest.mock('@cos/database', () => ({
  withRetry: jest.fn((fn: () => unknown) => fn()),
}));

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));

import { UnauthorizedException } from '@nestjs/common';
import { ClsServiceManager } from 'nestjs-cls';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// createPrismaClient now hands PrismaPg a SHARED pg.Pool (one per connection string) instead of a
// bare `{ connectionString }` config — see shared/prisma/create-prisma-client.ts. What these tests
// care about is unchanged and still worth asserting: WHICH datasource each client was routed to.
// Read it back off the pool the adapter was constructed with.
function adapterUrl(nth: number): string | undefined {
  const arg = (PrismaPg as jest.Mock).mock.calls[nth]?.[0] as
    { options?: { connectionString?: string }; connectionString?: string } | undefined;
  return arg?.options?.connectionString ?? arg?.connectionString;
}

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// Run fn inside a CLS context, optionally seeding the tenant context the service reads. Passing
// store=null runs inside an active context with nothing set (clsTenantId() → ''); calling the service
// outside runInCls() entirely exercises the cls.isActive()===false path.
function runInCls<T>(store: Record<string, string> | null, fn: () => Promise<T>): Promise<T> {
  const cls = ClsServiceManager.getClsService();
  return cls.run(async () => {
    if (store) for (const [k, v] of Object.entries(store)) cls.set(k, v);
    return fn();
  });
}

describe('TenantPrismaService', () => {
  const ORIGINAL_ENV = { ...process.env };
  const noop = async (): Promise<undefined> => undefined;

  beforeEach(() => {
    (PrismaClient as jest.Mock).mockClear();
    (PrismaPg as jest.Mock).mockClear();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe('tenant validation (lazy, in run())', () => {
    it('rejects with UnauthorizedException when no CLS context is active', async () => {
      // No runInCls wrapper → cls.isActive() is false → clsTenantId() returns ''.
      await expect(new TenantPrismaService().run(noop)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects with UnauthorizedException when CLS is active but tenantId is unset', async () => {
      const svc = new TenantPrismaService();
      await expect(runInCls(null, () => svc.run(noop))).rejects.toThrow(UnauthorizedException);
    });

    it('rejects with UnauthorizedException for a non-UUID tenant id', async () => {
      const svc = new TenantPrismaService();
      await expect(runInCls({ tenantId: 'INVALID' }, () => svc.run(noop))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects with UnauthorizedException for tenant-code format (not a UUID)', async () => {
      const svc = new TenantPrismaService();
      await expect(runInCls({ tenantId: 'acme_corp' }, () => svc.run(noop))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('accepts a UUID with uppercase hex', async () => {
      process.env['APP_DATABASE_URL'] = 'postgresql://app@localhost/db';
      const svc = new TenantPrismaService();
      const upper = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
      (PrismaClient as jest.Mock).mockImplementationOnce(() => ({
        $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) =>
          cb({ $executeRawUnsafe: jest.fn() }),
        ),
        $disconnect: jest.fn(),
      }));
      await expect(runInCls({ tenantId: upper }, () => svc.run(noop))).resolves.toBeUndefined();
    });
  });

  describe('run', () => {
    it('executes fn inside a transaction with SET LOCAL app.current_tenant_id', async () => {
      process.env['APP_DATABASE_URL'] = 'postgresql://app@localhost/db';
      const executeRawUnsafe = jest.fn().mockResolvedValue(undefined);
      const txMock = { $executeRawUnsafe: executeRawUnsafe };
      (PrismaClient as jest.Mock).mockImplementationOnce(() => ({
        $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
        $disconnect: jest.fn().mockResolvedValue(undefined),
      }));

      const svc = new TenantPrismaService();
      const fn = jest.fn().mockResolvedValue('result');
      const result = await runInCls({ tenantId: VALID_UUID }, () => svc.run(fn));

      expect(executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.current_tenant_id = '${VALID_UUID}'`,
      );
      expect(fn).toHaveBeenCalledWith(txMock);
      expect(result).toBe('result');
    });
  });

  describe('getClient — datasource URL resolution & caching', () => {
    function stubClient(): void {
      (PrismaClient as jest.Mock).mockImplementation(() => ({
        $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) =>
          cb({ $executeRawUnsafe: jest.fn() }),
        ),
        $disconnect: jest.fn().mockResolvedValue(undefined),
      }));
    }

    it('uses APP_DATABASE_URL for shared tenants', async () => {
      process.env['APP_DATABASE_URL'] = 'postgresql://app@localhost/app';
      delete process.env['DATABASE_URL'];
      stubClient();
      await runInCls({ tenantId: VALID_UUID }, () => new TenantPrismaService().run(noop));
      expect(adapterUrl(0)).toBe('postgresql://app@localhost/app');
    });

    it('throws when APP_DATABASE_URL is unset — never falls back to the superuser DATABASE_URL', async () => {
      // H1: a shared tenant with no app-role URL must fail loudly rather than connect as a
      // RLS-bypassing superuser. DATABASE_URL being present must NOT rescue it.
      delete process.env['APP_DATABASE_URL'];
      process.env['DATABASE_URL'] = 'postgresql://super@localhost/db';
      stubClient();
      await expect(
        runInCls({ tenantId: VALID_UUID }, () => new TenantPrismaService().run(noop)),
      ).rejects.toThrow(/APP_DATABASE_URL is not set/);
      expect(PrismaPg).not.toHaveBeenCalled();
    });

    it('uses the dedicated DB URL when present (enterprise tenant)', async () => {
      process.env['APP_DATABASE_URL'] = 'postgresql://app@localhost/app';
      stubClient();
      const dedicated = 'postgresql://app@dedicated/ent';
      await runInCls({ tenantId: VALID_UUID, dedicatedDbUrl: dedicated }, () =>
        new TenantPrismaService().run(noop),
      );
      expect(adapterUrl(0)).toBe(dedicated);
    });

    it('uses the dedicated DB URL even when APP_DATABASE_URL is unset (enterprise never needs it)', async () => {
      delete process.env['APP_DATABASE_URL'];
      stubClient();
      const dedicated = 'postgresql://app@dedicated/ent';
      await runInCls({ tenantId: VALID_UUID, dedicatedDbUrl: dedicated }, () =>
        new TenantPrismaService().run(noop),
      );
      expect(adapterUrl(0)).toBe(dedicated);
    });

    it('reuses a cached client for the same URL across runs', async () => {
      process.env['APP_DATABASE_URL'] = 'postgresql://app@localhost/app';
      stubClient();
      const svc = new TenantPrismaService();
      await runInCls({ tenantId: VALID_UUID }, () => svc.run(noop));
      await runInCls({ tenantId: VALID_UUID }, () => svc.run(noop));
      expect(PrismaClient as jest.Mock).toHaveBeenCalledTimes(1);
    });
  });

  describe('onModuleDestroy', () => {
    it('disconnects every cached Prisma client', async () => {
      process.env['APP_DATABASE_URL'] = 'postgresql://app@localhost/app';
      const disconnectMock = jest.fn().mockResolvedValue(undefined);
      (PrismaClient as jest.Mock).mockImplementationOnce(() => ({
        $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) =>
          cb({ $executeRawUnsafe: jest.fn() }),
        ),
        $disconnect: disconnectMock,
      }));
      const svc = new TenantPrismaService();
      await runInCls({ tenantId: VALID_UUID }, () => svc.run(noop)); // populates the client cache
      await svc.onModuleDestroy();
      expect(disconnectMock).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when no clients were created', async () => {
      await expect(new TenantPrismaService().onModuleDestroy()).resolves.toBeUndefined();
    });
  });
});
