// In-service Keycloak JWT verification (spec §5.9.4). **A verified token is now required.**
//
// WHAT CHANGED, AND WHY (TDD OQ-46)
// ---------------------------------
// The header above this one used to say Kong verifies the JWT at the edge and injects
// x-tenant-id/x-user-id/x-user-role, and that this service verifies the token as a second layer. The
// second layer was real; the first was not. `infrastructure/kubernetes/kong/kong-declarative.yml` is
// referenced by no ArgoCD Application, there are no `KongPlugin` CRDs, no chart carries an Ingress
// template, and the repository's only `kind: Ingress` names `ingressClassName: nginx`. With this
// Service on ClusterIP, no NetworkPolicy and no mesh, the scenario the old header described as a
// hypothetical — "a caller reaching the pod off-mesh could spoof x-user-role: SYSTEM_ADMIN" — was
// simply the state of the system: `verifyBearer` returned null for a request with no Authorization
// header, and the plugin fell through to the headers.
//
// TWO KINDS OF TOKEN
// ------------------
// A user token carries `tenant_id`; the identity comes from its claims and a header may only agree
// with it. A **service** token — the backend's `client_credentials` grant — carries no `tenant_id`,
// because it acts for no user; it authenticates the CALLER, and the identity headers say on whose
// behalf. That is the trusted-subsystem pattern, and it is needed because the backend calls this
// service from Temporal activities and Kafka consumers that hold no user token to forward.
//
// The two are told apart by `preferred_username`, NOT by `azp`. Both token kinds were fetched from a
// live Keycloak 26.6.4 and compared: `azp` is `cos-backend` on BOTH — a Path A user authenticates
// through the same client — so keying on it would let any Path A token whose `tenant_id` mapper
// failed be treated as the trusted backend. Keycloak names a service account
// `service-account-{clientId}` and realm usernames are unique, so no human can hold that name.

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

/** A human's token: authoritative for tenant, user and role. */
export interface VerifiedUser {
  kind: 'user';
  tenantId: string;
  userId: string;
  role: string;
}

/** The backend's own token: authoritative for WHO is calling, silent on whose behalf. */
export interface VerifiedService {
  kind: 'service';
  clientId: string;
}

export type VerifiedIdentity = VerifiedUser | VerifiedService;

// The client whose service account may act as the trusted subsystem. Defaults to the audience this
// service already verifies, so a deployment that changes one and not the other cannot open a hole.
const SERVICE_CLIENT_ID = process.env['SERVICE_CLIENT_ID'] ?? AUDIENCE;
const SERVICE_ACCOUNT_USERNAME = `service-account-${SERVICE_CLIENT_ID}`;

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
  if (typeof tenantId === 'string' && tenantId) {
    const userId = claims['user_id'] ?? claims.sub;
    return {
      kind: 'user',
      tenantId,
      userId: typeof userId === 'string' ? userId : '',
      role: typeof claims['role'] === 'string' ? claims['role'] : '',
    };
  }

  // No tenant_id. Either the backend's service account, or a user token whose tenant_id mapper did
  // not fire — and those must not be confused, so both signals are required.
  if (
    claims['azp'] === SERVICE_CLIENT_ID &&
    claims['preferred_username'] === SERVICE_ACCOUNT_USERNAME
  ) {
    return { kind: 'service', clientId: SERVICE_CLIENT_ID };
  }

  throw new InvalidTokenError('Token missing tenant_id claim');
}
