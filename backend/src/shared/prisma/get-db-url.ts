// Resolves the PostgreSQL connection URL for a given tenant.
// The platform.tenants lookup uses DATABASE_URL (platform schema never moves to a dedicated DB; this
// is a controlled config read keyed by a validated UUID). The RETURNED connection — used for the
// tenant's domain queries — is an app-role URL so PostgreSQL RLS is enforced: dedicated_db_url for
// enterprise tenants (already an app-role URL), else APP_DATABASE_URL for shared tenants. It must
// never return the RLS-bypassing DATABASE_URL superuser (spec §7.7, QM-18, ADR-008).

import { createPrismaClient } from './create-prisma-client';
import { appDatabaseUrl } from './app-database-url';
import { decryptDedicatedDbUrl } from '../crypto/dedicated-db-url-cipher';

export async function getDbUrlForTenant(tenantId: string): Promise<string> {
  const prisma = createPrismaClient(process.env['DATABASE_URL']);
  try {
    const rows = await prisma.$queryRaw<Array<{ dedicated_db_url: string | null }>>`
      SELECT dedicated_db_url FROM platform.tenants
      WHERE tenant_id = ${tenantId}::uuid AND is_active = true
      LIMIT 1
    `;
    // Stored value may be ciphertext (s1.tenant.encrypted-db-url) or legacy plaintext — the decrypt
    // helper accepts both, so no backfill is needed (security review F5b).
    const stored = rows[0]?.dedicated_db_url;
    return stored ? decryptDedicatedDbUrl(stored) : appDatabaseUrl();
  } finally {
    await prisma.$disconnect();
  }
}
