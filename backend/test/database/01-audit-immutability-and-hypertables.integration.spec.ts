// Integration tests: audit immutability + TimescaleDB hypertables — Phases 16, 21, 22, 24
//
// §35.13 ESC-28. Three §35.10 cases sat as PLANNED with "not located":
//   TC-P16-INT-001  `audit_logs` rejects UPDATE and DELETE from the application role
//   TC-P21-INT-001  Utilisation records land in the TimescaleDB hypertable
//   TC-P21-ISO-001  Equipment APIs are tenant-isolated
//
// All three are properties of the migrated database, not of any TypeScript function — a unit test
// cannot see them at all. They are asserted here against a real TimescaleDB, connected as the
// `app_user` role the application actually uses, because that role is what the RLS policies name.

import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../src/shared/prisma/create-prisma-client';
import { startIntegrationInfra, stopIntegrationInfra } from '../helpers/integration-infra';
import type { IntegrationInfra } from '../helpers/integration-infra';

const TENANT_A = 'aaaaaaaa-0001-4000-8000-000000000001';
const TENANT_B = 'bbbbbbbb-0001-4000-8000-000000000001';
const ACTOR_A = 'aaaaaaaa-0002-4000-8000-000000000001';

describe('RLS immutability + hypertables (Testcontainers — TimescaleDB)', () => {
  let infra: IntegrationInfra;
  let root: PrismaClient; // superuser: sets up fixtures, bypasses RLS
  let appUrl: string;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    root = infra.prisma;

    // The migrations create app_user without a password (it is only ever assumed via SET ROLE in
    // production). Give it one here so a second client can connect AS that role and be subject to
    // the policies — connecting as the container superuser would bypass every one of them.
    await root.$executeRawUnsafe(`ALTER ROLE app_user WITH LOGIN PASSWORD 'app_pw'`);
    const url = new URL(infra.pgUrl);
    url.username = 'app_user';
    url.password = 'app_pw';
    appUrl = url.toString();

    // Seed a tenant and an actor for the FK constraints on platform.audit_logs.
    for (const [tenantId, code] of [
      [TENANT_A, 'rls_tenant_a'],
      [TENANT_B, 'rls_tenant_b'],
    ] as const) {
      await root.$executeRawUnsafe(
        `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type)
         VALUES ($1::uuid, $2, $2, $2, 'STARTER'::platform."PlanType")
         ON CONFLICT DO NOTHING`,
        tenantId,
        code,
      );
    }
    await root.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-rls-a', 'rls-a@example.com', 'RLS A')
       ON CONFLICT DO NOTHING`,
      ACTOR_A,
      TENANT_A,
    );
  }, 180_000);

  afterAll(async () => {
    await stopIntegrationInfra(infra ?? {});
  });

  // ── TC-P16-INT-001 ────────────────────────────────────────────────────────

  describe('TC-P16-INT-001 — platform.audit_logs is append-only for the application role', () => {
    let app: PrismaClient;
    let logId: string;

    beforeAll(async () => {
      app = createPrismaClient(appUrl);
      // An audit row inserted as app_user, inside its own tenant context.
      const [row] = await app.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${TENANT_A}'`);
        return tx.$queryRaw<Array<{ log_id: string }>>`
          INSERT INTO platform.audit_logs (tenant_id, actor_id, action, resource_type, resource_id)
          VALUES (${TENANT_A}::uuid, ${ACTOR_A}::uuid, 'CREATE', 'project', ${TENANT_A}::uuid)
          RETURNING log_id
        `;
      });
      logId = row!.log_id;
    });

    afterAll(async () => {
      await app.$disconnect();
    });

    it('allows the INSERT that writes the audit trail', () => {
      expect(logId).toBeTruthy();
    });

    // How RLS denies here matters operationally: with no UPDATE/DELETE policy the row is not
    // visible *for modification*, so PostgreSQL reports 0 rows affected rather than raising. The
    // audit trail is immutable either way, but code that expects an error would read the silent
    // no-op as success — hence the row-count assertions below.
    it('denies UPDATE — the statement affects zero rows', async () => {
      const affected = await app.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${TENANT_A}'`);
        return tx.$executeRaw`
          UPDATE platform.audit_logs SET action = 'TAMPERED' WHERE log_id = ${logId}::uuid
        `;
      });
      expect(affected).toBe(0);
    });

    it('denies DELETE — the statement affects zero rows', async () => {
      const affected = await app.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${TENANT_A}'`);
        return tx.$executeRaw`DELETE FROM platform.audit_logs WHERE log_id = ${logId}::uuid`;
      });
      expect(affected).toBe(0);
    });

    it('leaves the row intact and unaltered after both attempts', async () => {
      const [row] = await root.$queryRaw<Array<{ action: string }>>`
        SELECT action FROM platform.audit_logs WHERE log_id = ${logId}::uuid
      `;
      expect(row?.action).toBe('CREATE');
    });

    it('scopes SELECT to the caller tenant', async () => {
      const rows = await app.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${TENANT_B}'`);
        return tx.$queryRaw<Array<{ log_id: string }>>`
          SELECT log_id FROM platform.audit_logs WHERE log_id = ${logId}::uuid
        `;
      });
      expect(rows).toHaveLength(0);
    });
  });

  // ── TC-P21-INT-001 ────────────────────────────────────────────────────────

  describe('TC-P21-INT-001 — utilisation records land in a TimescaleDB hypertable', () => {
    it('equipment_utilization is registered as a hypertable', async () => {
      const rows = await root.$queryRaw<Array<{ hypertable_name: string }>>`
        SELECT hypertable_name FROM timescaledb_information.hypertables
        WHERE hypertable_schema = 'equipment_telemetry'
          AND hypertable_name = 'equipment_utilization'
      `;
      expect(rows).toHaveLength(1);
    });

    it('an inserted record is readable back and lands in a chunk', async () => {
      const equipmentId = 'cccccccc-0001-4000-8000-000000000001';
      await root.$executeRaw`
        INSERT INTO equipment_telemetry.equipment_utilization
          (recorded_at, equipment_id, tenant_id, project_id, hours_operated, fuel_consumed)
        VALUES (now(), ${equipmentId}::uuid, ${TENANT_A}::uuid, NULL, 8.5, 120.0)
      `;

      const [row] = await root.$queryRaw<Array<{ hours_operated: string }>>`
        SELECT hours_operated FROM equipment_telemetry.equipment_utilization
        WHERE equipment_id = ${equipmentId}::uuid
      `;
      expect(Number(row!.hours_operated)).toBe(8.5);

      // A hypertable stores rows in chunks; at least one must now exist.
      const chunks = await root.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*) AS n FROM timescaledb_information.chunks
        WHERE hypertable_schema = 'equipment_telemetry'
          AND hypertable_name = 'equipment_utilization'
      `;
      expect(Number(chunks[0]!.n)).toBeGreaterThan(0);
    });

    it('the other telemetry tables are hypertables too', async () => {
      const rows = await root.$queryRaw<Array<{ hypertable_name: string }>>`
        SELECT hypertable_name FROM timescaledb_information.hypertables
        WHERE hypertable_schema = 'workforce_telemetry'
        ORDER BY hypertable_name
      `;
      // Phase 22 converts attendance_logs and timesheets; assert the schema is not empty rather
      // than pinning names a later migration may add to.
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  // ── TC-P21-ISO-001 ────────────────────────────────────────────────────────

  describe('TC-P21-ISO-001 — equipment data is tenant-isolated at the database level', () => {
    const EQUIP_A = 'dddddddd-0001-4000-8000-000000000001';
    const EQUIP_B = 'dddddddd-0002-4000-8000-000000000001';
    let app: PrismaClient;

    beforeAll(async () => {
      app = createPrismaClient(appUrl);
      for (const [id, tenant, code] of [
        [EQUIP_A, TENANT_A, 'EQ-A-001'],
        [EQUIP_B, TENANT_B, 'EQ-B-001'],
      ] as const) {
        await root.$executeRawUnsafe(
          `INSERT INTO equipment.equipment
             (equipment_id, tenant_id, equipment_code, equipment_name, equipment_type, status)
           VALUES ($1::uuid, $2::uuid, $3, $3, 'EXCAVATOR'::equipment.equipment_type_enum,
                   'AVAILABLE'::equipment.equipment_status_enum)
           ON CONFLICT DO NOTHING`,
          id,
          tenant,
          code,
        );
      }
    });

    afterAll(async () => {
      await app.$disconnect();
    });

    const asTenant = <T>(tenantId: string, fn: (tx: PrismaClient) => Promise<T>): Promise<T> =>
      app.$transaction(async (tx) => {
        await (tx as PrismaClient).$executeRawUnsafe(
          `SET LOCAL app.current_tenant_id = '${tenantId}'`,
        );
        return fn(tx as PrismaClient);
      });

    it('tenant A sees only its own equipment', async () => {
      const rows = await asTenant(
        TENANT_A,
        (tx) =>
          tx.$queryRaw<Array<{ equipment_id: string }>>`
          SELECT equipment_id FROM equipment.equipment
        `,
      );
      const ids = rows.map((r) => r.equipment_id);
      expect(ids).toContain(EQUIP_A);
      expect(ids).not.toContain(EQUIP_B);
    });

    it("tenant A cannot read tenant B's equipment even by id", async () => {
      const rows = await asTenant(
        TENANT_A,
        (tx) =>
          tx.$queryRaw<Array<{ equipment_id: string }>>`
          SELECT equipment_id FROM equipment.equipment WHERE equipment_id = ${EQUIP_B}::uuid
        `,
      );
      expect(rows).toHaveLength(0);
    });

    it("tenant A cannot update tenant B's equipment", async () => {
      await asTenant(
        TENANT_A,
        (tx) =>
          tx.$executeRaw`
          UPDATE equipment.equipment
          SET status = 'RETIRED'::equipment.equipment_status_enum
          WHERE equipment_id = ${EQUIP_B}::uuid
        `,
      );

      // The UPDATE matches no visible row; tenant B's record is untouched.
      const [row] = await root.$queryRaw<Array<{ status: string }>>`
        SELECT status FROM equipment.equipment WHERE equipment_id = ${EQUIP_B}::uuid
      `;
      expect(row!.status).toBe('AVAILABLE');
    });

    it('with no tenant context set, nothing is visible', async () => {
      // A request that fails to establish tenant context must read zero rows, never all of them.
      const rows = await app.$queryRaw<Array<{ equipment_id: string }>>`
        SELECT equipment_id FROM equipment.equipment
      `;
      expect(rows).toHaveLength(0);
    });
  });
});
