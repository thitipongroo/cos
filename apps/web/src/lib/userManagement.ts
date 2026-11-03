/**
 * What a refused role change or deactivation says on Settings → Users. Pure, so it sits inside the QM-1 gate.
 *
 * COS-TADM-004 is the last-administrator guard (ADR-110 round 2, `s1.tenant.last-admin-guard`): the change would leave
 * the tenant with no active TENANT_ADMIN. It gets its own message because the fix is specific — make someone else an
 * administrator first. COS-AUTH-002 (400) is TENANT_ADMIN / FINANCE given to an account with no email (§5.4.4).
 * Anything else is the general "nothing was changed".
 */
export function userChangeErrorKey(
  error: { code?: string; status?: number } | null | undefined,
): string {
  if (error?.code === 'COS-TADM-004') return 'user.error.lastTenantAdmin';
  // 400 only: COS-AUTH-002 also names the 503 "SMS provider unavailable" (docs/api/error-codes.md).
  if (error?.code === 'COS-AUTH-002' && error.status === 400) return 'user.role.pathBRequiresEmail';
  return 'settings.userChangeFailed';
}
