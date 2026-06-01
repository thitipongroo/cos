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
}
