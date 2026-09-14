/**
 * §6.7 — every SYSTEM_ADMIN tenant action is audited with its justification, IN the action's
 * transaction (product-owner decision 2026-09-14). Real TenantService, real PostgreSQL.
 *
 * The unit spec proves the SQL is issued in the right order on a mocked client. Three things only a
 * database can prove, and each is a test here:
 *
 *   1. the row lands, with the justification in metadata and the TARGET tenant as tenant_id;
 *   2. an action whose audit row cannot be written does not happen — the actor_id foreign key refuses
 *      an actor with no platform.users row, and the tenant must still be active afterwards;
 *   3. the audit writer passes audit_logs' RLS WITH CHECK on a connection that is NOT a superuser.
 *      The container's own user is a superuser and bypasses RLS entirely, so (3) runs the writer as
 *      `app_user`, the login migration 20260623000001 creates — otherwise SET LOCAL would be proven
 *      only to parse.
 */
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  type IntegrationInfra,
} from '../helpers/integration-infra';
import { TenantService } from '../../src/modules/tenant/tenant.service';

const JUSTIFICATION = 'Contract terminated by the customer (ticket OPS-5120).';
const ACTOR_HOME_TENANT = '88888888-0000-4000-8000-000000000001';
const ACTOR_ID = '88888888-1111-4000-8000-000000000001';

const flagsOff = { isEnabled: () => false } as never;

describe('Admin audit · real database', () => {
  let infra: IntegrationInfra;
  let service: TenantService;

  async function seedTenant(id: string, code: string): Promise<void> {
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, $2, $2, $3, 'ENTERPRISE'::platform."PlanType", true)`,
      id,
      code,
      `realm-${code}`,
    );
  }

  async function auditRows(tenantId: string) {
    return infra.prisma.$queryRawUnsafe<
      Array<{
        actor_id: string;
        action: string;
        resource_type: string;
        metadata: Record<string, unknown>;
      }>
    >(
      `SELECT actor_id::text, action, resource_type, metadata FROM platform.audit_logs
        WHERE tenant_id = $1::uuid ORDER BY occurred_at`,
      tenantId,
    );
  }

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    // The SYSTEM_ADMIN's own home row (E2): a users row is what the actor_id foreign key needs.
    await seedTenant(ACTOR_HOME_TENANT, 'audit-home');
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-audit-admin', 'sysadmin@example.com', 'Platform Operator')`,
      ACTOR_ID,
      ACTOR_HOME_TENANT,
    );
    service = new TenantService(flagsOff);
  });

  afterAll(async () => {
    await service?.onModuleDestroy();
    await stopIntegrationInfra(infra);
  });

  // Also the only test that runs createTenant's SQL on a real database. Before it, the unqualified
  // `::"PlanType"` cast failed every create (42704) and no test could see it.
  it('create inserts the tenant and writes one tenant.create row for it', async () => {
    const created = await service.createTenant(
      {
        tenantCode: 'audit_create',
        tenantName: 'Audit Create Co',
        planType: 'ENTERPRISE' as never,
      },
      ACTOR_ID,
      JUSTIFICATION,
    );

    expect(created.tenant_code).toBe('audit_create');
    const rows = await auditRows(created.tenant_id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      actor_id: ACTOR_ID,
      action: 'tenant.create',
      resource_type: 'tenant',
      metadata: {
        justification: JUSTIFICATION,
        tenant_code: 'audit_create',
        plan_type: 'ENTERPRISE',
      },
    });
  });

  it('deactivate writes one tenant.deactivate row for the TARGET tenant, with the reason', async () => {
    const target = '88888888-2222-4000-8000-000000000001';
    await seedTenant(target, 'audit-deactivate');

    await service.deactivateTenant(target, ACTOR_ID, JUSTIFICATION);

    const rows = await auditRows(target);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      actor_id: ACTOR_ID,
      action: 'tenant.deactivate',
      resource_type: 'tenant',
      metadata: { justification: JUSTIFICATION },
    });
  });

  it('assign DB audits the HOST and never stores the password in the audit row', async () => {
    const target = '88888888-2222-4000-8000-000000000002';
    await seedTenant(target, 'audit-assign');

    await service.assignDedicatedDb(
      target,
      'postgresql://db_admin:s3cret@db-ent-042.cos.internal:5432/bkk',
      ACTOR_ID,
      JUSTIFICATION,
    );

    const rows = await auditRows(target);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.metadata).toEqual({
      justification: JUSTIFICATION,
      dedicated_db_host: 'db-ent-042.cos.internal',
    });
    expect(JSON.stringify(rows)).not.toContain('s3cret');
  });

  it('an actor with no users row cannot act: the deactivation is rolled back with the audit row', async () => {
    const target = '88888888-2222-4000-8000-000000000003';
    await seedTenant(target, 'audit-no-actor');

    await expect(
      service.deactivateTenant(target, '88888888-9999-4000-8000-000000000999', JUSTIFICATION),
    ).rejects.toThrow();

    const [tenant] = await infra.prisma.$queryRawUnsafe<Array<{ is_active: boolean }>>(
      `SELECT is_active FROM platform.tenants WHERE tenant_id = $1::uuid`,
      target,
    );
    expect(tenant!.is_active).toBe(true);
    expect(await auditRows(target)).toHaveLength(0);
  });

  // (3) RLS. As app_user the whole deactivate cannot be run — platform.tenants' own RLS hides the row
  // from that role before the audit step is reached (measured 2026-09-14: NotFoundException), because
  // TenantService is built to run on DATABASE_URL, not the app role. So the AUDIT WRITER is exercised
  // as app_user directly: the service's own writeAdminAudit, inside a transaction on an app_user client.
  // The control proves the SET LOCAL is what lets the row through, rather than the role being
  // unrestricted.
  describe('audit_logs RLS, as app_user (does not bypass RLS)', () => {
    const target = '88888888-2222-4000-8000-000000000004';
    let asAppUser: TenantService;
    let saved: string | undefined;

    beforeAll(async () => {
      await seedTenant(target, 'audit-rls');
      const url = new URL(infra.pgUrl);
      url.username = 'app_user';
      url.password = 'app_user_dev_password';
      saved = process.env['DATABASE_URL'];
      process.env['DATABASE_URL'] = url.toString();
      asAppUser = new TenantService(flagsOff);
      process.env['DATABASE_URL'] = saved;
    });

    afterAll(async () => {
      await asAppUser?.onModuleDestroy();
    });

    const prismaOf = (svc: TenantService) =>
      (svc as unknown as { prisma: IntegrationInfra['prisma'] }).prisma;

    it('writeAdminAudit inserts the row: it sets app.current_tenant_id first', async () => {
      const writer = (
        asAppUser as unknown as {
          writeAdminAudit: (tx: unknown, e: Record<string, unknown>) => Promise<void>;
        }
      ).writeAdminAudit.bind(asAppUser);

      await prismaOf(asAppUser).$transaction((tx) =>
        writer(tx, {
          tenantId: target,
          actorId: ACTOR_ID,
          action: 'tenant.deactivate',
          justification: JUSTIFICATION,
        }),
      );

      expect((await auditRows(target)).map((r) => r.action)).toEqual(['tenant.deactivate']);
    });

    it('CONTROL: the same INSERT without SET LOCAL is refused by the policy', async () => {
      await expect(
        prismaOf(asAppUser).$executeRawUnsafe(
          `INSERT INTO platform.audit_logs (tenant_id, actor_id, action, resource_type, resource_id, metadata)
           VALUES ($1::uuid, $2::uuid, 'tenant.deactivate', 'tenant', $1::uuid, '{}'::jsonb)`,
          target,
          ACTOR_ID,
        ),
      ).rejects.toThrow();
      expect(await auditRows(target)).toHaveLength(1);
    });
  });
});
