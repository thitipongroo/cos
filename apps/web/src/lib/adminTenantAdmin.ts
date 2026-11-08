/**
 * The SYSTEM_ADMIN side of a tenant's first TENANT_ADMIN (ADR-110): when the Tenant List and Tenant Detail offer to
 * create one or to resend its invitation, and what a refusal says. Pure, so it sits inside the QM-1 gate; the modal
 * only renders it. The backend enforces the same rule (TenantAdminBootstrapService) — this decides what is shown.
 */

import { errorKeyForStatus, type TenantListRow } from './adminTenants';

/** How long the invitation link stays valid — ADMIN_INVITE_LIFESPAN_SEC on the server (product owner, 2026-11-02). */
export const ADMIN_INVITE_HOURS = 72;

export type TenantAdminAction = 'create' | 'resend';

/** What the modal does: the two row states above, plus withdrawing the unused invitation (offered with `resend`). */
export type TenantAdminMode = TenantAdminAction | 'cancel';

/**
 * `create` for an active tenant with no administrator; `resend` while its only administrator has never signed in (a
 * hint — the server refuses with COS-TADM-002 once the invitation is used);
 * nothing otherwise, and nothing at all while `s1.tenant.bootstrap-admin` is off.
 */
export function tenantAdminAction(
  row: Pick<TenantListRow, 'is_active' | 'tenant_admin_count' | 'tenant_admin_pending'>,
  enabled: boolean,
): TenantAdminAction | null {
  if (!enabled || !row.is_active) return null;
  if (row.tenant_admin_count === 0) return 'create';
  return row.tenant_admin_pending ? 'resend' : null;
}

/**
 * What a refused request says. The COS-TADM conflicts and an email held by another account (COS-USER-003) are all
 * 409 and tell the operator different things, so they are told apart by code; a resend too soon is 429 COS-TADM-005;
 * a switched-off flag is 503 COS-FLAG-001.
 */
export function tenantAdminErrorKey(
  error: { status?: number; code?: string } | null | undefined,
): string {
  if (error?.code === 'COS-TADM-001') return 'admin.tenantAdmin.error.alreadyHasAdmin';
  if (error?.code === 'COS-TADM-002') return 'admin.tenantAdmin.error.notResendable';
  if (error?.code === 'COS-TADM-003') return 'admin.tenantAdmin.error.notCancellable';
  if (error?.code === 'COS-TADM-005') return 'admin.tenantAdmin.error.resendTooSoon';
  if (error?.code === 'COS-USER-003') return 'admin.tenantAdmin.error.emailTaken';
  if (error?.code === 'COS-USER-004') return 'admin.errors.invalid';
  // These endpoints have no other 503, so status alone also reads as switched off.
  if (error?.code === 'COS-FLAG-001' || error?.status === 503)
    return 'admin.tenantAdmin.error.disabled';
  if (error?.status === 409) return 'admin.tenantAdmin.error.emailTaken';
  return errorKeyForStatus(error?.status, 'rowAction');
}
