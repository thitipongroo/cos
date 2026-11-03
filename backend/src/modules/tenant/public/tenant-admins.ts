// Who counts as a tenant's administrator — one definition for the SYSTEM_ADMIN list (tenant_admin_count /
// tenant_admin_pending) and for the first-admin bootstrap guard (ADR-110), so the button the list offers and the
// rule the endpoint enforces cannot disagree.
//
// An administrator is an ACTIVE platform.users row of the tenant holding TENANT_ADMIN as its primary role
// (tenant_memberships) or as an additional role (user_additional_roles) — the same union RolesGuard authorises.
// The predicate is written out in both queries below because a tagged-template query cannot take a fragment
// without Prisma.sql; KEEP THE TWO WHERE CLAUSES IDENTICAL.
//
// "Never signed in" is the bootstrap invitation not yet used. platform.users.last_seen_at is NOT NULL and
// defaults to now() exactly as created_at does, in the same INSERT, so the two are equal until LastSeenService
// first writes it on an authenticated request. Equality is therefore "never signed in"; there is no NULL to test.

import type { Prisma } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, '$queryRaw'>;

export interface TenantAdminRow {
  user_id: string;
  never_signed_in: boolean;
}

export interface TenantAdminState {
  tenant_admin_count: number;
  /** The tenant's ONLY administrator has never signed in — the invitation can be resent. */
  tenant_admin_pending: boolean;
}

/** The tenant's active administrators, leaving out `exceptUserId` when one is given. */
export async function tenantAdmins(
  db: Db,
  tenantId: string,
  exceptUserId: string | null = null,
): Promise<TenantAdminRow[]> {
  const rows = await db.$queryRaw<TenantAdminRow[]>`
    SELECT u.user_id, (u.last_seen_at = u.created_at) AS never_signed_in
      FROM platform.users u
     WHERE u.tenant_id = ${tenantId}::uuid
       AND u.is_active
       AND (EXISTS (SELECT 1 FROM platform.tenant_memberships m
                     WHERE m.tenant_id = u.tenant_id AND m.user_id = u.user_id AND m.role = 'TENANT_ADMIN')
            OR EXISTS (SELECT 1 FROM platform.user_additional_roles r
                        WHERE r.tenant_id = u.tenant_id AND r.user_id = u.user_id AND r.role = 'TENANT_ADMIN'))
  `;
  return exceptUserId === null ? rows : rows.filter((r) => r.user_id !== exceptUserId);
}

/** Administrator state of every tenant that has at least one; a tenant missing from the map has none. */
export async function tenantAdminStates(db: Db): Promise<Map<string, TenantAdminState>> {
  const rows = await db.$queryRaw<Array<TenantAdminState & { tenant_id: string }>>`
    SELECT u.tenant_id,
           count(*)::int AS tenant_admin_count,
           (count(*) = 1 AND bool_and(u.last_seen_at = u.created_at)) AS tenant_admin_pending
      FROM platform.users u
     WHERE u.is_active
       AND (EXISTS (SELECT 1 FROM platform.tenant_memberships m
                     WHERE m.tenant_id = u.tenant_id AND m.user_id = u.user_id AND m.role = 'TENANT_ADMIN')
            OR EXISTS (SELECT 1 FROM platform.user_additional_roles r
                        WHERE r.tenant_id = u.tenant_id AND r.user_id = u.user_id AND r.role = 'TENANT_ADMIN'))
     GROUP BY u.tenant_id
  `;
  return new Map(
    rows.map(({ tenant_id, ...state }) => [tenant_id, state] as [string, TenantAdminState]),
  );
}

export const NO_TENANT_ADMIN: TenantAdminState = {
  tenant_admin_count: 0,
  tenant_admin_pending: false,
};
