// migrateDataActivity inside a Temporal activity (D48, 2026-11-13): the copy's progress becomes heartbeats,
// and the activity's cancellation reaches the copy as an AbortSignal — what lets a heartbeat timeout or a
// cancel stop an attempt instead of leaving it copying beside the next one. The copy itself (and that
// aborting it rolls back) is exercised on real Postgres in test/provisioning/06-tenant-data-copy.

import { MockActivityEnvironment } from '@temporalio/testing';

const copyTenantRows = jest.fn();
jest.mock('../tenant-data-copy', () => ({
  assertBypassesRls: jest.fn().mockResolvedValue(undefined),
  listTenantTables: jest.fn().mockResolvedValue([{ schema: 'projects', table: 'projects' }]),
  tenantHasRows: jest.fn().mockResolvedValue(true),
  listForeignKeys: jest.fn().mockResolvedValue([]),
  orderByForeignKeys: (tables: unknown) => tables,
  copyTenantRows: (...args: unknown[]) => copyTenantRows(...args),
}));
jest.mock('pg', () => ({
  ...jest.requireActual('pg'),
  Client: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    end: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  })),
}));
jest.mock('../tenant-db-secrets', () => ({
  readMasterPassword: jest.fn().mockResolvedValue('pw'),
  ensureAppUserPassword: jest.fn(),
}));
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { migrateDataActivity } from '../enterprise-provisioning.activities';

const PARAMS = {
  tenantId: 'aaaaaaaa-0000-4000-8000-000000000001',
  rdsEndpoint: 'tenant-db.example.internal',
  masterSecretArn: 'arn:aws:secretsmanager:ap-southeast-1:000000000000:secret:x',
};

describe('migrateDataActivity in a Temporal activity (D48)', () => {
  beforeEach(() => copyTenantRows.mockReset());

  it('heartbeats with the table the copy reports', async () => {
    copyTenantRows.mockImplementation(
      async (
        _s: unknown,
        _d: unknown,
        _t: unknown,
        _tables: unknown,
        opts: { onProgress: (t: string) => void },
      ) => {
        opts.onProgress('projects.projects');
        return { alreadyCopied: false, tables: [] };
      },
    );
    const env = new MockActivityEnvironment();
    const beats: unknown[] = [];
    env.on('heartbeat', (d: unknown) => beats.push(d));
    await env.run(migrateDataActivity, PARAMS);
    expect(beats).toEqual([{ table: 'projects.projects' }]);
  });

  it("passes the activity's cancellation to the copy as an AbortSignal", async () => {
    let seen: AbortSignal | undefined;
    copyTenantRows.mockImplementation(
      (_s: unknown, _d: unknown, _t: unknown, _tables: unknown, opts: { signal: AbortSignal }) => {
        seen = opts.signal;
        return new Promise((_resolve, reject) =>
          opts.signal.addEventListener('abort', () => reject(new Error('aborted'))),
        );
      },
    );
    const env = new MockActivityEnvironment();
    const run = env.run(migrateDataActivity, PARAMS);
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    env.cancel();
    await expect(run).rejects.toThrow();
    expect(seen?.aborted).toBe(true);
  });

  it('keeps heartbeating on a timer while the copy reports no progress', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    try {
      let finish!: () => void;
      copyTenantRows.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = () => resolve({ alreadyCopied: false, tables: [] });
          }),
      );
      const env = new MockActivityEnvironment();
      const beats: unknown[] = [];
      env.on('heartbeat', (d: unknown) => beats.push(d));
      const run = env.run(migrateDataActivity, PARAMS);
      for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
      jest.advanceTimersByTime(95_000);
      finish();
      await run;
      expect(beats).toEqual([{ phase: 'working' }, { phase: 'working' }, { phase: 'working' }]);
      // And it stops with the activity.
      jest.advanceTimersByTime(60_000);
      expect(beats).toHaveLength(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('opens both connections with TCP keepalive (the timer heartbeat cannot catch a hung query)', async () => {
    const { Client } = jest.requireMock<{ Client: jest.Mock }>('pg');
    Client.mockClear();
    copyTenantRows.mockResolvedValue({ alreadyCopied: false, tables: [] });
    await new MockActivityEnvironment().run(migrateDataActivity, PARAMS);
    expect(Client).toHaveBeenCalledTimes(2);
    for (const [options] of Client.mock.calls) {
      expect(options).toMatchObject({ keepAlive: true, keepAliveInitialDelayMillis: 30_000 });
    }
  });
});
