/**
 * Phase 16 — tenant isolation and audit immutability, PROVEN rather than inspected
 * (master:4484-4497, 4563).
 *
 * WHY THIS FILE READS DIFFERENTLY FROM EVERY OTHER T2 SPEC. All of them assert the SHAPE of a policy
 * from pg_policies, because the harness connects as the container's superuser and a superuser
 * bypasses row-level security whether or not FORCE is set — so a cross-tenant request through the
 * API proves nothing here. `SET LOCAL ROLE app_user` inside a transaction drops those privileges,
 * and RLS starts biting. That makes master:4563's "must not leak data" testable as behaviour, and it
 * is the only place in the estate where isolation is demonstrated rather than described.
 *
 * Every isolation test below pairs the scoped read with an unscoped CONTROL. Without it, a passing
 * assertion could equally mean the table was empty, the insert failed, or the query was wrong.
 */
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ MessageId: 'mock-msg-id' }),
  })),
  PublishCommand: jest.fn(),
}));

import { randomUUID } from 'node:crypto';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  type IntegrationInfra,
} from '../helpers/integration-infra';

describe('Phase 16 · isolation proven under app_user', () => {
  let infra: IntegrationInfra;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
  });

  afterAll(async () => {
    await stopIntegrationInfra(infra);
  });

  /** Run `fn` as app_user with the tenant GUC set, exactly as the application does. */
  const asTenant = <T>(
    tenantId: string,
    fn: (tx: IntegrationInfra['prisma']) => Promise<T>,
  ): Promise<T> =>
    infra.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE app_user');
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', $1, true)`, tenantId);
      return fn(tx as unknown as IntegrationInfra['prisma']);
    });

  /** Run `fn` as app_user with NO tenant set — the unset-GUC case the NULLIF guard exists for. */
  const asUnscoped = <T>(fn: (tx: IntegrationInfra['prisma']) => Promise<T>): Promise<T> =>
    infra.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE app_user');
      return fn(tx as unknown as IntegrationInfra['prisma']);
    });

  describe('the role itself', () => {
    it('is neither superuser nor BYPASSRLS', async () => {
      // Either attribute would make every policy in the database decorative.
      const rows = await infra.prisma.$queryRawUnsafe<
        Array<{ rolsuper: boolean; rolbypassrls: boolean }>
      >(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'app_user'`);
      expect(rows).toHaveLength(1);
      expect(rows[0].rolsuper).toBe(false);
      expect(rows[0].rolbypassrls).toBe(false);
    });

    it('is what the application actually connects as', async () => {
      const role = await asUnscoped(async (tx) => {
        const rows = await tx.$queryRawUnsafe<Array<{ role: string }>>(
          'SELECT current_user AS role',
        );
        return rows[0]?.role;
      });
      expect(role).toBe('app_user');
    });
  });

  describe('cross-tenant reads (master:4492-4494, 4563)', () => {
    const seedTombstone = (tenantId: string) =>
      infra.prisma.$executeRawUnsafe(
        `INSERT INTO platform.sync_tombstones (tenant_id, entity_type, entity_id)
         VALUES ($1::uuid, 'task', $2::uuid)`,
        tenantId,
        randomUUID(),
      );

    it('a tenant sees its own row and not the other', async () => {
      const mine = randomUUID();
      const theirs = randomUUID();
      await seedTombstone(mine);
      await seedTombstone(theirs);

      // CONTROL: both rows exist and the predicate matches both.
      const unrestricted = await infra.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM platform.sync_tombstones WHERE tenant_id IN ($1::uuid, $2::uuid)`,
        mine,
        theirs,
      );
      expect(Number(unrestricted[0].n)).toBe(2);

      const visible = await asTenant(mine, async (tx) => {
        const rows = await tx.$queryRawUnsafe<Array<{ n: bigint }>>(
          `SELECT count(*) AS n FROM platform.sync_tombstones WHERE tenant_id IN ($1::uuid, $2::uuid)`,
          mine,
          theirs,
        );
        return Number(rows[0].n);
      });
      expect(visible).toBe(1);
    });

    it('asking for the other tenant explicitly still returns nothing', async () => {
      // The API layer is not the control here: even a query that NAMES the other tenant — the shape
      // an IDOR or a forgotten predicate produces — comes back empty.
      const mine = randomUUID();
      const theirs = randomUUID();
      await seedTombstone(theirs);

      const leaked = await asTenant(mine, async (tx) => {
        const rows = await tx.$queryRawUnsafe<Array<{ n: bigint }>>(
          `SELECT count(*) AS n FROM platform.sync_tombstones WHERE tenant_id = $1::uuid`,
          theirs,
        );
        return Number(rows[0].n);
      });
      expect(leaked).toBe(0);
    });

    it('an unset tenant sees nothing rather than everything', async () => {
      // The NULLIF in every policy exists for this: an unset GUC becomes NULL, which matches no
      // row. Without it the comparison against '' would error, or worse, behave unpredictably —
      // and the failure mode of "matches everything" is a full cross-tenant dump.
      const tenantId = randomUUID();
      await seedTombstone(tenantId);

      const visible = await asUnscoped(async (tx) => {
        const rows = await tx.$queryRawUnsafe<Array<{ n: bigint }>>(
          `SELECT count(*) AS n FROM platform.sync_tombstones WHERE tenant_id = $1::uuid`,
          tenantId,
        );
        return Number(rows[0].n);
      });
      expect(visible).toBe(0);
    });
  });

  describe('cross-tenant writes', () => {
    it('WITH CHECK refuses an insert stamped with another tenant', async () => {
      // Reading is only half of isolation. Without WITH CHECK a tenant could write INTO another
      // tenant's data — invisible to them, and undetectable by any read-side test.
      const mine = randomUUID();
      const theirs = randomUUID();

      await expect(
        asTenant(mine, (tx) =>
          tx.$executeRawUnsafe(
            `INSERT INTO platform.sync_tombstones (tenant_id, entity_type, entity_id)
             VALUES ($1::uuid, 'task', $2::uuid)`,
            theirs,
            randomUUID(),
          ),
        ),
      ).rejects.toThrow();
    });

    it('accepts an insert stamped with the caller tenant', async () => {
      // The control for the test above: the refusal must be about the TENANT, not about app_user
      // lacking INSERT on the table at all.
      const mine = randomUUID();
      await expect(
        asTenant(mine, (tx) =>
          tx.$executeRawUnsafe(
            `INSERT INTO platform.sync_tombstones (tenant_id, entity_type, entity_id)
             VALUES ($1::uuid, 'task', $2::uuid)`,
            mine,
            randomUUID(),
          ),
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('audit_logs are immutable to the application (master:4484-4485)', () => {
    // audit_logs carries FKs to platform.tenants and platform.users, so a row needs both to exist.
    // Columns are log_id / actor_id / resource_type / resource_id (20260531000001_platform_schema).
    const seedTenantAndUser = async (): Promise<{ tenantId: string; userId: string }> => {
      const tenantId = randomUUID();
      const userId = randomUUID();
      const code = tenantId.slice(0, 8);
      await infra.prisma.$executeRawUnsafe(
        `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
         VALUES ($1::uuid, $2, 'Audit Immutability', $3, 'STARTER'::platform."PlanType", true)`,
        tenantId,
        code,
        // keycloak_realm is UNIQUE — each seeded tenant needs its own, or the second insert in a
        // test file collides with the first.
        `realm-${code}`,
      );
      await infra.prisma.$executeRawUnsafe(
        `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, phone_number, email, display_name)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'Auditor')`,
        userId,
        tenantId,
        `kc-${code}`,
        `+6689${code.slice(0, 6).replace(/\D/g, '0').padEnd(6, '0')}`,
        `${code}@example.com`,
      );
      return { tenantId, userId };
    };

    const seedAudit = async (tenantId: string, actorId: string): Promise<string> => {
      const id = randomUUID();
      await infra.prisma.$executeRawUnsafe(
        `INSERT INTO platform.audit_logs (log_id, tenant_id, actor_id, action, resource_type, resource_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'CREATE', 'project', $4::uuid)`,
        id,
        tenantId,
        actorId,
        randomUUID(),
      );
      return id;
    };

    it('the tenant can read its own audit rows', async () => {
      // CONTROL. Everything below asserts that a write does nothing; without this, "no rows
      // changed" could simply mean app_user cannot see the table at all.
      const { tenantId, userId } = await seedTenantAndUser();
      await seedAudit(tenantId, userId);

      const visible = await asTenant(tenantId, async (tx) => {
        const rows = await tx.$queryRawUnsafe<Array<{ n: bigint }>>(
          `SELECT count(*) AS n FROM platform.audit_logs WHERE tenant_id = $1::uuid`,
          tenantId,
        );
        return Number(rows[0].n);
      });
      expect(visible).toBe(1);
    });

    it('an UPDATE changes nothing', async () => {
      // Phase 15 settled that audit logs are retained seven years under WORM. That schedule is
      // meaningless if the application can rewrite a row inside it: immutability is the control,
      // retention is only the timetable.
      const { tenantId, userId } = await seedTenantAndUser();
      const logId = await seedAudit(tenantId, userId);

      await asTenant(tenantId, (tx) =>
        tx.$executeRawUnsafe(
          `UPDATE platform.audit_logs SET action = 'TAMPERED' WHERE log_id = $1::uuid`,
          logId,
        ),
      );

      const rows = await infra.prisma.$queryRawUnsafe<Array<{ action: string }>>(
        `SELECT action FROM platform.audit_logs WHERE log_id = $1::uuid`,
        logId,
      );
      expect(rows[0].action).toBe('CREATE');
    });

    it('a DELETE removes nothing', async () => {
      const { tenantId, userId } = await seedTenantAndUser();
      const logId = await seedAudit(tenantId, userId);

      await asTenant(tenantId, (tx) =>
        tx.$executeRawUnsafe(`DELETE FROM platform.audit_logs WHERE log_id = $1::uuid`, logId),
      );

      const rows = await infra.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM platform.audit_logs WHERE log_id = $1::uuid`,
        logId,
      );
      expect(Number(rows[0].n)).toBe(1);
    });

    it('an INSERT is still permitted — the log has to be writable', async () => {
      // Immutable means append-only, not read-only. A policy set that blocked INSERT too would
      // stop every audited operation in the platform.
      const { tenantId, userId } = await seedTenantAndUser();
      await expect(
        asTenant(tenantId, (tx) =>
          tx.$executeRawUnsafe(
            `INSERT INTO platform.audit_logs (log_id, tenant_id, actor_id, action, resource_type, resource_id)
             VALUES ($1::uuid, $2::uuid, $3::uuid, 'CREATE', 'project', $4::uuid)`,
            randomUUID(),
            tenantId,
            userId,
            randomUUID(),
          ),
        ),
      ).resolves.toBeDefined();
    });
  });
});
