# Keycloak Dual Authentication Path (Path A: OTP, Path B: OIDC)

**Date:** 2026-06-09
**Status:** Accepted — **amended 2026-08-21 (role binding dropped) and 2026-08-23 (one account, one path)**
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
Path B. `POST /api/v1/users` provisions one or the other. See the 2026-08-23 update below for why
that stayed true.

---

## Update — 2026-08-23: one account, one path

**Product-owner decision, superseding "unified login" in part.** The role binding stays dropped — any
role may be provisioned on either path, with the `TENANT_ADMIN` / `FINANCE` exception above. What is
withdrawn is per-ACCOUNT choice: an account carries one identifier and therefore one path for its
lifetime, and `POST /api/v1/users` rejecting both together is now the intended design rather than a
gap awaiting a spec.

**The mechanism cannot support both on one account, and this was measured rather than reasoned.**
Path A mints its token by writing an ephemeral credential onto the Keycloak account and immediately
calling Direct Grant (see Decision below). Keycloak stores exactly one password credential per user,
so on an account that also had a Path B password that write destroys it. Against Keycloak 26.6.4 on
2026-08-23: a real password authenticated, one OTP login ran `resetPassword` + Direct Grant, and the
same real password was then rejected with `invalid_grant`. Irreversibly — the admin API withholds
`secretData`, so the hash cannot be saved and restored around the login.

Three alternatives were tested and none is available:

- **Standard token exchange** (`TOKEN_EXCHANGE_STANDARD_V2`, enabled by default in 26.6.4) answers
  `requested_subject is not supported for standard token exchange`. It re-issues a token the caller
  already holds; at OTP time there is none.
- **Legacy token exchange** (`TOKEN_EXCHANGE`) is the only variant that accepts `requested_subject`,
  and it reports `type: PREVIEW`, `deprecated: true`, disabled. Building the login path of a product
  with CIS/FIPS customers on a deprecated preview feature is not a trade worth making.
- **A custom authenticator SPI** would work. Rejected on cost: a Java artifact in the build and
  deploy path, to serve a convenience nobody had asked for.

**Why the convenience was not worth it.** Per-account choice was attractive mainly as a fallback —
if OTP fails you, sign in with a password. On a construction site OTP fails you when there is no
signal, and with no signal a password login cannot reach Keycloak either. The fallback was never real.
The genuine offline gap was elsewhere and is now closed: Path A requests `offline_access`, so the
refresh token no longer dies after 30 minutes idle and a handset can be away for a month and still
refresh silently (`05-security-compliance` §5.4.4, TDD OQ-14).

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

- `context/phases/phase-02-authentication-tenant-system.md` — Authentication + Tenant System
- `docs/specifications/05-security-compliance.md` §5.2
