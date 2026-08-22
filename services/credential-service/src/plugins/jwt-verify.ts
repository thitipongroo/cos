// In-service Keycloak JWT verification (spec §5.9.4) — mirrors services/file-service.
// **A verified token is now required.**
//
// WHAT CHANGED, AND WHY (TDD OQ-46)
// ---------------------------------
// The old header said Kong verifies and injects the identity headers at the edge and that this is the
// second of two layers. Kong is deployed nowhere: no ArgoCD Application references
// `infrastructure/kubernetes/kong/`, there are no `KongPlugin` CRDs, no chart has an Ingress template,
// and the repository's only `kind: Ingress` names `ingressClassName: nginx`. It also warned that "a
// spoofed x-tenant-id reaching the pod off-mesh would be high-impact" — with this Service on
// ClusterIP, no NetworkPolicy and no mesh, and `verifyBearer` returning null for a request with no
// Authorization header at all, that was reachable from any pod in the namespace. This service holds
// every tenant's issuer key material.
//
// TWO KINDS OF TOKEN
// ------------------
// A user token carries `tenant_id` and is authoritative for identity. A **service** token — the
// backend's `client_credentials` grant — carries none, because it acts for no user: it authenticates
// the CALLER, and the identity headers say on whose behalf (the trusted-subsystem pattern, needed
// because the backend also calls from Temporal activities and Kafka consumers with no user token to
// forward).
//
// Told apart by `preferred_username`, NOT `azp`. Both kinds were fetched from a live Keycloak 26.6.4
// and compared: `azp` is `cos-backend` on BOTH, because Path A users authenticate through that same
// client. Keying on it would promote any user token whose `tenant_id` mapper failed to trusted-caller
// status. Keycloak names a service account `service-account-{clientId}` and realm usernames are
// unique, so no human can hold that name.

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

/**
 * The client whose service account may act as the trusted subsystem. Defaults to the audience this
 * service already verifies, so a deployment that changes one and not the other cannot open a hole.
 */
function serviceClientId(): string {
  return process.env['SERVICE_CLIENT_ID'] ?? process.env['KEYCLOAK_AUDIENCE'] ?? 'cos-backend';
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
  const clientId = serviceClientId();
  if (
    claims['azp'] === clientId &&
    claims['preferred_username'] === `service-account-${clientId}`
  ) {
    return { kind: 'service', clientId };
  }

  throw new InvalidTokenError('Token missing tenant_id claim');
}
