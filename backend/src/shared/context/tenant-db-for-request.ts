// The routing a request that has no Keycloak JWT gets (D50, 2026-11-13).
//
// JwtAuthGuard publishes CLS_DEDICATED_DB_URL from keycloak-jwt.strategy, which also refuses an inactive
// tenant with a 401. The guards that authenticate a request some other way — a vendor's magic link or
// session, a contract-signing link, a data subject's verification link — published only the tenant, so
// TenantPrismaService sent an enterprise tenant's requests to the shared database, and an inactive (for
// instance paused, mid-provisioning) tenant was not refused. They call this after verifying their token.

import { UnauthorizedException } from '@nestjs/common';
import { resolveTenantDb, TenantInactiveError } from '../prisma/get-db-url';

/** The tenant's dedicated database URL, or null for the shared one; 401 for an inactive or unknown tenant. */
export async function tenantDbForRequest(tenantId: string): Promise<string | null> {
  try {
    return (await resolveTenantDb(tenantId)).dedicatedDbUrl;
  } catch (err) {
    if (err instanceof TenantInactiveError) {
      // The JWT path's wording (keycloak-jwt.strategy.ts), so both read the same to a client.
      throw new UnauthorizedException('Tenant or user not found or inactive');
    }
    throw err;
  }
}
