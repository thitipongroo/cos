// Boot-time assertion over the staged-rollout security toggles (security review F8).
//
// THE PROBLEM THIS SOLVES
// ----------------------
// Three security controls ship with `?? 'false'` defaults so they could be merged before the
// surrounding infrastructure was ready:
//
//   WAF_ORIGIN_ENFORCE         — bind traffic to the edge (cloudflare-waf.middleware.ts)
//   MFA_ENFORCE                — reject privileged tokens lacking OTP proof (mfa-enforcement.ts)
//   WEBHOOK_REPLAY_PROTECTION  — require a signed timestamp (platform-webhook.service.ts)
//
// Each default is individually defensible — enabling one before its infrastructure is verified would
// 403 all live traffic, lock out every TENANT_ADMIN/FINANCE user, or reject every real webhook. What is
// NOT defensible is that a production deploy which simply never mentions them boots silently with all
// three off, and looks identical to one where an operator deliberately chose off.
//
// So this does not flip any default — flipping them is an operational decision that needs the
// infrastructure verified first (docs/runbooks/mfa-enforcement.md). It forces the decision to be
// EXPLICIT in production: set each variable to `true` or `false`, and the posture becomes reviewable in
// config rather than inferred from an omission. Non-production environments are untouched.

import { createLogger } from '@cos/logger';
import { parseCidrList } from '../net/cidr-match';

const logger = createLogger('security-toggles');

/** Toggles whose value must be stated outright in production, never left to a default. */
export const REQUIRED_PRODUCTION_TOGGLES = [
  'WAF_ORIGIN_ENFORCE',
  'MFA_ENFORCE',
  'WEBHOOK_REPLAY_PROTECTION',
] as const;

/**
 * Case-insensitive "true".
 *
 * Takes a required string, not `string | undefined`: every call below happens AFTER the unset check,
 * which guarantees the variable is present. A `?? ''` default here would be an unreachable branch that
 * only served to hide that guarantee.
 */
function isTrue(raw: string): boolean {
  return raw.toLowerCase() === 'true';
}

/**
 * Throw when production configuration leaves a security posture implicit.
 *
 * Two rules:
 *  1. Every toggle in {@link REQUIRED_PRODUCTION_TOGGLES} must be set (to either value) in production.
 *  2. `WAF_ORIGIN_ENFORCE=true` with no TRUSTED_PROXY_CIDRS is rejected outright — that combination is
 *     not a stricter posture, it is a total outage: the middleware denies every request whose peer is
 *     not in an empty allowlist, which is every request. Better to fail at boot than to serve 403s.
 *
 * No-op outside production, where the staged defaults are exactly what local/CI runs want.
 */
export function assertSecurityTogglesConfigured(env: NodeJS.ProcessEnv = process.env): void {
  if (env['NODE_ENV'] !== 'production') return;

  const unset = REQUIRED_PRODUCTION_TOGGLES.filter((name) => env[name] === undefined);
  if (unset.length > 0) {
    throw new Error(
      `Security toggles must be set explicitly in production: ${unset.join(', ')}. ` +
        'Set each to "true" or "false" — leaving one unset silently disables it ' +
        '(see backend/src/shared/config/security-toggles.ts).',
    );
  }

  if (
    isTrue(env['WAF_ORIGIN_ENFORCE']!) &&
    parseCidrList(env['TRUSTED_PROXY_CIDRS']).length === 0
  ) {
    throw new Error(
      'WAF_ORIGIN_ENFORCE=true requires TRUSTED_PROXY_CIDRS to be non-empty — with an empty ' +
        'allowlist CloudflareWafMiddleware denies every request.',
    );
  }

  logger.info(
    {
      wafOriginEnforce: isTrue(env['WAF_ORIGIN_ENFORCE']!),
      mfaEnforce: isTrue(env['MFA_ENFORCE']!),
      webhookReplayProtection: isTrue(env['WEBHOOK_REPLAY_PROTECTION']!),
      trustedProxyRanges: parseCidrList(env['TRUSTED_PROXY_CIDRS']).length,
    },
    'security.toggles.resolved',
  );
}
