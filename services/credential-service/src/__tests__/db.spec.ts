import { jest } from '@jest/globals';
import type { Pool } from 'pg';
import { createPool, withTenant } from '../db.js';

describe('db', () => {
  it('createPool returns a pg Pool bound to the connection string', () => {
    const pool = createPool('postgres://user@localhost/db');
    expect(pool).toBeTruthy();
    expect(typeof pool.connect).toBe('function');
    void pool.end();
  });

  function mockPool(queryImpl?: (sql: string) => Promise<unknown>) {
    const query = jest.fn(async (sql: string) => (queryImpl ? queryImpl(sql) : undefined));
    const release = jest.fn();
    const client = { query, release };
    const pool = { connect: jest.fn(async () => client) };
    return { pool: pool as unknown as Pool, client, query, release };
  }

  it('runs the callback inside a tenant-scoped transaction and commits', async () => {
    const { pool, query, release } = mockPool();
    const out = await withTenant(pool, 'tenant-1', async () => 'result');
    expect(out).toBe('result');
    const sqls = query.mock.calls.map((c) => c[0]);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[1]).toContain("set_config('app.current_tenant_id'");
    expect(sqls[sqls.length - 1]).toBe('COMMIT');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and rethrows when the callback fails', async () => {
    const { pool, query, release } = mockPool();
    await expect(
      withTenant(pool, 'tenant-1', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const sqls = query.mock.calls.map((c) => c[0]);
    expect(sqls).toContain('ROLLBACK');
    expect(release).toHaveBeenCalledTimes(1);
  });
});
