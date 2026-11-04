// Who counts as a tenant's administrator — one definition for the SYSTEM_ADMIN list (tenant_admin_count /
// tenant_admin_pending) and for the first-admin bootstrap guard (ADR-110), so the button the list offers and the
// rule the endpoint enforces cannot disagree.
//
// An administrator is an ACTIVE platform.users row of the tenant holding TENANT_ADMIN as its primary role
// (tenant_memberships) or as an additional role (user_additional_roles) — the union RolesGuard authorises. Whether
// the account has an email does NOT matter here: Keycloak's Path B gate reads only the PRIMARY role, so a phone-only
// account holding TENANT_ADMIN as an additional role signs in by OTP and acts as an administrator (round 3 review).
// The predicate is written out in both queries below because a tagged-template query cannot take a fragment
// without Prisma.sql; KEEP THE TWO WHERE CLAUSES IDENTICAL.
//
// "Never signed in" is the bootstrap invitation not yet used. platform.users.last_seen_at is NOT NULL and
// defaults to now() exactly as created_at does, in the same INSERT, so the two are equal until LastSeenService
// first writes it on an authenticated request. Equality is therefore "never signed in"; there is no NULL to test.

import { ConflictException } from '@nestjs/common';
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

/** docs/api/error-codes.md § COS-TADM. Here, not in the bootstrap service, because UserService raises 004 too. */
export const TENANT_ADMIN_ERROR = {
  ALREADY_HAS_ADMIN: 'COS-TADM-001',
  INVITE_NOT_RESENDABLE: 'COS-TADM-002',
  INVITE_NOT_CANCELLABLE: 'COS-TADM-003',
  LAST_ADMIN: 'COS-TADM-004',
  RESEND_TOO_SOON: 'COS-TADM-005',
} as const;

/** QM-15 flag for the last-administrator guard in UserService (ADR-110 round 2). Default OFF. */
export const LAST_ADMIN_GUARD_FLAG = 's1.tenant.last-admin-guard';

/**
 * Serialises the changes to a tenant's administrator set made by the bootstrap, resend, cancel and, with the guard
 * on, UserService's role changes and deactivation. PDPA erasure (subject-request.repository.ts) deactivates accounts
 * WITHOUT it, on purpose: a statutory erasure is never refused, so it can leave a tenant with no administrator. Released at commit or rollback. Taken before any row the transaction
 * updates or locks, so two writers never wait on each other in opposite orders. The one exception, bootstrap, takes it
 * after its INSERT, holding only the KEY SHARE lock the platform.users foreign key places on the tenant row — which
 * conflicts with none of the locks the other writers take.
 */
export async function lockTenantAdmins(
  tx: Pick<Prisma.TransactionClient, '$executeRaw'>,
  tenantId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`cos:tenant-admin:${tenantId}`}, 0))`;
}

/**
 * Refuse (409 COS-TADM-004) when the caller's write in this transaction took the tenant's LAST active administrator
 * away. `wasAdmin` is whether the user it changed was an administrator before the write (read under the same lock);
 * a write that did not touch an administrator is never refused, even in a tenant that already has none.
 */
export async function assertTenantKeepsAnAdmin(
  db: Db,
  tenantId: string,
  userId: string,
  wasAdmin: boolean,
): Promise<void> {
  if (!wasAdmin || (await tenantAdmins(db, tenantId)).length > 0) return;
  throw new ConflictException({
    error: {
      code: TENANT_ADMIN_ERROR.LAST_ADMIN,
      message:
        'A tenant must keep at least one administrator. Make someone else an administrator first.',
      messageKey: 'user.error.lastTenantAdmin',
      details: { user_id: userId },
    },
  });
}

/** Whether `userId` is one of the tenant's active administrators right now (call under lockTenantAdmins). */
export async function isTenantAdmin(db: Db, tenantId: string, userId: string): Promise<boolean> {
  return (await tenantAdmins(db, tenantId)).some((a) => a.user_id === userId);
}
