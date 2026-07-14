---
title: Construction OS — Android Screen Capture
last_updated: 2026-07-15
---

# Construction OS — Android App Screens

> Part of [`docs/screens/`](../README.md) · platform: **Android** (emulator). iOS and Web live in sibling folders.

Screenshots of the Construction OS mobile app (Expo / React Native, Android), captured against the
**local backend with seeded demo data** — real logins and live API calls, not mockups.

| Device  | `Medium_Phone` AVD — Android 37 (`google_apis_playstore`), x86_64, 1080×2400     |
| ------- | -------------------------------------------------------------------------------- |
| App     | Debug build (`android/app/build/outputs/apk/debug/app-debug.apk`) + Metro        |
| Backend | NestJS @ `localhost:3001` (`E2E_AUTH_BYPASS=true`) · Keycloak @ `localhost:8090` |
| Project | `DEMO-001` — _Bangkok Tower — Phase 1_                                           |

## Login flow — [`_public/`](_public/)

English UI (matching [`mockup/00_login_flow/mobile/`](../../../mockup/00_login_flow/mobile)); the
login header's language switcher is used to leave the th-TH default (QM-3).

| #   | Screen                                            | What it shows                                                                  |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| 00  | [Login](_public/00-login.png)                     | Landing — Path A phone form, Path B "Login with Email" as the secondary action |
| 01  | [OTP verify](_public/01-login-otp-verify.png)     | Passcode step for `+66 •••• 0010`, requested from the landing                  |
| 02  | [Email + password](_public/02-login-password.png) | Keycloak's hosted page in a Chrome Custom Tab, `cos` theme (§20.6.1 / QM-4)    |
| 03  | [Securing session](_public/03-login-loading.png)  | `VerifyingOverlay`, shown while the Path B code→token exchange runs            |

Captured by [`apps/mobile/scripts/capture-android-login.mjs`](../../../apps/mobile/scripts/capture-android-login.mjs)
(`cd apps/mobile && pnpm capture:android` — it installs standalone, see the root `pnpm-workspace.yaml`)
— adb/uiautomator only, deliberately **not** Detox:
Path B hands off to Keycloak in a Chrome Custom Tab, and while Detox holds the UiAutomation
connection a `uiautomator dump` only ever returns the instrumented app's own window, leaving the
browser undrivable. The script asserts the screen it expects (e.g. `verifying-overlay`) before saving
each frame, so a mis-tap fails the run instead of writing a screenshot of the wrong thing.

## App screens — `00-login.png` … `20-profile.png`

The 21 flat files are the same route set as [iOS](../ios/README.md), captured by
[`apps/mobile/e2e/capture.spec.ts`](../../../apps/mobile/e2e/capture.spec.ts) from **one
`PROJECT_MANAGER` session** (`+66800000002` — the role with the widest data access), deep-linking
each route via `cos:///<route>`. They are not per-role views: unlike [`../web/`](../web), which is
grouped into role folders, this set documents routes as one user sees them — matching the iOS layout.

`00-login.png` here predates the login redesign — `_public/00-login.png` is the current landing.

## Known gaps

- **Per-role capture is not possible with the current demo provisioning.** Path A (phone + OTP) needs
  a Keycloak user whose _username_ is the phone number (`identity.service.ts` `issueTokensForPhone` →
  `keycloak-admin.service.ts` `exchangeOtpForTokens`), but
  [`provision-keycloak-demo.ts`](../../../backend/prisma/provision-keycloak-demo.ts) provisions the
  demo users as Path B (username = email), so no seeded role can complete an OTP login.
