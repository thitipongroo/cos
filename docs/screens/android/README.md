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
flat numbered dump). Each folder holds the screens one audience sees, numbered from `00` within the
folder — one screen can span several shots that share a number (e.g. the multi-state Settings view).

| Folder | What it holds |
| --- | --- |
| [`_public/`](_public/) | Pre-auth — the native splash (`00`), app-launch loading (`01`) and the login flow (`02`–`04`). |
| [`_mfa-flow/`](_mfa-flow/) | The office-role MFA enrolment flow through Keycloak (`01`–`07`), captured in the browser. |
| [`_shared/`](_shared/) | Cross-role app-shell screens — notification preferences (`01`, three states) and the navigation drawer (`02`). |
| [`SITE_ENGINEER/`](SITE_ENGINEER/) | The Site Engineer loading state + dashboard (`00`, `01`). |
| [`TENANT_ADMIN/`](TENANT_ADMIN/) | The Tenant Admin dashboard, Quick-Add, Users, Sync queue, System Settings (`00`–`04`), the Invite-user form (`05`), the Role-permissions breakdown (`06`), the Roles-selection picker (`07`), the Invitation-success confirmation (`08`) and the System-integration picker (`09`). |

The two adb dashboard scripts write straight into their role folder —
[`capture-android-home.mjs`](../../../apps/mobile/scripts/capture-android-home.mjs) → `SITE_ENGINEER/`,
[`capture-android-tenant-admin-home.mjs`](../../../apps/mobile/scripts/capture-android-tenant-admin-home.mjs)
→ `TENANT_ADMIN/` — and [`capture-android-login.mjs`](../../../apps/mobile/scripts/capture-android-login.mjs)
writes `_public/`. The `_mfa-flow/` and `_shared/` shots are captured by hand (the Keycloak browser flow
and the shared app-shell routes), not by these scripts.

## Login flow — [`_public/`](_public/)

English UI (matching [`mockup/00_login_flow/mobile/`](../../../mockup/00_login_flow/mobile)); the
login header's language switcher is used to leave the th-TH default (QM-3).

| #   | Screen                                            | What it shows                                                                  |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| 02  | [Login](_public/02-login.png)                          | Landing — Path A phone form, Path B "Login with Email" as the secondary action |
| 03  | [OTP verify](_public/03-login-otp-verify.png)          | Passcode step for `+66 •••• 0010`, requested from the landing                  |
| 03  | [Email + password](_public/03-login-password.png)      | Keycloak's hosted page in a Chrome Custom Tab, `cos` theme (§20.6.1 / QM-4)    |
| 04  | [Securing session](_public/04-login-loading.png)       | `VerifyingOverlay`, shown while the Path B code→token exchange runs            |

Captured by [`apps/mobile/scripts/capture-android-login.mjs`](../../../apps/mobile/scripts/capture-android-login.mjs)
(`cd apps/mobile && pnpm capture:android` — it installs standalone, see the root `pnpm-workspace.yaml`)
— adb/uiautomator only, deliberately **not** Detox:
Path B hands off to Keycloak in a Chrome Custom Tab, and while Detox holds the UiAutomation
connection a `uiautomator dump` only ever returns the instrumented app's own window, leaving the
browser undrivable. The script asserts the screen it expects (e.g. `verifying-overlay`) before saving
each frame, so a mis-tap fails the run instead of writing a screenshot of the wrong thing.

## Site Engineer dashboard — [`SITE_ENGINEER/01-site-engineer-home.png`](SITE_ENGINEER/01-site-engineer-home.png)

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

## Site Engineer dashboard — loading state — [`SITE_ENGINEER/00-site-engineer-loading.png`](SITE_ENGINEER/00-site-engineer-loading.png)

The same dashboard while its data is still loading: the reusable [`LoadingState`](../../../apps/mobile/src/components/LoadingState.tsx)
component (ADR-055 — the implementation of
[`mockup/mobile/imp_002_universal_loading_component_mobile_view`](../../../mockup/mobile/imp_002_universal_loading_component_mobile_view))
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
fetches hang, relaunches so the screen re-mounts into its loading state, and screencaps the framebuffer
directly — uiautomator cannot dump the screen because the skeletons animate continuously ("could not
get idle state").

## Tenant Admin dashboard — [`TENANT_ADMIN/00-tenant-admin-home.png`](TENANT_ADMIN/00-tenant-admin-home.png)

The `TENANT_ADMIN` Home ([`components/TenantAdminHome.tsx`](../../../apps/mobile/src/components/TenantAdminHome.tsx),
implementing [`mockup/mobile/04_tenant_admin/00_home/01_home_admin`](../../../mockup/mobile/04_tenant_admin/00_home/01_home_admin)),
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
Quick-Add menu (`TENANT_ADMIN/01-tenant-admin-quick-add.png`) and the Users tab
(`TENANT_ADMIN/02-tenant-admin-users.png`).

## Tenant Admin — Users — [`TENANT_ADMIN/02-tenant-admin-users.png`](TENANT_ADMIN/02-tenant-admin-users.png)

The `TENANT_ADMIN` "Users" tab ([`app/(app)/users.tsx`](../../../apps/mobile/src/app/(app)/users.tsx)),
implementing the
[`02_users/01_user_management`](../../../mockup/mobile/04_tenant_admin/02_users/01_user_management)
mockup — the tenant's active users from `GET /users` (TENANT_ADMIN-only, spec §14.3), captured against the
`seed-realistic.ts` dataset (12 members). A header + subtitle, a **search box** (name/email), and
**role filter chips** derived from the roles actually present in the data (never a hardcoded list).
Each dark card carries a status strip, the initials monogram (or `photo_url`), name, a short **UID**
(from `user_id`), a `⋮` actions button, the role from `tenant_memberships`, the **status** (`is_active`),
and the **login method** — `OTP Login` when the account has a phone (Path A), `Email Login` otherwise
(Path B). Everything is live, never fabricated.

The cyan **User Audit** card is a real, deterministic count: active users whose `last_seen_at` is older
than 30 days. `last_seen_at` is a new `platform.users` column
([migration](../../../backend/prisma/migrations/20260728000001_add_last_seen_to_users/migration.sql))
written fire-and-forget + throttled (15 min/user) by `JwtAuthGuard` on every authenticated request, so
it captures both auth paths. No fabricated "95 % confidence" — it is a count, not a prediction, and it
reads **"all clear"** here because every seeded user was just seen (the column backfills to `now()` at
migration; the signal grows meaningful as real dormancy accrues). **Invite user** (FAB) and the per-user
`⋮` actions are first-pass placeholders (PO decision 2026-07-28) — create/edit/deactivate exist on the
web console; the mobile flows are a follow-up, and the buttons say so rather than dead-ending.

## Tenant Admin — Quick-Add menu — [`TENANT_ADMIN/01-tenant-admin-quick-add.png`](TENANT_ADMIN/01-tenant-admin-quick-add.png)

The FAB's full-screen **Quick Commands** overlay
([`components/QuickAddMenu.tsx`](../../../apps/mobile/src/components/QuickAddMenu.tsx), mockup
`04_tenant_admin/00_home/02_quick_action_button/00_quick_add_menu`) — a dark surface with its own top
bar (brand + SYNCED pill + close), four action cards, and a small stats bento. Left-accent colour
follows the action (primary / cyan / cyan / sync-gold). Real vs honest placeholder:

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
  connector picker (`09`). **Generate Usage Report** is an honest placeholder (no AI-report screen yet) —
  the AI-report card keeps the mockup's richer layout but **drops the fabricated "94 % CONFIDENCE /
  Source"** (no such signal exists).

## Tenant Admin — Invite user — [`05`](TENANT_ADMIN/05-invite-user.png) · [`roles`](TENANT_ADMIN/05-invite-user-roles.png) · [`email`](TENANT_ADMIN/05-invite-user-email.png)

The Quick Commands "Invite New User" target
([`app/(app)/invite-user.tsx`](../../../apps/mobile/src/app/(app)/invite-user.tsx), mockups
`04_tenant_admin/00_home/02_quick_action_button/01_invite_user/{01_invite_user_via_phone,02_invite_user_via_email}`
— one screen with a phone/email toggle covers both). A real, wired form: **SEND INVITATION** calls
`POST /users` (createUser, TENANT_ADMIN §14.3) with the chosen method — **Path A phone** (E.164, the
default `+66` prefix) or **Path B email** — the selected role, and the recipient's name.

- **One header, not two.** The screen renders no top bar of its own; it uses the app's global TopBar
  (brand · SYNCED pill · bell · avatar). A second "INVITE USER" bar stacked under the global one was a
  duplicate (PO decision 2026-07-29 — remove it). For this route the global bar shows a **Back arrow**
  (added to `TopBar` `BACK_ROUTES`) and a **Help "?"** beside the bell; **CANCEL** and the Back arrow
  both `router.back()` to Home.
- **Full name** — added on top of the mockup because `POST /users` requires `display_name`, which the
  mockup's contact-only form never collected (PO decision 2026-07-29). `05` = phone method (top),
  `email` = the EMAIL toggle (the contact field clears on switch); `roles` shows a selected role.
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

## Tenant Admin — Role permissions — [`06`](TENANT_ADMIN/06-role-permissions.png) · [`scroll`](TENANT_ADMIN/06-role-permissions-scroll.png)

Reached from Invite-user's **"View permissions"** link
([`app/(app)/role-permissions.tsx`](../../../apps/mobile/src/app/(app)/role-permissions.tsx), mockup
`04_tenant_admin/00_home/02_quick_action_button/01_invite_user/02_role_permissions`). A read-only access
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

## Tenant Admin — Roles selection — [`07`](TENANT_ADMIN/07-roles-selection.png) · [`scroll`](TENANT_ADMIN/07-roles-selection-scroll.png) · [`ai`](TENANT_ADMIN/07-roles-selection-ai.png)

The full-screen role picker opened from Invite-user's **"Show more roles"**
([`app/(app)/roles-selection.tsx`](../../../apps/mobile/src/app/(app)/roles-selection.tsx), mockup
`04_tenant_admin/00_home/02_quick_action_button/01_invite_user/03_roles_selection`). Searchable,
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

## Tenant Admin — Invitation success — [`08`](TENANT_ADMIN/08-invitation-success.png)

The terminal confirmation shown after Invite-user's **SEND INVITATION** succeeds
([`app/(app)/invitation-success.tsx`](../../../apps/mobile/src/app/(app)/invitation-success.tsx), mockup
`04_tenant_admin/00_home/02_quick_action_button/01_invite_user/04_invitation_success`). It **replaces the
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

## Tenant Admin — System integration — [`09`](TENANT_ADMIN/09-system-integration.png)

The connector picker opened from Quick Commands → **New System Integration**
([`app/(app)/system-integration.tsx`](../../../apps/mobile/src/app/(app)/system-integration.tsx), mockup
`04_tenant_admin/00_home/02_quick_action_button/02_system_integration/00_tenant_new_integration`). It
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
- **`09` is one full-page image** (PO decision 2026-07-29 — "one page, not split"): the capture shoots
  several scrolling viewports and stitches them with `scripts/stitch-fullpage.py`. Also visible here: the
  **brand icon in the TopBar is now a rounded-square tile** (`brandIcon` `borderRadius`, Linear/Palantir
  aesthetic) — a global TopBar change, so every screen's header picks it up.

## Tenant Admin — Sync Review Queue (Alerts) — [`03`](TENANT_ADMIN/03-tenant-admin-alerts.png) · [`03-diff`](TENANT_ADMIN/03-tenant-admin-alerts-diff.png)

The `TENANT_ADMIN` "Alerts" tab
([`app/(app)/sync-queue.tsx`](../../../apps/mobile/src/app/(app)/sync-queue.tsx)), implementing
[`04_tenant_admin/03_alerts/01_sync_queue`](../../../mockup/mobile/04_tenant_admin/03_alerts/01_sync_queue).
It is the field-sync **review queue** — `GET /site/conflict-records` (the SAME endpoint the Site
Engineer's ConflictBadge uses; spec §17.5 lets `TENANT_ADMIN` view/resolve), resolved via
`PATCH /site/conflict-records/:id/resolve`. Real data throughout: the badge + filter chips are the
actual `conflict_type` enum (**REJECTED / STATUS_CONFLICT / FIELD_CONFLICT**, colour-coded) — the
mockup's Critical/Medium/Low "severity" is not a field on the record, so it is not invented. `REF` comes
from `entity_id`, `FAILED AT` from `created_at`, and the **error reason** is a localised description of
each `conflict_type` (not a fabricated per-record message). `03-tenant-admin-alerts` shows the populated
list; `03-tenant-admin-alerts-diff` shows **Review data** expanded — the real client-vs-server field diff
from the two payloads (differing fields highlighted). **Mark resolved** is the single real action (the
mockup's retry / merge / edit are all one `resolve` on the backend).

The five conflicts are demo rows seeded by
[`seed-realistic.ts`](../../../backend/prisma/seed-realistic.ts) (a realistic tenant accumulates field-sync
conflicts, like it accumulates issues and reports); the screen renders that real (seed) data.

## Tenant Admin — System Settings — [`04`](TENANT_ADMIN/04-tenant-admin-settings.png) · [`04-integrations`](TENANT_ADMIN/04-tenant-admin-settings-integrations.png) · [`04-others`](TENANT_ADMIN/04-tenant-admin-settings-others.png)

The `TENANT_ADMIN` "Settings" tab
([`app/(app)/system-settings.tsx`](../../../apps/mobile/src/app/(app)/system-settings.tsx)), implementing
[`04_tenant_admin/04_settings/01_system_settings`](../../../mockup/mobile/04_tenant_admin/04_settings/01_system_settings).
The screen is taller than the viewport, so it is captured in three scroll positions:
`04-tenant-admin-settings` (Organization Info + Brand), `04-…-integrations` (External Integrations),
`04-…-others` (Others + AI System Insight).

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

## App launch — loading state — [`_public/01-app-launch-loading.png`](_public/01-app-launch-loading.png)

Opening the app now shows the same [`LoadingState`](../../../apps/mobile/src/components/LoadingState.tsx)
`widget` ("loading A", ADR-055) on a dark ground while the persisted session hydrates and the brand
font resolves ([`src/app/_layout.tsx`](../../../apps/mobile/src/app/_layout.tsx)) — the
**app favicon** (the hexagon mark) in place of the icon-plate skeleton, the **brand tagline** ("AI-NATIVE
/ Construction Platform") in place of the top skeleton bar, then a two-step (hydration + font) percentage
and a matching bar (`50%` here: session hydrated, font still loading). This mirrors the login hero, and
continues the native splash's identity into the JS layer so `_public/00-native-splash.png` → this state is one
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

## Native splash — [`_public/00-native-splash.png`](_public/00-native-splash.png)

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

`00-login.png` from that dump predated the login redesign — `_public/02-login.png` is the current landing.

## Known gaps

- **Per-role capture is possible now — this gap is closed** (2026-07-16). Path A needs a Keycloak user
  whose _username_ is the phone number (`identity.service.ts` `issueTokensForPhone` →
  `keycloak-admin.service.ts` `exchangeOtpForTokens` does a Direct Grant with `username: <phone>`),
  and [`provision-keycloak-demo.ts`](../../../backend/prisma/provision-keycloak-demo.ts) used to
  provision every demo user with the email as username, so no seeded role could complete an OTP login.
  It now uses the phone number as the username whenever the account has one; Path B still works
  because the realm sets `loginWithEmailAllowed`. `SITE_ENGINEER/01-site-engineer-home.png` is the first
  screen captured through a real per-role OTP login.
  - Accounts provisioned before this change cannot simply be renamed — the realm sets
    `editUsernameAllowed: false`, and Keycloak rejects a username change with
    `400 error-user-attribute-read-only` — so the script deletes and recreates them, then re-links
    `platform.users.keycloak_user_id`. Re-run it once against an existing realm to migrate.
- **The flat `00`–`20` set cannot be regenerated on Windows.**
  [`apps/mobile/e2e/capture.spec.ts`](../../../apps/mobile/e2e/capture.spec.ts) writes to
  `docs/screens/ios/` and shells out to `xcrun simctl`, so as committed it only drives an iOS
  simulator. The Android equivalents are the two adb scripts referenced above.
