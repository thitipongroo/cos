// Unit tests — NotificationPrismaService (Phase 20)
//
// Clients are POOLED PER DATASOURCE URL, not built per run(). The service used to construct a
// PrismaClient (a fresh pg pool + TCP connect + TLS handshake) on every call and disconnect it in a
// finally; that cost was paid 17 times over in NotificationRepository alone, plus once per Kafka
// event. Two tests here still asserted the old per-call $disconnect and had been failing ever since
// the refactor — they are rewritten below to assert the contract the code actually has, and the
// previously untested onModuleDestroy path is covered.
//
// getDbUrlForTenant is mocked to avoid real DB connections.
// run() validates the tenant id and issues SET LOCAL app.current_tenant_id so the notifications-schema
// RLS policies apply (H1 fix — the path previously ran as superuser with no SET LOCAL).

jest.mock('../../tenant/utils/get-db-url', () => ({
  getDbUrlForTenant: jest.fn().mockResolvedValue('postgresql://tenant-db/testdb'),
}));

jest.mock('@prisma/client', () => {
  const mockTx = { $queryRaw: jest.fn(), $executeRawUnsafe: jest.fn() };
  const $transaction = jest
    .fn()
    .mockImplementation(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx));
  const $disconnect = jest.fn().mockResolvedValue(undefined);
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({ $transaction, $disconnect })),
    _mocks: { $transaction, $disconnect, mockTx },
  };
});

// Prisma 7 (ADR-041): the connection URL is passed to the pg driver adapter, not `datasources`.
jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation((cfg: { connectionString: string }) => ({
    __connectionString: cfg.connectionString,
  })),
}));

const { _mocks } = jest.requireMock('@prisma/client') as {
  _mocks: {
    $transaction: jest.Mock;
    $disconnect: jest.Mock;
    mockTx: { $queryRaw: jest.Mock; $executeRawUnsafe: jest.Mock };
  };
};

import { UnauthorizedException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getDbUrlForTenant } from '../../tenant/utils/get-db-url';
import { NotificationPrismaService } from '../notification-prisma.service';

const TENANT_A = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TENANT_B = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

let svc: NotificationPrismaService;

beforeEach(() => {
  jest.resetAllMocks();
  (getDbUrlForTenant as jest.Mock).mockResolvedValue('postgresql://tenant-db/testdb');
  _mocks.$transaction.mockImplementation(async (fn: (tx: typeof _mocks.mockTx) => unknown) =>
    fn(_mocks.mockTx),
  );
  _mocks.mockTx.$executeRawUnsafe.mockResolvedValue(undefined);
  _mocks.$disconnect.mockResolvedValue(undefined);
  (PrismaClient as jest.Mock).mockImplementation(() => ({
    $transaction: _mocks.$transaction,
    $disconnect: _mocks.$disconnect,
  }));
  svc = new NotificationPrismaService();
});

describe('run', () => {
  it('resolves DB URL via getDbUrlForTenant and runs fn inside a transaction', async () => {
    const fn = jest.fn().mockResolvedValue('result');
    const result = await svc.run(TENANT_A, fn);
    expect(getDbUrlForTenant).toHaveBeenCalledWith(TENANT_A);
    expect(PrismaPg).toHaveBeenCalledWith({ connectionString: 'postgresql://tenant-db/testdb' });
    expect(_mocks.$transaction).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(_mocks.mockTx);
    expect(result).toBe('result');
  });

  it('sets RLS tenant context with SET LOCAL app.current_tenant_id before running fn', async () => {
    const order: string[] = [];
    _mocks.mockTx.$executeRawUnsafe.mockImplementation(async () => {
      order.push('set-local');
    });
    const fn = jest.fn().mockImplementation(async () => {
      order.push('fn');
    });
    await svc.run(TENANT_A, fn);
    expect(_mocks.mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      `SET LOCAL app.current_tenant_id = '${TENANT_A}'`,
    );
    expect(order).toEqual(['set-local', 'fn']);
  });

  it('rejects a non-UUID tenant id before opening any connection', async () => {
    await expect(svc.run('tenant-abc', jest.fn())).rejects.toThrow(UnauthorizedException);
    expect(getDbUrlForTenant).not.toHaveBeenCalled();
    expect(PrismaClient).not.toHaveBeenCalled();
  });

  it('returns the value from fn', async () => {
    const expected = [{ id: 1 }];
    const result = await svc.run(TENANT_A, async () => expected);
    expect(result).toEqual(expected);
  });

  // The pooling contract. These two replace tests that asserted a per-call $disconnect — the
  // behaviour the service deliberately stopped having. Disconnecting per call is what made every
  // notification pay for a new pg pool, TCP connect and TLS handshake.
  it('does NOT disconnect after a successful run — the client is pooled for reuse', async () => {
    await svc.run(TENANT_A, jest.fn().mockResolvedValue(undefined));
    expect(_mocks.$disconnect).not.toHaveBeenCalled();
  });

  it('does NOT disconnect when fn throws — a failed query must not close a shared pool', async () => {
    const error = new Error('db error');
    await expect(svc.run(TENANT_A, jest.fn().mockRejectedValue(error))).rejects.toThrow('db error');
    // Closing here would tear the pool out from under every other in-flight caller sharing this URL.
    expect(_mocks.$disconnect).not.toHaveBeenCalled();
  });

  it('creates one client PER DATASOURCE URL, not per call', async () => {
    (getDbUrlForTenant as jest.Mock)
      .mockResolvedValueOnce('postgresql://db1')
      .mockResolvedValueOnce('postgresql://db2');

    await svc.run(TENANT_A, jest.fn().mockResolvedValue(undefined));
    await svc.run(TENANT_B, jest.fn().mockResolvedValue(undefined));

    expect(PrismaClient).toHaveBeenCalledTimes(2);
    expect(PrismaPg).toHaveBeenNthCalledWith(1, { connectionString: 'postgresql://db1' });
    expect(PrismaPg).toHaveBeenNthCalledWith(2, { connectionString: 'postgresql://db2' });
    expect(getDbUrlForTenant).toHaveBeenNthCalledWith(1, TENANT_A);
    expect(getDbUrlForTenant).toHaveBeenNthCalledWith(2, TENANT_B);
  });

  it('reuses one client for two tenants that share a datasource URL (the point of pooling)', async () => {
    // Shared-DB tenants (STARTER/PROFESSIONAL) all resolve to APP_DATABASE_URL. Building a client
    // each time would defeat the refactor entirely while still passing a per-URL assertion.
    (getDbUrlForTenant as jest.Mock).mockResolvedValue('postgresql://shared');
    await svc.run(TENANT_A, jest.fn().mockResolvedValue(undefined));
    await svc.run(TENANT_B, jest.fn().mockResolvedValue(undefined));
    expect(PrismaClient).toHaveBeenCalledTimes(1);
  });
});

// ADR-034 / Rule 39 — pooled clients outlive the call, so something must close them. This path had
// no test at all before: the refactor moved the disconnect here and the suite never followed.
describe('onModuleDestroy', () => {
  it('disconnects every pooled client', async () => {
    (getDbUrlForTenant as jest.Mock)
      .mockResolvedValueOnce('postgresql://db1')
      .mockResolvedValueOnce('postgresql://db2');
    await svc.run(TENANT_A, jest.fn().mockResolvedValue(undefined));
    await svc.run(TENANT_B, jest.fn().mockResolvedValue(undefined));

    await svc.onModuleDestroy();
    expect(_mocks.$disconnect).toHaveBeenCalledTimes(2);
  });

  it('is safe when nothing was ever pooled', async () => {
    await expect(svc.onModuleDestroy()).resolves.toBeUndefined();
    expect(_mocks.$disconnect).not.toHaveBeenCalled();
  });

  it('clears the pool so a later run rebuilds rather than reusing a closed client', async () => {
    (getDbUrlForTenant as jest.Mock).mockResolvedValue('postgresql://shared');
    await svc.run(TENANT_A, jest.fn().mockResolvedValue(undefined));
    await svc.onModuleDestroy();
    await svc.run(TENANT_A, jest.fn().mockResolvedValue(undefined));
    // A stale map entry here would hand out a disconnected client after a hot reload / re-init.
    expect(PrismaClient).toHaveBeenCalledTimes(2);
  });
});
