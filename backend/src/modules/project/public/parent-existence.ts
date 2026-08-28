// Tenant-scoped parent-existence checks for the `projects` spatial hierarchy (§10.2/§11.2).
//
// One function per parent table. The table and id column are SQL identifiers, which $queryRaw cannot
// parameterize and which QM-4 forbids interpolating — so this is deliberately three static queries
// rather than one generic helper. Each check is scoped to the caller's tenant_id (RLS is the primary
// isolation; this WHERE is defence-in-depth and drives the not-found → 404 in the services).
//
// Callers are the modules/project/* repositories, which delegate their projectExists / buildingExists
// / floorExists methods here so the existence SQL for each parent lives in exactly one place.

import type { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';

/** True when a project with this id exists in the tenant. */
export async function projectExistsInTenant(
  tenantPrisma: TenantPrismaService,
  projectId: string,
  tenantId: string,
): Promise<boolean> {
  const rows = await tenantPrisma.run(
    async (tx) =>
      await tx.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS(
          SELECT 1 FROM projects.projects
          WHERE project_id = ${projectId}::uuid AND tenant_id = ${tenantId}::uuid
        ) AS exists
      `,
  );
  return rows[0]?.exists ?? false;
}

/** True when a building with this id exists in the tenant. */
export async function buildingExistsInTenant(
  tenantPrisma: TenantPrismaService,
  buildingId: string,
  tenantId: string,
): Promise<boolean> {
  const rows = await tenantPrisma.run(
    async (tx) =>
      await tx.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS(
          SELECT 1 FROM projects.buildings
          WHERE building_id = ${buildingId}::uuid AND tenant_id = ${tenantId}::uuid
        ) AS exists
      `,
  );
  return rows[0]?.exists ?? false;
}

/** True when a floor with this id exists in the tenant. */
export async function floorExistsInTenant(
  tenantPrisma: TenantPrismaService,
  floorId: string,
  tenantId: string,
): Promise<boolean> {
  const rows = await tenantPrisma.run(
    async (tx) =>
      await tx.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS(
          SELECT 1 FROM projects.floors
          WHERE floor_id = ${floorId}::uuid AND tenant_id = ${tenantId}::uuid
        ) AS exists
      `,
  );
  return rows[0]?.exists ?? false;
}
