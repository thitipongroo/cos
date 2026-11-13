// The pause activities (D48, 2026-11-13). The restore path retries setTenantActiveActivity without limit,
// so a tenant that no longer exists must fail for good, not retry every ten minutes forever.

import { ApplicationFailure } from '@temporalio/activity';

let rows: Array<{ is_active: boolean }> = [];
let updated = 0;
jest.mock('../../../../shared/prisma/create-prisma-client', () => ({
  createPrismaClient: () => ({
    $queryRaw: () => Promise.resolve(rows),
    $executeRaw: () => Promise.resolve(updated),
    $disconnect: () => Promise.resolve(),
  }),
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

  it('sets is_active when the tenant exists', async () => {
    updated = 1;
    await expect(setTenantActiveActivity({ tenantId, active: false })).resolves.toBeUndefined();
  });
});
