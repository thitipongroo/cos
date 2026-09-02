# 050: Mobile app supports Path B (email/password) login via Keycloak OIDC

**Date:** 2026-07-07
**Status:** Accepted
**Deciders:** Product owner (thitipongroo), engineering
**Tags:** mobile, security

---

## Context

The platform decision in `context/phases/phase-10-mobile-offline-engine.md` states that **all roles use the
React Native app on a smartphone** (Web App is tablet/laptop only). Authentication (spec §5.4, §20.6.1)
defines **two paths**:

- **Path A** — phone + SMS OTP, for field roles (SITE_WORKER, SITE_ENGINEER)
- **Path B** — email/password, for office/management roles (Executive, Finance, PM, Tenant Admin,
  Procurement Officer, Safety Officer) via **Keycloak OIDC** (RS256 JWT)

However, the mobile app's implemented login (`apps/mobile/src/app/(auth)/login.tsx`) and the master
Phase 10 Generate list only wired **Path A (OTP)**. Consequence: office/management roles had **no way to
authenticate on their smartphone** — they could only log in on the Web App. A functional audit (2026-07-07)
surfaced this as gap **G-M6**.

## Decision

The mobile app **MUST render both authentication paths**, mirroring the Web App (spec §20.6):

- **Path A** (phone + OTP) — existing `authStore.requestOtp` / `verifyOtp` flow (unchanged).
- **Path B** (email/password) — **Keycloak OIDC Authorization Code + PKCE** flow, opened via the system
  browser (`expo-auth-session` + `expo-web-browser`). The Keycloak-hosted login page handles
  email+password AND the MFA (TOTP) step required for `TENANT_ADMIN` / `FINANCE` (spec §5.4). The returned
  authorization code is exchanged for the same **RS256 JWT** issued to every other client; tokens are
  persisted via the existing `authStore.setTokens` (SecureStore), and role-based post-login routing is
  unchanged.

This introduces **no new auth mechanism** relative to §5.4 — it is the same Keycloak OIDC that the Web App
already uses (`signIn('keycloak')`). Custom email/password handling on the device remains **prohibited**
(QM-4): the device never sees or stores the password; only Keycloak does.

## Rationale

- **Spec-mandated mechanism, not a free choice.** QM-4 requires Path B = Keycloak OIDC and forbids custom
  email/password auth. OIDC Authorization-Code+PKCE via the system browser is the standard, secure Expo
  pattern and the only §5.4-compliant option; Resource-Owner-Password (Direct Grant) with the password
  entered in-app was rejected because it exposes the credential to the app and is discouraged by OAuth 2.1.
- **Consistency with Web.** Same IdP, same JWT, same session model — no divergent token lifetime or claim
  handling.
- **Unblocks all office roles on mobile**, honouring the "all roles on smartphone" platform decision.

Alternatives considered:

- _Office roles are Web-only (mobile stays OTP-only)_ — rejected by product owner (2026-07-07); contradicts
  the "all roles on smartphone" decision.
- _Keycloak Direct Grant with in-app email/password form_ — rejected: violates QM-4 (no custom
  email/password; credential must not touch the device) and cannot host the MFA step.

## Consequences

### Positive

- Every role can authenticate on the smartphone; feature parity with Web login (§20.6).
- MFA (TOTP) for TENANT_ADMIN/FINANCE is handled by Keycloak's hosted page — no bespoke mobile MFA UI.

### Negative

- Adds `expo-auth-session` + `expo-web-browser` dependencies and a redirect-URI scheme in `app.json`
  (deep-link handling for the OIDC callback).
- Requires a Keycloak public client configured with the mobile redirect URI.

### Neutral

- `login.tsx` gains a path selector (office email/password vs field OTP), mirroring the Web `/login`
  → `/login/otp` split.

## References

- Spec §20.6.1 (Web Authentication — two paths); §5.4 (authoritative auth spec, Keycloak OIDC / Direct Grant)
- `context/phases/phase-10-mobile-offline-engine.md` (mobile Auth Generate item)
- QM-4 (Security — Path B uses Keycloak OIDC; custom email/password prohibited)
- ADR-046 (Expo 56 mobile), ADR-013 (secrets)
- Gap G-M6 (functional audit 2026-07-07)
