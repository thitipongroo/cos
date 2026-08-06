// MFA enforcement — Layer 2 (defense-in-depth) for the two-layer MFA design (spec §5.4.1, master Phase 2).
//
// Layer 1 (authoritative): Keycloak forces OTP at login for TENANT_ADMIN / FINANCE via a role-conditional
//   OTP subflow in the browser flow (infrastructure/keycloak/realms/construction-os-realm.json).
// Layer 2 (this module): the backend independently rejects a privileged token whose `acr` does not prove
//   OTP was performed, so a token minted without the OTP step cannot act as TENANT_ADMIN / FINANCE. Invoked
//   from JwtAuthGuard.handleRequest (every authenticated request) — JwtAuthGuard is applied per-route, and
//   a global APP_GUARD would run BEFORE authentication (no req.user yet), so this is the correct hook.
//
// Rollout safety: enforcement is gated by MFA_ENFORCE (default OFF). The realm's acr.loa.map must be
// verified against a running Keycloak first (docs/runbooks/mfa-enforcement.md) — enforcing before `acr`
// is emitted correctly would lock out every privileged user. Until enabled, a shortfall is logged (WARN)
// but not blocked, so the tested code ships and ops activates it deliberately.

import { ForbiddenException } from '@nestjs/common';
import { createLogger } from '@cos/logger';

const logger = createLogger('mfa-enforcement');

// Roles that MUST complete MFA (TOTP) — Path B office roles (spec §5.4.1, §14, §20.8; master Phase 2).
export const MFA_REQUIRED_ROLES: ReadonlySet<string> = new Set(['TENANT_ADMIN', 'FINANCE']);

/** acr value(s) that prove OTP was performed, per the realm's acr.loa.map. Env-tunable so ops aligns the
 *  code with the realm without a redeploy (comma-separated). */
function acceptedAcrValues(): Set<string> {
  const raw = process.env['MFA_REQUIRED_ACR'] ?? 'gold';
  return new Set(
    raw
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  );
}

function enforcementEnabled(): boolean {
  return (process.env['MFA_ENFORCE'] ?? 'false').toLowerCase() === 'true';
}

/**
 * Throw ForbiddenException (COS-AUTH-001) when a TENANT_ADMIN / FINANCE token lacks proof of MFA and
 * enforcement is enabled. No-op for every other role, for a satisfied `acr`, or (with a WARN) while
 * MFA_ENFORCE is off.
 */
export function enforceMfaForPrivilegedRoles(user: {
  role: string;
  acr?: string;
  user_id?: string;
}): void {
  if (!MFA_REQUIRED_ROLES.has(user.role)) return;
  if (acceptedAcrValues().has(user.acr ?? '')) return;

  if (!enforcementEnabled()) {
    logger.warn(
      { userId: user.user_id, role: user.role, acr: user.acr ?? null },
      'mfa.shortfall — privileged role without MFA acr (enforcement disabled: MFA_ENFORCE!=true)',
    );
    return;
  }

  throw new ForbiddenException({
    error: {
      code: 'COS-AUTH-001',
      message: 'Multi-factor authentication is required for this role',
      messageKey: 'auth.mfa.required',
    },
  });
}
