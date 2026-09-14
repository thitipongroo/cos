// A user's identity, taken from the backend instead of the token's claims (ADR-107).
//
// ONE CLIENT FOR EVERY NODE SERVICE. file-service and credential-service each carried a copy of this file until
// revision R9; the copy was a 90-line clone over the jscpd ratchet, and two copies of a fail-closed security
// check drift. ai-gateway (Python) has its own implementation in services/ai-gateway/auth.py.
//
// WHY. `tenant_id`, `user_id` and `role` are Keycloak USER ATTRIBUTES mapped into the token. Until the realm
// ran `unmanagedAttributePolicy: ADMIN_EDIT` a user could rewrite their own through the Account API — measured
// 2026-09-14: a SITE_WORKER set its own `role` to SYSTEM_ADMIN — and even under ADMIN_EDIT anything able to set
// attributes can. A verified signature says Keycloak minted the token, not that those attributes are true.
// This service cannot read platform.users, so it asks the one component that can: the backend's
// `GET /api/v1/auth/identity` answers only after realm binding, subject binding (ADR-106) and the database
// role check (ADR-077).
//
// FAIL CLOSED. A backend that refuses the token is a 401; a backend that cannot be reached, answers 5xx, or
// answers something that is not an identity is IdentityUnavailableError → 503. Never the claims: falling
// back to them would reopen exactly this path, at the moment nobody is watching.
//
// CACHE. Per SHA-256 of the Authorization header, for the shorter of the token's remaining lifetime and 30 s,
// in a map capped at 10 000 entries (oldest evicted first). 30 s is how late a role change or deactivation
// can reach this service; a token without `exp` is never cached.

import { createHash } from 'node:crypto';

export interface BackendIdentity {
  tenantId: string;
  userId: string;
  role: string;
}

/** The backend refused the token: the caller is not who the token says. */
export class IdentityRejectedError extends Error {}

/** The backend could not give an answer. Not the caller's fault, and not a reason to trust the claims. */
export class IdentityUnavailableError extends Error {}

export const CACHE_MAX_MS = 30_000;
export const CACHE_MAX_ENTRIES = 10_000;
const REQUEST_TIMEOUT_MS = 5_000;

const cache = new Map<string, { identity: BackendIdentity; expiresAt: number }>();

/** Test seam: the cache is module state. */
export function clearIdentityCache(): void {
  cache.clear();
}

export function identityCacheSize(): number {
  return cache.size;
}

export async function resolveUserIdentity(
  authorization: string,
  tokenExpSeconds: number | undefined,
  now: () => number = Date.now,
): Promise<BackendIdentity> {
  const key = createHash('sha256').update(authorization).digest('hex');
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now()) return hit.identity;
  if (hit) cache.delete(key);

  const base = process.env['BACKEND_INTERNAL_URL'];
  if (!base) throw new IdentityUnavailableError('BACKEND_INTERNAL_URL is not set');

  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/+$/, '')}/api/v1/auth/identity`, {
      headers: { authorization },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new IdentityUnavailableError(err instanceof Error ? err.message : 'backend unreachable');
  }

  // Only 401 is the caller's token being refused. The backend answers 503 when it could not check the token
  // (a JWKS or database failure), and anything else — a 403, a 404 from a wrong URL or port — is not proof the
  // user is who they say either: fail closed as unavailable (Rule 41 review, revision R8).
  if (res.status === 401) {
    throw new IdentityRejectedError('backend answered 401');
  }
  if (!res.ok) throw new IdentityUnavailableError(`backend answered ${res.status}`);

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new IdentityUnavailableError('backend answered a body that is not JSON');
  }
  const b = (body ?? {}) as Record<string, unknown>;
  if (
    typeof b['tenant_id'] !== 'string' ||
    !b['tenant_id'] ||
    typeof b['user_id'] !== 'string' ||
    !b['user_id'] ||
    typeof b['role'] !== 'string'
  ) {
    throw new IdentityUnavailableError('backend answered without tenant_id, user_id and role');
  }
  const identity: BackendIdentity = {
    tenantId: b['tenant_id'],
    userId: b['user_id'],
    role: b['role'],
  };

  const ttl =
    tokenExpSeconds === undefined ? 0 : Math.min(CACHE_MAX_MS, tokenExpSeconds * 1000 - now());
  if (ttl > 0) {
    if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    cache.set(key, { identity, expiresAt: now() + ttl });
  }
  return identity;
}
