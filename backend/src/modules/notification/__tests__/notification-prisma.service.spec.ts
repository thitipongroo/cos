// Unit tests — NotificationPrismaService (Phase 20)
// PrismaClient is created per run() call, not in constructor.
// getDbUrlForTenant is mocked to avoid real DB connections.

jest.mock('../../tenant/utils/get-db-url', () => ({
  getDbUrlForTenant: jest.fn().mockResolvedValue('postgresql://tenant-db/testdb'),
}));

jest.mock('@prisma/client', () => {
  const mockTx = { $queryRaw: jest.fn() };
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
    mockTx: { $queryRaw: jest.Mock };
  };
};

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getDbUrlForTenant } from '../../tenant/utils/get-db-url';
import { NotificationPrismaService } from '../notification-prisma.service';

let svc: NotificationPrismaService;

beforeEach(() => {
  jest.resetAllMocks();
  (getDbUrlForTenant as jest.Mock).mockResolvedValue('postgresql://tenant-db/testdb');
  _mocks.$transaction.mockImplementation(async (fn: (tx: typeof _mocks.mockTx) => unknown) =>
    fn(_mocks.mockTx),
  );
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
    const result = await svc.run('tenant-abc', fn);
    expect(getDbUrlForTenant).toHaveBeenCalledWith('tenant-abc');
    expect(PrismaPg).toHaveBeenCalledWith({ connectionString: 'postgresql://tenant-db/testdb' });
    expect(_mocks.$transaction).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(_mocks.mockTx);
    expect(result).toBe('result');
  });

  it('returns the value from fn', async () => {
    const expected = [{ id: 1 }];
    const result = await svc.run('tenant-abc', async () => expected);
    expect(result).toEqual(expected);
  });

  it('calls $disconnect in finally after successful run', async () => {
    await svc.run('tenant-abc', jest.fn().mockResolvedValue(undefined));
    expect(_mocks.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('calls $disconnect in finally even when fn throws', async () => {
    const error = new Error('db error');
    await expect(svc.run('tenant-abc', jest.fn().mockRejectedValue(error))).rejects.toThrow(
      'db error',
    );
    expect(_mocks.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('creates a new PrismaClient per call with the resolved DB URL', async () => {
    (getDbUrlForTenant as jest.Mock)
      .mockResolvedValueOnce('postgresql://db1')
      .mockResolvedValueOnce('postgresql://db2');

    await svc.run('t1', jest.fn().mockResolvedValue(undefined));
    await svc.run('t2', jest.fn().mockResolvedValue(undefined));

    expect(PrismaClient).toHaveBeenCalledTimes(2);
    expect(PrismaPg).toHaveBeenNthCalledWith(1, { connectionString: 'postgresql://db1' });
    expect(PrismaPg).toHaveBeenNthCalledWith(2, { connectionString: 'postgresql://db2' });
    expect(getDbUrlForTenant).toHaveBeenNthCalledWith(1, 't1');
    expect(getDbUrlForTenant).toHaveBeenNthCalledWith(2, 't2');
  });
});
