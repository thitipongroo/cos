# Keycloak Dual Authentication Path (Path A: OTP, Path B: OIDC)

**Date:** 2026-06-09
**Status:** Accepted — **amended 2026-08-21: unified login (see Update)**
**Deciders:** Product Owner, Engineering Lead
**Tags:** security, architecture

---

## Update — 2026-08-21: the two paths stay, the role binding does not

**Product-owner decision: unified login.** A user may authenticate by **either** path. The two
mechanisms below are unchanged; what changes is that neither is reserved for a population.

**One exception — `TENANT_ADMIN` and `FINANCE` are Path B only.** Two independent reasons, either
sufficient on its own:

1. **MFA cannot be enforced on Path A.** Keycloak binds the **Direct Grant** flow separately from the
   **Browser** flow, so the role-conditional OTP that ADR-067 places in the browser flow never runs on
   a Path A token. QM-4 makes MFA mandatory for these two roles. The Direct Grant flow therefore
   **denies** them at the identity provider — verified against a live Keycloak 26.6.4 on 2026-08-22
   (`docs/runbooks/mfa-enforcement.md` Step 1b: privileged Direct Grant → HTTP 401, no token).
2. **SMS is a restricted authenticator.** NIST SP 800-63B Rev 4 classifies SMS/PSTN OTP as
   _restricted_ and it no longer satisfies AAL2; phone possession alone is a single factor. This ADR
   was written in June 2026 against the earlier revision.

**What the Context section below got right, and what it did not.** The two populations it describes
are real, and they are still why two mechanisms exist — a field worker who cannot keep a password is
the reason Path A was built. What does not follow is the _restriction_: nothing in the mechanism
requires that a Project Manager may not use a phone, or that a Site Engineer may not use a password.
The Decision section's parenthetical labels — "(field workers)", "(office users)" — read as scoping
and were treated as such across §14.3, §20.6.1, master Phase 2 and `context.md`. They are labels for
who each path was designed _for_, not a list of who may use it.

**Authoritative statement of who may use which path is now `05-security-compliance` §5.4.4**, which
those documents reference instead of restating.

**Precondition worth stating plainly:** a path is usable by a given account only if the account
carries the identifier it needs — a phone number for Path A, an email plus a Keycloak credential for
Path B. `POST /api/v1/users` provisions one or the other, so unified login is a policy ("no role is
barred"), not a guarantee that every existing account can already use both. Provisioning one user for
both paths is not yet specified.

---

## Context

Construction OS serves two distinct user populations with fundamentally different authentication needs:

1. **Field workers** (SITE_WORKER, SITE_ENGINEER) — low-tech fluency, work on mobile in
   the field, cannot reliably remember passwords, may share devices across shifts.
2. **Office users** (PROJECT_MANAGER, FINANCE, PROCUREMENT_OFFICER, TENANT_ADMIN,
   SYSTEM_ADMIN) — desk-based, email-centric, expect standard corporate login.

A single authentication mechanism would either force field workers to manage passwords
(adoption risk) or deprive office users of SSO and MFA controls (security risk).

---

## Decision

Implement **two authentication paths** sharing a single Keycloak instance as identity store and JWT issuer:

**Path A — Phone number + SMS OTP (field workers):**

- Custom lightweight NestJS module inside the `identity` module
- NOT via Keycloak extension or plugin — complexity not justified at MVP scale
- OTP: 6-digit numeric, TTL 5 minutes, max 3 attempts per session, rate-limited to 10 requests per phone per day
- SMS delivery: AWS SNS
- Interface: `{ sendOTP(phoneNumber, otp): Promise<void> }` — swappable SMS provider

**Path B — Email + password via Keycloak OIDC (office users):**

- Standard Keycloak OIDC Authorization Code Flow
- JWT: RS256-signed by Keycloak
- MFA: TOTP enforced for TENANT_ADMIN and FINANCE roles
- Future SSO: Keycloak SAML 2.0 IdP federation per enterprise tenant (admin console config, zero code change)

Both paths produce identical RS256 JWT claims consumed by Kong and NestJS RolesGuard.

---

## Rationale

**Why not Keycloak extension for OTP?**
Keycloak custom authenticator SPI requires Java expertise, adds upgrade risk, and is
harder to test. A NestJS module in TypeScript is testable at 100% coverage and replaceable
without touching Keycloak.

**Alternatives rejected:**

- Auth0 / Cognito — adds vendor dependency and per-MAU cost; overkill for MVP
- Custom JWT signing — diverges from JWKS standard; breaks Kong JWT plugin integration
- Keycloak OTP via SMS extension — brittle on Keycloak upgrades

---

## Consequences

### Positive

- Field workers never manage passwords — adoption friction removed
- Single JWT format consumed by all services — no path-specific token parsing
- Office users get full Keycloak SSO, MFA, and future SAML federation

### Negative

- Two auth code paths to maintain
- Path A requires NestJS to call Keycloak Admin API on OTP verify

### Neutral

- SMS cost scales with field worker count; budgeted per-tenant

---

## References

- `context/00_master_construction_os.md` §Phase 2 — Authentication + Tenant System
- `docs/specifications/05-security-compliance.md` §5.2
