# ADR-106 — Bind the JWT subject to the platform account

- **Status:** Accepted
- **Date:** 2026-09-14
- **Decided by:** product owner, 2026-09-14
- **Extends:** ADR-077 (per-request authoritative user/role check) and the realm binding of TDD OQ-51
- **Found by:** Rule 41 review of migration `20260914000001_keycloak_realm_unique_except_shared`

## Context

`KeycloakJwtStrategy.validate()` ties a token to a tenant with two checks: the realm in `iss` must be the
tenant's `platform.tenants.keycloak_realm` (OQ-51), and — with `s1.identity.authoritative-role-check` ON —
the `user_id` claim must name an active member of that tenant (ADR-077).

The realm check keeps tenants apart **only while a realm holds one tenant**. Spec §7.6 puts every STARTER and
PROFESSIONAL tenant on the shared realm `construction-os`. Until 2026-09-14 a `UNIQUE (keycloak_realm)`
constraint made a second such tenant impossible, so the gap was capped at one tenant. Migration
`20260914000001` lifts that constraint for the shared realm, and the gap becomes real.

In a shared realm, `tenant_id` and `user_id` are Keycloak **user attributes**. Anyone able to set attributes
in that realm can present tenant B's `tenant_id` together with a real `user_id` of one of B's users. The
realm check passes (same realm), and the ADR-077 join passes (that user is a real member of B). With the
ADR-077 switch OFF, not even a real `user_id` is needed.

## Decision

**The token's `sub` must equal the `keycloak_user_id` of the platform account its `user_id` claim names.**

`sub` is not an attribute: Keycloak issues it as the user's own id and signs it. Binding it means the claims
cannot name an account the caller cannot sign in as.

- Checked **explicitly** in `validate()`, after the realm check, not folded into the ADR-077 join — so
  turning that switch off does not turn this off. The account is joined without an `is_active` condition,
  so this check does not also become an active-user check.
- A missing `sub`, or no account, fails the same way.
- The rejection is the same single 401 message as every other rejection in `validate()`: no enumeration
  oracle. It is logged with tenant and user ids only.
- QM-15 kill switch **`s1.identity.subject-binding`**, default **ON** (the retrofit convention of
  `DEFAULT_FLAGS`). OFF re-opens the impersonation above.
- **The switch is evaluated with no user or tenant context — global or nothing.** Those ids are the
  unverified claims this check exists to verify. Scoping OFF to one locked-out account would switch the
  check off for any token that merely names that account: impersonation of exactly the account being
  rescued (Rule 41 review, cycle 2). For the same reason, do not create the toggle in Unleash ahead of
  need: Unleash creates a toggle disabled, and a disabled toggle turns this ADR off everywhere.
- **The services are not told unverified claims are verified.** While this switch is OFF,
  `GET /api/v1/auth/identity` answers 503 (ADR-107), so file-service, credential-service and ai-gateway
  refuse users instead of trusting the claims the backend is running on.

Service tokens (`ServiceTokenService`, `client_credentials`) are unaffected: they carry no `tenant_id` and
are refused by `validate()`'s claim check before this runs, as before.

## Consequences

**Positive.** Tenants sharing a realm are isolated by an unforgeable value. `JwtPayload` already documented
`sub` as `platform.users.keycloak_user_id`; the code now enforces what the type said.

**Risk — lock-out.** An account whose stored `keycloak_user_id` is not its real Keycloak id can no longer sign
in. Measured 2026-09-14 on the local stack: 14 of 14 `platform.users` rows carry an id that exists in realm
`construction-os-dev`, and the dev SYSTEM_ADMIN's token `sub` equals its row. A realm imported from
`infrastructure/keycloak/realms/construction-os-realm.json` into Keycloak 26.6.4 gets the `basic` scope, which
carries `sub`, on `cos-backend`, `cos-mobile` and `cos-web`, although the file does not list it (measured
2026-09-14 by importing it as a throwaway realm). **No deployed environment was measured.**
`scripts/readiness/check-keycloak-subject-binding.sh` performs the same comparison — in both directions: each
Keycloak user's `user_id` attribute against that account's stored id, and each stored id against the realm —
and must be run against an environment before this is relied on there; the kill switch recovers in under
60 s if an account is locked out.

**Not addressed.** Who may set user attributes in the shared realm is Keycloak configuration, not this code.
This ADR makes such an edit insufficient to cross tenants; it does not prevent the edit.

## Verification

- Unit: `backend/src/modules/identity/__tests__/keycloak-jwt.strategy.spec.ts` — match accepted, mismatch
  and missing `sub` refused, switch OFF skips it, and it still applies with the ADR-077 switch OFF.
- Integration (real database): `backend/test/auth-tenant/04-shared-realm.integration.spec.ts` — on a shared
  realm, a token whose subject is tenant A's user but whose claims name tenant B and a real user of B is
  refused; the genuine tokens pass.
