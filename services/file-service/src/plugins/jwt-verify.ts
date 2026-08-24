// In-service Keycloak JWT verification (defense-in-depth, spec §5.9.4) — mirrors ai-gateway/auth.py.
//
// Kong verifies the JWT and injects x-tenant-id/x-user-id/x-user-role at the edge; this service ALSO
// verifies the RS256 token itself (JWKS, iss/aud/exp) and derives the tenant from the claim, so it
// never trusts a client/header alone. If both a Kong header and a verifiable token are present they
// MUST agree — a mismatch fails closed. Without this, a caller reaching the pod off-mesh (or a Kong
// misconfig) could spoof x-user-role: SYSTEM_ADMIN / x-tenant-id and act as another tenant.

import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';

const KEYCLOAK_URL = process.env['KEYCLOAK_URL'] ?? 'http://keycloak:8080';
const REALM = process.env['KEYCLOAK_REALM'] ?? 'construction-os';
// `iss` reflects Keycloak's public URL (split-horizon), which can differ from the reachable URL —
// mirror the backend's KeycloakJwtStrategy and allow an explicit override.
const ISSUER = process.env['KEYCLOAK_ISSUER'] ?? `${KEYCLOAK_URL}/realms/${REALM}`;
const AUDIENCE = process.env['KEYCLOAK_AUDIENCE'] ?? 'cos-backend';
const JWKS_URI = `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/certs`;

const jwks = jwksRsa({ jwksUri: JWKS_URI, cache: true, rateLimit: true });

export interface VerifiedIdentity {
  tenantId: string;
  userId: string;
  role: string;
}

export class InvalidTokenError extends Error {}

/**
 * Verify the Authorization bearer token (RS256/JWKS, iss/aud/exp) → identity claims.
 * Returns null when no bearer token is present; throws InvalidTokenError on a bad/expired token.
 */
export async function verifyBearer(authHeader: unknown): Promise<VerifiedIdentity | null> {
  if (typeof authHeader !== 'string' || !authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
    throw new InvalidTokenError('Malformed token');
  }

  let claims: jwt.JwtPayload;
  try {
    const key = await jwks.getSigningKey(decoded.header.kid);
    claims = jwt.verify(token, key.getPublicKey(), {
      algorithms: ['RS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    }) as jwt.JwtPayload;
  } catch (err) {
    throw new InvalidTokenError(err instanceof Error ? err.message : 'Token verification failed');
  }

  const tenantId = claims['tenant_id'];
  if (typeof tenantId !== 'string' || !tenantId) {
    throw new InvalidTokenError('Token missing tenant_id claim');
  }
  const userId = claims['user_id'] ?? claims.sub;
  return {
    tenantId,
    userId: typeof userId === 'string' ? userId : '',
    role: typeof claims['role'] === 'string' ? claims['role'] : '',
  };
}
