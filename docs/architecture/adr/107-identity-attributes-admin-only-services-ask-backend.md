# ADR-107: Identity attributes are admin-only, and services take identity from the backend

**Date:** 2026-09-14
**Status:** Accepted
**Deciders:** product owner, 2026-09-14
**Tags:** security

---

## Context

Every token's `tenant_id`, `user_id` and `role` claims are mapped from Keycloak **user attributes**. They are
not declared in the realm's user profile (they are "unmanaged"), and
`infrastructure/keycloak/realms/construction-os-realm.json` set `unmanagedAttributePolicy: ENABLED`. Under that
policy a user can edit their own unmanaged attributes.

Measured on 2026-09-14 against the local Keycloak 26.6.4:

- Signed in as the dev SYSTEM_ADMIN of realm `construction-os-dev`, `POST /realms/construction-os-dev/account`
  with a changed `tenant_id` answered `204` and the new value was stored. It was restored through the admin API
  straight away.
- In a throwaway realm imported from the same JSON (deleted afterwards), a SITE_WORKER set its own `role` to
  `SYSTEM_ADMIN` and the value was stored.
- In that realm, after switching to `ADMIN_EDIT`: the user no longer sees the attributes, the same request
  leaves them unchanged, the admin API still sets them, and a new token still carries all three claims.

Who trusts those claims:

- **The backend** re-reads the database: ADR-077 takes the role and active state from `platform.users` /
  `platform.tenant_memberships`, and ADR-106 binds the token's `sub` to the account. A forged attribute
  cannot cross tenants or raise a role there.
- **file-service and credential-service** (`src/plugins/jwt-verify.ts` → `src/plugins/auth.ts`) take
  `tenant_id`, `user_id` and `role` straight from the verified token.
- **ai-gateway** (`auth.py`) takes `tenant_id` straight from the token.

None of the three services can read `platform.users`. So any user of a realm those services trust could
act as any tenant, and in the two Node services as any role, without migration `20260914000001` or a shared
realm being involved.

No code creates a dedicated Keycloak realm. Spec §7.6's "dedicated realm created for enterprise" has no
implementation, so a future realm gets whatever policy it is created with.

## Decision

Two layers. Neither is sufficient alone.

1. **Identity is admin-only in Keycloak.** Every realm a tenant uses runs with
   `unmanagedAttributePolicy: ADMIN_EDIT` (the unmanaged `tenant_id`, `user_id`, `role`), and its user
   profile gives `username` and `email` `edit: ["admin"]` (revision R8). The realm JSON says so for new
   imports. `scripts/ops/keycloak-lock-identity-attributes.sh` applies both to running realms, because an
   import applies only to a realm that does not exist yet; its `--check` mode measures an environment. Any
   realm created later, including a future dedicated realm, must be created this way.
2. **Services take a user's identity from the backend, not from the claims.** For a user token, file-service,
   credential-service and ai-gateway forward the same `Authorization` header to the backend's
   `GET /api/v1/auth/identity`. That route answers after the full `KeycloakJwtStrategy.validate`: realm
   binding, ADR-106 subject binding, and the ADR-077 active user and database role. The service uses the
   answer's `tenant_id`, `user_id` and `role`.
   - **Only on the backend's internal listener** (`INTERNAL_PORT`, 3100; revision R8). The public port runs
     `CloudflareWafMiddleware`, which in production refuses every request without `CF-Ray` — every call from a
     pod. The internal port is the same application served through Fastify's `routing` handler; the WAF check
     does not apply there, it serves no route but this one, and the backend chart's NetworkPolicy admits it
     from the three services' pods only. On the public port the route is a 404.
   - **The backend separates "token wrong" from "could not check".** A token refusal is `401`. A JWKS or
     database failure is `503 COS-AUTH-004`: passport-jwt reports both through `fail()`, and the guard tells
     them apart by the error's class.
   - **The services: `401` is `401`; anything else is `503`** — a 403, a 404 or a 5xx is not a verified
     identity. They never fall back to the claims.
   - **While either identity kill switch is OFF** (`s1.identity.subject-binding`,
     `s1.identity.authoritative-role-check`) the backend runs on unverified claims, so the route answers `503`.
   - **Rate-limited per verified user**, 600 requests a minute, not per address.
   - Answers are cached per token hash for the shorter of the token's remaining lifetime and 30 seconds.
   - Service tokens (the backend's `client_credentials` grant) are unchanged.
   - **One client for the Node services:** `packages/@cos/service-identity` (revision R9), used by file-service
     and credential-service; ai-gateway keeps a Python equivalent. CI builds the package before
     credential-service's tests, because that ESM service resolves it through `dist`.

## Rationale

- **Layer 1 closes the edit, layer 2 closes the trust.** An admin, or anything holding the backend's service
  account, can still set attributes. Layer 2 means even that cannot move a caller to another account's
  tenant or role in a service: the backend checks the database.
- **One decision point.** The alternative was giving each service read access to the platform tables and
  repeating the checks three times, in two languages. Rejected: three copies of the realm, subject,
  membership and role checks would drift, and three more database grants widen what a compromised service
  can read.
- **Fail closed.** Falling back to the claims when the backend is down would reopen exactly the path this
  closes, at the moment it is least observed.
- **A second port, not a second application.** A second Nest application would build every provider twice.
  Fastify's documented `routing` method is the same handler its own servers use, so one application answers
  both sockets; which one a request arrived on is the accepting socket's `localPort`, which a caller cannot set.
- **30 seconds.** ADR-077 made role and deactivation take effect per request. A cache delays that by at
  most 30 seconds for these services, in exchange for not making one backend call per request.

## Consequences

### Positive

- A user can no longer set their own `tenant_id`, `user_id`, `role`, `username` or `email`.
- The three services authorize with the same identity the backend does.
- A Keycloak or database outage reaches users of the services as "unavailable", not as a bad token.

### Negative

- The services now depend on the backend at request time. A backend outage makes their user routes answer
  `503`, and there is no kill switch for that dependency.
- One extra call per new token per service, then cached.
- An account refused by the MFA gate (`MFA_ENFORCE`, `403 COS-AUTH-001`) is `503` in the services, not a
  prompt to complete MFA — the services cannot tell it from any other non-401.
- The internal port relies on the NetworkPolicy being enforced by the cluster's CNI. It is schema-valid and
  rendered, and has not been observed enforced in a live cluster.
- A realm not yet locked is still editable. Run the `--check` mode against every environment.
- The services still verify tokens against one realm (`KEYCLOAK_REALM`), so an ENTERPRISE user on a `cos-*`
  realm is refused by them before the backend is asked — as before this ADR.

### Neutral

- Users could see their own `tenant_id`, `user_id` and `role` through the Account API before. Now they
  cannot. Nothing in the apps read them there. Users can still edit their first and last name.

## References

- ADR-077 (per-request authoritative role check), ADR-106 (subject binding)
- Spec §5.4.1, §5.9.4, §7.6
- `scripts/ops/keycloak-lock-identity-attributes.sh`
