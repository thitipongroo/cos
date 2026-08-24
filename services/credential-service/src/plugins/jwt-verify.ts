// In-service Keycloak JWT verification (defense-in-depth, spec §5.9.4) — mirrors ai-gateway/auth.py
// and services/file-service. Kong verifies + injects identity headers at the edge; this service ALSO
// verifies the RS256 token itself (JWKS, iss/aud/exp) and derives the tenant from the claim, so it
// never trusts a header alone. credential-service holds each tenant's issuer key material, so a spoofed
// x-tenant-id reaching the pod off-mesh would be high-impact — the token/header agreement fails closed.

import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';

interface KeycloakConfig {
  jwksUri: string;
  issuer: string;
  audience: string;
}

/** Resolved from env on each call so both the env-set and default paths are exercised uniformly. */
function config(): KeycloakConfig {
  const url = process.env['KEYCLOAK_URL'] ?? 'http://keycloak:8080';
  const realm = process.env['KEYCLOAK_REALM'] ?? 'construction-os';
  return {
    jwksUri: `${url}/realms/${realm}/protocol/openid-connect/certs`,
    // `iss` reflects Keycloak's public URL (split-horizon), which can differ — allow an override.
    issuer: process.env['KEYCLOAK_ISSUER'] ?? `${url}/realms/${realm}`,
    audience: process.env['KEYCLOAK_AUDIENCE'] ?? 'cos-backend',
  };
}

let cachedClient: ReturnType<typeof jwksRsa> | undefined;
let cachedUri: string | undefined;

/** One JWKS client per URI (it caches signing keys in-process); rebuilt only if the URI changes. */
function jwksClient(jwksUri: string): ReturnType<typeof jwksRsa> {
  if (!cachedClient || cachedUri !== jwksUri) {
    cachedClient = jwksRsa({ jwksUri, cache: true, rateLimit: true });
    cachedUri = jwksUri;
  }
  return cachedClient;
}

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

  const { jwksUri, issuer, audience } = config();
  let claims: jwt.JwtPayload;
  try {
    const key = await jwksClient(jwksUri).getSigningKey(decoded.header.kid);
    claims = jwt.verify(token, key.getPublicKey(), {
      algorithms: ['RS256'],
      issuer,
      audience,
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
