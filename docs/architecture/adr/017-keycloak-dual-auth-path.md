# Keycloak Dual Authentication Path (Path A: OTP, Path B: OIDC)

**Date:** 2026-06-09
**Status:** Accepted
**Deciders:** Product Owner, Engineering Lead
**Tags:** security, architecture

---

## Context

Construction OS serves two distinct user populations with fundamentally different authentication needs:

1. **Field workers** (SITE_WORKER, SITE_ENGINEER) — low-tech fluency, work on mobile in the field, cannot reliably remember passwords, may share devices across shifts.
2. **Office users** (PROJECT_MANAGER, FINANCE, PROCUREMENT_OFFICER, TENANT_ADMIN, SYSTEM_ADMIN) — desk-based, email-centric, expect standard corporate login.

A single authentication mechanism would either force field workers to manage passwords (adoption risk) or deprive office users of SSO and MFA controls (security risk).

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
Keycloak custom authenticator SPI requires Java expertise, adds upgrade risk, and is harder to test. A NestJS module in TypeScript is testable at 100% coverage and replaceable without touching Keycloak.

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
