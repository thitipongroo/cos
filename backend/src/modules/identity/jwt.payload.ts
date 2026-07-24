// JWT payload shape — RS256 signed by Keycloak (Path B) or COS identity service (Path A).
// Claim names defined in spec §5.4.1 (05-security-compliance.md).

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
