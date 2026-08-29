/**
 * Phase 24 — the Digital Twin schema against a real database (master:5684-5693, 5711).
 *
 * The twin service itself is Python and is covered by its own suite; what lives here is the schema
 * it depends on, and three claims about that schema that only a running PostgreSQL can settle:
 * that `create_hypertable` SUCCEEDED rather than merely being called, that twin_states really is
 * partitioned on recorded_at, and that RLS filters another tenant's rows under app_user rather than
 * merely being declared.
 *
 * The storage question is settled here too. master:5684-5686 co-locates twin states on the PRIMARY
 * PostgreSQL instance through Stages 1–3 (ADR-032, same instance as Phase 21/22). This suite runs
 * the backend's own migrations against one container, so the twin tables appearing in it IS that
 * co-location — a separate instance would need its own migration root and its own connection.
 */
import { randomUUID } from 'node:crypto';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  type IntegrationInfra,
} from '../helpers/integration-infra';

jest.setTimeout(900_000);

describe('Phase 24 · digital twin schema', () => {
  let infra: IntegrationInfra;

  const TENANT_ID = '99999999-1111-4000-8000-000000000024';
  const PROJECT_ID = '99999999-2222-4000-8000-000000000024';

  beforeAll(async () => {
    infra = await startIntegrationInfra();
  });

  afterAll(async () => {
    await stopIntegrationInfra(infra);
  });

  // ── Entities and enums ────────────────────────────────────────────────────

  describe('entities (master:5651-5656)', () => {
    it('creates both twin tables on the primary instance', async () => {
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'digital_twin'
          ORDER BY table_name`,
      );
      expect(rows.map((r) => r.table_name)).toEqual(['twin_entities', 'twin_states']);
    });

    it('enumerates the five entity types and three state sources', async () => {
      const labels = async (typeName: string): Promise<string[]> => {
        const rows = await infra.prisma.$queryRawUnsafe<Array<{ label: string }>>(
          `SELECT e.enumlabel AS label FROM pg_enum e
             JOIN pg_type t ON t.oid = e.enumtypid
             JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = 'digital_twin' AND t.typname = $1
            ORDER BY e.enumsortorder`,
          typeName,
        );
        return rows.map((r) => r.label);
      };

      expect(await labels('entity_type_enum')).toEqual([
        'STRUCTURE',
        'EQUIPMENT',
        'MATERIAL_STOCK',
        'WORKFORCE_ZONE',
        'INSPECTION_ZONE',
      ]);
      expect(await labels('state_source_enum')).toEqual(['IOT', 'MANUAL', 'AI_INFERRED']);
    });
  });

  // ── Hypertable ────────────────────────────────────────────────────────────

  describe('twin_states hypertable (master:5693)', () => {
    it('was actually registered as a hypertable', async () => {
      // The migration CALLS create_hypertable; only a live TimescaleDB says whether it worked. On a
      // plain postgres image the function does not exist and the whole deploy fails — the failure
      // Phase 18 traced to the harness image.
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ hypertable_name: string }>>(
        `SELECT hypertable_name FROM timescaledb_information.hypertables
          WHERE hypertable_schema = 'digital_twin'`,
      );
      expect(rows.map((r) => r.hypertable_name)).toEqual(['twin_states']);
    });

    it('partitions on recorded_at', async () => {
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
        `SELECT column_name FROM timescaledb_information.dimensions
          WHERE hypertable_schema = 'digital_twin' AND hypertable_name = 'twin_states'`,
      );
      expect(rows.map((r) => r.column_name)).toEqual(['recorded_at']);
    });
  });

  // ── The confidence rule ───────────────────────────────────────────────────

  describe('confidence is mandatory (master:5711)', () => {
    it('rejects a state row with no confidence', async () => {
      // "Confidence score mandatory on every inferred state." Asserted as a REFUSAL by the database
      // rather than as a NOT NULL in the migration text: an AI_INFERRED row that claims no
      // confidence would sit beside an IoT reading with nothing to separate them.
      await expect(
        infra.prisma.$executeRawUnsafe(
          `INSERT INTO digital_twin.twin_states (entity_id, tenant_id, recorded_at, attributes, source)
           VALUES ($1::uuid, $2::uuid, now(), '{}'::jsonb, 'AI_INFERRED')`,
          randomUUID(),
          TENANT_ID,
        ),
      ).rejects.toThrow();
    });

    it('accepts one that carries a confidence', async () => {
      // CONTROL: the refusal above must come from the missing confidence, not from something else
      // about the insert.
      const entityId = randomUUID();
      await infra.prisma.$executeRawUnsafe(
        `INSERT INTO digital_twin.twin_entities (entity_id, tenant_id, project_id, entity_type, confidence)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'EQUIPMENT', 0.95)`,
        entityId,
        TENANT_ID,
        PROJECT_ID,
      );
      await infra.prisma.$executeRawUnsafe(
        `INSERT INTO digital_twin.twin_states (entity_id, tenant_id, recorded_at, attributes, source, confidence)
         VALUES ($1::uuid, $2::uuid, now(), '{"fuel_level": 0.2}'::jsonb, 'IOT', 0.95)`,
        entityId,
        TENANT_ID,
      );

      const rows = await infra.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*)::bigint AS n FROM digital_twin.twin_states WHERE tenant_id = $1::uuid`,
        TENANT_ID,
      );
      expect(Number(rows[0].n)).toBe(1);
    });
  });

  // ── Tenant isolation ──────────────────────────────────────────────────────

  describe('tenant isolation', () => {
    it('carries the canonical policy on both twin tables', async () => {
      const rows = await infra.prisma.$queryRawUnsafe<
        Array<{ tablename: string; policyname: string; permissive: string; qual: string | null }>
      >(
        `SELECT tablename, policyname, permissive, qual FROM pg_policies
          WHERE schemaname = 'digital_twin'`,
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.filter((r) => r.permissive !== 'PERMISSIVE')).toEqual([]);
      expect(rows.filter((r) => r.policyname !== 'rls_tenant_isolation')).toEqual([]);
      // NULLIF, so an unset GUC matches no row instead of raising 22P02 on ''::uuid.
      expect(rows.filter((r) => !(r.qual ?? '').includes('NULLIF'))).toEqual([]);
    });

    it('hides another tenant twin state from app_user', async () => {
      const other = randomUUID();
      const scoped = await infra.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE app_user');
        await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', $1, true)`, other);
        return tx.$queryRawUnsafe<Array<{ n: bigint }>>(
          `SELECT count(*)::bigint AS n FROM digital_twin.twin_states`,
        );
      });
      // CONTROL: the superuser connection sees the row the previous test wrote, so the zero above
      // means "RLS filtered it", not "the table is empty".
      const all = await infra.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*)::bigint AS n FROM digital_twin.twin_states`,
      );
      expect(Number(scoped[0].n)).toBe(0);
      expect(Number(all[0].n)).toBeGreaterThan(0);
    });

    it('lets the owning tenant read its own state under app_user', async () => {
      // The other half of the pair: isolation that also blocked the owner would look identical in
      // the test above.
      const visible = await infra.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE app_user');
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.current_tenant_id', $1, true)`,
          TENANT_ID,
        );
        return tx.$queryRawUnsafe<Array<{ n: bigint }>>(
          `SELECT count(*)::bigint AS n FROM digital_twin.twin_states`,
        );
      });
      expect(Number(visible[0].n)).toBeGreaterThan(0);
    });
  });
});
