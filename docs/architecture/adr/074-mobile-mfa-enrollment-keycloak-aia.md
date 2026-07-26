# ADR-074: Mobile MFA enrollment via Keycloak Application-Initiated Action

**Date:** 2026-07-26
**Status:** Accepted
**Deciders:** Product owner
**Tags:** mobile | security | auth

---

## Context

`mockup/mobile/04_tenant_admin/` includes a **custom** in-app MFA (TOTP) enrollment flow: a QR /
authenticator setup screen (03), a success screen (05), and "backup/recovery codes" screens (06, 07).
Implementing these as native reimplementations was blocked by two facts:

1. **Decision H4** deprecated our custom TOTP module (`/api/v1/auth/mfa/*`, `identity/mfa/mfa.service.ts`):
   it is "NOT wired into any real login flow … MFA is now enforced by **Keycloak-native OTP** (Layer 1)
   plus the backend `acr` gate (`shared/guards/mfa-enforcement.ts`, Layer 2)." MFA (TOTP) is required for
   `TENANT_ADMIN` and `FINANCE`, which are Path B (browser → Keycloak) users. A custom native enrollment
   UI needs a custom endpoint to call — exactly what H4 killed — and QM-4 makes Keycloak the single
   source of truth for identity.
2. **Backup/recovery codes are UNSPECIFIED** — no spec (§14 MFA API lists only enroll/verify/authenticate),
   no DB column, no backend. Building them app-side would mean inventing storage + crypto + a redemption
   path, and codes the Keycloak login flow doesn't know about cannot satisfy a Keycloak-enforced second
   factor.

A world-class-pattern research pass (Auth0 / Okta / Microsoft Entra / Keycloak docs / NIST SP 800-63B /
OWASP MFA cheat sheet) confirmed the 2024–2026 dominant pattern: **when the IdP owns MFA, apps delegate
enrollment to the IdP's flow rather than reimplementing QR/verify against a custom endpoint.**

## Decision

Build screens 03/05 as **native chrome around a Keycloak-driven flow**, and use Keycloak for backup codes
(product-owner decision 2026-07-26):

1. **Native intro screen** (`apps/mobile/src/app/(app)/mfa-enrollment.tsx`) launches Keycloak's
   Application-Initiated Action `kc_action=CONFIGURE_TOTP` through the **same Authorization-Code + PKCE
   flow the office login already uses** (`expo-auth-session`, `login.tsx`). Keycloak renders the
   QR / secret / verify pages in a Custom Tab; the app owns only the intro and success chrome.
2. **Native success screen** (mockup 05) shows after the action returns, confirmed via `kc_action_status`.
   The authoritative second-factor check stays server-side (`mfa-enforcement.ts`, the `acr` gate).
3. **Backup codes = Keycloak's `recovery-authn-codes` required action**, not app-side. It is enabled in
   the realm (see Consequences); the 12 NIST-800-63B "lookup secret" codes are shown inside the same
   themed Keycloak flow. Screens 06/07 are therefore NOT built natively.
4. **QM-15 flag** — the enrollment surface is gated by `s1.auth.mfa-enrollment`. Mobile has no
   server-evaluated flags client yet (ADR-049 is backend-only), so the gate is a build-time
   `EXPO_PUBLIC_FF_S1_AUTH_MFA_ENROLLMENT` read statically on the drawer entry, failing closed. Wiring a
   runtime flags client (GET /api/v1/flags, 60 s kill-switch) is a tracked follow-up.

## Consequences

### Positive

- Stays aligned with H4 (Keycloak owns TOTP) and QM-4 (Keycloak single source of truth); adds **no new
  backend auth surface** and **no backup-codes schema**.
- Recovery codes are NIST/OWASP-aligned and live where the login-time second-factor check happens.
- The native intro/success screens give a branded, first-class feel; the Keycloak pages are themeable.

### Realm configuration applied (dev realm `construction-os-dev`)

- `CONFIGURE_TOTP` required action — already enabled (AIA available).
- `CONFIGURE_RECOVERY_AUTHN_CODES` required action — **registered + enabled** on 2026-07-26 via the admin
  API. This same config must be applied to every realm (shared `construction-os`, and each enterprise
  `cos-{tenantCode}` realm provisioned by Phase 25) — tracked for the realm-provisioning templates.

### Negative / follow-ups

- The enrollment step happens inside a browser tab, not a 100 % native screen (the standard OIDC-mobile
  seam; mitigated by Keycloak login-theme + native intro/success). Screens 03/06/07 become the **theme
  spec for the Keycloak pages**, not native screens.
- The QM-15 gate is build-time, not runtime — a mobile flags client is a follow-up.
- `EXPO_PUBLIC_KEYCLOAK_ISSUER` must point at the tenant's realm (`…/realms/construction-os-dev` in dev);
  the code default (`…/construction-os`) is a placeholder overridden per environment.

## References

- Decision H4 — `identity/mfa/mfa.service.ts` header; `shared/guards/mfa-enforcement.ts`
- [ADR-049](049-unleash-feature-flags.md) — feature-flag system (backend server-evaluated)
- `docs/specifications/14-api-architecture.md` §MFA · `docs/specifications/20-ux-flow.md` §MFA
- Keycloak Application-Initiated Actions (`kc_action=CONFIGURE_TOTP`); `recovery-authn-codes` required action
- NIST SP 800-63B (recovery codes = lookup secrets); OWASP MFA cheat sheet
- `mockup/mobile/04_tenant_admin/03_mfa_enrollment_mobile_view_restored` · `05_mfa_enrollment_success` ·
  `06_backup_codes_copied_success_state` · `07_mfa_backup_codes_download_success`
