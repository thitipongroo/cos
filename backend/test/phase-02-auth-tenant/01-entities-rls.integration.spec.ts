/**
 * Phase 2 Generate items 05 and 10 — master:1877-1922, 1940, 1961
 *
 *   item 05 "PostgreSQL migration files for all entities above"
 *           (platform.tenants / users / tenant_memberships / audit_logs, master:1877-1922)
 *   item 10 "Tenant isolation middleware" — ADR-031: app.current_tenant_id is set at request
 *           start; RLS is the PRIMARY isolation mechanism (master:896, 1843-1857).
 *
 * Asserted against a REAL migrated database, not against the migration text: what matters is the
 * schema that exists after `migrate deploy`, and several early migrations are superseded by later
 * ones (20260623000002 rewrote every RLS policy).
 */
import {
  IntegrationInfra,
  startIntegrationInfra,
  stopIntegrationInfra,
} from '../helpers/integration-infra';

// `@prisma/client` resolves only from backend/node_modules (pnpm isolated linker), and this spec
// lives outside backend/. Take the client type off the helper's own return type instead of adding
// a baseUrl/paths shim just to name it.
type PrismaLike = IntegrationInfra['prisma'];

// Set here rather than left to the config: backend/jest.integration.config.js defaults to 120s for
// the older route-shaped specs, and a container start plus `prisma migrate deploy` does not fit. The
// hook cost here is `prisma migrate deploy`, which grows with the migration count — 97 as of
// 2026-08-25, up from 92 that morning — and this file blew the 240s budget on a run where its two
// sibling Phase 2 suites still passed. A per-file budget below the config's only turns a slow
// machine into a red suite.
jest.setTimeout(900_000);

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: string;
}
interface PolicyRow {
  policyname: string;
  permissive: string;
  roles: string;
  qual: string | null;
  with_check: string | null;
}

describe('Phase 2 · platform entities and RLS (real database)', () => {
  let infra: IntegrationInfra;
  let prisma: PrismaLike;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    prisma = infra.prisma;
  });

  afterAll(async () => {
    await stopIntegrationInfra(infra);
  });

  const columnsOf = async (table: string): Promise<Record<string, ColumnRow>> => {
    const rows = await prisma.$queryRawUnsafe<ColumnRow[]>(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'platform' AND table_name = $1`,
      table,
    );
    return Object.fromEntries(rows.map((r) => [r.column_name, r]));
  };

  describe('platform.tenants (master:1878-1888)', () => {
    const REQUIRED = [
      'tenant_id',
      'tenant_code',
      'tenant_name',
      'keycloak_realm',
      'plan_type',
      'is_active',
      'dedicated_db_url',
      'data_region',
      'created_at',
      'updated_at',
    ];

    it('exists with every specified column', async () => {
      const cols = await columnsOf('tenants');
      expect(Object.keys(cols)).toEqual(expect.arrayContaining(REQUIRED));
    });

    it('dedicated_db_url is NULLABLE — NULL means shared DB (master:1885)', async () => {
      const cols = await columnsOf('tenants');
      expect(cols['dedicated_db_url']?.is_nullable).toBe('YES');
    });

    it('plan_type admits exactly STARTER, PROFESSIONAL, ENTERPRISE (master:1883)', async () => {
      const rows = await prisma.$queryRawUnsafe<Array<{ label: string }>>(
        `SELECT e.enumlabel AS label
           FROM pg_type t
           JOIN pg_enum e ON e.enumtypid = t.oid
           JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE n.nspname = 'platform'
            AND t.typname ILIKE '%plantype%'
          ORDER BY e.enumsortorder`,
      );
      expect(rows.map((r) => r.label).sort()).toEqual(
        ['ENTERPRISE', 'PROFESSIONAL', 'STARTER'].sort(),
      );
    });

    it('tenant_code and keycloak_realm are UNIQUE (master:1880, 1882)', async () => {
      const rows = await prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
        `SELECT indexdef FROM pg_indexes WHERE schemaname='platform' AND tablename='tenants'`,
      );
      const defs = rows.map((r) => r.indexdef).join('\n');
      expect(defs).toMatch(/UNIQUE[\s\S]*tenant_code/);
      expect(defs).toMatch(/UNIQUE[\s\S]*keycloak_realm/);
    });
  });

  describe('platform.users (master:1890-1901)', () => {
    it('exists with every specified column', async () => {
      const cols = await columnsOf('users');
      expect(Object.keys(cols)).toEqual(
        expect.arrayContaining([
          'user_id',
          'tenant_id',
          'keycloak_user_id',
          'email',
          'display_name',
          'is_active',
          'mfa_enabled',
          'mfa_totp_secret',
          'created_at',
          'updated_at',
        ]),
      );
    });

    it('mfa_totp_secret is nullable — it holds an encrypted secret only once enrolled (master:1898)', async () => {
      const cols = await columnsOf('users');
      expect(cols['mfa_totp_secret']?.is_nullable).toBe('YES');
    });
  });

  describe('platform.tenant_memberships (master:1903-1909)', () => {
    it('exists with every specified column', async () => {
      const cols = await columnsOf('tenant_memberships');
      expect(Object.keys(cols)).toEqual(
        expect.arrayContaining(['tenant_id', 'user_id', 'role', 'assigned_at']),
      );
    });

    it('(tenant_id, user_id) is UNIQUE (master:1909)', async () => {
      const rows = await prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
        `SELECT indexdef FROM pg_indexes
          WHERE schemaname='platform' AND tablename='tenant_memberships'`,
      );
      expect(rows.map((r) => r.indexdef).join('\n')).toMatch(
        /UNIQUE[\s\S]*tenant_id[\s\S]*user_id|UNIQUE[\s\S]*user_id[\s\S]*tenant_id/,
      );
    });
  });

  describe('platform.audit_logs (master:1911-1922)', () => {
    it('exists with every specified column', async () => {
      const cols = await columnsOf('audit_logs');
      expect(Object.keys(cols)).toEqual(
        expect.arrayContaining([
          'tenant_id',
          'actor_id',
          'action',
          'resource_type',
          'resource_id',
          'ip_address',
          'user_agent',
          'occurred_at',
          'metadata',
        ]),
      );
    });

    it('ip_address uses the INET type, not text (master:1918)', async () => {
      const cols = await columnsOf('audit_logs');
      expect(cols['ip_address']?.data_type).toBe('inet');
    });

    it('metadata is JSONB (master:1921)', async () => {
      const cols = await columnsOf('audit_logs');
      expect(cols['metadata']?.data_type).toBe('jsonb');
    });
  });

  describe('RLS is the primary isolation mechanism (master:896, 1843-1857)', () => {
    it('every domain-schema table has RLS ENABLED and FORCED', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          schemaname: string;
          tablename: string;
          relrowsecurity: boolean;
          relforcerowsecurity: boolean;
        }>
      >(
        `SELECT n.nspname AS schemaname, c.relname AS tablename,
                c.relrowsecurity, c.relforcerowsecurity
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind = 'r'
            AND n.nspname IN ('ai','boq','crm','digital_twin','equipment','equipment_telemetry',
                              'files','finance','notifications','procurement','projects',
                              'site_ops','workforce','workforce_telemetry')
            AND EXISTS (SELECT 1 FROM information_schema.columns col
                         WHERE col.table_schema = n.nspname
                           AND col.table_name = c.relname
                           AND col.column_name = 'tenant_id')`,
      );
      expect(rows.length).toBeGreaterThan(0);
      const notEnabled = rows
        .filter((r) => !r.relrowsecurity)
        .map((r) => `${r.schemaname}.${r.tablename}`);
      const notForced = rows
        .filter((r) => !r.relforcerowsecurity)
        .map((r) => `${r.schemaname}.${r.tablename}`);
      expect(notEnabled).toEqual([]);
      expect(notForced).toEqual([]);
    });

    it('each such table carries exactly ONE policy, PERMISSIVE, named rls_tenant_isolation', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<PolicyRow & { schemaname: string; tablename: string }>
      >(
        `SELECT schemaname, tablename, policyname, permissive, roles::text AS roles, qual, with_check
           FROM pg_policies
          WHERE schemaname IN ('ai','boq','crm','digital_twin','equipment','equipment_telemetry',
                               'files','finance','notifications','procurement','projects',
                               'site_ops','workforce','workforce_telemetry')`,
      );
      const byTable = new Map<string, typeof rows>();
      for (const r of rows) {
        const k = `${r.schemaname}.${r.tablename}`;
        byTable.set(k, [...(byTable.get(k) ?? []), r]);
      }
      const multiple = [...byTable.entries()].filter(([, v]) => v.length > 1).map(([k]) => k);
      expect(multiple).toEqual([]);

      const misnamed = rows.filter((r) => r.policyname !== 'rls_tenant_isolation');
      expect(misnamed.map((r) => `${r.schemaname}.${r.tablename}:${r.policyname}`)).toEqual([]);

      // master:1848-1851 — "NOT RESTRICTIVE: a lone RESTRICTIVE policy grants no access"
      const restrictive = rows.filter((r) => r.permissive !== 'PERMISSIVE');
      expect(restrictive.map((r) => `${r.schemaname}.${r.tablename}`)).toEqual([]);
    });

    it('every policy is scoped TO app_user and NULLIF-hardened, with WITH CHECK', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<PolicyRow & { schemaname: string; tablename: string }>
      >(
        `SELECT schemaname, tablename, policyname, permissive, roles::text AS roles, qual, with_check
           FROM pg_policies
          WHERE schemaname IN ('ai','boq','finance','procurement','projects','site_ops')`,
      );
      for (const r of rows) {
        expect(r.roles).toContain('app_user');
        expect(r.qual ?? '').toMatch(/NULLIF/);
        expect(r.with_check ?? '').toMatch(/NULLIF/);
      }
    });

    it('app_user is never granted BYPASSRLS (master:1856)', async () => {
      const rows = await prisma.$queryRawUnsafe<Array<{ rolbypassrls: boolean }>>(
        `SELECT rolbypassrls FROM pg_roles WHERE rolname = 'app_user'`,
      );
      expect(rows.length).toBe(1);
      expect(rows[0].rolbypassrls).toBe(false);
    });
  });
});
