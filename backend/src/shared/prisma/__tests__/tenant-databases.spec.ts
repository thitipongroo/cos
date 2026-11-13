// tenant-databases (D54, 2026-11-13): the dedicated side of every tenant sweep. On real Postgres:
// test/provisioning/08-dedicated-db-sweeps.integration.spec.ts.

const created: string[] = [];
const transaction = jest.fn();
const txOptions: unknown[] = [];
jest.mock('../create-prisma-client', () => ({
  createPrismaClient: (url: string) => {
    created.push(url);
    return {
      $transaction: (fn: (tx: unknown) => unknown, opts?: unknown) => {
        txOptions.push(opts);
        return transaction(url, fn);
      },
      $disconnect: jest.fn(),
    };
  },
}));
jest.mock('../../crypto/dedicated-db-url-cipher', () => ({
  decryptDedicatedDbUrl: (s: string) => {
    if (s === 'bad') throw new Error('Stored dedicated_db_url could not be decrypted');
    return `decrypted:${s}`;
  },
}));
const enterTenantTx = jest.fn();
jest.mock('../tenant-tx', () => ({
  enterTenantTx: (...a: unknown[]) => enterTenantTx(...a),
}));
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import type { PrismaClient } from '@prisma/client';
import {
  disconnectDedicatedClients,
  forEachDedicatedTenant,
  listDedicatedTenants,
  sharedTenantFilter,
} from '../tenant-databases';
import { Prisma } from '@prisma/client';

const platform = (rows: Array<{ tenant_id: string; dedicated_db_url: string }>) => {
  const q = jest.fn().mockResolvedValue(rows);
  return { client: { $queryRaw: q } as unknown as PrismaClient, q };
};

beforeEach(async () => {
  await disconnectDedicatedClients();
  created.length = 0;
  txOptions.length = 0;
  transaction
    .mockReset()
    .mockImplementation((_url: string, fn: (tx: unknown) => unknown) => fn({ tx: true }));
  enterTenantTx.mockReset().mockResolvedValue(undefined);
});

describe('listDedicatedTenants', () => {
  it('reads only active tenants with a dedicated database, URLs decrypted', async () => {
    const p = platform([{ tenant_id: 't1', dedicated_db_url: 'enc1' }]);
    await expect(listDedicatedTenants(p.client)).resolves.toEqual([
      { tenantId: 't1', url: 'decrypted:enc1' },
    ]);
    const sql = (p.q.mock.calls[0]![0] as string[]).join('?');
    expect(sql).toContain('is_active');
    expect(sql).toContain('dedicated_db_url IS NOT NULL');
  });
});

describe('forEachDedicatedTenant', () => {
  it("runs the job in each tenant's own database, inside a transaction entered for that tenant", async () => {
    const p = platform([
      { tenant_id: 't1', dedicated_db_url: 'a' },
      { tenant_id: 't2', dedicated_db_url: 'b' },
    ]);
    const out = await forEachDedicatedTenant(p.client, 'job', async (_tx, t) => t.tenantId);
    expect(out.map((o) => o.result)).toEqual(['t1', 't2']);
    expect(created).toEqual(['decrypted:a', 'decrypted:b']);
    expect(enterTenantTx).toHaveBeenNthCalledWith(1, { tx: true }, 't1', false);
    expect(enterTenantTx).toHaveBeenNthCalledWith(2, { tx: true }, 't2', false);
  });

  it('reuses one client per database across runs', async () => {
    const p = platform([{ tenant_id: 't1', dedicated_db_url: 'a' }]);
    await forEachDedicatedTenant(p.client, 'job', async () => 1);
    await forEachDedicatedTenant(p.client, 'job', async () => 1);
    expect(created).toEqual(['decrypted:a']);
  });

  it('skips a tenant whose database fails and goes on with the rest', async () => {
    const p = platform([
      { tenant_id: 't1', dedicated_db_url: 'a' },
      { tenant_id: 't2', dedicated_db_url: 'b' },
    ]);
    transaction.mockImplementation((url: string, fn: (tx: unknown) => unknown) =>
      url === 'decrypted:a' ? Promise.reject(new Error('connection refused')) : fn({ tx: true }),
    );
    const out = await forEachDedicatedTenant(p.client, 'job', async (_tx, t) => t.tenantId);
    expect(out.map((o) => o.result)).toEqual(['t2']);
  });
});

describe('forEachDedicatedTenant — failures and the deadline', () => {
  it('leaves out a tenant whose URL does not decrypt, and goes on with the rest', async () => {
    const p = platform([
      { tenant_id: 't1', dedicated_db_url: 'bad' },
      { tenant_id: 't2', dedicated_db_url: 'b' },
    ]);
    const out = await forEachDedicatedTenant(p.client, 'job', async (_tx, t) => t.tenantId);
    expect(out.map((o) => o.result)).toEqual(['t2']);
  });

  it('returns nothing, without throwing, when the list itself fails', async () => {
    const client = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('shared db down')),
    } as unknown as PrismaClient;
    await expect(forEachDedicatedTenant(client, 'job', async () => 1)).resolves.toEqual([]);
  });

  it('gives each tenant only the time left before the deadline, and starts none after it', async () => {
    const p = platform([
      { tenant_id: 't1', dedicated_db_url: 'a' },
      { tenant_id: 't2', dedicated_db_url: 'b' },
    ]);
    let now = 1_000_000;
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const out = await forEachDedicatedTenant(
        p.client,
        'job',
        async () => {
          now += 60_000; // the first tenant uses up the whole minute
          return 1;
        },
        1_000_000 + 60_000,
      );
      expect(out).toHaveLength(1);
      expect(txOptions).toEqual([{ timeout: 60_000 }]);
    } finally {
      clock.mockRestore();
    }
  });
});

describe('sharedTenantFilter', () => {
  it('keeps only tenants that are active and still on the shared database', () => {
    const sql = sharedTenantFilter(Prisma.sql`p.tenant_id`).sql;
    expect(sql).toContain('p.tenant_id IN');
    expect(sql).toContain('is_active AND dedicated_db_url IS NULL');
  });
});
