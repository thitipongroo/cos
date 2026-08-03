---
title: Construction OS — Android Screen Capture
last_updated: 2026-07-27
---

# Construction OS — Android App Screens

> Part of [`docs/screens/`](../README.md) · platform: **Android** (emulator). iOS and Web live in sibling folders.

Screenshots of the Construction OS mobile app (Expo / React Native, Android), captured against the
**local backend with seeded demo data** — real logins and live API calls, not mockups.

| Device  | `Medium_Phone` AVD — Android 37 (`google_apis_playstore`), x86_64, 1080×2400     |
| ------- | -------------------------------------------------------------------------------- |
| App     | Debug build (`android/app/build/outputs/apk/debug/app-debug.apk`) + Metro        |
| Backend | NestJS @ `localhost:3000` (`E2E_AUTH_BYPASS=true`) · Keycloak @ `localhost:8090` |
| Project | `DEMO-001` — _Bangkok Tower — Phase 1_                                           |

## Structure — grouped by role

Like [`../web/`](../web), the committed Android captures are grouped into role / flow folders (not a
flat numbered dump). **Within each role folder the screens are grouped again by the role's main-menu
tab** (its bottom-nav destinations) — a screen lives under the tab it is reached from, and screens
opened from the Home FAB's Quick Commands (Invite user, System integration, Apps & Services, …) sit
under `Home/`. Each menu subfolder is numbered from `00` within itself. **Every committed screen is ONE full-page
image** — where a screen is taller than the phone it is stitched from scrolling viewports
(`scripts/stitch-fullpage.py`) — except where a screen has a genuinely distinct alternate state, which
gets its own full-page file (the Invite-user `email` method, the Alerts `diff`-expanded view).

| Folder                             | What it holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`01-public/`](01-public/)         | Pre-auth — the native splash (`00`), app-launch loading (`01`), the login flow (`02`–`04`) and the Privacy Policy (`05`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| [`03-mfa/`](03-mfa/)               | The office-role MFA enrolment flow through Keycloak (`01`–`07`), captured in the browser.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| [`02-shared/`](02-shared/)         | Cross-role app-shell screens — notification preferences (`01`, three states) and the navigation drawer (`02`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [`SITE-ENGINEER/`](SITE-ENGINEER/) | Tabs: **Home \| Issues \| Inspections \| Reports**. Captured so far: [`01-Home/`](SITE-ENGINEER/01-Home/) — the loading state (`00`) + dashboard (`01`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [`TENANT-ADMIN/`](TENANT-ADMIN/)   | Tabs: **Home \| Users \| Alerts \| Settings**. [`01-Home/`](TENANT-ADMIN/01-Home/) — dashboard (`00`), Quick-Add (`01`) and the FAB flows: Invite-user (`02`), Role-permissions (`03`), Roles-selection (`04`), Invitation-success (`05`), System-integration (`06`), Apps-&-Services (`07`). [`02-Users/`](TENANT-ADMIN/02-Users/) — the users list (`01`), the per-user action sheet (`02`), the user profile (`03`), the multi-role permission editor (`04`) + the save-success screen (`05`), and the password-reset form (`06`) + its two done screens — temp-password (`07`) and email-link-sent (`08`). [`03-Alerts/`](TENANT-ADMIN/03-Alerts/) — the sync-review queue (`00`). [`04-Settings/`](TENANT-ADMIN/04-Settings/) — System Settings (`00`, one full-page). |

The two adb dashboard scripts write straight into their role's menu subfolders —
[`capture-android-home.mjs`](../../../apps/mobile/scripts/capture-android-home.mjs) → `SITE-ENGINEER/01-Home/`,
[`capture-android-tenant-admin-home.mjs`](../../../apps/mobile/scripts/capture-android-tenant-admin-home.mjs)
→ `TENANT-ADMIN/{01-Home,02-Users,03-Alerts,04-Settings}/` — and the FAB-flow scripts (`capture-android-invite-user.mjs`,
`…-role-permissions.mjs`, `…-roles-selection.mjs`, `…-invitation-success.mjs`, `…-system-integration.mjs`)
each write into `TENANT-ADMIN/01-Home/`. [`capture-android-login.mjs`](../../../apps/mobile/scripts/capture-android-login.mjs)
writes `01-public/`, as does
[`capture-android-privacy-policy.mjs`](../../../apps/mobile/scripts/capture-android-privacy-policy.mjs)
(the Privacy Policy screen, `05`) — the one capture here that needs **no backend**: the screen makes no
API call, so Metro alone is enough and no login is performed.
[`capture-android-shared-mfa.mjs`](../../../apps/mobile/scripts/capture-android-shared-mfa.mjs) writes the
three **in-app** cross-role shots — `02-shared/01-notification-preferences.png`,
`02-shared/02-navigation-drawer.png` and `03-mfa/01-app-intro.png`. Everything else under `03-mfa/`
(`02`–`07`) is the **Keycloak hosted browser** flow and is captured by hand, because it runs outside the
app where adb/uiautomator cannot drive it.

## Login flow — [`01-public/`](01-public/)

English UI (matching [`mockup/mobile/01_authen/`](../../../mockup/mobile/01_authen)); the
login header's language switcher is used to leave the th-TH default (QM-3).

| #   | Screen                                                                    | What it shows                                                                            |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 02  | [Login](01-public/02-login.png)                                           | Landing — Path A phone form, Path B "Login with Email" as the secondary action           |
| 03  | [OTP verify](01-public/03-login-otp-verify.png)                           | Passcode step for `+66 •••• 0010`, requested from the landing                            |
| 03  | [Email + password](01-public/03-login-password.png)                       | Keycloak's hosted page in a Chrome Custom Tab, `cos` theme (§20.6.1 / QM-4)              |
| 04  | [Securing session](01-public/04-login-loading.png)                        | `VerifyingOverlay`, shown while the Path B code→token exchange runs                      |
| 05  | [Privacy Policy](01-public/05-privacy-policy.png)                         | Pre-auth policy screen, reached from the login footer link                               |
| 05  | [→ Data Collection open](01-public/05-privacy-policy-data-collection.png) | The same screen with the first section expanded — the collapsed view shows only headings |

Captured by [`apps/mobile/scripts/capture-android-login.mjs`](../../../apps/mobile/scripts/capture-android-login.mjs)
(`cd apps/mobile && pnpm capture:android` — it installs standalone, see the root `pnpm-workspace.yaml`)
— adb/uiautomator only, deliberately **not** Detox:
Path B hands off to Keycloak in a Chrome Custom Tab, and while Detox holds the UiAutomation
connection a `uiautomator dump` only ever returns the instrumented app's own window, leaving the
browser undrivable. The script asserts the screen it expects (e.g. `verifying-overlay`) before saving
each frame, so a mis-tap fails the run instead of writing a screenshot of the wrong thing.

## Site Engineer dashboard — [`SITE-ENGINEER/01-Home/01-home.png`](SITE-ENGINEER/01-Home/01-home.png)

The `SITE_ENGINEER` Home (`components/SiteEngineerHome.tsx`), captured against the `seed-realistic.ts`
dataset through a real Path A (SMS OTP) login as `+66811000009` — Waraporn Klinhom, a SITE_ENGINEER at
Ekachai. **English is the default UI language** (product-owner decision 2026-07-26 — overrides QM-3's
former th-TH default); data values (issue titles, the phase name) stay in their stored Thai.

Layout (product-owner decisions 2026-07-25/26): a **project picker scoped to the projects this engineer
is a member of** (`GET /projects/mine` → `project_members` — here `CWRD` + `R9CT`, auto-selecting the
first); one consolidated command card (a "PROJECT PROGRESS" title, the project name, progress %, the
schedule verdict as a pill, the current phase inline, and a **START / GOAL footer showing the project's
`start_date` and `end_date`** — the project timeline, not a work-hours window); the four quick-action
tiles (Daily report · Capture photo · Safety check → /inspections · Request materials); and a round mic
FAB. The background is a **solid tiered dark surface** — the ADR-071 blueprint grid was removed to match
the design tokens (which specify no grid; §32.7 prohibits blueprint imagery); the progress-bar **glow**
(the other half of ADR-071) is kept.

Everything is live, driven by real data rather than the mockup's placeholders (never fabricated): `76%`
is the BOQ-value-weighted earned percent from `GET /projects/{projectId}/progress` (§32.12); the phase
(`Phase 1: งานฐานราก` — the stored Thai name, its English gloss trimmed for display) is the derived
current phase from `project_phases` (ADR-070); `01 Jun 2026` / `31 Jan 2027` are the project's
`start_date` / `end_date` (formatted "DD Mon YYYY", PO 2026-07-26); and the issues are the project's
real `site_ops.issues` rows. The verdict
pill "Behind by 34 d" is **red** because the project is behind schedule (`spi` below 0.90, §32.12
Display) — the mockup's green "Ahead of Schedule" is a placeholder this data does not support. The
header badge "1 HIGH" (count first, then severity — mockup parity) is the worst severity present and
its count. The issue rows carry no "AI: 94% • BIM SYNC" chip because no such field exists on issues.
The header avatar shows the
signed-in user's profile photo (`platform.users.photo_url`) when one is set; with no photo it falls
back to their initials ("WK" here — Waraporn Klinhom has no photo), then to a neutral person glyph.

> **Why it reads "ช้ากว่าแผน" (behind) and not the mockup's "Ahead of Schedule":** `seed-realistic.ts`
> anchors its tasks to fixed calendar dates about a month wide, so every planned end date is now in
> the past and planned% pins at 100 while earned% sits at 76. That is the dataset ageing out, not a
> defect — the figure moves with `now()` by design.

Captured by [`apps/mobile/scripts/capture-android-home.mjs`](../../../apps/mobile/scripts/capture-android-home.mjs)
(`node scripts/capture-android-home.mjs`) — adb/uiautomator only, same reasoning as the login script
below. It asserts the `site-engineer-home` testID before saving, and fails outright if the progress
card is showing its "no BOQ-linked task" placeholder, so a screenshot of an empty card cannot be
committed by accident.

## Site Engineer dashboard — loading state — [`SITE-ENGINEER/01-Home/00-loading.png`](SITE-ENGINEER/01-Home/00-loading.png)

The same dashboard while its data is still loading: the reusable [`LoadingState`](../../../apps/mobile/src/components/LoadingState.tsx)
component (ADR-055 — the implementation of
[`mockup/mobile/02_loading_component`](../../../mockup/mobile/02_loading_component))
now stands in for the content instead of the "no data" empty states: a `micro` strip (spinner +
"Loading…" + %) where the picker goes — so the picker's "no projects cached" message never reads as a
failure during load — the `widget` variant (an analytics icon-plate + a "Loading…"
label + % + bar) for the command card, and the `list` variant (ragged skeleton rows + a sync-active
spinner and % on the first row) under both Active Issues and Upcoming Tasks. The percentage is honest,
not simulated (ADR-055 caller-owns-progress): the dashboard's caller derives it from how many of its
load steps — `GET /projects/mine` + the project's progress / issues / tasks — have settled (`0 → 25 →
50 → 75 → 100`); the copy is the project's own `common.loadingLabel`, not the mockup's machine strings.
Once every step settles the real content replaces the skeletons. (In this capture all four fetches
hang, so the honest value is `0%`.)

Captured by the same script with `CAPTURE_LOADING=1`
(`CAPTURE_LOADING=1 node scripts/capture-android-home.mjs`): it pauses Postgres so the dashboard's
fetches hang, relaunches so the screen re-mounts into its loading state, and stitches a couple of
scrolling framebuffers into ONE full-page image (so Upcoming Tasks below the fold is included too).
uiautomator can't dump the animating skeletons, so the shots are screencapped directly — and to keep
the shimmer from defeating the stitch's overlap match, `LoadingState` **freezes every skeleton loop at
a mid-frame in capture builds** (`EXPO_PUBLIC_CAPTURE`, the same flag that mutes the LogBox toast);
production and normal dev animate as usual.

## Tenant Admin dashboard — [`TENANT-ADMIN/01-Home/01-home-dashboard.png`](TENANT-ADMIN/01-Home/01-home-dashboard.png)

The `TENANT_ADMIN` Home ([`components/TenantAdminHome.tsx`](../../../apps/mobile/src/components/TenantAdminHome.tsx),
implementing [`mockup/mobile/04_tenant_admin/01_home/01_home_dashboard`](../../../mockup/mobile/04_tenant_admin/01_home/01_home_dashboard)),
captured against the `seed-realistic.ts` dataset through a real Path A (SMS OTP) login as `+66811000002` —
Suphaporn Rattanakul, the TENANT_ADMIN at Ekachai. The header avatar reads **"SR"** (her initials — no
photo set), confirming the signed-in role.

Everything is live, never fabricated: **System Status** is `Operational` (green) from the backend health
probe; **AI Token Usage** shows a dash because this tenant has logged no AI usage yet (`ai.ai_usage_logs`
is empty for it), and **AI System Insights** correspondingly reads "AI usage is within budget — no alerts"
(the `alertLevel: none` state from `GET /ai/usage`); **Pending Approvals** is `0 items` — Payments awaiting
approval `0` and Purchase orders awaiting approval `0` — because `seed-realistic.ts` seeds no `PENDING`
payments or `PENDING_APPROVAL` POs for this tenant. These zeros are the real data, not placeholders; the
screen renders its empty states truthfully rather than inventing figures.

> **On the office role logging in via Path A:** `TENANT_ADMIN` normally signs in through the browser
> (Path B OIDC, where Keycloak enforces MFA). `provision-keycloak-demo.ts` gives every seeded phone-holder
> a phone username + password with no TOTP required action, so the Direct-Grant OTP path works for office
> roles too — which is what makes this dashboard capturable without driving the undrivable browser MFA flow.

**Shell — dark, like the Site Engineer Home (§32.7 Mobile Dark Surfaces; PO decision 2026-07-28).** The
whole shell renders dark to match the dark dashboard: a dark top bar and a dark bottom nav, and the light
`SyncStatusBar` strip is dropped (as it is for the Site Engineer). The bottom nav is **Home | Users |
Alerts | Settings** — the per-role tab set for `TENANT_ADMIN` (`components/MobileNav.tsx`): "Alerts" is
the sync-review queue and "Settings" is the System Settings route (`system-settings`, both dark);
Profile is reached from the top-bar avatar, not a fifth tab. The brand icon (no separate hamburger)
is the drawer trigger. The top bar also carries a small **icon-only sync glyph**
([`components/SyncPill.tsx`](../../../apps/mobile/src/components/SyncPill.tsx)) — the dark shell's sync
indicator in place of the dropped strip: a green check when synced, gold while syncing (glyph shape +
colour, no label, so it stays balanced beside the brand and never crowds it). It sits on the shared top
bar, so it shows the same on every Tenant Admin screen.

**Title-aware top bar + standard Help (PO decision 2026-07-29).** The shared bar shows the **CONSTRUCTION
OS** wordmark only on a role's top-level destinations (its bottom-nav tabs — for Tenant Admin: Home /
Users / Alerts / Settings, where the brand icon is the drawer trigger). On a **child** screen (a pushed
route such as Invite user, Notifications, System-settings detail, Profile-via-avatar) the bar instead
shows that **screen's name + a Back arrow** before the brand icon, and the screen no longer draws its own
in-content page heading (main screens dropped theirs too — the active bottom-nav tab names the screen).
Long titles truncate with "…" so they never crowd the sync pill. A **Help "?"** now sits beside the bell
on **every** authenticated screen (`testID="topbar-help"`); with no in-app help centre yet it opens an
honest "coming soon" note. The mockup's **+ FAB** (bottom-right) opens the
Quick-Add menu (below).

Captured by [`apps/mobile/scripts/capture-android-tenant-admin-home.mjs`](../../../apps/mobile/scripts/capture-android-tenant-admin-home.mjs)
(`node scripts/capture-android-tenant-admin-home.mjs`) — adb/uiautomator only. It asserts the
`tenant-admin-home` landing testID and then the `admin-system-status` card before saving, so a mis-tap or
an unrendered dashboard fails the run instead of writing the wrong screenshot; it then opens the FAB's
Quick-Add menu (`TENANT-ADMIN/01-Home/01-quick-action.png`) and the Users tab
(`TENANT-ADMIN/02-Users/01-users-dashboard.png`).

## Tenant Admin — Users — [`00`](TENANT-ADMIN/02-Users/01-users-dashboard.png) · [`actions`](TENANT-ADMIN/02-Users/02-users-more.png) · [`profile`](TENANT-ADMIN/02-Users/03-user-profile.png) · [`edit`](TENANT-ADMIN/02-Users/04-edit-permission.png) · [`success`](TENANT-ADMIN/02-Users/05-success-permission.png) · [`reset`](TENANT-ADMIN/02-Users/06-reset-password.png) · [`temp-done`](TENANT-ADMIN/02-Users/07-temp-password-create.png) · [`link-sent`](TENANT-ADMIN/02-Users/08-reset-link-sent.png)

The `TENANT_ADMIN` "Users" tab ([`app/(app)/users.tsx`](<../../../apps/mobile/src/app/(app)/users.tsx>)),
implementing the
[`02_users/02_user_management`](../../../mockup/mobile/04_tenant_admin/02_users/02_user_management)
mockup — the tenant's active users from `GET /users` (TENANT_ADMIN-only, spec §14.3), captured against the
`seed-realistic.ts` dataset (12 members). A header + subtitle, a **search box** (name/email), and
**role filter chips** derived from the roles actually present in the data (never a hardcoded list).
Each dark card carries a status strip, the initials monogram (or `photo_url`), name, a short **UID**
(from `user_id`), a `⋮` actions button, the role from `tenant_memberships`, the **status** (`is_active`),
and the **login method** — `OTP Login` when the account has a phone (Path A), `Email Login` otherwise
(Path B). The avatar is a ringed circle; the footer ends in a **chevron** (active — the whole card taps
to open the action sheet) or a **lock** (inactive). Everything is live, never fabricated.

The cyan **AI User Audit** card (mockup `01_users_dashboard` layout — sparkle title, corner glyph, a top-right
badge) is a real, deterministic count: active users whose `last_seen_at` is older
than 30 days. `last_seen_at` is a new `platform.users` column
([migration](../../../backend/prisma/migrations/20260728000001_add_last_seen_to_users/migration.sql))
written fire-and-forget + throttled (15 min/user) by `JwtAuthGuard` on every authenticated request, so
it captures both auth paths. No fabricated "95 % confidence" — it is a count, not a prediction, and it
reads **"all clear"** here because every seeded user was just seen (the badge shows **ALL CLEAR**, or
**N FLAGGED** once dormant accounts accrue — a real count, not the mockup's invented "95 % confidence") (the column
backfills to `now()` at migration; the signal grows meaningful as real dormancy accrues). **Invite user** (FAB) is a
first-pass placeholder (create exists on the web console). The per-user
**`⋮` opens the action sheet** (mockup `02_user_management/01_management`, `02-users-more.png`): a bottom
sheet headed by the selected user, with **Edit permissions · Reset password · View activity · Deactivate
account** (the last in red). Each targets a sub-flow not built on mobile yet (mockups `03_edit_permission`
/ `05_reset_password` / `07_user_activity` / `08_user_deactivation`), so it opens an honest "not available
on mobile yet" note rather than dead-ending. **Tapping the card itself (or its chevron)** opens the
**user profile** (below); only the ⋮ opens the sheet.

## Tenant Admin — User profile — [`01`](TENANT-ADMIN/02-Users/03-user-profile.png)

The per-user detail ([`app/(app)/user-profile.tsx`](<../../../apps/mobile/src/app/(app)/user-profile.tsx>)),
implementing [`02_users/02_user_management/02_user_profile`](../../../mockup/mobile/04_tenant_admin/02_users/02_user_management/02_user_profile).
Pushed from the Users list (a card tap), carrying the tapped row as params. No top bar of its own — the
global TopBar shows "User Profile" + a Back arrow.

Everything is real, never the mockup's placeholders:

- **Hero** — the ringed avatar (photo or initials) with a live status dot, name, `UID · ROLE`, and the
  Active/Inactive badge — all from the `GET /users` row.
- **AI Analytics Engine** — kept as a shell but **drops the mockup's fabricated "98 % confidence"**;
  it shows the account's real **last-seen** (`Last active: …` from `last_seen_at`), sourced honestly.
- **Personal Information** — real Email, Phone, and **Department**. `department` is a new nullable
  `platform.users` column (migration `20260730000001`, added to support HR) seeded per role by
  `seed-realistic.ts`; each field shows a dash when the account has no value.
- **Projects** — the projects the user is a member of, from a new endpoint **`GET /projects/user/:id`**
  (TENANT_ADMIN-only, tenant-scoped via `project_members`); an honest "not a member of any project" when
  the list is empty. Real rows (the seeded EXECUTIVE belongs to all five), replacing the mockup's
  fabricated "Skyline Tower A / Metro Bridge".
- **Edit permissions** opens the multi-role permission editor (below). **Reset password** targets a
  sub-flow not built on mobile yet, so it opens an honest "not available on mobile yet" note.

## Tenant Admin — Edit permissions — [`04`](TENANT-ADMIN/02-Users/04-edit-permission.png)

The permission editor ([`app/(app)/edit-permission.tsx`](<../../../apps/mobile/src/app/(app)/edit-permission.tsx>)),
implementing [`02_users/02_user_management/03_edit_permission`](../../../mockup/mobile/04_tenant_admin/02_users/02_user_management/03_edit_permission).
Reached from the Users action sheet or the profile's **Edit permissions**.

**The real fix for "one person, several jobs" — multi-role, the industry-standard way.** COS enforces
authorization by role membership (`@Roles`, ~156 endpoints), not per-user permissions, so the mockup's
editable per-user CRUD toggles have no backing store. Following NIST RBAC and Keycloak's own model
(researched before deciding — a user with multiple roles gets the **union** of their permissions), this
screen instead lets a TENANT_ADMIN give a user a **primary role plus additional roles**:

- **Backend** — a new `platform.user_additional_roles` table (migration `20260730000002`); `PUT
/users/:id/roles` sets the primary (on `tenant_memberships`) + the additional set. Enforcement is real:
  `RolesGuard` falls back to a user's additional roles when the JWT's primary role doesn't satisfy an
  endpoint, and `PermissionsGuard` unions `ROLE_PERMISSIONS` across all of them. Both guards keep a
  fast path (primary role alone) so the common request never hits the DB.
- **The module matrix is a READ-ONLY reflection of the effective (union) permissions** — it updates live
  as roles are toggled. It is derived from the authoritative `GET /auth/roles/:role/permissions` (§6.4),
  never per-user overrides. The capture shows **Thanawat Boonmee** — primary **Project Manager** + an
  additional **Safety Officer** (a PM who also runs site safety); the matrix is the union, e.g.
  **Inspections gains APPROVE** from the Safety Officer role that the Project Manager role alone lacks.
- The mockup's fabricated **"92 % confidence"** AI recommendation is dropped for an honest shell that
  simply states the effective access is the union of N roles. **Save** persists via `PUT /users/:id/roles`.

## Tenant Admin — Permission saved — [`05`](TENANT-ADMIN/02-Users/05-success-permission.png)

The terminal confirmation shown after the editor's SAVE succeeds
([`app/(app)/permission-success.tsx`](<../../../apps/mobile/src/app/(app)/permission-success.tsx>),
mockup [`02_users/02_user_management/04_success_permission`](../../../mockup/mobile/04_tenant_admin/02_users/02_user_management/04_success_permission)).
Edit-permission `router.replace`s here on a successful `PUT /users/:id/roles`, carrying the target's id +
name. No top bar of its own — the global TopBar shows the CONSTRUCTION OS wordmark with **no Back arrow**
(terminal, reached via `router.replace`).

- **Real submitted data** — the heading confirms the save and the body names the actual user
  (`Thanawat Boonmee` in the capture). The mockup's **"99 % confidence" AI SYNC LOG is fabricated**, so the
  card is kept as an honest shell that states the change applies to the account's effective permissions
  and is recorded in the audit log (`identity.user.role_changed.v1`). The mockup's _"syncs to every site
  tablet immediately"_ is dropped too — the stateless JWT means a role change takes effect on the target's
  next sign-in.
- **Back to user management** → `router.replace('/users')`. **View user profile** → the user's profile
  (which fetches the row by id when it is opened with only an id, so it still shows real data).

## Tenant Admin — Reset password — [`06`](TENANT-ADMIN/02-Users/06-reset-password.png)

The admin-triggered password-reset form
([`app/(app)/reset-password.tsx`](<../../../apps/mobile/src/app/(app)/reset-password.tsx>), mockup
[`02_users/02_user_management/05_reset_password`](../../../mockup/mobile/04_tenant_admin/02_users/02_user_management/05_reset_password)).
Opened from a user's profile **Reset password** button or the Users-list ⋮ sheet, carrying the target's row.
The **breadcrumb** (`USER MANAGEMENT › PASSWORD RESET`) sits under the TopBar (mockup).

**Delivery model** (PO decision informed by research — NIST 800-63B Rev.4, OWASP Forgot-Password Cheat
Sheet, Okta): the **email reset link is the standards-compliant primary method**; the temporary password is
the fallback for phone-only accounts.

- **Real target** — the card shows the actual user from the passed row (`Chalermsak Nithat`, `CRM SALES
MANAGER` in the capture).
- **AI Security Check → honest shell** — the mockup's _"99 % Confidence · No suspicious activity detected"_
  is **fabricated**; the card is kept but states the truth (the reset is recorded in the audit log; no risk
  score is inferred).
- **Send reset link (email)** — the **recommended, preselected** method when the user has an email. Backed by
  `POST /users/:id/reset-password/email` → `KeycloakAdminService.sendPasswordResetEmail` →
  `executeActionsEmail(['UPDATE_PASSWORD'], lifespan=900)`: Keycloak emails a **single-use link that expires
  in 15 minutes** (NIST 800-63B Rev.4 — single-use, short-lived, separate channel), and the user sets their
  OWN password — COS never handles the plaintext. Requires realm SMTP (a `mailhog` dev service; §docker-compose).
  If the user has **no email**, this row is disabled (_"No email on file"_) and the temp method is selected.
- **Generate temporary password** — the fallback: `POST /users/:id/reset-password` →
  `setTemporaryPassword` (`temporary=true`). The mockup's _"expires in 1hr"_ is dropped — `temporary=true`
  forces a change at next sign-in, it is not a timed expiry.
- **Footer** — the mockup's **"REQUEST ORIGIN: TERMINAL 04-HQ" is fabricated** (no terminal concept) and
  dropped; **AUTH LEVEL: TENANT ADMIN** is real (only a TENANT_ADMIN can reach the endpoint) and kept.
- **Confirm reset** branches on the selected method → the email path `router.replace`s to `08`
  (reset-link-sent), the temp path to `07`. **Cancel** → `router.back()`. Both emit
  `identity.user.password_reset.v1` (with `method` = `email_link` / `temporary_password`).

## Tenant Admin — Password reset done (temp) — [`07`](TENANT-ADMIN/02-Users/07-temp-password-create.png)

The terminal confirmation shown after **Confirm reset** succeeds with the **temporary-password** fallback
([`app/(app)/reset-password-success.tsx`](<../../../apps/mobile/src/app/(app)/reset-password-success.tsx>),
mockup [`02_users/02_user_management/07_temp_password_success`](../../../mockup/mobile/04_tenant_admin/02_users/02_user_management/07_temp_password_success)).
Reached via `router.replace` — no top bar of its own (global TopBar shows the wordmark, **no Back**).

- **Real temp password, shown masked** — the value the backend returned is displayed **masked**
  (`••••••••••`) with a **Reveal** toggle + a **SHOWN ONCE** badge, so a live credential is never left on
  screen or committed into a screenshot; it is never persisted and cannot be shown again.
- **CORE_AI insight → honest** — the mockup's _"This password will expire in 60 minutes"_ is **not
  achievable** with Keycloak `temporary=true` (no timed expiry — it stays valid until the user signs in and
  changes it), so the card states exactly that (PO chose the honest no-expiry copy over faking a timer).
- **System security log → honest** — the mockup's fabricated `TICKET ID` / `TERMINAL ID` footer is dropped;
  the truthful audit fact (event `identity.user.password_reset.v1`, which now publishes cleanly) is kept.
- **Done** → `router.replace('/users')`.
- **Note (Path A users)** — the temp password is chiefly meaningful for Path B (email/password) sign-in;
  for phone/OTP users the login credential is re-set on each OTP exchange. `temporary=true` also adds an
  `UPDATE_PASSWORD` required action in Keycloak, which for an OTP user must be cleared before their next OTP
  login. This becomes universally meaningful once the planned **unified login** (any user signs in via OTP
  _or_ email+password) lands.

## Tenant Admin — Reset link sent (email) — [`08`](TENANT-ADMIN/02-Users/08-reset-link-sent.png)

The terminal confirmation for the **standards-compliant email path**
([`app/(app)/reset-password-email-success.tsx`](<../../../apps/mobile/src/app/(app)/reset-password-email-success.tsx>),
mockup [`02_users/02_user_management/06_reset_password_success`](../../../mockup/mobile/04_tenant_admin/02_users/02_user_management/06_reset_password_success)).
Reached via `router.replace` — terminal, wordmark TopBar, no Back.

- **Real send** — Keycloak actually emailed the target (verified via the MailHog dev inbox); the body names
  the real address (`chalermsak.n@ekachai.co.th`) and the real token lifespan. The mockup's _"link valid 24
  hours"_ is replaced with the true **15 minutes**, and the fabricated `SYSTEM SECURITY LOG` UIDs with the
  truthful audit fact (`identity.user.password_reset.v1`, `method: email_link`).
- **Return to user list** → `router.replace('/users')`.

## Tenant Admin — Quick-Add menu — [`TENANT-ADMIN/01-Home/01-quick-action.png`](TENANT-ADMIN/01-Home/01-quick-action.png)

The FAB's full-screen **Quick Commands** overlay
([`components/QuickAddMenu.tsx`](../../../apps/mobile/src/components/QuickAddMenu.tsx), mockup
`04_tenant_admin/01_home/02_quick_action_button/01_quick_action_menu`) — a dark surface with its own top
bar (brand + SYNCED pill + close), **five action cards** (Invite · New System Integration · Apps &
Services · Generate Usage Report · Force System Sync), and a small stats bento. Left-accent colour
follows the action. With the fifth card the overlay now scrolls, so `01` is captured as **one full-page
stitch** (`scripts/stitch-fullpage.py`). Real vs honest placeholder:

- **Force System Sync** — real (`runPushSync()` then `runDeltaSync()`, §17.6 flush + pull); tapping it
  spins the icon and the sub-label reads **SYNCING…** while it runs.
- **SYNCED pill** (top bar) — real `useSyncStatus()` (the SyncStatusBar's source; green check when idle).
- **Active Projects** / **System Health** bento — real figures over **bundled photo backdrops** (PO
  decision 2026-07-29): the project count from `GET /projects/mine` (0 for this admin, who is a member of
  none) on `assets/tenant-admin/digital_archectural_blueprint.jpg`, and liveness from `GET /health/live`
  shown as a word (**Optimal**), **not** the mockup's invented "98.4 %", on
  `assets/tenant-admin/micro_server.jpg`. Each tile follows the mockup layout — a dimmed photo banner on
  top, then the label + real value stacked below on the card surface.
- **Invite New User** opens the Invite-user form (below); **New System Integration** opens the
  connector picker (`06`); **Apps & Services** opens the module hub (`07`). **Generate Usage Report** is an
  honest placeholder (no AI-report screen yet) — the AI-report card keeps the mockup's richer layout but
  **drops the fabricated "94 % CONFIDENCE / Source"** (no such signal exists).

## Tenant Admin — Invite user — [`phone`](TENANT-ADMIN/01-Home/03-invite-user-phone.png) · [`email`](TENANT-ADMIN/01-Home/03-invite-user-email.png)

The Quick Commands "Invite New User" target
([`app/(app)/invite-user.tsx`](<../../../apps/mobile/src/app/(app)/invite-user.tsx>), mockups
`04_tenant_admin/01_home/02_quick_action_button/02_invite_user/{02_invite_user_via_phone,02_invite_user_via_email}`
— one screen with a phone/email toggle covers both). A real, wired form: **SEND INVITATION** calls
`POST /users` (createUser, TENANT_ADMIN §14.3) with the chosen method — **Path A phone** (E.164, the
default `+66` prefix) or **Path B email** — the selected role, and the recipient's name.

- **One header, not two.** The screen renders no top bar of its own; it uses the app's global TopBar
  (brand · SYNCED pill · bell · avatar). A second "INVITE USER" bar stacked under the global one was a
  duplicate (PO decision 2026-07-29 — remove it). For this route the global bar shows a **Back arrow**
  (added to `TopBar` `BACK_ROUTES`) and a **Help "?"** beside the bell; **CANCEL** and the Back arrow
  both `router.back()` to Home.
- **Full name** — added on top of the mockup because `POST /users` requires `display_name`, which the
  mockup's contact-only form never collected (PO decision 2026-07-29). Each method is one
  full-page image (header → role cards → AI panel → footer): `phone` = the phone method, `email` = the
  EMAIL toggle (the contact field clears on switch). Both show a role selected so the AI copy is role-aware.
- **Role assignment** is the real assignable `CosRole` set — everything except the cross-tenant
  `SYSTEM_ADMIN` (`assertRoleAssignableByTenant`), four shown with **"Show more roles (7)"** (the real
  remaining count, not the mockup's "4"); the selected role is what `createUser` receives.
- **SYNCED pill** is the global TopBar's real `useSyncStatus()` (TENANT_ADMIN `SyncPill`). **Assign
  projects** is a UI-only search over the tenant's projects (`createUser` takes no project list, so it
  is applied after the account is created, not submitted here) — no fabricated "Skyline Tower A /
  Central Hub" chips (PO decision 2026-07-29 — real search only).
- The **CORE_AI ASSISTANT** panel keeps its **"94 % CONFIDENCE"** badge, and its copy is **role-aware**
  ("…pre-applied for the _Project Manager_ role") but **drops the mockup's fabricated permission
  specifics** ("approval rights for Payouts and Daily Reports") — PO decision 2026-07-29.

## Tenant Admin — Role permissions — [`03`](TENANT-ADMIN/01-Home/04-role-permissions.png)

Reached from Invite-user's **"View permissions"** link
([`app/(app)/role-permissions.tsx`](<../../../apps/mobile/src/app/(app)/role-permissions.tsx>), mockup
`04_tenant_admin/01_home/02_quick_action_button/02_invite_user/02_role_permissions`). A read-only access
breakdown for the role being invited.

- **Real RBAC, not the mockup's values.** The module → access rows are **derived from the authoritative
  permission matrix** (`ROLE_PERMISSIONS`, spec §6.4) fetched over a new endpoint
  **`GET /auth/roles/:role/permissions`** — so they show what the role can _actually_ do. Level is
  derived per resource: any `*`/`approve` grant → **FULL**, else `write` → **RW**, else read → **R**. For
  `PROJECT_MANAGER` that is Projects RW · BOQ RW · Procurement **FULL** (it holds `procurement:approve`)
  · Finance R · Site Operations RW · Analytics R · AI R — deliberately different from the mockup's
  illustrative Procurement RW / Site FULL / Safety R (PO decision 2026-07-29 — honest RBAC over the
  drawn values; only the modules a role really holds are listed).
- **Hero** reuses the role's real name + `inviteUser.roleDesc` copy. Per-module descriptions are generic,
  role-independent resource summaries (not the mockup's role-specific narratives).
- The **CORE_AI ASSISTANT** banner is kept as the mockup drew it, **including "98 % Confidence" and
  "Verified against RBAC v4.2"** (PO decision 2026-07-29 — "full ตาม mockup"). The screen has no top bar
  of its own: the global TopBar shows "Role permissions" + a Back arrow; the footer **"Back to
  invitation"** and that arrow both `router.back()`.

## Tenant Admin — Roles selection — [`04`](TENANT-ADMIN/01-Home/05-roles-selection.png)

The full-screen role picker opened from Invite-user's **"Show more roles"**
([`app/(app)/roles-selection.tsx`](<../../../apps/mobile/src/app/(app)/roles-selection.tsx>), mockup
`04_tenant_admin/01_home/02_quick_action_button/02_invite_user/03_roles_selection`). Searchable,
single-select (createUser takes one role).

- **All 11 real assignable roles**, not the mockup's curated 7 — the `AVAILABLE ROLES (11)` count and
  the list are the assignable `CosRole` set (everything except the cross-tenant `SYSTEM_ADMIN`), with
  real `inviteUser.roleDesc` copy (PO decision 2026-07-29). The **primary/support grouping** and the
  **Chief/Lead/Field/HSE tier badges** are decorative and follow the mockup; roles the mockup did not
  badge (Proc Manager, Site Worker, Tenant Admin, Viewer) stay unbadged rather than inventing tiers.
- The **CORE_AI Context** banner is kept as drawn, **including "98 % Confidence" / "Source: Tenant Policy
  v4.2"** (PO decision 2026-07-29 — "full ตาม mockup"). The info "ⓘ" opens the real role-permissions
  breakdown for the selected role.
- **CONFIRM ROLES** hands the pick back to the Invite-user form through an ephemeral store
  ([`store/inviteRoleStore.ts`](../../../apps/mobile/src/store/inviteRoleStore.ts)) and pops — the inline
  role card there becomes selected and the AI copy turns role-aware. The pop relies on the Tabs navigator
  being switched to **`backBehavior="history"`** (`components/MobileNav.tsx`): these pushed screens are
  hidden `Tabs.Screen` siblings, and the React Navigation default (`firstRoute`) would send Back to Home
  instead of the screen that opened the picker — this also fixes Role-permissions' "Back to invitation".

## Tenant Admin — Invitation success — [`05`](TENANT-ADMIN/01-Home/06-invitation-success.png)

The terminal confirmation shown after Invite-user's **SEND INVITATION** succeeds
([`app/(app)/invitation-success.tsx`](<../../../apps/mobile/src/app/(app)/invitation-success.tsx>), mockup
`04_tenant_admin/01_home/02_quick_action_button/02_invite_user/04_invitation_success`). It **replaces the
old success `Alert`**; Invite-user `router.replace`s here on `createUser` 201.

- **Real submitted data.** Recipient shows the **contact exactly as entered, unmasked** (PO decision
  2026-07-29 — the mockup's `+66 81-xxx-9921` mask is dropped); Role is the chosen role. The **Projects
  row only appears when the admin actually picked projects** (createUser takes no project list, so it is
  usually absent) — no fabricated "Skyline Plaza / Central Hub". "Status: Awaiting response" is truthful
  (the invite is pending until the recipient verifies).
- The **CORE_AI** banner is kept as drawn, **including "98 % Confidence | RBAC policy v4.2"** (PO decision
  2026-07-29 — "full"). No top bar of its own — the global TopBar shows the CONSTRUCTION OS wordmark with
  **no Back arrow** (terminal screen; reached via `router.replace`). **Invite another member** →
  `router.replace('/invite-user')`; **Go to dashboard** → `router.replace('/home')`.
- **Backend fix (required for this flow to work at all).** `POST /users` was returning **500** —
  `user.service.ts` cast the role to an unqualified `::"CosRoleEnum"`, but the type lives in the
  `platform` schema and the connection's `search_path` excludes it (`type "CosRoleEnum" does not exist`).
  Qualified to `::platform."CosRoleEnum"` in both `createUser` and `changeRole`; `POST /users` now returns
  **201** and the real SEND → success flow is reachable.

## Tenant Admin — System integration — [`06`](TENANT-ADMIN/01-Home/07-system-integration.png)

The connector picker opened from Quick Commands → **New System Integration**
([`app/(app)/system-integration.tsx`](<../../../apps/mobile/src/app/(app)/system-integration.tsx>), mockup
`04_tenant_admin/01_home/02_quick_action_button/03_system_integration/00_tenant_new_integration`). It
**replaces the Integration action's `coming soon` alert** — QuickAdd now `router.push`es here.

- A **catalogue of the integration types** the platform offers (LINE Messaging API · Autodesk BIM 360 ·
  ERP Connect), each with its brand accent + badge. There is **no backend integration API yet**, and each
  connector's configuration flow is a separate not-yet-built mockup (`02_line…` / `03_autodesk…` /
  `04_erp…`), so **tapping a card opens an honest per-connector "coming soon"** (PO decision 2026-07-29);
  the sub-flows get wired as they are implemented. Search filters the connectors.
- The **CORE_AI** banner is kept as drawn, **including "98% Confidence"** (PO decision 2026-07-29 —
  "full"). The **"Enterprise ready" band uses a bundled server-room photo asset**
  (`assets/tenant-admin/server_room.jpg`, provided by the PO) under an SVG scrim that keeps the caption
  legible (no external image). The global TopBar shows the screen title + a Back arrow.
- **`06` is one full-page image** (PO decision 2026-07-29 — "one page, not split"): the capture shoots
  several scrolling viewports and stitches them with `scripts/stitch-fullpage.py`. Also visible here: the
  **brand icon in the TopBar is now a rounded-square tile** (`brandIcon` `borderRadius`, Linear/Palantir
  aesthetic) — a global TopBar change, so every screen's header picks it up.

## Tenant Admin — Apps & Services — [`07`](TENANT-ADMIN/01-Home/08-apps-services.png)

The module / tools / extensions hub, opened from Quick Commands → **Apps & Services** (a new action card
there — `router.push`)
([`app/(app)/apps-services.tsx`](<../../../apps/mobile/src/app/(app)/apps-services.tsx>), mockup
`04_tenant_admin/01_home/02_quick_action_button/03_system_integration/01_application_and_services/00_apps_and_services`).

- **Honest wiring:** every card is a catalogue entry with no built screen yet (the core modules are
  field-role features; the extensions have no backend integration API; Audit Logs has no screen), so
  **tapping opens a per-item "coming soon"**. The decorative **"AI Enhanced" / "Phase 5"** tier badges
  follow the mockup; search filters every section by name.
- Sections (PO decision 2026-07-29): **Core Modules** (Site Reports · Issue Management · Inventory · BIM
  Viewer · Drone Reality Capture), **Admin Tools** (Audit Logs only — User Management / System Settings
  removed), **Extensions** — the three connectors, ordered **LINE Messaging API · Autodesk BIM 360 · ERP
  Connect**. `07` is one full-page stitch; no top bar of its own (global TopBar shows the title + Back
  arrow).

## Tenant Admin — Sync Review Queue (Alerts) — [`00`](TENANT-ADMIN/03-Alerts/01-alerts-dashboard.png)

The `TENANT_ADMIN` "Alerts" tab
([`app/(app)/sync-queue.tsx`](<../../../apps/mobile/src/app/(app)/sync-queue.tsx>)), implementing
[`04_tenant_admin/03_alerts/01_alerts_dashboard`](../../../mockup/mobile/04_tenant_admin/03_alerts/01_alerts_dashboard).
It is the field-sync **review queue** — `GET /site/conflict-records` (the SAME endpoint the Site
Engineer's ConflictBadge uses; spec §17.5 lets `TENANT_ADMIN` view/resolve), resolved via
`PATCH /site/conflict-records/:id/resolve`. Real data throughout: the badge + filter chips are the
actual `conflict_type` enum (**REJECTED / STATUS_CONFLICT / FIELD_CONFLICT**, colour-coded) — the
mockup's Critical/Medium/Low "severity" is not a field on the record, so it is not invented. `REF` comes
from `entity_id`, `FAILED AT` from `created_at`, and the **error reason** is a localised description of
each `conflict_type` (not a fabricated per-record message). `01-alerts-dashboard` shows the populated
list as one full-page image. **Mark resolved** is the single real action (the
mockup's retry / merge / edit are all one `resolve` on the backend).

The five conflicts are demo rows seeded by
[`seed-realistic.ts`](../../../backend/prisma/seed-realistic.ts) (a realistic tenant accumulates field-sync
conflicts, like it accumulates issues and reports); the screen renders that real (seed) data.

## Tenant Admin — System Settings — [`00`](TENANT-ADMIN/04-Settings/01-system-settings.png)

The `TENANT_ADMIN` "Settings" tab
([`app/(app)/system-settings.tsx`](<../../../apps/mobile/src/app/(app)/system-settings.tsx>)), implementing
[`04_tenant_admin/04_settings/01_system_settings`](../../../mockup/mobile/04_tenant_admin/04_settings/01_system_settings).
The screen is taller than the viewport, so it is captured as ONE full-page image (stitched from
scrolling viewports): Organization Info → Brand & Identity → External Integrations → Others → AI System Insight.

**Real, persisted data:** **Organization Info** — name + code from `GET /tenant`
([`my-tenant.controller.ts`](../../../backend/src/modules/tenant/my-tenant.controller.ts), a new
self-service endpoint scoped by the JWT `tenant_id`, so a caller can only read their own tenant). The
copy button uses the OS's own text-selection (no clipboard dependency) — it selects the code so the
native Copy affordance appears, never a faked "copied" confirmation. **LINE Notification** — the on/off
toggle (`notifications_enabled`) and the channel token (`line_channel_token`) are read from
`GET /tenant/settings` and saved via `PATCH /tenant/settings`; the token here is empty because the seeded
tenant has none set. **System language** is the real `LanguageSwitcher` (th⇄en).

**Honest placeholders (full mockup layout, no fabricated data — PO decision 2026-07-28):** Brand logo
upload + primary-colour picker, Autodesk BIM 360 sync, Security policy, and Delete-tenant each open an
"not available yet" notice rather than dead-ending. The mockup's **AI System Insight** showed an invented
"LINE token expires in 3 days / 98 % confidence" — there is no such signal, so the card renders its shell
with an honest empty state (**"No AI insights available yet."**), never the fabricated prediction.

## Shared — Notification settings — [`01`](02-shared/01-notification-preferences.png) · [`quiet hours`](02-shared/01-notification-preferences-quiet.png) · [`saved`](02-shared/01-notification-preferences-saved.png)

The cross-role notification-preferences route, reached from the navigation drawer (below) rather than
from a tab. Three states of the same screen.

**`01-notification-preferences.png`** — the top of the list. Preferences are grouped by
consequence, not by channel. **CRITICAL INFRASTRUCTURE** holds a single row, _Safety incident
(immediate)_, badged **REQUIRED** with a padlock and its `IN_APP` + `LINE` channels shown as
green ticks rather than toggles — that row cannot be switched off, which is spec §19.6's
"critical safety notifications cannot be disabled or quieted" rendered as UI rather than
enforced silently server-side. **PROJECT & OPERATIONS** below it (_Daily site report_,
_Inspection failed_, _Budget variance alert_) uses ordinary per-channel toggle chips.

**`01-notification-preferences-quiet.png`** — scrolled to the bottom: _Purchase approval requested_
and _AI risk prediction_, then **QUIET HOURS (PUSH ONLY)** with `START 22:00` / `END 07:00` on
±steppers — the `quiet_hours_start` / `quiet_hours_end` defaults from the
`notification_preferences` table. The note under it repeats the §19.6 carve-out: _"Push is muted
during this window. Critical safety alerts are never quieted."_

**`01-notification-preferences-saved.png`** — the post-save confirmation: _Changes saved_, with
`STATUS Active` and `LAST SYNC Just now`, and a **Back** button.

## Shared — Navigation drawer — [`02-shared/02-navigation-drawer.png`](02-shared/02-navigation-drawer.png)

The drawer opened from the top bar, captured as Somsak Duangdee (`SITE_WORKER`) — the identity card
shows the initials avatar, the role, and an **Online & synced** pill. **FIELD TOOLS** lists Project
overview, Daily site reports, Safety incident logs, Inspections, Materials and Deliveries; below the
divider sit Notification settings and a red **Log out**. This is where routes that are deliberately
NOT bottom-tabs live — `MobileNav.tsx` sets `href: null` on the notification-preferences and
mfa-enrollment routes so they stay reachable without spending one of the 4–5 tab slots spec §32.7
allows.

## MFA enrolment — [`01`](03-mfa/01-app-intro.png) · [`02`](03-mfa/02-keycloak-login.png) · [`03`](03-mfa/03-keycloak-totp-setup.png) · [`04`](03-mfa/04-keycloak-totp-verify.png) · [`05`](03-mfa/05-app-enrollment-success.png) · [`06`](03-mfa/06-keycloak-recovery-codes.png) · [`07`](03-mfa/07-keycloak-backup-codes-copied.png)

TOTP enrolment for the office roles (QM-4 makes MFA mandatory for `TENANT_ADMIN` and `FINANCE`). The
flow deliberately leaves the app: per [ADR-050](../../architecture/adr/050-mobile-path-b-login.md)
there is **no bespoke mobile MFA UI** — Keycloak's hosted pages own every step that touches the
secret, so the app only bookends the flow.

- **`01-app-intro.png`** (in-app) — _Two-factor authentication_, a three-step primer (open your
  authenticator → scan the QR → enter the 6-digit code and save the backup codes) and a
  **SET UP AUTHENTICATOR** button. The footnote _"You'll continue in a secure Construction OS
  window"_ is the hand-off to Keycloak.
- **`02-keycloak-login.png`** (browser) — the Keycloak login page at `localhost:8090/realms/…`,
  branded _Secure Access_, email + password, with SOC2 / GDPR / ISO 27001 badges in the footer.
- **`03-keycloak-totp-setup.png`** (browser) — _MFA Enrollment · Tenant Administrator Security
  Protocol_: a compliance notice, **01 SETUP AUTHENTICATOR** with the QR plus a **MANUAL ENTRY
  SECRET KEY**, and **02 ENTER VERIFICATION CODE** with six single-digit boxes.
- **`04-keycloak-totp-verify.png`** (browser) — the same page with the code boxes focused. See
  [Known gaps](#known-gaps): this capture is obscured by Chrome and the keyboard.
- **`05-app-enrollment-success.png`** (in-app) — back inside the app: _Enrollment successful_ with a
  **SECURITY AUDIT SUMMARY** (`Status Active`, `Method Authenticator app`, `Backup codes Saved`) and
  **Go to dashboard**.
- **`06-keycloak-recovery-codes.png`** (browser) — _Backup Security Codes_: twelve one-time codes and
  the warning that they will not be shown again after leaving the page.
- **`07-keycloak-backup-codes-copied.png`** (browser) — the same page scrolled to the actions after
  **COPY ALL CODES** was pressed: a _Copied to Clipboard_ toast over the Android clipboard preview,
  Download / Print, an _"I have saved these codes somewhere safe"_ checkbox gating **Complete setup**.

> The secret keys and backup codes visible in `03`, `04`, `06` and `07` belong to a throwaway account
> on the **local dev realm** (`localhost:8090`) — they authenticate nothing outside that machine.

## App launch — loading state — [`01-public/01-app-launch-loading.png`](01-public/01-app-launch-loading.png)

Opening the app now shows the same [`LoadingState`](../../../apps/mobile/src/components/LoadingState.tsx)
`widget` ("loading A", ADR-055) on a dark ground while the persisted session hydrates and the brand
font resolves ([`src/app/_layout.tsx`](../../../apps/mobile/src/app/_layout.tsx)) — the
**app favicon** (the hexagon mark) in place of the icon-plate skeleton, the **brand tagline** ("AI-NATIVE
/ Construction Platform") in place of the top skeleton bar, then a two-step (hydration + font) percentage
and a matching bar (`50%` here: session hydrated, font still loading). This mirrors the login hero, and
continues the native splash's identity into the JS layer so `01-public/00-native-splash.png` → this state is one
continuous branded dark hold (same `#020617` ground, same mark + wordmark), not a colour or content jump.
The favicon + tagline are passed by the caller through the new opt-in `iconSource` / `heading` props
(ADR-055 — the component bakes no brand asset or copy; the dashboard's `widget` skeleton, which passes
neither, is unchanged). The tagline is the English brand default, not i18n: this renders before
`I18nProvider` mounts and before the persisted locale is known (QM-3's system default); the interactive
`label` is still omitted for the same reason. Captured by cold-launching (`pm clear` wipes the font
cache, widening the font-load window) and screencapping the framebuffer. The dev-only LogBox toast
("Open debugger to view warnings.") is suppressed for capture builds — Metro started with
`EXPO_PUBLIC_CAPTURE=1` runs `LogBox.ignoreAllLogs()` in [`_layout.tsx`](../../../apps/mobile/src/app/_layout.tsx),
so it never lands in a documentation screenshot; normal `expo start` is unaffected.

## Native splash — [`01-public/00-native-splash.png`](01-public/00-native-splash.png)

The Android 12+ system splash (`android/app/src/main/res/values/styles.xml`, `Theme.App.SplashScreen`)
shown for the ~1 s before the JS bundle mounts. Two changes from the original:

- **Background** darkened from `#0B1020` to **`#020617`** (`darkColors.bg`, the app-shell ground —
  `splashscreen_background` in `res/values/colors.xml`), so splash → launch-loading → app is one
  continuous dark surface with no navy flash.
- **Layout** reworked so the mark reads large and balanced. The old splash fed the whole wide
  `splash-logo.png` wordmark (878×154) into `windowSplashScreenAnimatedIcon`, and Android 12 letterboxed
  it into the small square icon slot — tiny. Now the **icon is the square hexagon mark** (from
  `assets/favicon.png`, replacing the `drawable-*/splashscreen_logo.png` set), so it fills that slot at
  ~192 dp, and the **"CONSTRUCTION OS" wordmark** (cropped out of `splash-logo.png` and scaled per
  density into `drawable-*/splashscreen_branding.png`) moves to `android:windowSplashScreenBrandingImage`,
  centred at the bottom.
- **Branding fix.** The `drawable-*/splashscreen_branding.png` set was regenerated from
  `assets/splash-logo.png`: the committed drawables had the final **"S" of "OS" cropped off** (the
  wordmark touched the canvas edge), so the splash rendered a half-cut S. The wordmark is now re-cropped
  with the complete "OS", centred with margin so nothing touches an edge, and the fine-print
  **"AI-NATIVE CONSTRUCTION PLATFORM"** tagline is re-rendered crisply in Inter Tight (it was soft).
  Needs a native rebuild.

This is **native config** (drawables + theme in `android/`), hand-maintained beyond what the
`expo-splash-screen` plugin generates (the plugin has no branding-image option), so it changes only on a
fresh native build, not via Metro. Rebuilt with `gradlew assembleDebug` under **JDK 21** (Android Studio
JBR) — the shell's default `JAVA_HOME` (JDK 25) is not yet supported by the RN 0.85 / Gradle 8.13
toolchain and fails plugin resolution. Captured by cold-launching (`am start`) and screencapping the
framebuffer inside the splash window. The launcher app icon is untouched: it reads a separate
`iconBackground` colour (`res/mipmap-anydpi-v26/ic_launcher.xml`), not these splash drawables.

## App screens — `00-login.png` … `20-profile.png`

The 21 flat files are the same route set as [iOS](../ios/README.md), captured by
[`apps/mobile/e2e/capture.spec.ts`](../../../apps/mobile/e2e/capture.spec.ts) from **one
`PROJECT_MANAGER` session** (`+66800000002` — the role with the widest data access), deep-linking
each route via `cos:///<route>`. That flat dump documents routes as one user sees them, matching the iOS
layout — a different thing from the **committed** per-role captures here, which are grouped into role
folders (see [Structure](#structure--grouped-by-role) above), like [`../web/`](../web).

`00-login.png` from that dump predated the login redesign — `01-public/02-login.png` is the current landing.

## Known gaps

- **Per-role capture is possible now — this gap is closed** (2026-07-16). Path A needs a Keycloak user
  whose _username_ is the phone number (`identity.service.ts` `issueTokensForPhone` →
  `keycloak-admin.service.ts` `exchangeOtpForTokens` does a Direct Grant with `username: <phone>`),
  and [`provision-keycloak-demo.ts`](../../../backend/prisma/provision-keycloak-demo.ts) used to
  provision every demo user with the email as username, so no seeded role could complete an OTP login.
  It now uses the phone number as the username whenever the account has one; Path B still works
  because the realm sets `loginWithEmailAllowed`. `SITE-ENGINEER/01-Home/01-home.png` is the first
  screen captured through a real per-role OTP login.
  - Accounts provisioned before this change cannot simply be renamed — the realm sets
    `editUsernameAllowed: false`, and Keycloak rejects a username change with
    `400 error-user-attribute-read-only` — so the script deletes and recreates them, then re-links
    `platform.users.keycloak_user_id`. Re-run it once against an existing realm to migrate.
- **Three cross-role shots predate the tab-bar fix and need recapturing.**
  `02-shared/01-notification-preferences-quiet.png`,
  `02-shared/01-notification-preferences-saved.png` and `03-mfa/05-app-enrollment-success.png` still
  show a **seven**-tab bottom bar ending in truncated `mfa-en…` / `notific…` entries, plus a dev
  LogBox toast. Both are exactly what
  [`capture-android-shared-mfa.mjs`](../../../apps/mobile/scripts/capture-android-shared-mfa.mjs)
  exists to avoid — `MobileNav.tsx` now sets `href: null` on those two routes, and Metro must be
  started with `EXPO_PUBLIC_CAPTURE=1` to suppress the toast. The clean pair captured after that fix
  (`01-notification-preferences.png`, `02-navigation-drawer.png`) shows the correct five-tab bar with
  no toast. The `-saved` shot additionally carries a red `Uncaught (in promise …) Error: fetch failed`
  toast, so its backend was unreachable at capture time.
- **`03-mfa/04-keycloak-totp-verify.png` does not show what its name claims.** It is the TOTP _setup_
  page again, with Chrome's "Save password?" prompt covering the header and the Android keyboard
  toolbar covering the left edge; the six verification boxes are still empty. A genuine "code
  entered, about to submit" frame is still missing. Being a Keycloak browser page, it can only be
  recaptured by hand.
- **The flat `00`–`20` set cannot be regenerated on Windows.**
  [`apps/mobile/e2e/capture.spec.ts`](../../../apps/mobile/e2e/capture.spec.ts) writes to
  `docs/screens/ios/` and shells out to `xcrun simctl`, so as committed it only drives an iOS
  simulator. The Android equivalents are the two adb scripts referenced above.
