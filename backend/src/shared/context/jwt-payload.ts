// JWT payload shape — RS256 signed by Keycloak (Path B) or COS identity service (Path A).
// Claim names defined in spec §5.4.1 (05-security-compliance.md).
//
// Lives in shared/ rather than in the identity MODULE. spec §6.9 puts RolesGuard and PolicyGuard in
// backend/src/shared/guards/ precisely "because they depend on JwtPayload" — so the shape those
// guards need cannot itself sit inside a module, or the shared layer depends on a module it is
// meant to sit beneath. It did: roles.guard, policy.guard, permissions.guard and audit.interceptor
// all reached into modules/identity for it, and so did sync's own auth guard, which was a
// cross-module reach past identity's public API (master:1608). Moved 2026-08-26.

export interface JwtPayload {
  // Standard OIDC claims
  sub: string; // Keycloak user_id (= platform.users.keycloak_user_id)
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  jti: string;

  // COS custom claims — authoritative names per spec §5.4.1
  tenant_id: string; // UUID — platform.tenants.tenant_id
  user_id: string; // UUID — platform.users.user_id (distinct from sub)
  role: string; // CosRole enum value e.g. "PROJECT_MANAGER"

  // Standard OIDC profile claims (optional)
  email?: string;
  phone_number?: string;
  name?: string;

  // Authentication Context Class Reference (OIDC standard). Emitted by Keycloak's `acr` client scope
  // and driven by the realm's acr.loa.map step-up config — used to prove MFA (OTP) was performed for
  // privileged roles (see shared/guards/mfa-enforcement.ts, spec §5.4.1).
  acr?: string;
}

/**
 * What the auth layer actually puts on `req.user`.
 *
 * JwtPayload plus the two fields resolved from platform.tenants during authentication. Declared
 * beside the payload rather than in the Passport strategy that produces it: shared/ code reads
 * `req.user` — tenant-context.interceptor is the reason this moved on 2026-08-26 — and importing
 * the shape from modules/identity made the shared layer depend on a module it sits beneath.
 */
export interface AuthenticatedUser extends JwtPayload {
  tenantCode: string;
  dedicatedDbUrl?: string;
}
