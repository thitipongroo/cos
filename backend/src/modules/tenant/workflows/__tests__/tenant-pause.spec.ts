// The pause activities (D48, D51 — 2026-11-13). The restore path retries setTenantActiveActivity without
// limit, so a tenant that no longer exists must fail for good, not retry every ten minutes forever. And
// the write goes through setTenantActiveDrained: the tenant's pause lock, exclusive, around the UPDATE.

import { ApplicationFailure } from '@temporalio/activity';

let rows: Array<{ is_active: boolean }> = [];
let updated = 0;
const statements: string[] = [];
jest.mock('../../../../shared/prisma/create-prisma-client', () => ({
  createPrismaClient: () => ({
    $queryRaw: () => Promise.resolve(rows),
    $disconnect: () => Promise.resolve(),
  }),
}));
jest.mock('pg', () => ({
  ...jest.requireActual('pg'),
  Client: jest.fn().mockImplementation(() => ({
    connect: () => Promise.resolve(),
    end: () => Promise.resolve(),
    on: () => undefined,
    query: (text: string) => {
      statements.push(text.split(' ').slice(0, 2).join(' '));
      return Promise.resolve({ rows: [], rowCount: text.startsWith('UPDATE') ? updated : null });
    },
  })),
}));
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import {
  getTenantActiveActivity,
  setTenantActiveActivity,
} from '../enterprise-provisioning.activities';

const tenantId = 'aaaaaaaa-0000-4000-8000-000000000001';

async function failure(p: Promise<unknown>): Promise<ApplicationFailure> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApplicationFailure);
  return err as ApplicationFailure;
}

describe('tenant pause activities', () => {
  beforeEach(() => {
    statements.length = 0;
  });

  it('reads is_active', async () => {
    rows = [{ is_active: false }];
    await expect(getTenantActiveActivity({ tenantId })).resolves.toBe(false);
  });

  it('a missing tenant is a non-retryable failure, on read and on write', async () => {
    rows = [];
    updated = 0;
    expect((await failure(getTenantActiveActivity({ tenantId }))).nonRetryable).toBe(true);
    expect((await failure(setTenantActiveActivity({ tenantId, active: true }))).nonRetryable).toBe(
      true,
    );
  });

  it('sets is_active under the exclusive pause lock, in one transaction (D51)', async () => {
    updated = 1;
    await expect(setTenantActiveActivity({ tenantId, active: false })).resolves.toBeUndefined();
    expect(statements).toEqual([
      'BEGIN',
      'SELECT pg_advisory_xact_lock(hashtextextended($1,',
      'UPDATE platform.tenants',
      'COMMIT',
    ]);
  });
});
