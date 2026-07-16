---
title: Construction OS — Android Screen Capture
last_updated: 2026-07-16
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

## Site Engineer dashboard — [`21-site-engineer-home.png`](21-site-engineer-home.png)

The `SITE_ENGINEER` Home (`components/SiteEngineerHome.tsx`, from
[`mockup/site-engineer/dashboard-mobile/`](../../../mockup/site-engineer/dashboard-mobile)), captured
against the `seed-realistic.ts` dataset through a real Path A (SMS OTP) login as
`+66811000009` — Waraporn Klinhom, the SITE_ENGINEER the Rama IX Corporate Tower (`R9CT`) tasks are
assigned to. Thai UI: this screen is documented in the th-TH default (QM-3).

Everything on it is live: `76%` is the BOQ-value-weighted earned percent from
`GET /projects/{projectId}/progress` (§32.12 — the API returned `percentComplete: 75.56`,
`plannedPercent: 100`, `spi: 0.756`, `status: "behind"`), and the issues are the project's real
`site_ops.issues` rows. The verdict "ช้ากว่าแผน" is **red** because `spi` 0.756 is below 0.90
(§32.12 Display three-band colour), and "ตามแผน 132%" is `plannedPercent ÷ percentComplete` — over
100% exactly because the project is behind. The header right badge "สูง 1 รายการ" is the worst
severity present (HIGH) and its count; the issues list is ordered worst-first.

> **Why it reads "ช้ากว่าแผน" (behind) and not the mockup's "Ahead of Schedule":** `seed-realistic.ts`
> anchors its tasks to fixed calendar dates about a month wide, so every planned end date is now in
> the past and planned% pins at 100 while earned% sits at 76. That is the dataset ageing out, not a
> defect — the figure moves with `now()` by design.

Captured by [`apps/mobile/scripts/capture-android-home.mjs`](../../../apps/mobile/scripts/capture-android-home.mjs)
(`node scripts/capture-android-home.mjs`) — adb/uiautomator only, same reasoning as the login script
below. It asserts the `site-engineer-home` testID before saving, and fails outright if the progress
card is showing its "no BOQ-linked task" placeholder, so a screenshot of an empty card cannot be
committed by accident.

## App screens — `00-login.png` … `20-profile.png`

The 21 flat files are the same route set as [iOS](../ios/README.md), captured by
[`apps/mobile/e2e/capture.spec.ts`](../../../apps/mobile/e2e/capture.spec.ts) from **one
`PROJECT_MANAGER` session** (`+66800000002` — the role with the widest data access), deep-linking
each route via `cos:///<route>`. They are not per-role views: unlike [`../web/`](../web), which is
grouped into role folders, this set documents routes as one user sees them — matching the iOS layout.

`00-login.png` here predates the login redesign — `_public/00-login.png` is the current landing.

## Known gaps

- **Per-role capture is possible now — this gap is closed** (2026-07-16). Path A needs a Keycloak user
  whose _username_ is the phone number (`identity.service.ts` `issueTokensForPhone` →
  `keycloak-admin.service.ts` `exchangeOtpForTokens` does a Direct Grant with `username: <phone>`),
  and [`provision-keycloak-demo.ts`](../../../backend/prisma/provision-keycloak-demo.ts) used to
  provision every demo user with the email as username, so no seeded role could complete an OTP login.
  It now uses the phone number as the username whenever the account has one; Path B still works
  because the realm sets `loginWithEmailAllowed`. `21-site-engineer-home.png` is the first screen
  captured through a real per-role OTP login.
  - Accounts provisioned before this change cannot simply be renamed — the realm sets
    `editUsernameAllowed: false`, and Keycloak rejects a username change with
    `400 error-user-attribute-read-only` — so the script deletes and recreates them, then re-links
    `platform.users.keycloak_user_id`. Re-run it once against an existing realm to migrate.
- **The flat `00`–`20` set cannot be regenerated on Windows.**
  [`apps/mobile/e2e/capture.spec.ts`](../../../apps/mobile/e2e/capture.spec.ts) writes to
  `docs/screens/ios/` and shells out to `xcrun simctl`, so as committed it only drives an iOS
  simulator. The Android equivalents are the two adb scripts referenced above.
