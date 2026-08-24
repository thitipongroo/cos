// Reading a session out of an access token's claims, without trusting them to be there.
//
// Both sign-in paths (§20.6.1) decode the issued JWT to learn who signed in: Path A after
// `/auth/otp/verify`, Path B after the OIDC code exchange. Both did it inline, and both did it the
// same unchecked way — `claims['role'] as CosRole`, `claims['user_id'] as string` — which is a lie
// the type system cannot catch: a token without those claims produced `role: undefined` typed as
// CosRole, and `SecureStore.setItemAsync(ROLE_KEY, undefined)` throws from inside `setTokens`,
// surfacing as "login failed" with nothing to say why. A token with an unrecognised role string was
// worse: it persisted, and the app then routed by a role no screen knows.
//
// Nothing here decides ACCESS. The server authorises every request; this only decides which tabs to
// draw. Rejecting an unusable token at the door means the failure is legible instead of arriving
// three screens later as an empty menu.

import { CosRole } from '@cos/types';
import { decodeJwtPayload } from './jwt';

export interface SessionClaims {
  userId: string;
  role: CosRole;
  /** Keycloak's standard `name` claim. Optional — not every account has one. */
  displayName: string | null;
}

const ROLES = new Set<string>(Object.values(CosRole));

/**
 * The session an access token describes, or null when it does not describe a usable one.
 *
 * Null — rather than a throw or a partial object — because both call sites already have an error
 * branch for "this sign-in did not work", and a token missing its identity claims is exactly that.
 */
export function sessionFromToken(accessToken: string): SessionClaims | null {
  const claims = decodeJwtPayload(accessToken);

  const userId = typeof claims['user_id'] === 'string' ? claims['user_id'] : '';
  // An empty user_id is not a session: `authStore.hydrate` rejects it on the next launch (`!userId`),
  // so accepting it here would grant a session that silently disappears when the app restarts.
  if (!userId) return null;

  const role = claims['role'];
  if (typeof role !== 'string' || !ROLES.has(role)) return null;

  return {
    userId,
    role: role as CosRole,
    displayName: typeof claims['name'] === 'string' ? claims['name'] : null,
  };
}
