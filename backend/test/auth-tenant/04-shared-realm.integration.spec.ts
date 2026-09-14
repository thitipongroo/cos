/**
 * Shared realms (§7.6) against a real database — 20260914000001_keycloak_realm_unique_except_shared.
 *
 * The UNIQUE (keycloak_realm) constraint made a second STARTER/PROFESSIONAL tenant impossible: every one
 * is given the shared realm `construction-os`, and the second insert failed with
 * `tenants_keycloak_realm_key` (measured through the SYSTEM_ADMIN panel, 2026-09-14). The migration keeps
 * uniqueness for every realm except the shared `construction-os` — keyed on the realm, not the plan.
 * What this proves, in order:
 *
 *   1. two small tenants are created on the shared realm, by the real TenantService;
 *   2. a realm that is not the shared one cannot be registered twice, WHATEVER the plan — a second
 *      ENTERPRISE, a STARTER on an ENTERPRISE tenant's realm, two PROFESSIONAL rows on one own realm —
 *      and an ENTERPRISE row on the shared realm is accepted (a tenant upgraded before its realm exists);
 *   3. the realm binding in KeycloakJwtStrategy still holds with a realm shared by several tenants —
 *      each tenant's token validates on the shared realm, and a token naming one of them from a realm
 *      that is not theirs is refused. Reading the strategy suggested a Set allowlist and a per-tenant
 *      binding would cope; this is where that reading is checked.
 */
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  type IntegrationInfra,
} from '../helpers/integration-infra';
import { TenantService } from '../../src/modules/tenant/tenant.service';
import { KeycloakJwtStrategy } from '../../src/modules/identity/strategies/keycloak-jwt.strategy';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const ROLLBACK = readFileSync(
  join(
    __dirname,
    '../../prisma/rollbacks/20260914000001_keycloak_realm_unique_except_shared.rollback.sql',
  ),
  'utf8',
);

const MIGRATION = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20260914000001_keycloak_realm_unique_except_shared/migration.sql',
  ),
  'utf8',
);

const SHARED_REALM = 'construction-os';
const ADMIN_TENANT = '99999999-0000-4000-8000-000000000001';
const ADMIN_USER = '99999999-1111-4000-8000-000000000001';
const JUSTIFICATION = 'Shared-realm integration test (spec §7.6).';

describe('Shared Keycloak realm for small tenants (§7.6)', () => {
  let infra: IntegrationInfra;
  let tenants: TenantService;
  let strategy: KeycloakJwtStrategy;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    // The acting SYSTEM_ADMIN — createTenant audits, and audit_logs.actor_id needs a users row.
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_id, tenant_code, tenant_name, keycloak_realm, plan_type, is_active)
       VALUES ($1::uuid, 'realm-admin-home', 'Operator Home', 'cos-realm-admin-home', 'ENTERPRISE'::platform."PlanType", true)`,
      ADMIN_TENANT,
    );
    await infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
       VALUES ($1::uuid, $2::uuid, 'kc-realm-admin', 'op@example.com', 'Operator')`,
      ADMIN_USER,
      ADMIN_TENANT,
    );
    tenants = new TenantService({ isEnabled: () => false } as never);
    strategy = new KeycloakJwtStrategy();
  });

  afterAll(async () => {
    await tenants?.onModuleDestroy();
    await strategy?.onModuleDestroy();
    await stopIntegrationInfra(infra);
  });

  it('creates two STARTER/PROFESSIONAL tenants on the one shared realm', async () => {
    const a = await tenants.createTenant(
      { tenantCode: 'shared_a', tenantName: 'Shared A', planType: 'STARTER' as never },
      ADMIN_USER,
      JUSTIFICATION,
    );
    const b = await tenants.createTenant(
      { tenantCode: 'shared_b', tenantName: 'Shared B', planType: 'PROFESSIONAL' as never },
      ADMIN_USER,
      JUSTIFICATION,
    );
    expect(a.keycloak_realm).toBe(SHARED_REALM);
    expect(b.keycloak_realm).toBe(SHARED_REALM);
  });

  const insertTenant = (code: string, realm: string, plan: string) =>
    infra.prisma.$executeRawUnsafe(
      `INSERT INTO platform.tenants (tenant_code, tenant_name, keycloak_realm, plan_type)
       VALUES ($1, $1, $2, $3::platform."PlanType")`,
      code,
      realm,
      plan,
    );

  it('still refuses a second ENTERPRISE tenant on a dedicated realm that is taken', async () => {
    await expect(insertTenant('dup_ent', 'cos-realm-admin-home', 'ENTERPRISE')).rejects.toThrow(
      /tenants_keycloak_realm_dedicated_key/,
    );
  });

  // Rule 41 cycle 2 (#3): keyed on the plan, both of these were accepted.
  it("refuses a STARTER tenant on an ENTERPRISE tenant's realm", async () => {
    await expect(insertTenant('starter_on_ent', 'cos-realm-admin-home', 'STARTER')).rejects.toThrow(
      /tenants_keycloak_realm_dedicated_key/,
    );
  });

  it('refuses two PROFESSIONAL tenants on one realm that is not the shared one', async () => {
    await insertTenant('pro_own_1', 'own-realm-pro', 'PROFESSIONAL');
    await expect(insertTenant('pro_own_2', 'own-realm-pro', 'PROFESSIONAL')).rejects.toThrow(
      /tenants_keycloak_realm_dedicated_key/,
    );
    await infra.prisma.$executeRawUnsafe(
      `DELETE FROM platform.tenants WHERE tenant_code = 'pro_own_1'`,
    );
  });

  it('accepts an ENTERPRISE tenant on the shared realm (upgraded before its realm exists)', async () => {
    await insertTenant('ent_on_shared', SHARED_REALM, 'ENTERPRISE');
    await infra.prisma.$executeRawUnsafe(
      `DELETE FROM platform.tenants WHERE tenant_code = 'ent_on_shared'`,
    );
  });

  describe('KeycloakJwtStrategy on a shared realm', () => {
    const users: Record<string, { tenantId: string; userId: string }> = {};

    beforeAll(async () => {
      for (const [code, userId] of [
        ['shared_a', '99999999-2222-4000-8000-00000000000a'],
        ['shared_b', '99999999-2222-4000-8000-00000000000b'],
      ] as const) {
        const [row] = await infra.prisma.$queryRawUnsafe<Array<{ tenant_id: string }>>(
          `SELECT tenant_id::text FROM platform.tenants WHERE tenant_code = $1`,
          code,
        );
        await infra.prisma.$executeRawUnsafe(
          `INSERT INTO platform.users (user_id, tenant_id, keycloak_user_id, email, display_name)
           VALUES ($1::uuid, $2::uuid, $3, $4, $3)`,
          userId,
          row!.tenant_id,
          `kc-${code}`,
          `${code}@example.com`,
        );
        await infra.prisma.$executeRawUnsafe(
          `INSERT INTO platform.tenant_memberships (tenant_id, user_id, role)
           VALUES ($1::uuid, $2::uuid, 'SITE_ENGINEER'::platform."CosRoleEnum")`,
          row!.tenant_id,
          userId,
        );
        users[code] = { tenantId: row!.tenant_id, userId };
      }
    });

    // `sub` is the account's keycloak_user_id (`kc-<code>` in this fixture) — ADR-106 binds the two.
    const payload = (code: string, realm: string) => ({
      sub: `kc-${code}`,
      iss: `http://localhost:8090/realms/${realm}`,
      tenant_id: users[code]!.tenantId,
      user_id: users[code]!.userId,
      role: 'SITE_ENGINEER',
    });

    it('trusts the shared realm', async () => {
      const trusted = await (
        strategy as unknown as { isTrustedRealm: (r: string) => Promise<boolean> }
      ).isTrustedRealm(SHARED_REALM);
      expect(trusted).toBe(true);
    });

    it.each(['shared_a', 'shared_b'])(
      'validates a %s token issued by the shared realm',
      async (code) => {
        const user = await strategy.validate(payload(code, SHARED_REALM) as never);
        expect(user).toEqual(
          expect.objectContaining({
            tenant_id: users[code]!.tenantId,
            user_id: users[code]!.userId,
          }),
        );
      },
    );

    // ADR-106 — the case migration 20260914000001 opens. Same realm, so the realm check passes; user_id is
    // a real member of shared_b, so the ADR-077 join passes. Only the subject gives it away: it is
    // shared_a's user presenting shared_b's claims.
    it("REFUSES shared_a's user presenting shared_b's tenant_id and user_id on the shared realm", async () => {
      await expect(
        strategy.validate({ ...payload('shared_b', SHARED_REALM), sub: 'kc-shared_a' } as never),
      ).rejects.toThrow('Tenant or user not found or inactive');
    });

    it("refuses a shared-realm tenant's token issued by a realm that is not theirs", async () => {
      await expect(
        strategy.validate(payload('shared_a', 'cos-realm-admin-home') as never),
      ).rejects.toThrow('Tenant or user not found or inactive');
    });
  });

  // QM-9 "verified rollback". Run LAST: it is meant to refuse while realms are shared (created above),
  // and the refusal must leave the schema exactly as it was — one transaction, no half-applied state.
  it('the rollback refuses while a realm is shared, and changes nothing', async () => {
    const client = new Client({ connectionString: infra.pgUrl });
    await client.connect();
    try {
      await expect(client.query(ROLLBACK)).rejects.toThrow(/Rollback refused: realms shared/);
      await client.query('ROLLBACK').catch(() => undefined);
      const { rows } = await client.query(
        `SELECT indexname FROM pg_indexes WHERE schemaname='platform' AND tablename='tenants'
           AND indexdef LIKE '%keycloak_realm%'`,
      );
      expect(rows.map((r: { indexname: string }) => r.indexname)).toEqual([
        'tenants_keycloak_realm_dedicated_key',
      ]);
    } finally {
      await client.end();
    }
  });

  it('with no shared realm left, the rollback restores the constraint — and runs twice', async () => {
    await infra.prisma.$executeRawUnsafe(
      `DELETE FROM platform.tenant_memberships WHERE tenant_id IN
         (SELECT tenant_id FROM platform.tenants WHERE tenant_code IN ('shared_a','shared_b'))`,
    );
    await infra.prisma.$executeRawUnsafe(
      `DELETE FROM platform.users WHERE tenant_id IN
         (SELECT tenant_id FROM platform.tenants WHERE tenant_code IN ('shared_a','shared_b'))`,
    );
    await infra.prisma.$executeRawUnsafe(
      `DELETE FROM platform.audit_logs WHERE tenant_id IN
         (SELECT tenant_id FROM platform.tenants WHERE tenant_code IN ('shared_a','shared_b'))`,
    );
    await infra.prisma.$executeRawUnsafe(
      `DELETE FROM finance.wht_rules WHERE tenant_id IN
         (SELECT tenant_id FROM platform.tenants WHERE tenant_code IN ('shared_a','shared_b'))`,
    );
    await infra.prisma.$executeRawUnsafe(
      `DELETE FROM platform.tenants WHERE tenant_code IN ('shared_a','shared_b')`,
    );
    const client = new Client({ connectionString: infra.pgUrl });
    await client.connect();
    try {
      await client.query(ROLLBACK);
      await client.query(ROLLBACK);
      const { rows } = await client.query(
        `SELECT conname FROM pg_constraint WHERE conrelid = 'platform.tenants'::regclass
           AND conname = 'tenants_keycloak_realm_key'`,
      );
      expect(rows).toHaveLength(1);
    } finally {
      await client.end();
    }
  });

  // Rule 41 cycles 2 (#6) and 3 (#13). The migration's DROP is IF EXISTS, so a uniqueness living under
  // another name would survive it silently — as a plain index, an expression index, a different predicate
  // or with INCLUDE columns. Runs after the rollback above, so the forward migration is re-applied here
  // against a table carrying each such index in turn — and must refuse without having dropped anything,
  // with no transaction wrapped around it by the test.
  it.each([
    ['a plain index', '(keycloak_realm)'],
    ['an expression index', '(lower(keycloak_realm))'],
    ['a different predicate', '(keycloak_realm) WHERE is_active'],
    ['INCLUDE columns', '(keycloak_realm) INCLUDE (tenant_code)'],
  ])(
    'the migration refuses, changing nothing, when keycloak_realm is also UNIQUE via %s',
    async (_l, def) => {
      const client = new Client({ connectionString: infra.pgUrl });
      await client.connect();
      try {
        await client.query(
          `CREATE UNIQUE INDEX tenants_realm_other_unique ON platform.tenants ${def}`,
        );
        await expect(client.query(MIGRATION)).rejects.toThrow(
          /keycloak_realm is also UNIQUE via: tenants_realm_other_unique/,
        );
        const { rows } = await client.query(
          `SELECT conname FROM pg_constraint WHERE conrelid = 'platform.tenants'::regclass
           AND conname = 'tenants_keycloak_realm_key'`,
        );
        expect(rows).toHaveLength(1);
      } finally {
        await client.query('DROP INDEX IF EXISTS platform.tenants_realm_other_unique');
        await client.end();
      }
    },
  );

  it('with no other uniqueness left, the migration re-applies cleanly', async () => {
    const client = new Client({ connectionString: infra.pgUrl });
    await client.connect();
    try {
      await client.query(MIGRATION);
      const { rows: idx } = await client.query(
        `SELECT indexname FROM pg_indexes WHERE schemaname='platform' AND tablename='tenants'
           AND indexdef LIKE '%keycloak_realm%'`,
      );
      expect(idx.map((r: { indexname: string }) => r.indexname)).toEqual([
        'tenants_keycloak_realm_dedicated_key',
      ]);
    } finally {
      await client.end();
    }
  });
});
