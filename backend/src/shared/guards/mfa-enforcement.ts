// MFA enforcement — Layer 2 (defense-in-depth) for the two-layer MFA design (spec §5.4.1, master Phase 2).
//
// Layer 1 (authoritative): Keycloak forces OTP at login for TENANT_ADMIN / FINANCE, and refuses them
//   outright on Path A. PRESENT in infrastructure/keycloak/realms/construction-os-realm.json since
//   2026-08-22: the realm binds `browserFlow: browser-mfa` and `directGrantFlow: direct-grant-mfa`,
//   and carries `acr.loa.map = {"silver":1,"gold":2}`. `scripts/ci/check-keycloak-mfa-config.mjs`
//   asserts it stays there, in the CI lint job.
//
//   THE MECHANISM IS NOT THE ONE ADR-067 ORIGINALLY SPECIFIED. `conditional-user-role` appears zero
//   times: it was proven unusable and replaced by a `Condition - user attribute` on the `role` user
//   attribute (`^(TENANT_ADMIN|FINANCE)$`), which is what the two custom flows condition on. The
//   composite role `mfa-required` does not exist and is not needed.
//
//   This comment asserted the opposite until 2026-08-23 — it still described the pre-2026-08-22
//   realm and told the reader that Layer 2 was "the only depth there is". It was stale by a day when
//   it was written and wrong for a year of reading after that; a security control's own source file
//   is the worst place to be wrong about whether the other layer exists (TDD OQ-10).
//
//   Two things remain genuinely OPS work, not code: an already-running Keycloak does not pick up the
//   committed realm (`--import-realm` runs on first init only), and Layer 2 is off until MFA_ENFORCE
//   is set. Both are docs/runbooks/mfa-enforcement.md. Never hand-edit the realm JSON's flows: a
//   malformed import breaks every login and there is no Keycloak in CI to validate one against.
// Layer 2 (this module): the backend independently rejects a privileged token whose `acr` does not prove
//   OTP was performed, so a token minted without the OTP step cannot act as TENANT_ADMIN / FINANCE. Invoked
//   from JwtAuthGuard.handleRequest (every authenticated request) — JwtAuthGuard is applied per-route, and
//   a global APP_GUARD would run BEFORE authentication (no req.user yet), so this is the correct hook.
//
// Rollout safety: enforcement is gated by MFA_ENFORCE (default OFF). The realm's acr.loa.map must be
// verified against a running Keycloak first (docs/runbooks/mfa-enforcement.md) — enforcing before `acr`
// is emitted correctly would lock out every privileged user. Until enabled, a shortfall is logged (WARN)
// but not blocked, so the tested code ships and ops activates it deliberately.
//
// BOTH VARIABLES ARE IN THE HELM VALUES for every environment (infrastructure/helm/cos-backend), set
// to the same defaults as here. They were in `.env.example` only until 2026-08-23, which meant the
// deliberate activation this comment describes was impossible in a cluster without first editing a
// chart — the kill switch existed everywhere except where it would be thrown (TDD OQ-10).

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
