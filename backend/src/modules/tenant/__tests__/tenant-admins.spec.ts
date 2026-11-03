// Unit tests for the tenant-administrator definition shared by the SYSTEM_ADMIN list and the bootstrap guard (ADR-110).

import {
  assertTenantKeepsAnAdmin,
  isTenantAdmin,
  LAST_ADMIN_GUARD_FLAG,
  lockTenantAdmins,
  NO_TENANT_ADMIN,
  tenantAdminStates,
  tenantAdmins,
} from '../public/tenant-admins';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const sqlOf = (db: { $queryRaw: jest.Mock }) =>
  (db.$queryRaw.mock.calls[0]![0] as TemplateStringsArray).join('?');

// The two queries must apply the same rule; these are the parts that can drift.
const RULE = [
  'u.is_active',
  "m.role = 'TENANT_ADMIN'",
  "r.role = 'TENANT_ADMIN'",
  'platform.user_additional_roles',
  'u.last_seen_at = u.created_at',
];

describe('tenantAdmins', () => {
  const rows = [
    { user_id: 'a', never_signed_in: true },
    { user_id: 'b', never_signed_in: false },
  ];

  it("returns the tenant's active administrators, primary or additional role", async () => {
    const db = { $queryRaw: jest.fn().mockResolvedValue(rows) };
    expect(await tenantAdmins(db, TENANT_ID)).toEqual(rows);
    for (const part of RULE) expect(sqlOf(db)).toContain(part);
    expect(db.$queryRaw.mock.calls[0]![1]).toBe(TENANT_ID);
  });

  it('leaves out the user named in exceptUserId', async () => {
    const db = { $queryRaw: jest.fn().mockResolvedValue(rows) };
    expect(await tenantAdmins(db, TENANT_ID, 'a')).toEqual([rows[1]]);
  });
});

describe('tenantAdminStates', () => {
  it('maps each tenant with an administrator to its count and pending state', async () => {
    const db = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([
          { tenant_id: 't1', tenant_admin_count: 1, tenant_admin_pending: true },
        ]),
    };
    const states = await tenantAdminStates(db);
    expect(states.get('t1')).toEqual({ tenant_admin_count: 1, tenant_admin_pending: true });
    expect(states.has('t2')).toBe(false);
    const sql = sqlOf(db);
    for (const part of RULE) expect(sql).toContain(part);
    expect(sql).toContain('count(*) = 1 AND bool_and(');
    expect(sql).toContain('GROUP BY u.tenant_id');
  });

  it('a tenant missing from the map has no administrator', () => {
    expect(NO_TENANT_ADMIN).toEqual({ tenant_admin_count: 0, tenant_admin_pending: false });
  });
});

describe('lockTenantAdmins / assertTenantKeepsAnAdmin', () => {
  it('locks on the tenant-admin key', async () => {
    const tx = { $executeRaw: jest.fn() };
    await lockTenantAdmins(tx, TENANT_ID);
    expect((tx.$executeRaw.mock.calls[0]![0] as TemplateStringsArray).join('?')).toContain(
      'pg_advisory_xact_lock',
    );
    expect(tx.$executeRaw.mock.calls[0]![1]).toBe(`cos:tenant-admin:${TENANT_ID}`);
  });

  it('passes while an administrator remains', async () => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([{ user_id: 'a', never_signed_in: false }]),
    };
    await expect(assertTenantKeepsAnAdmin(db, TENANT_ID, 'u1', true)).resolves.toBeUndefined();
  });

  it('refuses with 409 COS-TADM-004 when the write removed the last one', async () => {
    const db = { $queryRaw: jest.fn().mockResolvedValue([]) };
    await expect(assertTenantKeepsAnAdmin(db, TENANT_ID, 'u1', true)).rejects.toMatchObject({
      status: 409,
      response: {
        error: {
          code: 'COS-TADM-004',
          messageKey: 'user.error.lastTenantAdmin',
          details: { user_id: 'u1' },
        },
      },
    });
  });

  it('never refuses a write that did not touch an administrator, even with none left', async () => {
    const db = { $queryRaw: jest.fn().mockResolvedValue([]) };
    await expect(assertTenantKeepsAnAdmin(db, TENANT_ID, 'u1', false)).resolves.toBeUndefined();
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('isTenantAdmin reads the current administrators', async () => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([{ user_id: 'u1', never_signed_in: false }]),
    };
    expect(await isTenantAdmin(db, TENANT_ID, 'u1')).toBe(true);
    expect(await isTenantAdmin(db, TENANT_ID, 'u2')).toBe(false);
  });

  it('names the guard flag', () => {
    expect(LAST_ADMIN_GUARD_FLAG).toBe('s1.tenant.last-admin-guard');
  });
});
