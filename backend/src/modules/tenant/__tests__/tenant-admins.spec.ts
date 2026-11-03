// Unit tests for the tenant-administrator definition shared by the SYSTEM_ADMIN list and the bootstrap guard (ADR-110).

import { NO_TENANT_ADMIN, tenantAdminStates, tenantAdmins } from '../public/tenant-admins';

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
