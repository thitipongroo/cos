// The two database steps of enterprise provisioning (D45, D46 — 2026-11-13).
//
// runMigrationsActivity ran `npx prisma migrate deploy` with DATABASE_URL set to the tenant's database.
// The image had no npx and no prisma CLI, and Prisma 7 reads the migrate URL from DIRECT_DATABASE_URL
// (prisma.config.ts) — the SHARED database in the worker. These tests hold the replacement to: the CLI
// run by node without a shell, from backend/ (where prisma.config.ts and the migrations are), with both
// variables set to the tenant URL.
//
// migrateDataActivity's copy is exercised against two real Postgres servers in
// test/provisioning/06-tenant-data-copy.integration.spec.ts; here, the pure parts: the table list refuses a
// table without tenant_id, the order puts parents first and refuses a cycle, a role under RLS is refused,
// and the has-data check looks at every table.

import { existsSync } from 'node:fs';
import path from 'node:path';

const prismaMigrateDeploy = jest
  .fn()
  .mockResolvedValue({ stdout: 'All migrations applied.', stderr: '' });
jest.mock('../prisma-migrate-deploy', () => ({
  ...jest.requireActual('../prisma-migrate-deploy'),
  prismaMigrateDeploy: (url: string) => prismaMigrateDeploy(url),
}));
jest.mock('../tenant-db-secrets', () => ({
  readMasterPassword: jest.fn().mockResolvedValue('p@ss/w:rd'),
  ensureAppUserPassword: jest.fn(),
}));
// migrateDataActivity's connections: a role subject to RLS. Every query after the role check would find
// nothing; the activity must stop there rather than read "nothing" as "no data" and skip.
const pgQueries: string[] = [];
jest.mock('pg', () => ({
  ...jest.requireActual('pg'),
  Client: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    end: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    escapeIdentifier: (s: string) => `"${s}"`,
    query: jest.fn((sql: string) => {
      pgQueries.push(sql);
      if (sql.includes('rolbypassrls'))
        return Promise.resolve({ rows: [{ role: 'cos', ok: false }] });
      return Promise.resolve({ rows: [] });
    }),
  })),
}));
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { migrateDataActivity, runMigrationsActivity } from '../enterprise-provisioning.activities';
import { BACKEND_ROOT, type ExecFileFn } from '../prisma-migrate-deploy';
import {
  assertBypassesRls,
  listTenantTables,
  orderByForeignKeys,
  tenantHasRows,
  type TenantTable,
} from '../tenant-data-copy';

const { prismaMigrateDeploy: realMigrateDeploy } = jest.requireActual<
  typeof import('../prisma-migrate-deploy')
>('../prisma-migrate-deploy');

describe('runMigrationsActivity (D45)', () => {
  it('migrates the tenant database, not whatever DIRECT_DATABASE_URL points at', async () => {
    await runMigrationsActivity({
      tenantId: '00000000-0000-4000-8000-000000000001',
      rdsEndpoint: 'tenant-db.example.internal',
      masterSecretArn: 'arn:aws:secretsmanager:ap-southeast-1:000000000000:secret:x',
    });

    expect(prismaMigrateDeploy).toHaveBeenCalledWith(
      `postgresql://cos_admin:${encodeURIComponent('p@ss/w:rd')}@tenant-db.example.internal:5432/cos`,
    );
  });
});

describe('prismaMigrateDeploy (D45)', () => {
  it('runs the prisma CLI with node — no shell, no npx — from backend/, with both URLs set', async () => {
    const run = jest.fn<ReturnType<ExecFileFn>, Parameters<ExecFileFn>>().mockResolvedValue({
      stdout: 'ok',
      stderr: '',
    });
    const url = 'postgresql://cos_admin:x@tenant:5432/cos';

    await realMigrateDeploy(url, run);

    const [file, args, options] = run.mock.calls[0]!;
    expect(file).toBe(process.execPath);
    expect(args[0]).toMatch(/[\\/]prisma[\\/]build[\\/]index\.js$/);
    expect(args.slice(1)).toEqual(['migrate', 'deploy']);
    expect(options.cwd).toBe(BACKEND_ROOT);
    expect(options.env['DIRECT_DATABASE_URL']).toBe(url);
    expect(options.env['DATABASE_URL']).toBe(url);
  });

  it('runs from the directory that holds prisma.config.ts, the schema and the migrations', () => {
    expect(existsSync(path.join(BACKEND_ROOT, 'prisma.config.ts'))).toBe(true);
    expect(existsSync(path.join(BACKEND_ROOT, 'prisma', 'schema.prisma'))).toBe(true);
    expect(existsSync(path.join(BACKEND_ROOT, 'prisma', 'migrations'))).toBe(true);
  });
});

const t = (schema: string, table: string): TenantTable => ({
  schema,
  table,
  columns: ['id', 'tenant_id'],
});

describe('tenant table list and order (D46)', () => {
  it('refuses a table without tenant_id instead of skipping it', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        { schema: 'projects', table: 'projects', column: 'id' },
        { schema: 'projects', table: 'projects', column: 'tenant_id' },
        { schema: 'boq', table: 'orphan', column: 'id' },
      ],
    });

    await expect(listTenantTables({ query } as never)).rejects.toThrow(
      'tables without tenant_id cannot be copied per tenant: boq.orphan',
    );
  });

  it('puts every parent before its children', () => {
    const tables = [t('boq', 'boq_items'), t('boq', 'boqs'), t('projects', 'projects')];
    const edges = [
      { from: 'boq.boq_items', to: 'boq.boqs' },
      { from: 'boq.boqs', to: 'projects.projects' },
    ];

    expect(orderByForeignKeys(tables, edges).map((x) => `${x.schema}.${x.table}`)).toEqual([
      'projects.projects',
      'boq.boqs',
      'boq.boq_items',
    ]);
  });

  it('refuses a foreign-key cycle', () => {
    const tables = [t('a', 'x'), t('a', 'y')];
    expect(() =>
      orderByForeignKeys(tables, [
        { from: 'a.x', to: 'a.y' },
        { from: 'a.y', to: 'a.x' },
      ]),
    ).toThrow('foreign-key cycle among: a.x, a.y');
  });
});

describe('copy preconditions (D46)', () => {
  it('refuses a role subject to row-level security, naming it', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ role: 'cos', ok: false }] });
    await expect(assertBypassesRls({ query } as never, 'source')).rejects.toThrow(
      'source role cos is subject to row-level security: it would copy nothing',
    );
  });

  it('accepts a superuser or BYPASSRLS role', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ role: 'cos_admin', ok: true }] });
    await expect(assertBypassesRls({ query } as never, 'target')).resolves.toBeUndefined();
  });

  it('finds tenant data in any table, not only projects', async () => {
    const found = new Map([['finance.customers', true]]);
    const query = jest.fn((sql: string) =>
      Promise.resolve({
        rows: [{ found: [...found.keys()].some((k) => sql.includes(`"${k.split('.')[1]}"`)) }],
      }),
    );
    const db = { query, escapeIdentifier: (s: string) => `"${s}"` };
    const tables = [t('projects', 'projects'), t('finance', 'customers')];
    await expect(tenantHasRows(db as never, 'x', tables)).resolves.toBe(true);
    await expect(tenantHasRows(db as never, 'x', [t('projects', 'projects')])).resolves.toBe(false);
  });
});

describe('migrateDataActivity (D46)', () => {
  it('fails on a source role subject to RLS instead of skipping as if the tenant had no data', async () => {
    pgQueries.length = 0;
    await expect(
      migrateDataActivity({
        tenantId: 'aaaaaaaa-0000-4000-8000-000000000001',
        rdsEndpoint: 'tenant-db.example.internal',
        masterSecretArn: 'arn:aws:secretsmanager:ap-southeast-1:000000000000:secret:x',
      }),
    ).rejects.toThrow('source role cos is subject to row-level security');
    expect(pgQueries).toHaveLength(1);
  });
});
