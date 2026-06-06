// Resolves the PostgreSQL connection URL for a given tenant.
// Always queries platform.tenants via DATABASE_URL (platform schema never moves to dedicated DB).
// Returns dedicated_db_url if set (enterprise), else DATABASE_URL (shared DB).

import { PrismaClient } from '@prisma/client';

export async function getDbUrlForTenant(tenantId: string): Promise<string> {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env['DATABASE_URL'] } },
  });
  try {
    const rows = await prisma.$queryRaw<Array<{ dedicated_db_url: string | null }>>`
      SELECT dedicated_db_url FROM platform.tenants
      WHERE tenant_id = ${tenantId}::uuid AND is_active = true
      LIMIT 1
    `;
    return rows[0]?.dedicated_db_url ?? process.env['DATABASE_URL'] ?? '';
  } finally {
    await prisma.$disconnect();
  }
}
