# ADR-077 — Resolve `is_active` and the effective role from the database on every request

- **Status:** Accepted
- **Date:** 2026-08-04
- **Supersedes (in part):** the "stateless auth, do not re-check the user" tradeoff documented
  inline in `backend/src/modules/identity/strategies/keycloak-jwt.strategy.ts` (ADR-031
  request-context model)
- **Context:** security review findings F1 / F1b / F2 / F2b

## Context

`KeycloakJwtStrategy.validate()` previously verified only that the tenant in the token was active, and
took the `role` claim at face value. Two admin operations were therefore ineffective:

1. **`PATCH /users/:id/deactivate`** wrote `platform.users.is_active = false` and nothing else. The
   Keycloak account stayed enabled and nothing re-read the flag at auth time, so a deactivated user
   could complete a fresh login and be issued a new, fully valid token — indefinitely, not merely for
   the remaining lifetime of an already-issued token.

2. **`PATCH /users/:id/role` and `PUT /users/:id/roles`** wrote `platform.tenant_memberships` only. The
   `role` claim is produced by a Keycloak `oidc-usermodel-attribute-mapper` reading the user attribute
   `role`, which was written once at user-creation time and never updated. `identity.user.role_changed.v1`
   was emitted but had no consumer. A demotion — including revoking `TENANT_ADMIN` — never reached any
   token, so `RolesGuard`, `PermissionsGuard`, `SyncAuthGuard` and `enforceMfaForPrivilegedRoles` all
   kept honouring the original role permanently.

The inline comment described the exposure as bounded by the 15-minute `accessTokenLifespan`, and
suggested shortening that lifespan for faster revocation. Both statements were wrong: nothing bounded
it, and shortening the lifespan would not have helped, because the user could always obtain a new
token.

## Decision

**1. The database is authoritative for both the active flag and the effective role, checked per request.**

`validate()` now runs one query that joins `platform.tenants` → `platform.users` → `platform.tenant_memberships`,
and:

- rejects the request when any of the three is missing (inactive tenant, inactive/absent user, revoked
  membership) — as a single indistinguishable failure, so the response is not a tenant/user enumeration
  oracle;
- **overwrites** `payload.role` with `tenant_memberships.role` before returning.

Overwriting rather than comparing is deliberate: every downstream authorization component reads
`user.role`, so one assignment corrects all of them, and no guard needs to learn about this change.

**2. Both admin operations also write through to Keycloak.**

`deactivateUser` calls `users.update({enabled:false})` + `users.logout()`; `changeRole` / `setUserRoles`
call `users.update({attributes})` with the attribute map read-modify-written (Keycloak replaces the map
wholesale, so a naive write would drop `tenant_id` and `user_id`).

This is redundant with decision 1 for this service — and that is the point. Keycloak is the identity
store for both auth paths and for anything else that may consume its tokens; leaving it stating a role
the platform no longer grants is a correctness problem regardless of who reads it.

## Consequences

### Positive

- Deactivation and demotion take effect on the next request, with no re-login and no token expiry wait.
- Defence in depth: if the Keycloak write in decision 2 fails, decision 1 still denies access.
- Keycloak's own view of a user stays correct for tokens minted later.

### Negative / accepted

- Authentication is no longer purely stateless. The cost is measured, not theoretical: the strategy
  **already** queried `platform.tenants` on every request, so this is the same round trip with two joins
  added — no new query, no new connection. Both joins are on indexed primary/foreign keys.
- A database outage now fails authentication rather than serving requests from token claims alone. This
  is the intended direction: the alternative is honouring authorization decisions the platform can no
  longer verify. The tenant lookup already had this property.
- `deactivateUser` performs a network call to Keycloak inside a request. A failure surfaces as a 500
  with the COS flag already flipped — the safe direction, and decision 1 means access is already denied.

## Kill switch (QM-15)

This changes authorization logic, which QM-15 requires to ship behind a feature flag. The switch is
`s1.identity.authoritative-role-check`, registered in `DEFAULT_FLAGS`.

It defaults **ON**, unlike a new feature. Two reasons: this is a security fix, so an unset flag must not
ship the vulnerability; and this file's existing convention is that _retrofit_ kill-switches fail open to
the current behaviour, so a flag-service outage keeps the fix live rather than silently reverting
authorization to a stale token claim.

Turning it OFF restores pre-ADR-077 behaviour — the token's `role` claim is trusted and
`platform.users.is_active` is not re-checked — which re-opens F1b and F2b **by design**. It exists only
so an incident in the auth hot path can be mitigated in under 60 seconds without a rollback deploy. The
inactive-TENANT check is outside the switch and always enforced.

The query is a LEFT JOIN precisely so one statement serves both states: the tenant half is always
enforced, and the user/membership columns come back NULL rather than dropping the row, so flipping the
flag changes only how the result is interpreted.

**Rejected alternative — sync Keycloak only (no per-request DB read).** This would leave every
already-issued token carrying the stale role until its session ended, and would make revocation depend
entirely on an external call succeeding. Given the guards read `user.role` on every request anyway,
reading the authoritative value there is both simpler and strictly safer.
