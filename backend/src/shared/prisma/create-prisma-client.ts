import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Build a PrismaClient backed by the node-postgres driver adapter (Prisma 7 / ADR-041).
 *
 * Prisma 7 removed schema `url`/`datasources`; a client must be given a driver adapter instead.
 * Defaults to `DATABASE_URL` — the app runtime connection, which routes through PgBouncer in
 * transaction mode (QM-18). Callers routing to a per-tenant / dedicated ENTERPRISE database pass an
 * explicit `connectionString` (ADR-008, spec §7.1); `TenantPrismaService` continues to key its
 * client pool by URL and wrap queries in `SET LOCAL app.current_tenant_id` for RLS.
 *
 * The returned client still exposes `$disconnect()` and is closed on shutdown (ADR-034).
 */
export function createPrismaClient(
  connectionString: string = process.env['DATABASE_URL'] ?? '',
  options?: Omit<Prisma.PrismaClientOptions, 'adapter' | 'datasources' | 'datasourceUrl'>,
): PrismaClient {
  return new PrismaClient({ ...options, adapter: new PrismaPg({ connectionString }) });
}
