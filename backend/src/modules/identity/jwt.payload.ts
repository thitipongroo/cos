// JWT payload shape — RS256 signed by Keycloak.
// Both Path A (SMS OTP) and Path B (Keycloak OIDC) produce this shape.

export interface JwtPayload {
  // Standard OIDC claims
  sub: string;          // Keycloak user_id (keycloak_user_id in DB)
  iss: string;          // Keycloak issuer URL
  aud: string | string[];
  exp: number;
  iat: number;
  jti: string;          // JWT ID — used for refresh token tracking

  // COS custom claims (mapped via Keycloak token mapper)
  cos_tenant_id: string;    // UUID
  cos_tenant_code: string;  // e.g. "acme_corp"
  cos_user_id: string;      // UUID (platform.users.user_id)
  cos_role: string;         // CosRole enum value
  email?: string;           // Present for Path B (office users)
  phone_number?: string;    // Present for Path A (field workers — [REDACTED] in logs)
  name?: string;            // display_name
}
