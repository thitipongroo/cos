/**
 * ADR-110 — the first TENANT_ADMIN of a tenant, on a real PostgreSQL. Real TenantAdminBootstrapService, UserService
 * and TenantService; Keycloak is a double (no realm runs here).
 *
 * The unit spec proves the order of the SQL on a mocked client. What only a database can prove:
 *
 *   1. two concurrent bootstraps leave exactly ONE administrator — the advisory lock and the re-check under it
 *      settle the race, and the loser's Keycloak account is deleted;
 *   2. the administrator rule the list and the guard share (tenant-admins.ts) is valid SQL and counts what it says,
 *      including "never signed in" as last_seen_at = created_at;
 *   3. the audit row lands under the TARGET tenant with the justification;
 *   4. a tenant whose trial has ended (EXPIRED) can still be given its administrator.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  type IntegrationInfra,
} from '../helpers/integration-infra';
import { TenantService } from '../../src/modules/tenant/tenant.service';
import { UserService } from '../../src/modules/tenant/user.service';
import { TenantAdminBootstrapService } from '../../src/modules/tenant/tenant-admin-bootstrap.service';

const JUSTIFICATION = 'Trial request TR-0042 from construction-os.io — first admin.';
const ACTOR_HOME_TENANT = '99999999-0000-4000-8000-000000000001';
const ACTOR_ID = '99999999-1111-4000-8000-000000000001';

const flagsOff = { isEnabled: () => false } as never;

describe('Tenant admin bootstrap · real database', () => {
  let infra: IntegrationInfra;
  let users: UserService;
  let tenants: TenantService;
  let bootstrap: TenantAdminBootstrapService;
  let kcSeq = 0;
  const keycloak = {
    createEmailUser: jest.fn(async () => ({ keycloakUserId: `kc-bootstrap-${++kcSeq}` })),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    // No password until the invitation is used — what Keycloak reports for a fresh Path B account.
    hasAnyCredential: jest.fn().mockResolvedValue(false),
    deleteUser: jest.fn().mockResolvedValue(undefined),
    disableUser: jest.fn().mockResolvedValue(undefined),
  };

  async function seedTenant(id: string, code: string): Promise<void> {
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, $2, $2, 'construction-os', 'STARTER'::platform."PlanType", true)`,
      id,
      code,
    );
  }

  const admins = (tenantId: string) =>
    infra.prisma.$queryRawUnsafe<Array<{ email: string }>>(
      `SELECT u.email FROM platform.users u
         JOIN platform.tenant_memberships m ON m.user_id = u.user_id AND m.tenant_id = u.tenant_id
        WHERE u.tenant_id = $1::uuid AND m.role = 'TENANT_ADMIN'`,
      tenantId,
    );

  const audit = (tenantId: string) =>
    infra.prisma.$queryRawUnsafe<Array<{ action: string; metadata: Record<string, unknown> }>>(
      `SELECT action, metadata FROM platform.audit_logs WHERE tenant_id = $1::uuid ORDER BY occurred_at`,
      tenantId,
    );

  const listed = async (tenantId: string) =>
    (await tenants.listTenants()).find((t) => t.tenant_id === tenantId)!;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    // The SYSTEM_ADMIN's home row: the audit actor_id foreign key needs one (§6.7 implementation reading).
    await seedTenant(ACTOR_HOME_TENANT, 'bootstrap-home');
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-bootstrap-operator', 'operator@example.com', 'Platform Operator')`,
      ACTOR_ID,
      ACTOR_HOME_TENANT,
    );
    const outbox = { write: jest.fn() } as never;
    users = new UserService(keycloak as never, outbox, flagsOff);
    tenants = new TenantService(flagsOff);
    bootstrap = new TenantAdminBootstrapService(users, keycloak as never);
  });

  afterAll(async () => {
    await bootstrap?.onModuleDestroy();
    await users?.onModuleDestroy();
    await tenants?.onModuleDestroy();
    await stopIntegrationInfra(infra);
  });

  beforeEach(() => jest.clearAllMocks());

  it('two concurrent bootstraps leave exactly one administrator', async () => {
    const tenantId = '99999999-2222-4000-8000-000000000001';
    await seedTenant(tenantId, 'bootstrap-race');

    const results = await Promise.allSettled([
      bootstrap.bootstrap(
        tenantId,
        { email: 'first@race.example', display_name: 'First' },
        ACTOR_ID,
        JUSTIFICATION,
      ),
      bootstrap.bootstrap(
        tenantId,
        { email: 'second@race.example', display_name: 'Second' },
        ACTOR_ID,
        JUSTIFICATION,
      ),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason).toMatchObject({ response: { error: { code: 'COS-TADM-001' } } });
    expect(await admins(tenantId)).toHaveLength(1);
    // Refused at the pre-check (no Keycloak account) or under the lock (account created, then deleted).
    expect(keycloak.createEmailUser.mock.calls.length - keycloak.deleteUser.mock.calls.length).toBe(
      1,
    );
    const rows = await audit(tenantId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe('tenant.bootstrap_admin');
    expect(rows[0]!.metadata['justification']).toBe(JUSTIFICATION);
  });

  it('the list counts the administrator, pending until first sign-in; resend follows the same rule', async () => {
    const tenantId = '99999999-2222-4000-8000-000000000002';
    await seedTenant(tenantId, 'bootstrap-pending');
    expect(await listed(tenantId)).toMatchObject({
      tenant_admin_count: 0,
      tenant_admin_pending: false,
    });

    const created = await bootstrap.bootstrap(
      tenantId,
      { email: 'owner@pending.example', display_name: 'Owner' },
      ACTOR_ID,
      JUSTIFICATION,
    );
    expect(created.invite_sent).toBe(true);
    expect(keycloak.sendPasswordResetEmail).toHaveBeenCalledWith(
      expect.stringMatching(/^kc-bootstrap-/),
      'construction-os',
      259_200,
    );
    expect(await listed(tenantId)).toMatchObject({
      tenant_admin_count: 1,
      tenant_admin_pending: true,
    });

    const resent = await bootstrap.resendInvite(tenantId, ACTOR_ID, JUSTIFICATION);
    expect(resent).toMatchObject({ user_id: created.user_id, invite_sent: true });
    expect((await audit(tenantId)).map((r) => r.action)).toEqual([
      'tenant.bootstrap_admin',
      'tenant.resend_admin_invite',
    ]);

    // The customer used the link (Keycloak now holds a password) and made a first request.
    keycloak.hasAnyCredential.mockResolvedValue(true);
    await infra.prisma.$executeRawUnsafe(
      `UPDATE platform.users SET last_seen_at = now() + interval '1 second' WHERE user_id = $1::uuid`,
      created.user_id,
    );
    expect(await listed(tenantId)).toMatchObject({
      tenant_admin_count: 1,
      tenant_admin_pending: false,
    });
    await expect(bootstrap.resendInvite(tenantId, ACTOR_ID, JUSTIFICATION)).rejects.toMatchObject({
      response: { error: { code: 'COS-TADM-002', details: { reason: 'invitation_used' } } },
    });
    keycloak.hasAnyCredential.mockResolvedValue(false);
    await expect(
      bootstrap.bootstrap(
        tenantId,
        { email: 'second@pending.example', display_name: 'Second' },
        ACTOR_ID,
        JUSTIFICATION,
      ),
    ).rejects.toMatchObject({ response: { error: { code: 'COS-TADM-001' } } });
  });

  // The bootstrap audit row is the proof a resend may go to this account. (The container user is a superuser and
  // bypasses RLS, so this shows the query is right, not that the GUC satisfies audit_logs' policy.)
  it('resend refuses an administrator the customer created, even one who never signed in', async () => {
    const tenantId = '99999999-2222-4000-8000-000000000005';
    const userId = '99999999-3333-4000-8000-000000000005';
    await seedTenant(tenantId, 'bootstrap-customer-made');
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-bootstrap-bob', 'bob@customer.example', 'Bob')`,
      userId,
      tenantId,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
       VALUES ($1::uuid, $2::uuid, 'TENANT_ADMIN'::platform."CosRoleEnum")`,
      tenantId,
      userId,
    );

    await expect(bootstrap.resendInvite(tenantId, ACTOR_ID, JUSTIFICATION)).rejects.toMatchObject({
      response: { error: { code: 'COS-TADM-002', details: { reason: 'not_bootstrapped' } } },
    });
    expect(keycloak.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(await audit(tenantId)).toEqual([]);
  });

  it('an additional-role TENANT_ADMIN counts as an administrator', async () => {
    const tenantId = '99999999-2222-4000-8000-000000000003';
    const userId = '99999999-3333-4000-8000-000000000003';
    await seedTenant(tenantId, 'bootstrap-additional');
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-bootstrap-exec', 'exec@additional.example', 'Exec')`,
      userId,
      tenantId,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
       VALUES ($1::uuid, $2::uuid, 'EXECUTIVE'::platform."CosRoleEnum")`,
      tenantId,
      userId,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.user_additional_roles (user_id, tenant_id, role)
       VALUES ($1::uuid, $2::uuid, 'TENANT_ADMIN'::platform."CosRoleEnum")`,
      userId,
      tenantId,
    );

    expect((await listed(tenantId)).tenant_admin_count).toBe(1);
    await expect(
      bootstrap.bootstrap(
        tenantId,
        { email: 'x@additional.example', display_name: 'X' },
        ACTOR_ID,
        JUSTIFICATION,
      ),
    ).rejects.toMatchObject({ response: { error: { code: 'COS-TADM-001' } } });
    expect(keycloak.createEmailUser).not.toHaveBeenCalled();
  });

  it('a tenant whose trial has ended can still be given its administrator', async () => {
    const tenantId = '99999999-2222-4000-8000-000000000004';
    await seedTenant(tenantId, 'bootstrap-expired');
    await infra.prisma.$executeRawUnsafe(
      `UPDATE platform.tenants
          SET subscription_status = 'EXPIRED',
              trial_started_at = now() - interval '35 days',
              trial_ends_at = now() - interval '5 days'
        WHERE tenant_id = $1::uuid`,
      tenantId,
    );

    const created = await bootstrap.bootstrap(
      tenantId,
      { email: 'owner@expired.example', display_name: 'Owner' },
      ACTOR_ID,
      JUSTIFICATION,
    );

    expect(created.invite_sent).toBe(true);
    expect(await admins(tenantId)).toEqual([{ email: 'owner@expired.example' }]);
  });

  // Round 2 (D6): cancel the unused invitation sent to a wrong address, then invite the right one.
  it('cancel deactivates the bootstrapped account, deletes it in Keycloak, and lets the tenant be bootstrapped again', async () => {
    const tenantId = '99999999-2222-4000-8000-000000000006';
    await seedTenant(tenantId, 'bootstrap-cancel');
    const wrong = await bootstrap.bootstrap(
      tenantId,
      { email: 'owner@typo.example', display_name: 'Owner' },
      ACTOR_ID,
      JUSTIFICATION,
    );

    const cancelled = await bootstrap.cancelInvite(tenantId, ACTOR_ID, JUSTIFICATION);

    expect(cancelled).toEqual({
      user_id: wrong.user_id,
      email: 'owner@typo.example',
      keycloak: 'deleted',
    });
    expect(keycloak.deleteUser).toHaveBeenCalledTimes(1);
    expect(await listed(tenantId)).toMatchObject({ tenant_admin_count: 0 });
    const [row] = await infra.prisma.$queryRawUnsafe<Array<{ is_active: boolean }>>(
      `SELECT is_active FROM platform.users WHERE user_id = $1::uuid`,
      wrong.user_id,
    );
    expect(row!.is_active).toBe(false);

    const right = await bootstrap.bootstrap(
      tenantId,
      { email: 'owner@right.example', display_name: 'Owner' },
      ACTOR_ID,
      JUSTIFICATION,
    );
    expect(right.invite_sent).toBe(true);
    expect((await audit(tenantId)).map((r) => r.action)).toEqual([
      'tenant.bootstrap_admin',
      'tenant.cancel_admin_invite',
      'tenant.bootstrap_admin',
    ]);

    // Once the invitation is used, cancel is refused and nothing changes.
    keycloak.hasAnyCredential.mockResolvedValue(true);
    await expect(bootstrap.cancelInvite(tenantId, ACTOR_ID, JUSTIFICATION)).rejects.toMatchObject({
      response: { error: { code: 'COS-TADM-003', details: { reason: 'invitation_used' } } },
    });
    keycloak.hasAnyCredential.mockResolvedValue(false);
    expect(await listed(tenantId)).toMatchObject({ tenant_admin_count: 1 });
  });

  // Round 2 (D7): with the guard on, two concurrent demotions of a tenant's last two administrators leave one.
  it('last-admin guard: concurrent demotions of the last two administrators leave exactly one', async () => {
    const tenantId = '99999999-2222-4000-8000-000000000007';
    const a = '99999999-3333-4000-8000-00000000000a';
    const b = '99999999-3333-4000-8000-00000000000b';
    await seedTenant(tenantId, 'bootstrap-guard');
    for (const [id, kc] of [
      [a, 'kc-guard-a'],
      [b, 'kc-guard-b'],
    ] as const) {
      await infra.prisma.$executeRawUnsafe(
        `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
         VALUES ($1::uuid, $2::uuid, $3::text, $3::text || '@guard.example', $3::text)`,
        id,
        tenantId,
        kc,
      );
      await infra.prisma.$executeRawUnsafe(
        `INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
         VALUES ($1::uuid, $2::uuid, 'TENANT_ADMIN'::platform."CosRoleEnum")`,
        tenantId,
        id,
      );
    }
    const guarded = new UserService(
      { syncUserRole: jest.fn(), disableUser: jest.fn() } as never,
      { write: jest.fn() } as never,
      { isEnabled: (f: string) => f === 's1.tenant.last-admin-guard' } as never,
    );
    try {
      const results = await Promise.allSettled([
        guarded.changeRole(a, { role: 'PROJECT_MANAGER' as never }, tenantId, a),
        guarded.deactivateUser(b, tenantId, a),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const refused = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(refused.reason).toMatchObject({ response: { error: { code: 'COS-TADM-004' } } });
      expect((await listed(tenantId)).tenant_admin_count).toBe(1);
    } finally {
      await guarded.onModuleDestroy();
    }
  });

  // Round 3 (D9): setUserRoles cannot make a phone-only account a TENANT_ADMIN — it could never sign in as one.
  it('setUserRoles refuses TENANT_ADMIN as an additional role on a phone-only account, and changes nothing', async () => {
    const tenantId = '99999999-2222-4000-8000-000000000008';
    const worker = '99999999-3333-4000-8000-000000000008';
    await seedTenant(tenantId, 'bootstrap-path-b');
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-path-a-worker', '+66890000008', '', 'Worker')`,
      worker,
      tenantId,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
       VALUES ($1::uuid, $2::uuid, 'SITE_WORKER'::platform."CosRoleEnum")`,
      tenantId,
      worker,
    );

    await expect(
      users.setUserRoles(
        worker,
        { primary_role: 'SITE_WORKER' as never, additional_roles: ['TENANT_ADMIN' as never] },
        tenantId,
        ACTOR_ID,
      ),
    ).rejects.toMatchObject({ response: { error: { code: 'COS-AUTH-002' } } });

    const extra = await infra.prisma.$queryRawUnsafe<unknown[]>(
      `SELECT role FROM platform.user_additional_roles WHERE user_id = $1::uuid`,
      worker,
    );
    expect(extra).toEqual([]);
    expect((await listed(tenantId)).tenant_admin_count).toBe(0);

    // The readiness query (scripts/readiness/check-path-b-roles.sh) finds an account already in that state —
    // seeded directly, as setUserRoles no longer allows it. Read for this tenant only: the database is shared.
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.user_additional_roles (user_id, tenant_id, role)
       VALUES ($1::uuid, $2::uuid, 'FINANCE'::platform."CosRoleEnum")`,
      worker,
      tenantId,
    );
    const script = readFileSync(
      join(__dirname, '../../../scripts/readiness/check-path-b-roles.sh'),
      'utf8',
    );
    const query = /-- BEGIN QUERY\r?\n([\s\S]*?)-- END QUERY/.exec(script)![1]!;
    const found = await infra.prisma.$queryRawUnsafe<Array<Record<string, string>>>(query);
    expect(found.filter((r) => r['tenant_code'] === 'bootstrap-path-b')).toEqual([
      { tenant_code: 'bootstrap-path-b', user_id: worker, role: 'FINANCE' },
    ]);
  });

  // Round 3 (10.8): POST /users cannot create a phone-number TENANT_ADMIN either.
  it('createUser refuses a phone-number TENANT_ADMIN — no row, no Keycloak account', async () => {
    const tenantId = '99999999-2222-4000-8000-000000000009';
    await seedTenant(tenantId, 'bootstrap-create-path-a');
    await expect(
      users.createUser(
        {
          display_name: 'Phone admin',
          phone_number: '+66890000009',
          role: 'TENANT_ADMIN' as never,
        },
        tenantId,
        ACTOR_ID,
      ),
    ).rejects.toMatchObject({ response: { error: { code: 'COS-AUTH-002' } } });
    const rows = await infra.prisma.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM platform.users WHERE tenant_id = $1::uuid`,
      tenantId,
    );
    expect(rows).toEqual([]);
    expect(keycloak.createEmailUser).not.toHaveBeenCalled();
  });
});
