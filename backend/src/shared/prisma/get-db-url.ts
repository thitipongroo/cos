// Resolves the PostgreSQL connection URL for a given tenant.
// The platform.tenants lookup uses DATABASE_URL (platform schema never moves to a dedicated DB; this
// is a controlled config read keyed by a validated UUID). The RETURNED connection — used for the
// tenant's domain queries — is an app-role URL so PostgreSQL RLS is enforced: dedicated_db_url for
// enterprise tenants (already an app-role URL), else APP_DATABASE_URL for shared tenants. It must
// never return the RLS-bypassing DATABASE_URL superuser (spec §7.7, QM-18, ADR-008).

import { createPrismaClient } from './create-prisma-client';
import { appDatabaseUrl } from './app-database-url';
import { decryptDedicatedDbUrl } from '../crypto/dedicated-db-url-cipher';

/**
 * A tenant that is inactive (deactivated, or paused while enterprise provisioning moves it — D48) or that
 * does not exist. Every path into a tenant's data refuses it, as the Keycloak JWT path does with a 401
 * (keycloak-jwt.strategy.ts joins `t.is_active = true`) — D50, 2026-11-13.
 */
export class TenantInactiveError extends Error {
  constructor(
    readonly tenantId: string,
    readonly reason: 'inactive' | 'unknown',
  ) {
    super(`tenant ${tenantId} is ${reason === 'inactive' ? 'not active' : 'unknown'}`);
    this.name = 'TenantInactiveError';
  }
}

/**
 * Where a tenant's data lives: its dedicated database's app-role URL, or null for the shared one. Throws
 * TenantInactiveError for an inactive or unknown tenant (D50) — until 2026-11-13 both read as "shared",
 * so writes for a paused enterprise tenant landed in the shared database it was being moved out of.
 * Read per call, like the JWT path: routing switches at once when provisioning assigns the database.
 */
export async function resolveTenantDb(
  tenantId: string,
): Promise<{ dedicatedDbUrl: string | null }> {
  const prisma = createPrismaClient(process.env['DATABASE_URL']);
  try {
    const rows = await prisma.$queryRaw<
      Array<{ is_active: boolean; dedicated_db_url: string | null }>
    >`
      SELECT is_active, dedicated_db_url FROM platform.tenants
      WHERE tenant_id = ${tenantId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) throw new TenantInactiveError(tenantId, 'unknown');
    if (!row.is_active) throw new TenantInactiveError(tenantId, 'inactive');
    // Stored value may be ciphertext (s1.tenant.encrypted-db-url) or legacy plaintext — the decrypt
    // helper accepts both, so no backfill is needed (security review F5b).
    return {
      dedicatedDbUrl: row.dedicated_db_url ? decryptDedicatedDbUrl(row.dedicated_db_url) : null,
    };
  } finally {
    await prisma.$disconnect();
  }
}

/** The app-role URL for a tenant's domain queries; throws TenantInactiveError (see resolveTenantDb). */
export async function getDbUrlForTenant(tenantId: string): Promise<string> {
  const { dedicatedDbUrl } = await resolveTenantDb(tenantId);
  return dedicatedDbUrl ?? appDatabaseUrl();
}
