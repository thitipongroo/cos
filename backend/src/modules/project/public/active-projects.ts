// Active-project count — the quantity every plan limit is measured in (spec §26.1, ADR-109).
//
// "Active" is DRAFT, ACTIVE or ON_HOLD: a project the tenant is still running or about to run. COMPLETED and
// CANCELLED projects stay readable but do not count. Published here so the tenant module (plan conversion,
// COS-PLAN-002) and the project module (project creation, COS-PLAN-001) count the same thing.
//
// Takes any transaction client: the tenant module calls it from the platform client's transaction, the project
// module from TenantPrismaService's. The tenant_id WHERE is the isolation for the first and defence-in-depth
// behind RLS for the second.

import type { Prisma } from '@prisma/client';

/** The project statuses a plan's project limit counts. */
export const ACTIVE_PROJECT_STATUSES = ['DRAFT', 'ACTIVE', 'ON_HOLD'] as const;

/** How many active projects the tenant has. Call inside the transaction that acts on the answer. */
export async function countActiveProjects(
  // Only what is used, so both a $transaction client and TenantPrismaService.run's client fit.
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  tenantId: string,
): Promise<number> {
  // The status list is static SQL, kept in step with ACTIVE_PROJECT_STATUSES by the spec beside this file.
  const [row] = await tx.$queryRaw<Array<{ active: number }>>`
    SELECT count(*)::int AS active
      FROM projects.projects
     WHERE tenant_id = ${tenantId}::uuid
       AND status::text IN ('DRAFT', 'ACTIVE', 'ON_HOLD')
  `;
  // count(*) with no GROUP BY always returns exactly one row.
  return row!.active;
}
