# ADR-067: MFA enforcement for TENANT_ADMIN / FINANCE — Keycloak-native OTP + backend acr gate

**Date:** 2026-07-24
**Status:** Accepted — **Layer 1 NOT PRESENT in the checked-in realm (verified 2026-08-20)**
**Deciders:** Product owner, Security
**Tags:** security

> ## ⚠️ Verified gap — 2026-08-20
>
> The Decision below records Layer 1 as "Applied and verified against a live Keycloak … then exported
> to the realm JSON". **The realm JSON in git contains none of it.** Read directly from
> `infrastructure/keycloak/realms/construction-os-realm.json`:
>
> | What Layer 1 requires                             | What the realm file holds                                                                    |
> | ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
> | a `browser-mfa` flow bound as the Browser flow    | `browserFlow: "browser"` — the stock flow, and **every** flow in the file is `builtIn: true` |
> | `Condition - user role` (`conditional-user-role`) | absent — 0 occurrences; the `forms` subflow still runs stock `conditional-user-configured`   |
> | a composite realm role `mfa-required`             | absent from `roles.realm` (12 roles, none of them this)                                      |
> | realm attribute `acr.loa.map`                     | absent from `attributes` (8 keys, none of them this)                                         |
>
> `conditional-user-configured` is precisely the condition the Context section says the security review
> **rejected**: it runs OTP only for users who have already enrolled, so a privileged user who never
> enrolled still signs in with a password alone.
>
> **Nor is it anywhere else in the repository.** A search across every provisioning-relevant file type
> (`.ts`, `.sh`, `.yaml`, `.yml`, `.tf`, `.json`, `.mjs`, excluding `node_modules` and the realm file
> itself) finds `conditional-user-role` / `acr.loa.map` / `browserFlow` in exactly three places, all
> of them prose comments in backend TypeScript. There is no terraform, no provisioning script, no CI
> step and no second realm file that would add the flow at deploy time — so no automated path exists
> by which any environment could acquire Layer 1.
>
> Layer 2 is `MFA_ENFORCE`, which defaults to `false` (`shared/guards/mfa-enforcement.ts`).
>
> **Consequence, and it is checkable:** any environment provisioned from this realm file has NEITHER
> layer active for `TENANT_ADMIN` / `FINANCE`. Whether Layer 1 was applied to some live Keycloak and
> never exported back to git, or never applied at all, cannot be determined from this repository —
> both leave a freshly provisioned realm unprotected, so the required action is the same.
>
> **Not fixed here on purpose.** The runbook forbids a blind realm-JSON edit for a stated reason: a
> malformed authentication-flow import breaks _all_ logins, and this repo has no Keycloak to validate
> an import against. The fix is `docs/runbooks/mfa-enforcement.md` steps 1–2 against a live realm,
> followed by the export back to git that the Decision already assumes happened.

---

## Context

Spec §5.4.1 / master Phase 2 require MFA (TOTP) for the `TENANT_ADMIN` and `FINANCE` roles (Path B office
users). A security review found MFA was **not actually enforced**:

- Keycloak's browser flow used `Condition - user configured`, so OTP ran only for users who had already
  enrolled; `CONFIGURE_TOTP` was not a default/role-forced action → a privileged user who never enrolled
  logged in with a password alone.
- The backend has a custom TOTP module (`identity/mfa/*`, `/api/v1/auth/mfa/*`) storing `mfa_totp_secret`
  in `platform.users`, but **no web/mobile client calls it** — it is orphaned. Path B login goes
  browser → Keycloak directly, so the backend never sees the password step.
- The JWT carried no `acr`/`amr`/`mfa` claim, so no downstream request could prove MFA was performed.

## Decision

Enforce MFA in two layers, with Keycloak as the source of truth (consistent with "Keycloak is the single
source of truth for identity"):

1. **Layer 1 (authoritative) — Keycloak-native OTP.** The browser flow forces OTP for `TENANT_ADMIN` /
   `FINANCE` via a role-conditional OTP subflow (`Condition - user role` = composite role `mfa-required`,
   OTP Form REQUIRED), and `acr.loa.map` step-up so the token's `acr` proves OTP. Applied and verified
   against a live Keycloak per `docs/runbooks/mfa-enforcement.md`, then exported to the realm JSON.
2. **Layer 2 (defense-in-depth) — backend acr gate.** `JwtAuthGuard.handleRequest` calls
   `enforceMfaForPrivilegedRoles` (`shared/guards/mfa-enforcement.ts`): a `TENANT_ADMIN`/`FINANCE` token
   whose `acr` is not in the accepted set is rejected with `COS-AUTH-001` (403). Gated by `MFA_ENFORCE`
   (default **off**) and tuned by `MFA_REQUIRED_ACR`, so it ships safely before the realm `acr` is verified.

The custom backend TOTP module is marked **deprecated** (kept to avoid test churn; removed in a later change).

## Rationale

- The only place Path B MFA can be enforced at login is Keycloak — the backend is not in the password path.
- Placing Layer 2 in `JwtAuthGuard` (not a global `APP_GUARD`) is required: `JwtAuthGuard` is applied
  per-route and populates `req.user`; a global guard runs _before_ authentication and would see no user.
- `MFA_ENFORCE` default-off avoids a lockout: enforcing against a realm that does not yet emit the expected
  `acr` would reject every privileged login. The realm behavior cannot be validated by CI (no Keycloak in
  the test harness), so enforcement is activated by ops only after live verification.
- Rejected: wiring the custom backend TOTP into the flow (needs new frontend work, duplicates Keycloak, and
  contradicts "Keycloak is the source of truth").

## Consequences

### Positive

- MFA is actually forced for privileged roles at login; a token minted without OTP cannot act as those roles.
- Layer 2 is fully unit-tested (100% coverage) and reversible via an env kill switch.

### Negative

- Layer 1 is a live-Keycloak configuration task (runbook), not a CI-verified realm-JSON change; drift risk
  until the realm is exported back to git. **That drift is now confirmed, not hypothetical** — see the
  verified-gap note at the top of this ADR (2026-08-20). Nothing in CI can catch it: there is no Keycloak
  in the test harness, so the only guard against a realm that silently loses Layer 1 is reading the file.
- Two MFA mechanisms coexist until the deprecated custom module is removed.

### Neutral

- Path A (SMS OTP, field roles) is unaffected — MFA applies to Path B office roles only.

## References

- spec §5.4.1 (05-security-compliance), §14, §20.8; master Phase 2
- `docs/runbooks/mfa-enforcement.md`
- `backend/src/shared/guards/mfa-enforcement.ts`
- `docs/api/error-codes.md` → COS-AUTH-001
