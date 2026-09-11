---
title: Construction OS — Android Screen Capture
last_updated: 2026-08-17
---

# Construction OS — Android App Screens

> Part of [`docs/screens/`](../README.md) · platform: **Android** (emulator). iOS and Web live in sibling folders.

Screenshots of the Construction OS mobile app (Expo / React Native, Android), captured against the
**local backend with seeded demo data** — real logins and live API calls, not mockups.

> **One folder is a documented exception, and the sentence above would otherwise be false of it.**
> The EXECUTIVE screens in [`08-executive/`](08-executive/) print a handful of figures this platform
> cannot compute — a compliance percentage and its letter grade, safe man-hours, a six-month
> compliance trend, a per-project safety score, a project-count delta, a per-project sync chip and a
> locations panel. `GET /safety/compliance` returns four counts and no percentage; projects carry no
> coordinates. Those values come from `mockup/mobile/08_executive/` by product-owner decision of
> 2026-09-04, are held in one module (`apps/mobile/src/lib/mockupFigures.ts`) so the set can be
> counted and removed together, and are recorded in
> [ADR-099](../../architecture/adr/099-mockup-figures-without-a-data-source.md). The role's own
> section below marks each panel. **Everything else in that folder — the portfolio budget and
> variance, the task counts, the critical path, the incident counts and every AI panel — is live
> data, and every other role folder is live data throughout.**

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
under `Home/`. Each menu subfolder is numbered from its own start — `03-site-engineer/01-Home/` begins
at `00` (a loading state precedes the dashboard), the `04-tenant-admin/` subfolders at `01`.
**Every committed screen is ONE full-page
image** — where a screen is taller than the phone it is stitched from scrolling viewports
(`apps/mobile/scripts/stitch-fullpage.py`) — except where a screen has a genuinely distinct alternate state, which
gets its own full-page file (the Invite-user `email` method, the Alerts `diff`-expanded view).

> **The tree was restructured on 2026-08-11**, content unchanged — git recorded every move as `R100`.
> Two things changed together, and both are worth knowing before following an old link:
>
> 1. **Every folder is numbered in the order a user meets it**, and role folders are lower-kebab, not
>    `UPPER-KEBAB`: `SITE-ENGINEER/` → `03-site-engineer/`, `TENANT-ADMIN/` → `04-tenant-admin/`,
>    `SITE-WORKER/` → `05-site-worker/`, `PROJECT-MANAGER/` → `06-project-manager/`. The old flat
>    `01-public/` split into [`00-loading/`](00-loading/) (splash + app-launch) and
>    [`01-authen/`](01-authen/) (one subfolder per pre-auth flow); `03-mfa/` and
>    `02-shared/privacy-policy/` moved under `01-authen/` too, since both are part of getting in.
>    **MFA moved on again on 2026-08-16**, to [`01-authen/02-mfa/`](01-authen/02-mfa/): enrolment is
>    reached AFTER sign-in by every role that carries it, so it is cross-role rather than pre-auth.
>    The Privacy Policy stayed in `01-authen/` until **2026-08-17**, when it was retired along with
>    the Terms of Use, the Support Center and the Transparency Portal. It came **back the same day**
>    (product-owner decision), because the policy's five sections were split out of its accordion
>    into five routes of their own and those screens exist in no other capture — see
>    [Privacy Policy](#privacy-policy) below. The Terms of Use, the Support Center and the
>    Transparency Portal stayed retired.
>
>    **MFA came back to `01-authen/02-mfa/` on 2026-08-18**, reversing the 2026-08-16 move, and the
>    policy DOCUMENT went the other way to [`02-shared/01-privacy-policy/`](02-shared/01-privacy-policy/).
>    Both follow the mockup set, which was restructured the same way on the same day. The policy frame
>    was renamed `00-privacy-policy-preauth` → `00-policy-dashboard` in that move: it is not a
>    pre-auth screen, it is the shared document, and the name said otherwise.
>
> 2. **Every frame in a role folder names its role**: `01-dashboard.png` became
>    `01-ta-home-dashboard.png` / `01-sw-home-dashboard.png` / `01-pm-home-dashboard.png`, so a file
>    stays identifiable once it is out of its folder. Cross-role folders (`00-loading/`, `01-authen/`,
>    `02-shared/`) take no prefix — they belong to no role.
>
> Two sets left the committed tree in the same change (product-owner decision): the PROJECT_MANAGER
> **vendor directory** (`04-More/02-vendors.png`) and the whole **CRM Sales Manager** folder
> (leads / opportunities / customers). Both capture paths were retired with them — the vendors step
> was removed from `capture-android-project-manager.mjs`, and `capture-android-crm.mjs` and its
> `capture:android:crm` script were deleted. **Neither SCREEN was removed from the app**; only their
> screenshots left this set.

| Folder                                       | What it holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`00-loading/`](00-loading/)                 | The two frames before the app has a screen — the Android 12+ native splash (`00`) and the app-launch loading state (`01`) the JS layer holds while the session hydrates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [`01-authen/`](01-authen/)                   | Getting in — four flows: [`01-login/`](01-authen/01-login/) (`01`–`04`), [`02-mfa/`](01-authen/02-mfa/) (`01`–`07`, back from `02-shared/` on 2026-08-18), [`03-privacy-policy/`](01-authen/03-privacy-policy/) (`01`–`07`, the screens the policy pushes) and [`04-terms-of-use/`](01-authen/04-terms-of-use/) (`01`–`02`, back on 2026-08-18 — ADR-092). Four sets left on 2026-08-17 (product-owner decision): the Privacy Policy in both entry states, the Transparency Portal beneath it (`01-data-collection/`, 14 screens `00`–`13`), `04-terms-of-use/` and `05-get-support/`. **The Privacy Policy came back the same day** — its five sections became five routes, and those screens are documented nowhere else; the `00-…-postauth` drawer frame and the portal did NOT. On 2026-08-18 the policy DOCUMENT itself moved on to `02-shared/`, leaving this folder the seven screens it pushes, and **the Terms of Use came back on the same reasoning**: its download went live (ADR-092), so the flow has a second screen and the first one changed. The Transparency Portal and the Support Center are kept below, marked retired; their capture scripts stay deleted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [`02-shared/`](02-shared/)                   | Cross-role screens that belong to no role. **Two flows since 2026-09-11**, when [`02-support-centre/`](02-shared/02-support-centre/) was added — `01-support-hub`, the POST-AUTH Support screen, which had never been captured because nothing in the repo signed in and tapped the TopBar's `?`. It belongs here on the same test as the policy below: every role reaches it the same way and it belongs to none of them. Before that it held exactly one flow: [`01-privacy-policy/`](02-shared/01-privacy-policy/) — the policy document (`00-policy-dashboard`), which one `<PrivacyPolicyDocument />` renders at BOTH `(auth)/privacy-policy` and `(app)/privacy-policy` and which therefore belongs to neither. MFA sat here from 2026-08-16 and **went back to `01-authen/02-mfa/`** on 2026-08-18, following its drawing; the notification-preferences frames (`01`, `02`) and the navigation drawer (`03`) were **retired on 2026-08-16**. Those sections are kept below, marked retired, because what they documented is still true of the app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| [`03-site-engineer/`](03-site-engineer/)     | Tabs: **Home \| Issues \| Tasks \| Reports** — `Tasks` replaced `Inspections` on 2026-08-12 (PO decision; [`roleTabs.ts`](../../../apps/mobile/src/lib/roleTabs.ts) is the source, and `/inspections` became a derived drawer row for the role rather than being dropped). [`01-Home/`](03-site-engineer/01-Home/) — the **project picker** overlay (`00-se-project-selection`), the dashboard's loading state (`00-se-home-loading`) and the dashboard itself (`01`). [`02-Issues/`](03-site-engineer/02-Issues/) — the issue board (`01`). [`03-Tasks/`](03-site-engineer/03-Tasks/) — the task list (`01`). [`04-Reports/`](03-site-engineer/04-Reports/) — the submitted-report review list (`01`). Both `00-` frames sort before the dashboard because each precedes it: the picker is answered first, then the dashboard loads.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [`04-tenant-admin/`](04-tenant-admin/)       | Tabs: **Home \| Users \| Alerts \| Settings**. [`01-Home/`](04-tenant-admin/01-Home/) — dashboard (`01`), Quick-Add (`02`) and the FAB flows: Invite-user (`03`), Role-permissions (`04`), Roles-selection (`05`), Invitation-success (`06`), System-integration (`07`), Apps-&-Services (`08`). [`02-Users/`](04-tenant-admin/02-Users/) — the users list (`01`), the per-user action sheet (`02`), the user profile (`03`), the multi-role permission editor (`04`) + the save-success screen (`05`), and the password-reset form (`06`) + its two done screens — temp-password (`07`) and email-link-sent (`08`). [`03-Alerts/`](04-tenant-admin/03-Alerts/) — the sync-review queue (`01`). [`04-Settings/`](04-tenant-admin/04-Settings/) — System Settings (`01`, one full-page).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [`05-site-worker/`](05-site-worker/)         | Tabs: **Home \| Tasks \| Safety \| Directory**. [`01-Home/`](05-site-worker/01-Home/) — the **site picker** overlay in both its states (`00-sw-select-project` forced, `00-sw-change-project` dismissible), the field dashboard (`01`), the FAB's **Quick actions** overlay (`02`), and the two screens that overlay opens: **Report issue** (`03`) and **Daily report** (`04`). Those four are named for the mockup folders they implement (`01_dashboard`, `02_quick_actions`, `03_issue`, `04_daily_report`). [`02-Tasks/`](05-site-worker/02-Tasks/) (`01`), [`03-Safety/`](05-site-worker/03-Safety/) (`01`), [`04-Directory/`](05-site-worker/04-Directory/) (`01`). [`05-Drawer/`](05-site-worker/05-Drawer/) — the **navigation drawer** (`01`), which IS the profile, and the **account settings** screen its Settings row pushes to (`02`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [`07-safety-officer/`](07-safety-officer/)   | Tabs: **Home \| Incidents \| Checklists \| Permits** — the bar the product owner settled on 2026-08-13 from [`mockup/mobile/07_safety_officer`](../../../mockup/mobile/07_safety_officer), whose three drawings agree on `Home \| Incidents \| Checklists \| Profile`; Profile is no role's tab (§32.7), so Permits took the slot. [`01-Home/`](07-safety-officer/01-Home/) — the safety dashboard (`01`): open-incident tile, the two unavailable KPI tiles, the daily-checklist card, recent incidents. [`02-Incidents/`](07-safety-officer/02-Incidents/) — the feed (`01`): four filter pills, the incident card with its photo plate, the AI-risk panel. [`03-Checklists/`](07-safety-officer/03-Checklists/) — the inspection list (`01`) and the checklist being filled (`02`), which is what the mockup actually draws. [`04-Permits/`](07-safety-officer/04-Permits/) — the permit register (`01`), the request form behind its FAB (`02`) and the confirmation that follows a real submission (`03`). The `03` frame is reached by ACTUALLY submitting the form, the route being `router.replace`-only from a successful POST, so each run leaves one extra PENDING permit in the demo tenant and the REQUEST ID on screen is the number the server stored. **"Checklists" is the `/inspections` route relabelled**, not a new screen, which is why its tab testID is still `inspection-tab`. FOUR PANELS IN THESE FRAMES READ "not available yet", AND THAT IS THE HONEST STATE: the drawings show a compliance percentage, safe-hours-since-last-LTI, an AI-predicted risk per incident and a weather-sourced hazard alert, and none of the four has a source anywhere in this platform (`GET /safety/compliance` returns four counts and no score; nothing records hours against a lost-time injury; `/ai/reports/*` has no safety surface; nothing ingests weather). Product-owner ruling 2026-08-13: draw the zone, say plainly it is not ready, never print an invented figure. What IS real in these frames — the counts, the incident feed, the checklist templates and their Thai item text, the permit row and its validity dates — comes from the live backend against seeded data. Captured by [`capture-android-safety-officer.mjs`](../../../apps/mobile/scripts/capture-android-safety-officer.mjs) as `+66811000007` (Decha Phumipat).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| [`06-project-manager/`](06-project-manager/) | Tabs: **Home \| Procurement \| Finance \| More** — the bar from the CORRECTED [`mockup/mobile/06_project_manager`](../../../mockup/mobile/06_project_manager) set (2026-08-10). [`01-Home/`](06-project-manager/01-Home/) — the manager dashboard (`01`): two KPI tiles, the critical-blockers card, the AI panel and YOUR PROJECTS. [`02-Procurement/`](06-project-manager/02-Procurement/) — three counters, the AI panel and the approvals queue (`01`). [`03-Finance/`](06-project-manager/03-Finance/) — portfolio financial summary, AI panel, per-project budget health (`01`). [`04-More/`](06-project-manager/04-More/) — the More menu (`01`); the vendor directory it pushes to was `02` until 2026-08-11, when it left the committed set (see the restructure note above) — the screen itself is unchanged. [`05-Drawer/`](06-project-manager/05-Drawer/) — the navigation drawer (`01`), which from 2026-08-10 is PER ROLE: only **Settings** and **Support Center** are shared, and the section above them comes from [`lib/drawerLinks.ts`](../../../apps/mobile/src/lib/drawerLinks.ts). **Superseded 2026-08-14:** the drawer drawing was copied to `mockup/mobile/02_shared/01_navigation_drawer`, byte-identical to `04_tenant_admin/05_navigation_drawer`, so it is nobody's role menu any more. (**Both drawings were withdrawn on 2026-08-16**, in one commit. The ruling stands — ADR-085; `apps/mobile/src/lib/drawerLinks.ts` now carries the four rows and is the record of what they specified.) Its four buildable rows — Project Overview, Daily Site Reports, Safety Incident Logs, Material Inventory — now LEAD every role's drawer, and the role's own rows follow. No role takes a drawing verbatim now: the four are the first entries of the DERIVED table, so each still appears only where §6.4 grants the module behind it and no drawer row can lead to a 403. The 2026-08-10 arrangement this replaces gave `04_tenant_admin/` and `06_project_manager/05_navigation_drawer` their drawing verbatim and derived the other ten; what it was protecting is kept, since the list every role used to share was not neutral — it was the TENANT_ADMIN drawing plus two extra rows. **This frame was recaptured on 2026-08-14 and shows the new model**: the four drawn rows lead (Project overview · Daily site reports · Safety incident logs · Materials), Tasks and Inspections follow, and `More (13)` carries the rest — this role derives now as well as taking the drawn rows, where before it stopped at its drawing's seven. The earlier `03-Approvals/` and `04-Vendors/` folders were removed with the bar they were numbered for. `PROC_MANAGER` does not share these screens: the corrected mockup set is a PROJECT_MANAGER app end to end, and master 3490 keeps that role on Home \| RFQs \| Orders \| Deliveries. |

The two adb dashboard scripts write straight into their role's menu subfolders —
[`capture-android-home.mjs`](../../../apps/mobile/scripts/capture-android-home.mjs) → `03-site-engineer/01-Home/`,
[`capture-android-tenant-admin-home.mjs`](../../../apps/mobile/scripts/capture-android-tenant-admin-home.mjs)
→ `04-tenant-admin/{01-Home,03-Alerts,04-Settings}/` — and the FAB-flow scripts (`capture-android-invite-user.mjs`,
`…-role-permissions.mjs`, `…-roles-selection.mjs`, `…-invitation-success.mjs`, `…-system-integration.mjs`)
each write into `04-tenant-admin/01-Home/`. `04-tenant-admin/02-Users/` has its own writers —
[`capture-android-users-actions.mjs`](../../../apps/mobile/scripts/capture-android-users-actions.mjs)
(the list `01` + the action sheet `02`), `…-user-profile.mjs`, `…-edit-permission.mjs`,
`…-permission-success.mjs` and `…-reset-password.mjs`. **Exactly one script writes each committed
frame**: the tenant-admin-home script used to stitch a second copy of the users list, and that step was
removed on 2026-08-07 so the file cannot depend on which script ran last.
[`capture-android-login.mjs`](../../../apps/mobile/scripts/capture-android-login.mjs)
writes `01-authen/01-login/` — the whole of that folder.
[`capture-android-shared-mfa.mjs`](../../../apps/mobile/scripts/capture-android-shared-mfa.mjs) writes the
one **in-app** MFA shot — `01-authen/02-mfa/01-app-intro.png`. Everything else under
`01-authen/02-mfa/` (`02`–`07`) is the **Keycloak hosted browser** flow and is captured by hand, because it
runs outside the app where adb/uiautomator cannot drive it.
[`capture-android-privacy-policy.mjs`](../../../apps/mobile/scripts/capture-android-privacy-policy.mjs)
is the one script here that writes to TWO folders — `02-shared/01-privacy-policy/` for the shared
document and `01-authen/03-privacy-policy/` for the seven screens it pushes.

> **Both MFA paths above changed on 2026-08-18** (`01-authen/02-mfa/` → `01-authen/02-mfa/`), and the
> script was repointed in the same change. A capture script left on a moved path does not fail — it
> quietly recreates the old folder on the next run, which is the same defect as a script writing a
> retired frame and is why both are called out here rather than left to be discovered.

<!-- markdownlint-disable-next-line MD028 -->

> **That script wrote three more frames until 2026-08-16** — `02-shared/01-notification-preferences.png`,
> its `-saved` state and `02-shared/03-navigation-drawer.png`. All three were retired (product-owner
> decision) and **their steps were removed from the script**, the same way the PROJECT_MANAGER vendor
> step and `capture-android-crm.mjs` were retired on 2026-08-11: a script that still writes a retired
> path recreates it on the next run. Removing the preferences step also removed the only capture step
> in this repo that WROTE to the database — it pressed SAVE CHANGES for real to reach the `if (saved)`
> branch. **Neither screen left the app**; only their screenshots left this set.

<!-- markdownlint-disable-next-line MD028 -->

> **Four scripts were deleted outright on 2026-08-17**, by the same rule one step further: when every
> frame a script writes has been retired, the file has nothing left to write. `01-authen/` lost
> `03-privacy-policy/` (both entry states), its `01-data-collection/` portal, `04-terms-of-use/` and
> `05-get-support/` — 18 frames — so `capture-android-privacy-policy.mjs`,
> `capture-android-terms-of-use.mjs`, `capture-android-support.mjs` and
> `capture-android-transparency.mjs` went with them, along with the
> `capture:android:privacy-policy` and `capture:android:transparency` entries in
> `apps/mobile/package.json` (the other two never had one). This is the CRM disposal, not the
> notification-preferences one: there was no surviving step to keep.
>
> **TWO of the four have since been restored**, and both reversals turn on the same thing: the rule
> above is about a script having nothing left to write, and each stopped being true when the screens
> changed under it. `capture-android-privacy-policy.mjs` came back the same day (below);
> `capture-android-terms-of-use.mjs` came back on **2026-08-18**, restored from git history and
> extended, when ADR-092 gave the terms a real PDF — a second screen that exists in no other capture,
> and a first screen corrected against its own drawing.
>
> **`capture-android-privacy-policy.mjs` was restored later the same day** (product-owner decision),
> and it is the one reversal here. The rule above turns on a script having nothing left to write; the
> policy's five sections had just become five ROUTES of their own, which is six frames that exist in
> no other capture — the disposal was correct for the folder as it stood and stopped being correct
> the moment the screens changed. The restored script writes the pre-auth flow only: it does not
> recreate `00-…-postauth` (that route is unchanged and still deliberately uncaptured) and it does
> not recreate the Transparency Portal. The other three scripts stay deleted.
>
> Two facts those scripts carried are worth keeping, because they are the reason the flows were
> captured the way they were. The policy and terms captures were **the only two here that needed no
> backend** — neither screen made an API call, so Metro alone was enough and no login was performed.
> **That is now true of each flow's first frame only**: both gained a download receipt (ADR-091,
> ADR-092) that fetches a real PDF and verifies its digest on the device, so each script ends with one
> step that wants NestJS on `:3000` and takes `--skip-download` to leave it out.
> The support capture **did** need one, not to render the screen but to reach it: the only entry the
> mockups draw is on the OTP step, so the script requested a real passcode to get there, and the
> screen's status banner then probed `GET /health/live`.

<!-- markdownlint-disable-next-line MD028 -->

> **`06-project-manager/` is captured by
> [`capture-android-project-manager.mjs`](../../../apps/mobile/scripts/capture-android-project-manager.mjs)**,
> which logs in as the seeded project manager (`+66811000003`) and walks Procurement → Finance → More
> → Drawer → **Home** in one run. It also walked More → **Vendors** until 2026-08-11, when that frame
> left the committed set and the step was removed with it. Several things in these frames are the
> honest state rather than a staged one:
>
> - **HOME IS SHOT LAST, on purpose.** Photographed three seconds after sign-in it came out empty —
>   "You are not a member of any project yet" for a manager with three — because its load lost a race
>   with the session and never retried, while the Finance tab a minute later showed all three. The
>   SCREEN was fixed for that (it now distinguishes a failed load from an empty portfolio, and
>   retries on focus); this ordering is what makes the screenshot document the dashboard instead of
>   that race.
> - **Active RFQs and Deliveries today read 00.** The seed's RFQs are `EVALUATED`, not `PUBLISHED`
>   (bids can no longer arrive), and no delivery lands on the capture date. Both counters are real
>   queries, so they answer 0.
> - **Total variance reads about −85%.** The seed allocates 85 % of each budget in lines while the
>   purchase orders spend a small fraction of it, so the portfolio genuinely sits far under its
>   allocation. The figure is the server's own variance formula, summed across the manager's
>   projects.
> - **The Insights panel shows its idle state.** It generates a report only when the button is
>   pressed, and that call goes to the ai-gateway, which is not in the docker compose these captures
>   run against. No report is faked to fill the panel.
> - **Four More tiles carry a COMING SOON chip.** `Project settings`, `Team management`,
>   `Documents & drawings` and `Site map` appear in the drawing but name no screen in this app, and
>   none of the four appears anywhere in `docs/specifications/`. The chip is said BEFORE the tap
>   rather than in an alert after it (PO decision 2026-08-10).
> - **The drawer has no BIM row.** The PM drawer mockup's seventh item is "BIM Progress Audit";
>   `00-glossary.md` states "Full BIM integration is post-MVP", so there is no screen to link and it
>   is left out rather than stubbed.
>
> The retired vendor frame exercised the classification added the same day, and the rule outlives the
> screenshot: TOP RATED is DERIVED from the score's grade-A threshold (never stored), UNDER REVIEW is
> `verification_status = PENDING`, VERIFIED without TOP RATED is a checked vendor with no score yet,
> and a vendor carrying no badge at all is a seed row whose two columns are still NULL.

## Login flow — [`01-authen/`](01-authen/)

English UI (matching [`mockup/mobile/01_authen/`](../../../mockup/mobile/01_authen)); the
login header's language switcher is used to leave the th-TH default (QM-3).

**Each pre-auth flow was its own numbered subfolder, numbering from its own start** — which is why
the Terms of Use and the Support Center were both `01` while the login flow ran `01`–`04`. They were
`06` and `07` in one flat `01-public/` until the 2026-08-11 restructure; the splash and app-launch
loading left that folder in the same change, for [`00-loading/`](00-loading/). **Two subfolders are
left:** `01-login/` and `03-privacy-policy/`, with the gap at `02` where MFA sat before it moved to
`01-authen/02-mfa/` on 2026-08-16, and at `05` where the Support Center sat before it was retired on
2026-08-17 (`04`, the Terms of Use, is occupied again since 2026-08-18). The numbers are NOT closed
up — renumbering would break every
link that ever pointed at them and would claim the flows had been reordered rather than withdrawn.

| Folder      | Screen                                                       | What it shows                                                                  |
| ----------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `01-login/` | [Login](01-authen/01-login/01-login.png)                     | Landing — Path A phone form, Path B "Login with Email" as the secondary action |
| `01-login/` | [OTP verify](01-authen/01-login/02-login-otp-verify.png)     | Passcode step for `+66 •••• 0010`, requested from the landing                  |
| `01-login/` | [Email + password](01-authen/01-login/03-login-password.png) | Keycloak's hosted page in a Chrome Custom Tab, `cos` theme (§20.6.1 / QM-4)    |
| `01-login/` | [Securing session](01-authen/01-login/04-login-loading.png)  | `VerifyingOverlay`, shown while the Path B code→token exchange runs            |

Captured by [`apps/mobile/scripts/capture-android-login.mjs`](../../../apps/mobile/scripts/capture-android-login.mjs)
(`cd apps/mobile && pnpm capture:android` — it installs standalone, see the root `pnpm-workspace.yaml`)
— adb/uiautomator only, deliberately **not** Detox:
Path B hands off to Keycloak in a Chrome Custom Tab, and while Detox holds the UiAutomation
connection a `uiautomator dump` only ever returns the instrumented app's own window, leaving the
browser undrivable. The script asserts the screen it expects (e.g. `verifying-overlay`) before saving
each frame, so a mis-tap fails the run instead of writing a screenshot of the wrong thing.

## Privacy Policy

Folders: [`02-shared/01-privacy-policy/`](02-shared/01-privacy-policy/) (the document) +
[`01-authen/03-privacy-policy/`](01-authen/03-privacy-policy/) (the seven screens it pushes).

The PDPA §23 notice a reader meets before signing up, reached from the login footer. Eight frames
across **two folders**, and the split is not arbitrary: the policy document itself is mounted at BOTH
`(auth)/privacy-policy` and `(app)/privacy-policy` through one `<PrivacyPolicyDocument />`, so it
belongs to no single flow and sits in `02-shared/`. The seven screens it pushes are pre-auth only and
stay in `01-authen/`. Both the frame and its drawing moved there on **2026-08-18** (git records the
rename; the drawing is now `mockup/mobile/02_shared/01_privacy_policy/00_policy_dashboard`).

| Screen                                                                      | What it shows                                                                                  |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [Policy](02-shared/01-privacy-policy/00-policy-dashboard.png)               | Brand block, compliance pill, intro, and the five section rows — each a link, not an accordion |
| [Data Collection](01-authen/03-privacy-policy/01-data-collection.png)       | Four categories collected today, then three grouped under `PLANNED — NOT COLLECTED YET`        |
| [Data Usage](01-authen/03-privacy-policy/02-data-usage.png)                 | Three purposes in use today; AI model training grouped under `PLANNED — NOT IN USE YET`        |
| [PDPA & GDPR](01-authen/03-privacy-policy/03-pdpa-gdpr.png)                 | Principles, regional frameworks, data residency, and certification status                      |
| [Technical Security](01-authen/03-privacy-policy/04-technical-security.png) | Encryption / network guard / tenant isolation with their tags, then infrastructure             |
| [User Rights](01-authen/03-privacy-policy/05-user-rights.png)               | The four rights, and an `AUTHENTICATE` action that returns to the login the reader came from   |
| [Contact the DPO](01-authen/03-privacy-policy/06-contact.png)               | The pre-auth inquiry form (ADR-091). Attachments are drawn disabled — see the note below       |
| [Download complete](01-authen/03-privacy-policy/07-download-complete.png)   | The policy PDF on the device, with its digest checked against the one the platform published   |

Captured by [`apps/mobile/scripts/capture-android-privacy-policy.mjs`](../../../apps/mobile/scripts/capture-android-privacy-policy.mjs).
**Seven of the eight frames need no backend** — they render from the i18n bundle alone, so Metro is
enough and no login is performed. `07-download-complete` is the exception: it downloads the real PDF
from `GET /privacy/policy/pdf` and verifies its digest on the device, so it needs NestJS on `:3000`.
Pass `--skip-download` to capture only the offline seven.

**The inquiry receipt (`08_data_protection_submit_success`) is deliberately not captured.** Reaching
it means POSTing a real inquiry, which needs the backend AND `s1.identity.privacy-inquiry` flipped on
— and that flag ships OFF (QM-15), because the route it gates is the one endpoint an unauthenticated
stranger can write a row through. A capture step that only works with a kill-switch disabled is a
step that fails for everyone who runs the script as shipped.

**The five sections became routes on 2026-08-17** (product-owner decision), matching
`mockup/mobile/01_authen/03_privacy_policy/01…05`, which draw them as full screens. The policy's own
drawing carries EMPTY accordion bodies, so its rows were always meant to lead somewhere. The
post-auth route at `(app)/privacy-policy` keeps its accordion and is deliberately not captured: it
already links to the Transparency Portal for depth, and it renders the same document.

**Every `COMING SOON` chip in this set is load-bearing.** The mockups list geofencing, IoT sensor
capture, on-device AI, AI model training, a live infrastructure status feed, and ISO 27001 / SOC 2 as
though all six were live. None is. Three of them (AI training, live status, both certificates) are on
the roadmap — Phase 23, Phase 15 and the Stage 1→2 / 2→3 gates in
`docs/specifications/05-security-compliance.md` §5.3. **Two are not on any roadmap at all**:
`grep -rni geofenc docs/specifications context` returns exactly one substantive hit, in
`context/00_master_construction_os.md`, saying this platform does not have one, and nothing anywhere
specifies on-device inference. They are drawn and labelled here on a product-owner decision to keep
the mockup's content and mark what has no code behind it; on a PDPA notice the difference between
"we collect this" and "we intend to" is the whole document, so it is carried twice — by the chip and
by the group heading above it.

## Pre-auth Terms of Use — [`01-authen/04-terms-of-use/`](01-authen/04-terms-of-use/)

**Back, after being retired on 2026-08-17** (product-owner decision 2026-08-18). The retirement was
correct for the folder as it stood — one frame of a screen whose only interactive control was
disabled — and stopped being correct when ADR-092 gave the terms a real PDF: the flow now has two
screens, and the document screen itself changed.
[`capture-android-terms-of-use.mjs`](../../../apps/mobile/scripts/capture-android-terms-of-use.mjs)
is restored from git history and extended with the download step. This is the same reversal, on the same reasoning,
that brought `capture-android-privacy-policy.mjs` back the day it was deleted.

| Screen                                                                      | What it shows                                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [Terms of Use](01-authen/04-terms-of-use/01-terms-of-use.png)               | The six clauses with `01` expanded, both summary tiles, and the pinned action bar           |
| [Download complete](01-authen/04-terms-of-use/02-terms-of-use-download.png) | The terms PDF on the device, with its digest checked against the one the platform published |

**The first frame needs no backend; the second does.** The document renders from the i18n bundle plus
one bundled image, so Metro alone is enough — that was true of the whole script until the download
went live. `02-terms-of-use-download` fetches the real PDF from `GET /terms/pdf` and verifies its
digest on the device, so it needs NestJS on `:3000`. Pass `--skip-download` for the offline frame
only.

Two things in these frames are easy to re-break and are stated here rather than left to the pixels:

- The screen opens with **clause `01` already expanded** rather than fully collapsed, so the reader
  lands on text instead of on a list of headings.
- The receipt prints the **measured** file name, size, digest and timestamp. Every corresponding
  figure in the drawing (`v4.2.0-STABLE`, `COS_TERMS_STABLE.pdf`, `1.2 MB`, `8a7f…e210`,
  `June 10, 2024`) belongs to no edition of this document, and the drawing shows the hash with no
  verdict beside it — the card adds one, because a digest with nothing to compare it against is
  decoration (ADR-092).

## Pre-auth Support Center — not captured (retired 2026-08-17)

**`01-authen/05-get-support/01-get-support.png` is no longer part of this set** (product-owner
decision 2026-08-17); `capture-android-support.mjs` was deleted with it. The frame showed the screen
reached from the OTP step's GET SUPPORT, all topics collapsed.

**The SCREEN is untouched** (ADR-085): [`(auth)/support.tsx`](<../../../apps/mobile/src/app/(auth)/support.tsx>)
still carries it, and its own header is now the record — that screen has outlived both its drawing
(withdrawn 2026-08-15) and its screenshot. What the retired frame documented is kept below, because
it is the part that reads as a defect to anyone who has not been told otherwise.

> **The Support Center showed both emergency controls DISABLED, and that is the honest default.** The priority line
> and the IT hotline dial `EXPO_PUBLIC_SUPPORT_CENTER_PHONE` and `EXPO_PUBLIC_SUPPORT_IT_HOTLINE`
> (product-owner decision 2026-08-09) — per-deployment config, because no support-desk,
> emergency-contact or hotline column exists in the schema and this screen is reached before sign-in,
> so there is no project to resolve one from. The priority line calls the **support centre**, not a
> named person: the drawing's "Call Site Supervisor" was renamed on 2026-08-09, which is also why the
> variable is not `…_SUPERVISOR_PHONE` — a desk number is a per-deployment fact, an on-duty supervisor
> is not. Both are unset in the repo, so the frame showed the unconfigured state
> rather than an invented number — and the screen still does, until they are set in `apps/mobile/.env`.
>
> Two other things on that screen deliberately differ from its mockup
> (`mockup/mobile/01_authen/07_get_help/01_support_center`, **withdrawn 2026-08-15** — not repointed
> at `mockup/mobile/support_center/01_dashboard`, which came from a different commit with no rename
> record and differs in content, so it is not asserted as the successor): there is **no bottom
> nav** (the drawing has one, but this is a pre-auth route — and `Field | Tasks | Support | Profile` is
> no role's tab set, while §32.7 fixes each role at four), and the assistant panel is labelled **FIELD
> ASSISTANT**, not the drawn "AI FIELD ASSISTANT". Its text is derived from the connectivity state and
> the health probe by plain rules; the same standard that forbids describing the rule-based device-trust
> score as AI-derived (ADR-081) applies here. The drawn copy — "you're in Sector 7", a known cellular
> outage — was dropped outright: there is no sector, zone or outage feed anywhere in the product.

## Site Engineer dashboard — [`03-site-engineer/01-Home/01-se-home-dashboard.png`](03-site-engineer/01-Home/01-se-home-dashboard.png)

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

## Site Engineer dashboard — loading state — [`03-site-engineer/01-Home/00-se-home-loading.png`](03-site-engineer/01-Home/00-se-home-loading.png)

The same dashboard while its data is still loading: the reusable [`LoadingState`](../../../apps/mobile/src/components/LoadingState.tsx)
component (ADR-055 — the implementation of
[`mockup/mobile/00_loading`](../../../mockup/mobile/00_loading))
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

## Site Engineer — project picker — [`01-Home/00-se-project-selection.png`](03-site-engineer/01-Home/00-se-project-selection.png)

[`<SelectProjectSheet />`](../../../apps/mobile/src/components/SelectProjectSheet.tsx), implementing
[`03_site_engineer/01_home/00_project_selection`](../../../mockup/mobile/03_site_engineer/01_home/00_project_selection)
— and since the 2026-08-12 product-owner decision it is **the project's one project-selection shape**,
the same overlay the Site Worker gets.

**An OVERLAY, not a route.** A dimmed backdrop with a centred card, so the page underneath stays
legible around the edges — which is what tells the user this is a question about the app rather than a
new place inside it. It rendered full-screen until 2026-08-12 and read as a route, the exact confusion
the decision resolved. This frame is the **dismissible** state: it carries the close **X**, which the
forced state (no project chosen yet) does not.

**The RECOMMENDED panel is STATIC, all of it but one number**, and that is the single most important
thing to know about this frame. `Priority action`, `Critical-path risk detection`, `Conf: 98%` and
`Source: site telemetry` are **i18n string literals bound to no computation whatsoever**. Nothing in
this product can produce any of them: critical-path risk would need a model that does not exist (the
nearest, DelayForecastModel, is Phase 23 and needs 90+ days of production data, §22.6), and
site telemetry is IoT — Phase 24. The panel is drawn in full as a declared future feature
(PO decision 2026-08-12, "static ตามใน mockup เพื่อแสดงไว้เป็น feature ในอนาคต").

> **This frame is the reason a `COMING SOON` chip now sits on that risk strip.** The component's own
> note has claimed since 2026-08-12 that such a tag was kept "because §22.3 is explicit that a surface
> must not read as AI-derived while a placeholder serves it" — but no tag was ever rendered, and no
> i18n key existed for one. This capture is what put the undisclosed version on the record. The chip
> was added on 2026-08-16 (PO decision) and the misleading comment corrected with it, so **the
> committed frame above predates the fix and shows the panel without it**; it needs recapturing.
> No render test could have caught this — the disclaimer existed only in prose.

The one figure that **is** real is **`CURRENT PROGRESS 69%`** — the §32.12 BOQ-value-weighted
`progress_percent`, the same number the card for that project shows lower down the same list. The
project the panel is about is simply **the first row, not a ranking**: nothing in the platform ranks
sites by risk yet, and the code says so rather than implying an ordering.

Everything below the panel is live: **Chaeng Watthana Access Road Upgrade** `ACTIVE` 69%, **Rama IX
Corporate Tower** `ACTIVE` `Office Block` 63%, **Thonglor Park Residences** `ON HOLD` `Tower B` 0%.
The line beside the pin is the project's **building name**, so Chaeng Watthana shows none — the office
has not modelled a building for it — rather than a pin over nothing.

## Site Engineer — Issues · Tasks · Reports — [`02-Issues/`](03-site-engineer/02-Issues/) · [`03-Tasks/`](03-site-engineer/03-Tasks/) · [`04-Reports/`](03-site-engineer/04-Reports/)

The role's other three tabs, all captured signed in as **Waraporn Klinhom** (`+66811000009`) against
`seed-realistic.ts` — the same engineer as the Home frames, so both runs document one person's data.
All three open with the global TopBar and
[`<ProjectContextBar />`](../../../apps/mobile/src/components/ProjectContextBar.tsx) naming the active
project, and all three carry the bar **Home | Issues | Tasks | Reports**.

> **These three are full pages made by SHRINKING THE DISPLAY, not by stitching**
> ([`capture-android-site-engineer-tabs.mjs`](../../../apps/mobile/scripts/capture-android-site-engineer-tabs.mjs)).
> `adb shell input swipe` moves the Issues board but does **not** move the Tasks or Reports lists at
> all, and it fails silently in both directions — the swipe always "succeeds", and a verify step that
> diffs uiautomator dumps reports movement that is really the status-bar clock ticking. **Three runs
> were committed as full pages with most of the list missing** before that was pinned down by hashing
> frames with the top quarter excluded. Lowering `wm density` puts the whole page in one frame
> instead: no gesture to get wrong, no seam to stitch, and the pixels are the app's real output at a
> real density. Each screen is asserted by its own testID before the shutter, so a mis-tap fails the
> run rather than filing a screenshot of the wrong screen.

### Issues — [`02-Issues/01-se-issue-dashboard.png`](03-site-engineer/02-Issues/01-se-issue-dashboard.png)

The **issue board** ([`app/(app)/issues.tsx`](<../../../apps/mobile/src/app/(app)/issues.tsx>), mockup
`03_site_engineer/02_issues/02_se_issue_dashboard`). One route serves two screens: `SITE_WORKER` gets
the capture form, `SITE_ENGINEER` gets this board with the form behind its floating **+**. Until
2026-08-12 the engineer got the worker's whole camera-and-voice form with a list bolted underneath.

- **The five filter chips map to real columns and nothing else** ([`lib/issueBoard.ts`](../../../apps/mobile/src/lib/issueBoard.ts)):
  `ALL · CRITICAL · HIGH · OPEN · RESOLVED` over `site_ops.issues.severity` and `.status`. `RESOLVED`
  covers **CLOSED** too — both are end states and the drawing has one chip for the pair.
- **The left strip answers "does this need me", not "how bad was it".** A finished issue is green
  whatever it once was; otherwise CRITICAL → danger, HIGH → warning, MEDIUM → accent, LOW → the
  neutral. All five cards in this frame follow it: `MEDIUM/RESOLVED` and `LOW/RESOLVED` are green,
  the two `HIGH` are amber, the open `MEDIUM` is cyan.
- **The slot the drawing fills with a location ("Sector B - Pier 4") carries `issue_type` instead**
  (PO decision 2026-08-12) — Defect · General · Punch item here. An issue has no floor, room, zone or
  area column, only lat/long, so a per-issue location would have meant a migration plus a picker in
  the capture flow. `issue_type` is real, CHECK-constrained, varies per card, and is the same
  classification the Phase 6 task-completion gate reads.
- **`1h ago` is the real age** from `created_at`; a row cached before local DDL v6 shows no age rather
  than an invented one. The id eyebrow (`F2FC7CAC`) is `shortId(issue_id)`, with the sync state
  opposite it.
- **ISSUE INSIGHT** is [`<SiteInsight />`](../../../apps/mobile/src/components/SiteInsight.tsx) bound
  to the `SITE_SUMMARY` report, and it renders **only what the server returns** — here the honest
  pre-report state, _"No report has been generated for this project yet"_, naming the project it would
  report on. **GENERATE REPORT exists although no mockup draws it** (PO decision 2026-08-11): the
  drawings show a panel already full of prose, but `POST /ai/reports/*` is the only way to obtain a
  report's text and §26 meters AI per tenant against a monthly quota — a dashboard that reported on
  load would spend the tenant's allowance on every tab tap.
- **Escalate (G-M12) is gone from this screen** (PO decision 2026-08-12 — the mockup has no such
  button), and **from mobile entirely** — this was its only mobile entry point, and its drawing was
  deleted in the same restructure with no successor. It is **not** gone from the product:
  `POST /site/issues/:id/escalate` is still served and `apps/web` still calls it
  (`useEscalateIssue` → [`site/issues/page.tsx`](<../../../apps/web/src/app/(app)/site/issues/page.tsx>)).

### Tasks — [`03-Tasks/01-se-tasks.png`](03-site-engineer/03-Tasks/01-se-tasks.png)

The task list ([`app/(app)/tasks.tsx`](<../../../apps/mobile/src/app/(app)/tasks.tsx>), mockup
`03_site_engineer/03_tasks/01_se_tasks`). `Tasks` took this tab from `Inspections` on 2026-08-12;
`/inspections` became a derived drawer row for the role rather than being dropped.

- **`PHASE 1 : FOUNDATION` is derived, never a stored flag** (ADR-070): the lowest-seq phase that is
  `IN_PROGRESS`, or the next one not yet `COMPLETED`. With no phase known the heading names the list
  instead of inventing one. The column holds both languages — `งานฐานราก (Foundation)` — and
  [`phaseName()`](../../../apps/mobile/src/lib/phaseName.ts) renders **one**, the reader's.
- **`3 outstanding` counts work still open, not the list length** — five cards here, two `Completed`,
  so three. It is scoped to the project the bar above names, because a header about one site over a
  list of five sites would be two answers on one screen.
- **The filtering is behind the `filter_list` glyph**, not a chip row (PO decision 2026-08-12): four
  always-on buttons took a whole row to say what one glyph and a sheet can, and pushed the first card
  off the fold.
- **The badge slot carries a delay severity** (`! HIGH`, `! MEDIUM`) because **there is no priority
  column anywhere** — not in `projects.tasks`, not in any migration, not in the API. Completed cards
  are dimmed and carry **no Update progress button**; `Not started` sits at 0% with one.
- **The cards show dates, not times.** Times exist since migration `20260811000001`, but this screen's
  badge is a delay severity and its cards span weeks — a red chip over a time of day says nothing
  about how late the work is. The dashboard, which is about today, shows the window instead.
- **SCHEDULE INSIGHT** is [`<ScheduleInsight />`](../../../apps/mobile/src/components/ScheduleInsight.tsx)
  bound to `DELAY_RISK`, the only schedule report the gateway serves. It replaced a **static** "AI
  Insight" card on 2026-08-12: a real forecast became obtainable, and with one on the screen the
  static one stopped being a placeholder for something absent and became a second, invented insight
  beside a true one.

> **This frame prints a raw UUID and that was a real defect**, fixed on 2026-08-16. It reads
> `Source: project d0c71c19-bf77-53bc-8a9c-0ad00385982a` because `tasks.tsx` rendered
> `<ScheduleInsight>` **without
> `projectLabel`**, so `InsightPanel` fell back to the id, while `issues.tsx` and `reports.tsx` both
> passed the name. The capture is what surfaced it — three screens carrying one panel, and only this
> one naming nothing. The screen now passes the name; **the frame above predates the fix** and needs
> recapturing.

### Reports — [`04-Reports/01-se-reports.png`](03-site-engineer/04-Reports/01-se-reports.png)

The submitted-report review list ([`app/(app)/reports.tsx`](<../../../apps/mobile/src/app/(app)/reports.tsx>),
mockup `03_site_engineer/04_reports/04_se_reports`). The route is shared with `EXECUTIVE`, which gets
a different screen behind the same tab; this half was rebuilt to its drawing on 2026-08-12.

- **It was the last Site Engineer screen still pinned to the static LIGHT palette** while every other
  one followed `usePalette()` — on the app's dark default this list was the one page that stayed
  white. It reads the palette now.
- **`24 TOTAL` is the response's real `total`**, and the same number decides whether **Load More
  History** appears; the previous full-page heuristic was wrong.
- **The left strip is NOT the status colour** — it answers "does this need me", and turns on the
  blocker as much as on the status: **amber** while the report is a `DRAFT` (unfinished work the
  engineer owes), **red** when `blocker_category` is set to something other than `OTHER` — `WEATHER`,
  `MATERIAL` or `POWER`, a named cause someone can act on — and **green** otherwise. The three rules
  are checked in that order, so every row is coloured. In this frame the single red card is the
  `WEATHER` one; the `POWER` card is amber because it is still a `DRAFT`, which outranks its blocker.
- **The card's headline is `blockers`** — what the report says actually stopped work — falling back
  to its own `summary`, and only then to a generic name. The chip under it is `blocker_category`.
- **INSIGHT**, not "SITE INSIGHT" (PO decision 2026-08-12): the drawing's own heading, and on a screen
  already headed by the project bar the word "site" said it twice. Same `SITE_SUMMARY` report as the
  issue board — whose declared inputs are these very reports plus the project's open issues.
- **Two things the drawing puts on a card cannot be filled**: a per-report **title** (there is no such
  column) and a per-row **sync state** — this list is the SERVER's own copy fetched over HTTP, so
  every row in it is already synced and the value would be a constant.

## Tenant Admin dashboard — [`04-tenant-admin/01-Home/01-ta-home-dashboard.png`](04-tenant-admin/01-Home/01-ta-home-dashboard.png)

The `TENANT_ADMIN` Home ([`components/TenantAdminHome.tsx`](../../../apps/mobile/src/components/TenantAdminHome.tsx),
implementing [`mockup/mobile/04_tenant_admin/01_home/01_home_dashboard`](../../../mockup/mobile/04_tenant_admin/01_home/01_home_dashboard)),
captured against the `seed-realistic.ts` dataset through a real Path A (SMS OTP) login as `+66811000002` —
Suphaporn Rattanakul, the TENANT_ADMIN at Ekachai. The header avatar reads **"SR"** (her initials — no
photo set), confirming the signed-in role.

Everything is live, never fabricated. **System Status** is `Operational` (green) from the backend health
probe. **Pending Approvals** is the tenant's two real approval queues — **Payments awaiting approval**
(`/finance/payments?status=PENDING`) and **Purchase orders awaiting approval**
(`/procurement/purchase-orders?status=PENDING_APPROVAL`), both counted by the SERVER's `total`.

> **Both figures were wrong before 2026-08-11, in two different ways, and both are worth knowing.**
>
> **The payment queue did not exist.** `seed-realistic.ts` wrote a `finance.payments` row only for the
> orders it marked `paid`, all `PROCESSED` — so a fully seeded database had an empty AP queue and this
> tile read `0` truthfully but uselessly. Every delivered + invoiced order now gets a payment row and
> `paid` decides its STATUS: four settled and two `PENDING` per project, ten pending across the five
> active ones. A delivered order with an APPROVED invoice has money owed on it, and a `PENDING`
> payment is how this platform records that (`PATCH /finance/payments/:id/approve` settles it).
>
> **The PO tile was counting page one, not counting.** `seedPendingApprovals()` has created two
> `PENDING_APPROVAL` POs since 2026-08-10 — this README claimed otherwise until now — but the screen
> fetched `/procurement/purchase-orders` unfiltered and filtered the result itself. The endpoint
> paginates at 20, the tenant holds 42 POs, and because the seed inserts them all in ONE transaction
> their `created_at DEFAULT now()` is the SAME timestamp, so the `ORDER BY created_at DESC` deciding
> page one has no tiebreaker: the tile could read 0 or 2 on identical data. Both tiles now ask the
> server for the status and read its `total` — the same fix `c75879dd` applied to the manager
> dashboard. `/finance/payments` gained an optional `?status=` for it (additive, no version bump per
> QM-2), bringing it level with `/finance/billing` and `/procurement/purchase-orders`.

**AI Token Usage shows a dash, and seeding cannot change that.** `GET /ai/usage` is served by the
**ai-gateway** ([`usage.py`](../../../services/ai-gateway/usage.py)) — Kong routes `/api/v1/ai` there,
and the NestJS backend has no `ai` controller at all. These captures run against the backend on
`:3000` with no Kong and no ai-gateway (it sits behind the compose `apps` profile), so the call cannot
resolve however many rows `ai.ai_usage_logs` holds. **AI System Insights** reads "AI usage is within
budget — no alerts" for the same reason: it is derived from the `alertLevel` that request would have
returned. The dash is the honest rendering of "not measured here", which is why the widget shows one
instead of a number (product-owner decision 2026-08-11 — leave the card as it is rather than add the
gateway to the capture stack).

> **On the office role logging in via Path A:** `TENANT_ADMIN` normally signs in through the browser
> (Path B OIDC, where Keycloak enforces MFA). `provision-keycloak-demo.ts` gives every seeded phone-holder
> a phone username + password with no TOTP required action, so the Direct-Grant OTP path works for office
> roles too — which is what makes this dashboard capturable without driving the undrivable browser MFA flow.

**Shell — dark, like the Site Engineer Home (§32.7 Mobile Dark Surfaces; PO decision 2026-07-28).** The
whole shell renders dark to match the dark dashboard: a dark top bar and a dark bottom nav, and no
full-width sync strip. Since 2026-08-04 that is true of EVERY role, not just this one: the
`SyncStatusBar` strip was deleted and the top-bar `<SyncPill />` became the standard sync indicator
everywhere (this screen is the mockup the rest now follows). The bottom nav is **Home | Users |
Alerts | Settings** — the per-role tab set for `TENANT_ADMIN` (`components/MobileNav.tsx`): "Alerts" is
the sync-review queue and "Settings" is the System Settings route (`system-settings`, both dark);
Profile is reached from the top-bar avatar, not a fifth tab. The brand icon (no separate hamburger)
is the drawer trigger. The top bar also carries a small **icon-only sync glyph**
([`components/SyncPill.tsx`](../../../apps/mobile/src/components/SyncPill.tsx)) — the dark shell's sync
indicator in place of the dropped strip: a green check when synced, gold while syncing (glyph shape +
colour, no label, so it stays balanced beside the brand and never crowds it). It sits on the shared top
bar, so it shows the same on every Tenant Admin screen.

**Uniform top bar; a breadcrumb on CHILD screens only; standard Help.** The shared bar shows the
**CONSTRUCTION OS** wordmark on **every** screen, and the brand icon is the drawer trigger.

**How a screen is named — the authoritative rule is [§32.7 Mobile App Shell](../../specifications/32-implementation-specifications.md), not this file:**

| Screen                      | Named by                  | Breadcrumb | Back chevron |
| --------------------------- | ------------------------- | ---------- | ------------ |
| Top-level **tab** screen    | its active bottom-nav tab | no         | no           |
| Pushed **child** screen     | its breadcrumb            | yes        | yes          |
| Terminal (`router.replace`) | nothing — wordmark only   | no         | no           |

**No screen draws its own in-content page heading**, tab screens included — the tab already carries
the name, and repeating it inside the content states it twice.

On a **child** screen (a pushed route such as Invite user, Notifications, System-settings detail,
Profile-via-avatar) the screen is named by a clickable **breadcrumb** strip under the bar
([`components/Breadcrumb.tsx`](../../../apps/mobile/src/components/Breadcrumb.tsx)), and the bar
carries a leading bare chevron **`<`** back control (PO decision 2026-08-04). The two are
complementary: the chevron is the one-tap gesture, the breadcrumb shows depth and can jump more than
one level. `isChildRoute()` is the single source of "has a parent", so no route gets one without the
other.

> **This paragraph used to be the only place the naming rule was written down**, under the heading
> "Uniform top bar + breadcrumb + standard Help" — which reads as though every screen carries a
> breadcrumb, when only child screens do. Both halves of that ambiguity caused real defects on
> 2026-08-08: the Site Worker screens shipped with in-content titles (the rule was invisible to
> anyone reading §32.7), and the missing breadcrumbs on those same screens were then reported as a
> bug when they were correct. The rule now lives in §32.7 and is held by
> [`theme/__tests__/pageTitle.spec.ts`](../../../apps/mobile/src/theme/__tests__/pageTitle.spec.ts);
> what is left here is a pointer.
>
> Supersedes the **2026-07-29** "title-aware bar" (screen name + Material back arrow **in** the bar,
> wordmark on tabs only): the title moved to the breadcrumb on **2026-07-31**, which also removed the
> back arrow entirely; **2026-08-04** brought a back control back as the `<` chevron.

A **Help "?"** sits beside the bell on **every** authenticated screen (`testID="topbar-help"`); with
no in-app help centre yet it opens an honest "coming soon" note. The mockup's **+ FAB**
(bottom-right) opens the Quick-Add menu (below).

Captured by [`apps/mobile/scripts/capture-android-tenant-admin-home.mjs`](../../../apps/mobile/scripts/capture-android-tenant-admin-home.mjs)
(`node scripts/capture-android-tenant-admin-home.mjs`) — adb/uiautomator only. It asserts the
`tenant-admin-home` landing testID and then the `admin-system-status` card before saving, so a mis-tap or
an unrendered dashboard fails the run instead of writing the wrong screenshot; it then opens the FAB's
Quick-Add menu (`04-tenant-admin/01-Home/02-ta-quick-action.png`) and goes on to the Alerts and Settings tabs.
It does **not** capture the Users tab: that is
[`capture-android-users-actions.mjs`](../../../apps/mobile/scripts/capture-android-users-actions.mjs)'s
screen, and having both write it made the committed frame depend on which script ran last.

## Tenant Admin — Users — [`01`](04-tenant-admin/02-Users/01-ta-users-dashboard.png) · [`actions`](04-tenant-admin/02-Users/02-ta-users-more.png) · [`profile`](04-tenant-admin/02-Users/03-ta-user-profile.png) · [`edit`](04-tenant-admin/02-Users/04-ta-edit-permission.png) · [`success`](04-tenant-admin/02-Users/05-ta-success-permission.png) · [`reset`](04-tenant-admin/02-Users/06-ta-reset-password.png) · [`temp-done`](04-tenant-admin/02-Users/07-ta-temp-password.png) · [`link-sent`](04-tenant-admin/02-Users/08-ta-reset-link-sent.png)

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
**`⋮` opens the action sheet** (mockup `02_user_management/01_management`, `02-ta-users-more.png`): a bottom
sheet headed by the selected user, with **Edit permissions · Reset password · View activity · Deactivate
account** (the last in red). Each targets a sub-flow not built on mobile yet (mockups `03_edit_permission`
/ `05_reset_password` / `07_user_activity` / `08_user_deactivation`), so it opens an honest "not available
on mobile yet" note rather than dead-ending. **Tapping the card itself (or its chevron)** opens the
**user profile** (below); only the ⋮ opens the sheet.

Both frames are captured by
[`apps/mobile/scripts/capture-android-users-actions.mjs`](../../../apps/mobile/scripts/capture-android-users-actions.mjs)
(`node scripts/capture-android-users-actions.mjs`) — single top viewports, not full-page stitches: the
list frame is deliberately the header + AI audit card + the first ~2 user cards rather than the whole
scrolled list, and the action sheet fits one viewport. This script is the **only** writer of
`02-Users/01-ta-users-dashboard.png`.

## Tenant Admin — User profile — [`03`](04-tenant-admin/02-Users/03-ta-user-profile.png)

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

## Tenant Admin — Edit permissions — [`04`](04-tenant-admin/02-Users/04-ta-edit-permission.png)

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

## Tenant Admin — Permission saved — [`05`](04-tenant-admin/02-Users/05-ta-success-permission.png)

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

## Tenant Admin — Reset password — [`06`](04-tenant-admin/02-Users/06-ta-reset-password.png)

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

## Tenant Admin — Password reset done (temp) — [`07`](04-tenant-admin/02-Users/07-ta-temp-password.png)

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

## Tenant Admin — Reset link sent (email) — [`08`](04-tenant-admin/02-Users/08-ta-reset-link-sent.png)

The terminal confirmation for the **standards-compliant email path**
([`app/(app)/reset-password-email-success.tsx`](<../../../apps/mobile/src/app/(app)/reset-password-email-success.tsx>),
mockup [`02_users/02_user_management/06_reset_password_success`](../../../mockup/mobile/04_tenant_admin/02_users/02_user_management/06_reset_password_success)).
Reached via `router.replace` — terminal, wordmark TopBar, no Back.

- **Real send** — Keycloak actually emailed the target (verified via the MailHog dev inbox); the body names
  the real address (`chalermsak.n@ekachai.co.th`) and the real token lifespan. The mockup's _"link valid 24
  hours"_ is replaced with the true **15 minutes**, and the fabricated `SYSTEM SECURITY LOG` UIDs with the
  truthful audit fact (`identity.user.password_reset.v1`, `method: email_link`).
- **Return to user list** → `router.replace('/users')`.

## Tenant Admin — Quick-Add menu — [`04-tenant-admin/01-Home/02-ta-quick-action.png`](04-tenant-admin/01-Home/02-ta-quick-action.png)

The FAB's full-screen **Quick Commands** overlay
([`components/QuickAddMenu.tsx`](../../../apps/mobile/src/components/QuickAddMenu.tsx), mockup
`04_tenant_admin/01_home/02_quick_action_button/01_quick_action_menu`) — a dark surface with its own top
bar (brand + SYNCED pill + close), **five action cards** (Invite · New System Integration · Apps &
Services · Generate Usage Report · Force System Sync), and a small stats bento. Left-accent colour
follows the action. With the fifth card the overlay now scrolls, so `02` is captured as **one full-page
stitch** (`apps/mobile/scripts/stitch-fullpage.py`).

> **The overlay now opens straight onto its cards — it has no heading line of any kind** (PO decision
> 2026-08-11). The "Quick Commands" title went on 2026-07-31 because the wordmark above already
> identifies the surface, and the "Choose an action to create or update" subtitle that inherited its
> job went now, for the reason the sibling [`<QuickActionsMenu />`](../../../apps/mobile/src/components/QuickActionsMenu.tsx)
> already records for the Site Worker: five labelled cards under a sheet the user opened deliberately
> do not need to be told what they are. The `quickAdd.subtitle` key was deleted from **both** locales
> with it, rather than left orphaned for a later reader to wonder about.

Real vs honest placeholder:

- **Force System Sync** — real (`runPushSync()` then `runDeltaSync()`, §17.6 flush + pull); tapping it
  spins the icon and the sub-label reads **SYNCING…** while it runs.
- **SYNCED pill** (top bar) — real `useSyncStatus()`; green check when idle. Since 2026-08-04 this
  pill is the standard sync indicator on every role's top bar, not just Tenant Admin's.
- **Active Projects** / **System Health** bento — real figures over **bundled photo backdrops** (PO
  decision 2026-07-29): the project count from `GET /projects/mine` (0 for this admin, who is a member of
  none) on `assets/tenant-admin/digital_archectural_blueprint.jpg`, and liveness from `GET /health/live`
  shown as a word (**Optimal**), **not** the mockup's invented "98.4 %", on
  `assets/tenant-admin/micro_server.jpg`. Each tile follows the mockup layout — a dimmed photo banner on
  top, then the label + real value stacked below on the card surface.
- **Invite New User** opens the Invite-user form (below); **New System Integration** opens the
  connector picker (`07`); **Apps & Services** opens the module hub (`08`). **Generate Usage Report** is an
  honest placeholder (no AI-report screen yet) — the AI-report card keeps the mockup's richer layout but
  **drops the fabricated "94 % CONFIDENCE / Source"** (no such signal exists).

## Tenant Admin — Invite user — [`phone`](04-tenant-admin/01-Home/03-ta-invite-user-phone.png) · [`email`](04-tenant-admin/01-Home/03-ta-invite-user-email.png)

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

## Tenant Admin — Role permissions — [`04`](04-tenant-admin/01-Home/04-ta-role-permissions.png)

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

## Tenant Admin — Roles selection — [`05`](04-tenant-admin/01-Home/05-ta-roles-selection.png)

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

## Tenant Admin — Invitation success — [`06`](04-tenant-admin/01-Home/06-ta-invitation-success.png)

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

## Tenant Admin — System integration — [`07`](04-tenant-admin/01-Home/07-ta-system-integration.png)

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
- **`07` is one full-page image** (PO decision 2026-07-29 — "one page, not split"): the capture shoots
  several scrolling viewports and stitches them with `apps/mobile/scripts/stitch-fullpage.py`. Also visible here: the
  **brand icon in the TopBar is now a rounded-square tile** (`brandIcon` `borderRadius`, Linear/Palantir
  aesthetic) — a global TopBar change, so every screen's header picks it up.

## Tenant Admin — Apps & Services — [`08`](04-tenant-admin/01-Home/08-ta-apps-services.png)

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
  Connect**. `08` is one full-page stitch; no top bar of its own (global TopBar shows the title + Back
  arrow).

## Tenant Admin — Sync Review Queue (Alerts) — [`01`](04-tenant-admin/03-Alerts/01-ta-alerts-dashboard.png)

The `TENANT_ADMIN` "Alerts" tab
([`app/(app)/sync-queue.tsx`](<../../../apps/mobile/src/app/(app)/sync-queue.tsx>)), implementing
[`04_tenant_admin/03_alerts/01_alerts_dashboard`](../../../mockup/mobile/04_tenant_admin/03_alerts/01_alerts_dashboard).
It is the field-sync **review queue** — `GET /site/conflict-records` (the SAME endpoint the Site
Engineer's ConflictBadge uses; spec §17.5 lets `TENANT_ADMIN` view/resolve), resolved via
`PATCH /site/conflict-records/:id/resolve`. Real data throughout: the badge + filter chips are the
actual `conflict_type` enum (**REJECTED / STATUS_CONFLICT / FIELD_CONFLICT**, colour-coded) — the
mockup's Critical/Medium/Low "severity" is not a field on the record, so it is not invented. `REF` comes
from `entity_id`, `FAILED AT` from `created_at`, and the **error reason** is a localised description of
each `conflict_type` (not a fabricated per-record message). `01-ta-alerts-dashboard` shows the populated
list as one full-page image. **Mark resolved** is the single real action (the
mockup's retry / merge / edit are all one `resolve` on the backend).

> **`FAILED AT` carries the year** (product-owner decision 2026-08-11): `01:44 · 28/07/2026`, not the
> `28/07` it printed before. A queue left alone across a new year read as though the failure had
> happened days ago. The date now goes through `Intl` rather than the `getDate()/getMonth()+1`
> arithmetic it used: appending `getFullYear()` would have printed a **Gregorian** year to a Thai
> reader, which QM-3 names explicitly, so `th-TH-u-ca-buddhist` renders **2569** where English
> renders the Gregorian **2026**. The English tag is `en-GB`, not the app's `en-US`: this screen has
> always printed day-first,
> and `en-US` with 2-digit day/month would silently reorder `08/07/2026` into `07/08/2026` — the same
> characters meaning a different day. The **time** is deliberately left as hand-rolled 24h; it is a
> time, not a date, and `formatTime()` would have turned `01:44` into `01:44 AM`.
>
> **`ERROR REASON` is the mockup's panel now** (ADR-085 — mockups are authoritative for style). The
> drawing is `bg-dark-bg/50 p-3 rounded-lg border border-outline-variant/20` around a tiny bold red
> label and an **italic message in "quotes"** at body size in `on-surface`. Ours had drifted in three
> ways at once: the panel sat on `elevated` `#111827`, which is **lighter** than the card it sits on,
> so it read as a raised chip where the drawing **recesses** it; it carried no border at all; and the
> message was `muted` at label size, which made the one sentence explaining the failure the faintest
> text on the card. The quotation marks live in the **i18n values**, one per locale, rather than being
> concatenated at the call site — they are punctuation a locale owns, and these three keys are used
> on no other screen.

The five conflicts are demo rows seeded by
[`seed-realistic.ts`](../../../backend/prisma/seed-realistic.ts) (a realistic tenant accumulates field-sync
conflicts, like it accumulates issues and reports); the screen renders that real (seed) data.

## Tenant Admin — System Settings — [`01`](04-tenant-admin/04-Settings/01-ta-system-settings.png)

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

## Shared — Notification settings — not captured (retired 2026-08-16)

**The two frames are no longer part of this set** (product-owner decision 2026-08-16).
`02-shared/01-notification-preferences.png` and `02-shared/02-notification-preferences-saved.png` were
deleted, and the capture path was retired with them: the two steps that wrote them were removed from
[`capture-android-shared-mfa.mjs`](../../../apps/mobile/scripts/capture-android-shared-mfa.mjs), so
nothing recreates them on the next run. That also removed the only capture step in this repo that
WROTE to the database.

**The SCREEN is untouched.** [`notification-preferences.tsx`](<../../../apps/mobile/src/app/(app)/notification-preferences.tsx>)
is still the TENANT_ADMIN **Settings** tab, still wired into `MobileNav`, `roleTabs`, `AccountSettings`,
`Breadcrumb` and `routeRegistry.spec`, and master §Phase 10 still lists it. ADR-085: a screenshot
leaving this folder does not remove reviewed working capability — the same screen already survived
its mobile MOCKUP being withdrawn on 2026-08-13 (§32.7 keeps its dark-screen row without a drawing).
What the retired frames documented is kept below, because it is easy to re-break.

The route is reached from the navigation drawer rather than from a tab, and rendered as one page
(1080×4389 when it was stitched). Preferences are grouped by consequence, not by channel.
**CRITICAL INFRASTRUCTURE** holds a
single row, _Safety incident (immediate)_, badged **REQUIRED** with a padlock and its `IN_APP` +
`LINE` channels shown as green ticks rather than toggles — that row cannot be switched off, which is
spec §19.6's "critical safety notifications cannot be disabled or quieted" rendered as UI rather than
enforced silently server-side. **PROJECT & OPERATIONS** below it (_Daily site report_, _Inspection
failed_, _Budget variance alert_, _Purchase approval requested_, _AI risk prediction_) uses ordinary
per-channel toggle chips. It ends with **QUIET HOURS (PUSH ONLY)** — `START 22:00` / `END 07:00` on
±steppers, the `quiet_hours_start` / `quiet_hours_end` defaults from the `notification_preferences`
table — whose note repeats the §19.6 carve-out: _"Push is muted during this window. Critical safety
alerts are never quieted."_ — and the **SAVE CHANGES** button.

> A third file, `01-notification-preferences-quiet.png`, had already been folded into the page on
> 2026-08-06 (product-owner decision). Splitting one screen across two frames let them rot
> separately: that one still showed the light top bar and the full-width green `SyncStatusBar`, both
> retired 2026-08-04, plus a dev banner and a seven-tab bottom bar from before the extra routes were
> hidden. Worth keeping in writing now that the whole set is gone — it is the reason the page was
> stitched rather than screencapped, and the reason to stitch it again if it is ever recaptured.

The saved state was a **different screen**, not part of that page: the `if (saved)` branch in
`notification-preferences.tsx`. _Changes saved_, with `STATUS Active` and `LAST SYNC Just now`, and a
**Back** button. Its mockup (`06_notification/02_success_state`) was withdrawn on 2026-08-13, ahead of
the frame itself.

> Reaching that branch required **pressing SAVE CHANGES for real**, which wrote the fixture user's
> row in `notification_preferences` — there is no other way in. The step was idempotent (nothing was
> toggled first, so the values written were the ones already on screen), but it is why retiring this
> capture took the repo's only database-writing capture step with it.

## CRM Sales Manager — four tabs, six screens — [`12-crm-manager/`](12-crm-manager/)

**THE 2026-08-11 RETIREMENT IS OVER, AND THIS HEADING SAID OTHERWISE FOR A DAY.** It read
"not captured (retired 2026-08-11)" until 2026-09-10 while the six frames below were already in the
tree, committed at `74582833`. The retirement was real — the three CRM frames were deleted that
August and `capture-android-crm.mjs` went with them — and it was lifted by the product owner on
2026-09-10, who asked for the role's five remaining screens to be implemented from Stitch and each
to be captured. Recorded here rather than quietly overwritten, because a heading that contradicts
the folder beside it is exactly what this file is for.

Shot as `+66811000012` (Chalermsak Nithat) over **Path A, phone OTP**: `MFA_ROLES` is
`{TENANT_ADMIN, FINANCE}` and this role is in neither.

| Directory                                       | What the frames show                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| [`01-Home/`](12-crm-manager/01-Home/)           | `01-crm-dashboard` — pipeline value, active leads, win rate, the three stage counts |
| [`02-Leads/`](12-crm-manager/02-Leads/)         | `01-leads-directory` — search, state chips, the AI score per lead                   |
| [`03-Pipeline/`](12-crm-manager/03-Pipeline/)   | `01-opportunities` — the forecast card, the deal cards, convert                     |
| [`04-Customers/`](12-crm-manager/04-Customers/) | `01-customers` — the relationship card and the client list                          |
| [`05-Profile/`](12-crm-manager/05-Profile/)     | `01-navigation-drawer` (the grouped CRM menu) and `02-account-settings`             |

**The SCREENS are untouched.** `CRM_SALES_MANAGER` still has its four tabs in the app, still backed by
`crm.controller.ts` and the same role-gated routes `apps/web` uses; only their screenshots left this
folder. Two behaviours the retired frames documented are worth keeping in writing, because they are
easy to re-break: a **WON** opportunity deliberately renders **no** convert button (the server rejects
a second convert with `COS-CRM-003`, so the state is the affordance), and `value` is displayed as the
DECIMAL **string** the API returns — never parsed into a JS number (§14). The lead picker is a
**wrapping** row of chips, not a horizontal scroller: a horizontal `ScrollView` in that column
container laid nothing out, and since choosing a lead is mandatory before an opportunity can be
created, that made the screen unusable.

## Privacy Policy (both entry states) + Data Collection — not captured (retired 2026-08-17)

**Sixteen frames left this set in one change** (product-owner decision 2026-08-17): the whole of
`01-authen/03-privacy-policy/` — the Privacy Policy in both entry states, and the fourteen-screen
PDPA Transparency Portal beneath it at `01-data-collection/`. Both capture paths were retired with
them: `capture-android-privacy-policy.mjs` and `capture-android-transparency.mjs` are gone, along
with their `capture:android:privacy-policy` and `capture:android:transparency` entries, so nothing
recreates the folder on the next run.

**The SCREENS are untouched** (ADR-085). [`(auth)/privacy-policy.tsx`](<../../../apps/mobile/src/app/(auth)/privacy-policy.tsx>)
is still the login footer's policy link, [`(app)/privacy-policy.tsx`](<../../../apps/mobile/src/app/(app)/privacy-policy.tsx>)
is still the drawer's route, and [`(app)/transparency.tsx`](<../../../apps/mobile/src/app/(app)/transparency.tsx>)
with its eight child screens is still reached from the policy's Data Collection card, all backed by
ADR-078 / ADR-080 / ADR-081 / ADR-082 / ADR-083 / ADR-084. **These screens have now outlived both
their drawings and their screenshots** — the mockups went on 2026-08-15, the captures on 2026-08-17 —
which is why everything the frames documented is written out below rather than left to the images.
The layout the withdrawn drawings specified lives in
[`TransparencyKit.tsx`](../../../apps/mobile/src/components/TransparencyKit.tsx) and in the
`cardBodyLength.spec.ts` / `headingStutter.spec.ts` tests; this section is the record of what the
frames showed.

**Reached from drawer → PRIVACY POLICY → Data Collection card** (PO decision 2026-08-04). They are
not any role's tab. The folder sat under `01-authen/` because the pre-auth policy screen is the same
document, so both entry states were filed together rather than split across `01-authen/` and
`02-shared/`.

> **Entry path changed 2026-08-04.** These screens were previously reached from **Profile →
> Transparency Portal**. Both halves of that path are gone: the Profile **tab** was removed for every
> role (Profile is reached from the top-bar avatar), and the portal row was removed from Profile when
> the policy's Data Collection card became the entry point. The post-auth policy frame was the new
> doorway.

<!-- markdownlint-disable-next-line MD028 -->

> **The pre-auth policy was one frame, and only the collapsed state.** Until 2026-08-07 the
> then-`01-public/` folder also carried
> `05-privacy-policy-{data-collection,usage,compliance,security,rights}.png` — the same screen with
> each accordion section expanded. All five were removed as duplicates (product-owner decision),
> since the identical policy document was captured post-auth where it is the live route rather than a
> pre-auth stand-in, and the capture script was changed to stop expanding the sections so that
> re-running it could not reintroduce them.

Captured signed in as **Thanawat Boonmee — PROJECT_MANAGER** (`seed-realistic.ts`), because
`01-identity` renders that account's real stored values from `GET /api/v1/users/me`. Shell colour is
not role-dependent: **dark is the product default for every role** (PO decision 2026-08-04), with
light selectable in Profile, so the frames showed the dark default. Each child screen carries the `<`
back control restored to the top bar on 2026-08-04, alongside the breadcrumb.

What the sixteen policy/portal frames showed, kept because it is the only remaining description of
these screens as a set:

| #   | Screen                     | What it showed                                                                  |
| --- | -------------------------- | ------------------------------------------------------------------------------- |
| 00  | Privacy Policy (post-auth) | The drawer's policy route — same document as the pre-auth one, in the app shell |
| 00  | Data Collection            | Category count, what is collected, how it arrives, retention and rights         |
| 01  | Identity & contact         | The signed-in account's real name / email / phone / photo / role                |
| 02  | Site & location            | The five record types that carry a coordinate; geofencing marked Planned        |
| 03  | Technical logs             | Audit-log fields, the path an entry travels, retention tiers                    |
| 04  | What you enter             | The forms that create records and how entries are handled                       |
| 05  | Equipment sensors          | Every row Planned — IoT ingestion is Phase 21/24 and collects nothing today     |
| 06  | Automated processing       | OCR + report drafting in use; PPE detection and photo-vs-design Planned         |
| 07  | Erasing your data          | What is erased vs anonymised-and-kept, and why; request control inactive        |

### The D-series (`08`–`13`) — ADR-078 / ADR-080 / ADR-081 / ADR-084

| #   | Screen           | What it showed                                                                       |
| --- | ---------------- | ------------------------------------------------------------------------------------ |
| 08  | Data export      | The five real @pdpa categories, JSON/CSV, and the step-up before an archive is built |
| 09  | Network origin   | What the ingress address resolves to, latency measured on the device, and the rule   |
| 10  | Device details   | Installation id (not a hardware serial), how sign-in is bound, platform integrity    |
| 11  | Account security | Registered devices, revocation with a reason, and the biometric unlock switch        |
| 12  | Session details  | Real token lifetimes and transport — not the mockup's invented parameters (ADR-084)  |
| 13  | Timestamps       | UTC, storage precision, append-only audit, and the real retention tiers              |

**Two flag-dependent states were visible in those frames, and both were the correct rendering rather
than a defect:**

- `10-device-details` showed **no trust-score panel**, because `s1.identity.device-trust-score` ships
  OFF. The screen is built to drop the panel and still render every stored fact — the score is
  advisory and gates nothing (§22.3, ADR-081). To photograph the gauge, enable that flag first.
- `08-data-export` rendered its full flow only because `s1.identity.data-export` was flipped ON at
  100% rollout on 2026-08-05. With it OFF the screen shows "not available yet" instead.

The emulator reported `Never checked` / `Not reported on this platform` under Platform Integrity.
That is correct for a device enrolled before attestation existed, and it is exactly the distinction
ADR-083 required the screen to keep separate from "failed" — the frame was evidence the four-state
rendering works, not evidence of a broken check.

> **What a recapture would have to rebuild.** `capture-android-transparency.mjs` was the only capture
> script here that signed in and then walked a sub-tree, so it carried two helpers the others did not
> need: the shell's fixed bands are **taller** than the pre-auth screens (the breadcrumb pushes the
> content start to row 311 — it was 375 until the green sync strip was removed on 2026-08-04), and
> rows below the fold have to be tapped via a scroll-until-found helper, because React Native does not
> report off-viewport rows to `uiautomator`. Measure the BOTTOM band by walking **up** from the last
> row, never down: the content cards use the same `#0F172A` surface as the bottom nav, so a downward
> scan stops in the middle of the page.

## Shared — Navigation drawer — not captured (retired 2026-08-16)

**`02-shared/03-navigation-drawer.png` is no longer part of this set** (product-owner decision
2026-08-16); the step that wrote it was removed from `capture-android-shared-mfa.mjs` with it. The
drawer is **still in the app** on every role (ADR-085) — and it is still captured, per role, where it
now belongs: [`05-site-worker/05-Drawer/`](05-site-worker/05-Drawer/) and
[`06-project-manager/05-Drawer/`](06-project-manager/05-Drawer/). A cross-role frame stopped being
the honest way to document it on 2026-08-10, when the drawer became **per role**.

What the retired frame showed, kept because it is still true: the drawer opened from the top bar,
captured as Somsak Duangdee (`SITE_WORKER`) — the identity card with the initials avatar, the role,
and an **Online & synced** pill. **FIELD TOOLS** listed Project overview, Daily site reports, Safety
incident logs, Inspections, Materials and Deliveries; below the divider sat Notification settings and
a red **Log out**. This is where routes that are deliberately NOT bottom-tabs live — `MobileNav.tsx`
sets `href: null` on the notification-preferences and mfa-enrollment routes so they stay reachable
without spending one of the 4–5 tab slots spec §32.7 allows.

## MFA enrolment — [`01`](01-authen/02-mfa/01-app-intro.png) · [`02`](01-authen/02-mfa/02-keycloak-login.png) · [`03`](01-authen/02-mfa/03-keycloak-totp-setup.png) · [`04`](01-authen/02-mfa/04-keycloak-totp-verify.png) · [`05`](01-authen/02-mfa/05-app-enrollment-success.png) · [`06`](01-authen/02-mfa/06-keycloak-recovery-codes.png) · [`07`](01-authen/02-mfa/07-keycloak-backup-codes-copied.png)

> **This flow lives in [`01-authen/02-mfa/`](01-authen/02-mfa/) as of 2026-08-16.** It was
> `01-authen/02-mfa/` until then, filed with the pre-auth flows; enrolment is reached AFTER sign-in by
> every role that carries it, so it is cross-role, not a way in. Renumbered `02-mfa/` → `01-mfa/` on
> becoming the only occupant of `02-shared/`. The seven frames themselves are unchanged — git recorded
> every move as `R100`.

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

## App launch — loading state — [`00-loading/01-app-launch-loading.png`](00-loading/01-app-launch-loading.png)

Opening the app now shows the same [`LoadingState`](../../../apps/mobile/src/components/LoadingState.tsx)
`widget` ("loading A", ADR-055) on a dark ground while the persisted session hydrates and the brand
font resolves ([`src/app/_layout.tsx`](../../../apps/mobile/src/app/_layout.tsx)) — the
**app favicon** (the hexagon mark) in place of the icon-plate skeleton, the **brand tagline** ("AI-NATIVE
/ Construction Platform") in place of the top skeleton bar, then a two-step (hydration + font) percentage
and a matching bar (`50%` here: session hydrated, font still loading). This mirrors the login hero, and
continues the native splash's identity into the JS layer so `00-loading/00-native-splash.png` → this state is one
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

## Native splash — [`00-loading/00-native-splash.png`](00-loading/00-native-splash.png)

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
`SITE_ENGINEER` session** (`+66800000002`, an EKC user), deep-linking
each route via `cos:///<route>`. This said `PROJECT_MANAGER` — "the role with the widest data
access" — until 2026-08-06; the fixture never carried that role, in the realm import or in
`platform.tenant_memberships`. Routes needing an office role are therefore empty or forbidden in
that dump by construction. It documents routes as one user sees them, matching the iOS layout — a
different thing from the **committed** per-role captures here, which are grouped into role folders
(see [Structure](#structure--grouped-by-role) above), like [`../web/`](../web).

`00-login.png` from that dump predated the login redesign — `01-authen/01-login/01-login.png` is the current landing.

## Known gaps

- **Per-role capture is possible now — this gap is closed** (2026-07-16). Path A needs a Keycloak user
  whose _username_ is the phone number (`identity.service.ts` `issueTokensForPhone` →
  `keycloak-admin.service.ts` `exchangeOtpForTokens` does a Direct Grant with `username: <phone>`),
  and [`provision-keycloak-demo.ts`](../../../backend/prisma/provision-keycloak-demo.ts) used to
  provision every demo user with the email as username, so no seeded role could complete an OTP login.
  It now uses the phone number as the username whenever the account has one; Path B still works
  because the realm sets `loginWithEmailAllowed`. `03-site-engineer/01-Home/01-se-home-dashboard.png` is the first
  screen captured through a real per-role OTP login.
  - Accounts provisioned before this change cannot simply be renamed — the realm sets
    `editUsernameAllowed: false`, and Keycloak rejects a username change with
    `400 error-user-attribute-read-only` — so the script deletes and recreates them, then re-links
    `platform.users.keycloak_user_id`. Re-run it once against an existing realm to migrate.
- **One hand-made shot predates the tab-bar fix and needs recapturing.**
  `01-authen/02-mfa/05-app-enrollment-success.png` still shows a **seven**-tab bottom bar ending in truncated
  `mfa-en…` / `notific…` entries, plus a dev LogBox toast. That is exactly what
  [`capture-android-shared-mfa.mjs`](../../../apps/mobile/scripts/capture-android-shared-mfa.mjs)
  exists to avoid — `MobileNav.tsx` now sets `href: null` on those two routes, and Metro must be
  started with `EXPO_PUBLIC_CAPTURE=1` to suppress the toast. The one screen that script still drives
  (`01-authen/02-mfa/01-app-intro.png`) shows the correct four-tab bar with no toast. This one cannot
  be scripted without completing a real TOTP enrolment against Keycloak's own pages.
  - The three other frames it used to drive were **retired on 2026-08-16** with their steps —
    `01-notification-preferences.png`, its `-saved` state and `03-navigation-drawer.png`; see the two
    "not captured (retired …)" sections above. Before that, two entries had already left this list on
    2026-08-06: `01-notification-preferences-quiet.png` was folded into the stitched page, and the
    saved state became scripted rather than hand-made.
- **`01-authen/02-mfa/04-keycloak-totp-verify.png` does not show what its name claims.** It is the TOTP _setup_
  page again, with Chrome's "Save password?" prompt covering the header and the Android keyboard
  toolbar covering the left edge; the six verification boxes are still empty. A genuine "code
  entered, about to submit" frame is still missing. Being a Keycloak browser page, it can only be
  recaptured by hand.
- **The flat `00`–`20` set cannot be regenerated on Windows.**
  [`apps/mobile/e2e/capture.spec.ts`](../../../apps/mobile/e2e/capture.spec.ts) writes to
  `docs/screens/ios/` and shells out to `xcrun simctl`, so as committed it only drives an iOS
  simulator. The Android equivalents are the two adb scripts referenced above.

## Site Worker — four tabs, eight screens — [`05-site-worker/`](05-site-worker/)

> **THE ROLE NOW PICKS A SITE FIRST** (mockup `01_home/00_sw_project_selection`, added 2026-08-10).
> The corrected set puts a project picker in front of the dashboard and then prints the chosen site
> on every screen after it, so `00-sw-select-project` is not a screen the capture script navigates to —
> it is where the app already is after `pm clear`. Choosing one is what unlocks the rest of the run.
>
> **IT IS AN OVERLAY, NOT A ROUTE** (PO decision 2026-08-11), and the set carries BOTH of its states:
>
> |                                                                           |                                                          |                                                                        |
> | ------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- |
> | [`00-sw-select-project`](05-site-worker/01-Home/00-sw-select-project.png) | **forced** — no site chosen yet                          | **no close control**, and the hardware back does nothing               |
> | [`00-sw-change-project`](05-site-worker/01-Home/00-sw-change-project.png) | **deliberate** — opened from the project bar mid-session | an **X**, and closing keeps the site already chosen (marked `CURRENT`) |
>
> It was a route for one build, which put a back chevron on the one case that must not be escapable;
> the shell had to keep redirecting the worker back into it. An overlay has no chevron to answer for,
> so the two cases can differ honestly. Note in both shots that **no tab bar is visible** — the sheet
> covers the shell, which is also why the capture script waits on the sheet rather than the top bar.
>
> Two of those sites are worth noticing in the shot: **TLPK is `On hold`** (the sixth project, seeded
> paused so the picker can show more than one status) and **CWRD shows its code where the others show
> a building** — the location line is the project's building name, and that one has none recorded.

The `SITE_WORKER` tab set, implementing [`mockup/mobile/05_site_worker/`](../../../mockup/mobile/05_site_worker)
(`01_home/00_sw_project_selection`, `02_tasks/01_sw_daily_tasks`, `01_home/03_sw_issue`,
`01_home/04_sw_daily_report`, `03_safety/01_sw_checklist`).
Captured against the `seed-realistic.ts` dataset
through a real Path A (SMS OTP) login as `+66811000010` — Somsak Duangdee, the seeded SITE_WORKER at
Ekachai. The header avatar reads **"SD"** (his initials — no photo set), confirming the signed-in role.

> **The mockup folders were restructured on 2026-08-08** (commit `527231f`), content unchanged —
> git recorded every one as `R100`. The mapping, because two applied migrations still cite the old
> paths in their header comments and cannot be edited (immutable after apply, QM-9 —
> `backend/prisma/migrations/20260808000001…` and `…0002…`):
>
> | old                                 | new                                         |
> | ----------------------------------- | ------------------------------------------- |
> | `05_site_worker/01_tasks/00_main`   | `05_site_worker/02_tasks/01_sw_daily_tasks` |
> | `05_site_worker/02_issues/00_main`  | `05_site_worker/01_home/03_sw_issue`        |
> | `05_site_worker/03_reports/00_main` | `05_site_worker/01_home/04_sw_daily_report` |
> | `05_site_worker/04_safety/00_main`  | `05_site_worker/03_safety/01_sw_checklist`  |
>
> The same commit added four drawings this role had none of before — `01_home/01_sw_dashboard`,
> `01_home/02_sw_quick_actions`, `04_directory/01_sw_worker_list` and `05_profile/01_sw_account_settings`.

**The bar is Home | Tasks | Safety | Directory** (product-owner decision 2026-08-09) — close to the
`01_home/01_sw_dashboard` mockup's own bar, but with Home in the Projects slot, since a field worker has
no project-portfolio screen and Home is first for all twelve roles.

It moved twice to get here. The role's original four mockups drew **Tasks | Issues | Reports |
Safety** with no Home, and that shipped first; on 2026-08-08 Home replaced Tasks; on 2026-08-09
**Issues and Reports gave up their slots** to Tasks and Directory. Neither lost its entry point —
both are pushed from the Home FAB's quick-action menu, which carries exactly those two plus Safety.
§32.7 allows exactly four, so every arrival costs a departure.

**Tasks did not disappear** — it became a pushed child of Home, reached from the Tasks quick action
FieldHome already carried, and it now carries a breadcrumb (`HOME › TASKS`) and a back chevron like
every other child screen. That is also why its capture lives under `01-Home/`.

Two things the first arrangement broke, both fixed:

- **Landing.** `app/index.tsx` redirected every role to `/home`, which under the Home-less bar was a
  screen this role could not reach — it opened with nothing highlighted. The landing is now derived
  from the role's own tab set ([`lib/landingRoute.ts`](../../../apps/mobile/src/lib/landingRoute.ts)),
  so the two cannot disagree whichever way the tabs move.
- **Check-in is REMOVED from the product** (product-owner decision 2026-08-09). It was on Home,
  moved briefly into the navigation drawer, and was then cut outright along with its project picker,
  its `POST /workers/:id/attendance` client (`api/workforce.ts`) and its strings.
  **The Shift Hours tile survives the removal**, and this was checked rather than assumed:
  `attendance` is one of the six entity types `/sync/delta` streams down
  ([`sync/runDeltaSync.ts`](../../../apps/mobile/src/sync/runDeltaSync.ts)), so the rows that tile
  reads are recorded elsewhere and synced to the device. The button was never their only source.

**No screen here draws its own title, though all four mockups do.** §32.7 names a tab screen by its
tab, so `รายการงานวันนี้` / `บันทึกกิจกรรมประจำวัน` / `เช็คลิสต์ความปลอดภัย` are not rendered. Those three
screens shipped WITH a title on 2026-08-08 and were corrected the same day: the rule lived only in
this README, so neither §32.7, nor the mockups, nor any test contradicted them. The Safety screen's
**REQUIRED** badge went with them later the same day, on the product owner's reading that it stated
nothing checkable — what was required, or by when? The per-row "Required check" caption went too: the
seed sets `is_required` on every item, so it printed on all nine and distinguished none of them.

### Home — [`01-Home/01-sw-home-dashboard.png`](05-site-worker/01-Home/01-sw-home-dashboard.png)

The field dashboard and the role's landing screen. **Reworked on 2026-08-08** to mockup
`01_home/01_sw_dashboard`, which the restructure added — this role had no Home drawing before it. Now:
two bento stat tiles, the AI Insight module, today's priority tasks, and the FAB. (The drawing also
puts a project picker and a **CHECK IN** button on this screen; both were cut from the product on
2026-08-09 — see below.)

- **`My tasks 10 / 25 done`** and its bar are counted from `local_tasks`, so they are honest with no
  signal (§17.4).
- **`Shift hours`** is elapsed time since today's check-in, from `local_attendance` — rows that
  `/sync/delta` streams down, not rows this screen writes (the CHECK IN button that used to write
  them was removed on 2026-08-09, below). It shows a dash, not `00:00`, when the worker has not
  checked in: a zero would read as a shift that has just begun. The bar scales against an 8-hour
  shift (mirroring the server's `DEFAULT_SHIFT_HOURS`) and caps at full, while the number beside it
  is never clamped — ten hours into an eight-hour shift reads `10:00` against a full bar.
  `lib/__tests__/shiftHours.spec.ts` pins the cases that matter: a checked-out shift, a night shift
  left open yesterday, a duplicate check-in after a sync conflict, and clock skew.
- **The AI Insight module** is drawn in full, mockup copy and the `Conf: 94%` figure included (the
  same ruling applied to the report bar, the safety scan and the tasks insight). Nothing is behind
  it: the temperature projection has no source in this product, and §22.3 puts schedule generation
  behind Temporal with a human-in-the-loop step, so **ADJUST SCHEDULE** reports that it is
  unavailable rather than acting. No field of any record is derived from it.
- **Priority tasks** use the same `<TaskCard />` the Tasks screen renders — same swipe-to-complete,
  so the card cannot behave differently depending on which screen it is on. The mockup's
  `08:00 - 12:00` and `Sector B` are absent for the reason they are absent on Tasks: `planned_start`
  / `planned_end` are DATEs and there is no location column at all.
- **The heading is a link** (`Today's priority tasks ›`), not just a label. Moving the quick actions
  behind the FAB took the Tasks tile off this screen, and the mockup's only other route to the full
  list is `+ N more scheduled` — which does not render when there are no tasks, leaving `/tasks`
  unreachable in exactly the state a new worker starts in.

**CHECK IN and its project picker are gone** (see above). Shift Hours still reads `local_attendance`,
which delta sync fills. The mockup's **`WORKER COMMAND` heading is not rendered**: §32.7 names a top-level
tab screen by its active bottom-nav tab, all four of this role's screens had their in-content titles
removed on 2026-08-08, and `theme/__tests__/pageTitle.spec.ts` holds that line. The section heading
**`TODAY'S PRIORITY TASKS` is uppercased by style**, not by uppercasing the message: Thai has no
case, so `toUpperCase()` in the component would be a no-op there while shouting in English.

The two KPI cards it replaced (**open issues**, **pending sync**) are not lost — the Issues tab
carries its own list, and sync health is the TopBar indicator plus the Sync Queue screen.

> **The FAB appears twice in this image.** It is `position: absolute`, so it stays put while the page
> scrolls and lands in more than one of the shots `stitch-fullpage.py` joins. The same artifact is in
> the Site Engineer Home, whose voice FAB is fixed for the same reason. On the device there is one.

<!-- markdownlint-disable-next-line MD028 -->

> **This screen was the last one still pinned to the light token set.** It rendered a white page
> under the dark top bar and dark bottom nav, and its three quick-action tiles were white too, which
> went unnoticed while no role landed here by default. Making Home this role's first tab put it in
> front of a field worker on every app open, so `home.tsx` moved to the themed palette and
> `QuickActionCard`'s `variant` now DEFAULTS to the user's theme instead of to `'light'` — the tiles
> were white because the caller passed nothing and the default said nothing about being a choice.
> The four `<LoadingBoundary theme="light">` calls in the same file were fixed with it.

### Quick actions — [`01-Home/02-sw-quick-actions.png`](05-site-worker/01-Home/02-sw-quick-actions.png)

The FAB menu (mockup `01_home/02_sw_quick_actions`): three cards routing to **Issues**, **Safety** and
**Reports** — all screens that already exist, so this adds no capability, it shortens the path to the
three the role uses most. These are the same three Home used to carry as inline tiles; the mockup
restructure moved them behind the FAB, which is why Home no longer renders `<QuickActionCard />`.
They are also the two screens (Issues, Report) that left the bottom bar on 2026-08-09, so this menu
is now their entry point.

**An OVERLAY, not a route** — [`<QuickActionsMenu />`](../../../apps/mobile/src/components/QuickActionsMenu.tsx),
opened by Home's FAB (product-owner decision 2026-08-09). It shipped as a pushed screen first, and
that was wrong for one concrete reason: the reference it is meant to match
(`04_tenant_admin/01_home/02_quick_action_button/01_quick_action_menu`) heads the surface with **its
own bar carrying a close X**, and a route gets the shared `<TopBar />`, whose leading control is a
back chevron with no close affordance in it. The Site Worker's own mockup draws the same X. A modal
is what carries a bar like that, so it is one — the `/quick-actions` route was deleted with the
change, along with its `href: null` and its breadcrumb.

The bar matches the reference piece for piece: brand left, then the sync pill and the close button
right. It is dark on both themes, as the admin overlay is — an overlay is not the page beneath it.

**The cards are [`<QuickActionRow />`](../../../apps/mobile/src/components/QuickActionRow.tsx), the
project's quick-action button** (product-owner decision 2026-08-09: match the Tenant Admin menu,
`04-tenant-admin/01-Home/02-ta-quick-action.png`). One anatomy wherever a menu offers something to do — a
coloured left accent strip, a tinted rounded-square icon plate, a title, an uppercase subtitle saying
what the action does, and a trailing glyph.

It was the admin overlay's private `ActionCard` until this change; two menus offering the same kind
of thing were drawing it two different ways, which is what made it worth a component rather than a
copy. **The accent is per-action, not decoration** — the caller's way of saying which of its actions
are alike (the admin menu tints identity blue, integrations cyan, sync amber; this one tints the
urgent action red, the protective one green, the routine one accent). Callers pass a palette colour,
never a hex, so §32.7's no-hex-at-the-call-site rule holds and the accents follow the theme.

`variant="dark"` exists for hosts that stay dark whatever the user's theme. Both quick-action menus
are such hosts, so both pass it; the prop earns its keep the first time the row is used on an
ordinary screen. Same idiom as
`<ProjectPicker />`, `<Avatar />` and `<LoadingBoundary />`. The admin overlay's **AI report card is
deliberately NOT one of these** — it carries a description and its own CTA — but it keeps the same
48px plate, because the two sit in one list and a different size would read as a mistake.

**The `SYNCED` pill is [`<OverlaySyncPill />`](../../../apps/mobile/src/components/OverlaySyncPill.tsx)**,
extracted from the admin overlay in the same change for the same reason as the row: the second copy
is where a screen's private detail becomes a component. It is NOT `<SyncPill />` — that one lives in
the shared TopBar and is glyph-only, because a word would crowd a row that also holds the brand and
two icon buttons (PO 2026-08-04). A full-screen overlay has its own bar with room to spare, and both
quick-action mockups draw the word. Same four states, same precedence, same source: error > syncing >
pending > synced, where offline is not a state but a producer of pending — and since 2026-08-20 that
is enforced rather than asserted, because both pills read
[`useSyncPillView`](../../../apps/mobile/src/hooks/useSyncPillView.ts) and only the presentation is
each pill's own.

**SYNCED draws `cloud-done`, not the mockup's tick** (PO 2026-08-06, reaffirmed 2026-08-20). This pill
had drawn `check-circle` since it was extracted, following `01_quick_action_menu`'s `✓ SYNCED`, while
the top bar, the navigation drawer and the sync queue all drew the cloud. One state may not have two
glyphs — that is the whole of the original decision — and the cloud also says WHERE the work is, on
the server, which a tick leaves open. A mockup is authoritative for style, not for what a symbol
means (ADR-085).

A screen rather than a modal or bottom sheet: the mockup draws it as a full page with its own top
bar, §32.7 keeps modals for things that interrupt, and being a route gives it a breadcrumb and a back
chevron for free.

### Team directory — [`04-Directory/01-sw-directory.png`](05-site-worker/04-Directory/01-sw-directory.png)

The project crew as a contact list (mockup `04_directory/01_sw_worker_list`), added by the 2026-08-08
restructure. **The role's fourth tab** as of 2026-08-09. Every other role that can read it still
reaches it from the navigation drawer, which is why `NavigationDrawer` keeps the link for them and
drops it here — a drawer entry beside a tab is a second door onto one screen.

Everything on the card is real. `GET /projects/{id}/workforce/directory` (added the same day) is one
server-side join over `project_workforce` + `workers` + today's attendance — one request per project,
not one per worker, because a card-by-card fetch would be N+1 on site 3G (§17.7). **No migration was
needed**: `workforce.workers` already carried `full_name`, `trade_type` and `contact_phone`, and
`attendance_logs` already carried `check_in_at` / `check_out_at`.

- **`On site` is derived, never stored** — the worker's latest attendance row for TODAY, on THIS
  project, checked in and not yet checked out. Both predicates are asserted in the repository spec
  against the SQL text, because they live in the query: drop `date_trunc` and yesterday's check-in
  marks someone present; drop the project match and someone on another site does. A worker with no
  row today reads `false`, never null — "no record of them arriving" and "they have left" are the
  same fact to somebody looking for them.
- `1 of 4 on site` and the green left strip are the real counts for the seeded crew. The seed gained
  one OPEN check-in per project on 2026-08-08; before that every seeded row was a finished past day,
  which made the flag false for everyone and left this screen unable to show the state it exists for.
- **Not offline-cached, deliberately.** §17.4 does not list a directory among the offline reads, and
  the value this adds over a phone's own contacts is `on_site` — true only as of the fetch. A cached
  copy would assert that someone is standing on site with no way for the reader to judge how stale
  the claim is. Offline it says so.
- **Both card actions are drawn** as the mockup's 40px filled discs (product-owner decision
  2026-08-09). **Calling is real** — `tel:` via `Linking`, disabled when the worker has no
  `contact_phone`, which the column allows. **Chat reports that it is unavailable**, the treatment
  already used for START SCAN and ADJUST SCHEDULE: this product has no chat at all — no route, no
  backend module, no API spec — so the button says so rather than opening nothing or appearing to
  send. The call disc carries a hairline border because the mockup's `bg-surface-bright` has no token
  here and `elevated` sits within a few points of `surface`, so the disc was invisible on the card.
- **The cards are spaced, not flush.** They render inside `<LoadingBoundary />`, so they are one
  child of the page and the page's own `gap` never reached them — the gap moved onto a wrapper.
- The avatar is a **filled, outlined disc**. On the dark palette `elevated` sits close enough to
  `surface` that an unbordered circle vanished and the initials read as loose letters beside the
  name. A person glyph stands in when a name yields no initials, so the shape is never empty.

### Navigation drawer — the profile — [`05-Drawer/01-sw-drawer-profile.png`](05-site-worker/05-Drawer/01-sw-drawer-profile.png)

**THE DRAWER IS THE PROFILE** (product-owner decision 2026-08-09). There is no `/profile` route: the
screen was deleted, and identity now lives in the panel the top-bar avatar opens — avatar, name,
role, user id — over the field-tool links, a **Settings** row, and LOG OUT.

The account sections rendered INLINE here for one build, and that was the first shape of the ruling.
It put ~900px of a 2400px panel below the fold and made one surface carry two different kinds of
thing — navigation (go somewhere) and settings (change something) — with the fixed LOG OUT footer
slicing the PREFERENCES card in half at rest. They moved to their own screen on the same day; the
mockups split them the same way, the tenant-admin drawer drawing being Field Tools + Settings +
Logout and `05_profile/01_sw_account_settings` a full screen.

### Account settings — [`05-Drawer/02-sw-account-settings.png`](05-site-worker/05-Drawer/02-sw-account-settings.png)

[`app/(app)/account-settings.tsx`](<../../../apps/mobile/src/app/(app)/account-settings.tsx>), pushed
from the drawer's Settings row. **Not `system-settings`** — that is the Tenant Admin tab for
tenant-wide configuration; this is the signed-in user's own account, on every role.

This supersedes the 2026-08-04 ruling that Profile is "reached from the top-bar avatar, not a fifth
tab" — the avatar still opens it, but what opens is the drawer rather than a screen. The rows are
mockup `05_profile/01_sw_account_settings`: **MFA** (behind the same feature flag as before), biometric
unlock, language, notifications, dark mode, the **app version** and the **legal link**.

- The version is the REAL build number from `app.json`, read the way the login footer reads it. The
  mockup prints `2.4.0-stable`; that is a drawing, and a version a user might quote in a support
  request is the one thing here that must never be decorative.
- **"Change Secure PIN" is not built.** This product has no PIN — device unlock is biometric (the row
  above it), and inventing a second credential would be a security feature with no backend, no
  recovery path and no spec.
- **Laid out to mockup `05_profile/01_sw_account_settings`**: an uppercase section label over a bordered
  card, and inside it hairline-separated rows that all share one anatomy — leading icon, label, then
  a value, a value + chevron, or a switch. `<Row />` is the only row the file knows how to draw, so
  the regularity that is the point of the drawing cannot drift.
- The identity card the first drawer build drew was removed as a DUPLICATE: the header already shows
  the avatar, name and role. Only the **user id** moved up into it, rendered `User ID: 39E837EB` in a
  monospaced face — an id is read character by character, and a proportional face makes 0/O and 1/l
  ambiguous exactly where it matters. The mockup's own `SW-9281` is an employee-code scheme this
  product does not mint (`user_id` is a UUID), so
  [`shortId()`](../../../apps/mobile/src/lib/shortId.ts) renders the real one at a readable length —
  product-owner decision 2026-08-09, "use a short UUID for now". It is a display aid, never a key.
- **Three drawer links became rows**: MFA, Notification alerts and Legal & Privacy Policy are where
  the mockup puts them, and keeping the links too would have been three duplicate doors in one panel.
- **SECURITY carries the mockup's three rows.** `Multi-Factor Auth` is now drawn whatever the
  `EXPO_PUBLIC_FF_S1_AUTH_MFA_ENROLLMENT` flag says — hiding it left the section a single toggle and
  made a documented feature look absent; the flag decides where tapping it goes, the enrolment screen
  or a plain "not available yet". `Change Secure PIN` is drawn and reports the same, because **this
  product has no PIN**: device unlock is the biometric row above it, and there is no PIN column, no
  set/verify endpoint and no recovery path. A credential dialog with nothing behind it would be a
  security feature in name only.
- **`Biometric Login`**, the mockup's wording, and **no explanatory line under it** — the drawn row is
  a label and a switch. When the device cannot do it the switch is simply disabled; the OS is where a
  biometric gets enrolled, and this row is not the place to teach that.
- **No dividers between rows.** The mockup does draw them, at `border-outline-variant/10` — ten
  percent opacity, invisible at this size — while ours were full-strength hairlines that read as a
  table. The card's own border does the grouping.
- The **logout button was dropped from the account block** for the same reason — the drawer has one
  in its footer, and two in one panel is one too many.
- The former screen was also the **last one pinned to the light token set**, the same defect Home
  had one screen earlier: a white page between a dark top bar and a dark nav, unnoticed while
  nothing linked to it. It resolves its stylesheet through `usePalette()` now. The biometric row was
  stacked in the same pass — its unavailable-state message is a full sentence, and side by side it
  ran off the screen edge.

> **`e2e/capture.spec.ts` lost its `profile` route with the screen**, so the flat app-screen set is
> one shorter. Nothing else deep-linked `cos:///profile`.

### Tasks — [`02-Tasks/01-sw-tasks.png`](05-site-worker/02-Tasks/01-sw-tasks.png)

> **THE WHOLE CARD CARRIES THE VERDICT** (PO 2026-08-11): where the badge reads `! CRITICAL` the
> left accent and the progress bar are red with it, where it reads a softer band they are yellow.
> They used to disagree — a red badge above a yellow bar is two verdicts on one row. §15.4's four
> bands collapse onto the palette's two act-now tones: HIGH and CRITICAL are danger, MEDIUM and LOW
> are warning. LOW previously took `muted`, the same grey an untouched task wears, so a task one day
> late was drawn as a task with nothing wrong with it.
>
> **THE SEEDED DEADLINES MOVED WITH IT.** They used to hang off each project's start date, months
> behind whatever day the demo ran, so `delaySeverity` — working correctly — banded all 25 tasks
> CRITICAL and the screen was a wall of red that could not demonstrate the bands it was showing.
> `seed-realistic.ts` now anchors `planned_end` to TODAY and shifts it per project, giving roughly
> 2 CRITICAL · 3 HIGH · 2 MEDIUM · 1 LOW and seven not late at all — the last of those fall back to
> the status badge, which is why the card has both. The dates are re-stamped on every seed run, so a
> demo a month from now still shows the spread.
>
> **THE ONLY SCREEN IN THE SET WITH A STICKY HEADER**, and it broke the stitcher twice over. The
> project bar and the filter chips are pinned above a `FlatList`, and the scroll measurement — which
> matches the top of each shot against the one before it — locked onto those unmoving rows, reported
> `scroll~0` six times, and wrote **a single viewport out as though it were the whole page**. Two
> committed captures said "แสดงไม่เต็มหน้าจอ" for that reason and neither was a rendering fault.
> `stitch-fullpage.py` takes `--sticky N` now; the capture script measures `N` from the list's own
> top edge on the device rather than hard-coding it, because the bar grows with a two-line name.
> The stitched page is ~6,950px — all 25 tasks, not the three above the fold.

A **child screen of Home**, so it opens with the `HOME › TASKS` breadcrumb and a back chevron.
Filter chips with **real counts** (`All (25) · Pending (5) · In progress (10) · Done`), and one
card per task: a coloured left accent, an `ID: #…` eyebrow, the trade badge, percent + sync chip, the
planned window, and a progress bar. Swipe-right marks a task done (§17.5 Max-wins); the card taps
through to the progress editor. The mockup's **AI Insight** card sits between the cards and its
**floating voice FAB** sits over them, both added 2026-08-08.

Everything is live, never fabricated. The IDs (`#80AD3112`, `#7E519143`) are the last block of each
real `task_id`; the badges (`FOUNDATION`, `STRUCTURE`) are `projects.tasks.work_type`; the percentages
are the stored `progress_percent`. Three mockup elements are **dropped for want of data**:

- The **HIGH / MEDIUM priority badge** — there is no priority anywhere: not in `projects.tasks`, not in
  any migration, not in `schema.prisma`, not in spec 11, not in the API. The badge slot is kept and
  filled with the trade, which the row actually carries. Re-checked and **reaffirmed by the product
  owner on 2026-08-08** ("คงไว้แบบเดิม") after the option of adding a real `priority` column was put to
  them — so this is a decision, not an omission waiting to be fixed.
- **"08:00 - 12:00"** — `planned_start` / `planned_end` are DATEs; there is no time-of-day anywhere, so
  the chip shows the real planned window in days (rendered through `formatDate`, so Thai gets the
  Buddhist era — QM-3). The mockup's own second card puts "Pending Sync" in that same slot, so a status
  value there is its own idiom.
  The **"AI Insight"** card **is** drawn — copy, the 15-minute figure and all (PO decision 2026-08-08,
  reversing an earlier call to drop it, and consistent with the report's AI bar and the safety screen's
  AI Safety Scan). DelayForecastModel is Phase 23 and untrained (§22.6), so the card states the mockup's
  example rather than a computed forecast: it is static, nothing reads it, and no task field is derived
  from it. It sits **between** task cards — anchored to the second, or to the last one on a shorter
  list — as the mockup slots it, and does not render at all when there are no tasks. Its **"Reschedule
  automatically"** action does not reschedule anything: auto-schedule generation is post-MVP Layer B/C
  and §22.3 requires it to run through Temporal **with a human-in-the-loop step**, so the button reports
  that the feature is not available instead of acting.

The mockup's **floating voice FAB** is
[`<VoiceCommandFab />`](../../../apps/mobile/src/components/VoiceCommandFab.tsx) — the ADR-073
component already built for the Site Engineer home, not a second voice behaviour invented for this
screen: hold to record → transcribe → classify intent → route to a real screen, with a message rather
than a guessed action when the intent is unsupported. A plain black drop shadow separates it from
the cards it floats over — Material elevation, never a coloured glow, since FAB glow stays
§32.7-prohibited. A ring of page background was added underneath it on 2026-08-08, to keep it apart
from the **Update progress** buttons that share its blue; it was removed on 2026-08-09 because it
read as a thick border the mockup does not draw, which sets `shadow-2xl` on a bare `rounded-full`.

> `work_type`, `planned_start` and `planned_end` were already being sent by `/sync/delta` (it selects
> the whole row) and simply discarded by the client. Local DDL v4 caches them.

### Issues — [`01-Home/03-sw-report-issue.png`](05-site-worker/01-Home/03-sw-report-issue.png)

Camera-first, as the mockup draws it: the live viewfinder, then category, a hold-to-record voice note,
ONE text field, and **REPORT ISSUE**. Nothing follows that button — the screen ends there, as the
mockup does.

**One text field, not two** (product-owner decision 2026-08-09, matching the drawing). There was a
title input above the description; both are now the single field the mockup shows. `title` is
`NOT NULL` and capped at 255 by `CreateIssueDto`, and it is what every list, notification and
escalation displays — so the field's first 255 characters become the title and anything past that
stays in `description`, which is unbounded. Nothing is dropped and nothing is truncated silently.
Its placeholder changed with its role: it read "(optional)" while being the one field REPORT ISSUE
waits for.

**The voice button is 80px here**, not the 56px project standard — `w-20 h-20 rounded-full` is what
this mockup draws, and in a panel of its own the button IS the point rather than an accessory
floating over a list. `<VoiceNoteButton />` took a `fabSize` prop for it, and its corner radius
became the 999 capsule marker in the same change: a fixed 28 stops being a circle the moment a caller
passes any other diameter.

- **The category chips are the four REAL values of `site_ops.issues.issue_type`** — Defect, Rework,
  Punch item, General — not the mockup's Safety / Material / Technical / Blocker, which match no column,
  no enum and no API field (PO decision 2026-08-08: use the real values). These are the same four the
  task-completion gate reads (master §Phase 6 gate #2), so classifying here feeds the gate that blocks
  the task. The column has existed since migration `20260619000002`; `POST /site/issues` had no field
  for it, so every issue created through the API silently took the default `GENERAL`.
- The mockup's in-frame **"AI Suggestion: Safety Issue detected in frame"** is dropped —
  SafetyVisionModel is Phase 23 and needs 10,000+ labelled site photos (§22.6).
- **The photo zone and the voice zone are drawn the way the mockup draws them** (PO decision
  2026-08-08). `<PhotoCapture layout="viewfinder" />` is a 4:3 preview with an inset guide, a LIVE
  pill and a round shutter **on** the frame; the voice zone is a dashed panel with the mic centred in
  it and the hold-to-record line beneath. The mic glyph is the same `MaterialIcons` `mic` the Site
  Engineer Home FAB uses — the project standard since 2026-08-08, replacing a 🎙️ emoji that rendered in
  the system font and could never take the button's tint.
- **The issue list under REPORT ISSUE is gone for this role** (PO decision 2026-08-08 — "โซนด้านล่าง
  ของปุ่ม REPORT ISSUE คืออะไร ตัดออก"), which restores the mockup's capture-only shape. It is
  **not deleted**: `SITE_ENGINEER` shares this route, its own mockups draw the list
  (`03_site_engineer/02_issues/02_se_issue_dashboard` — renamed from `site_issues/issue_list` in the
  2026-08-12 restructure; its companion `…/escalate_issue_to_manager` was deleted there with no
  successor drawing, which per ADR-085 withdraws a drawing, not the capability), and this screen was
  the only place **G-M12** (escalate → PM) reached MOBILE — removing it outright would have taken a
  deliverable off the platform the field uses. So it is role-scoped, not dropped. (G-M12 itself never
  left the product: `apps/web` has its own escalate control. This sentence read "the only place G-M12
  exists in the app" until 2026-08-16, which was wrong — it is the only place on mobile.) A worker
  who needs sync state has the global sync indicator and the Sync Queue screen.

### Daily report — [`01-Home/04-sw-daily-report.png`](05-site-worker/01-Home/04-sw-daily-report.png)

The daily-entry form: the AI suggestion bar, manpower, shift, the per-trade breakdown, blockers,
photos, and **SAVE AS DRAFT / SUBMIT REPORT** — which are the row's real `status` values
(`DRAFT` / `SUBMITTED`), not two styles of one action.

**The free-text summary field is gone** (product-owner decision 2026-08-09): the mockup has none, and
this report's content is the structured manpower, shift and blockers below it.
`site_ops.site_reports.summary` is nullable, so nothing downstream needed it — it is sent as `null`,
and a project is now the only thing SAVE/SUBMIT waits for. The voice button went with the field it
dictated into; the blockers box is the screen's remaining free text.

**Manpower is typed, not only tapped** (PO decision 2026-08-08). The total is a numeric field — a crew
of 24 was 24 taps before — and each trade row puts its number **between** its − and + buttons, editable
the same way. The unit word is gone: the section is headed Manpower and every row is a headcount, so
"คน" repeated five times said nothing. The breakdown panel is **dimmed and inert until a total is
entered** — there is nothing to apportion before that, and the empty rows invited a breakdown that
contradicted a total nobody had given yet.

**Photos follow the mockup's ภาพประกอบ strip**: `<PhotoCapture layout="strip" />` — a horizontal row of
120px thumbnails ending in a dashed **UPLOAD** tile, with the camera opening only when that tile is
tapped rather than sitting live on the form. The camera permission is requested at that tap, not on
mount. The 3-column grid stays the default for the screens where the photos **are** the record
(deliveries, inspections). The voice mic is now a round FAB floating **inside** the work-progress
field, not a full-width bar under it — in the corner of the input it reads as "speak this field".

**Three mockup fields had nowhere to land, and were given a backend rather than dropped** (PO decision
2026-08-08):

| Field               | Where it now lives                                                          |
| ------------------- | --------------------------------------------------------------------------- |
| Shift (Day / Night) | `site_ops.site_reports.shift` — migration `20260808000001`, nullable (QM-9) |
| Blocker category    | `site_ops.site_reports.blocker_category` — same migration                   |
| Per-trade manpower  | `site_ops.manpower_logs` — the table existed since Phase 6 with **no API**  |

`POST /site/reports` now accepts `shift`, `blocker_category` and `manpower_lines[]`;
`GET /site/reports/{id}` returns the breakdown back. NULL means "not recorded" and is never defaulted
to `DAY` — no pre-existing report can be backfilled, because nothing anywhere records which shift a
past report covered. The free-text `blockers` column is untouched: the category is a queryable axis
over the operator's own words, not a replacement for them.

The mockup's **"AI แนะนำ: คาดว่างานติดตั้งจะเสร็จภายใน 18:00 น."** banner **is drawn**, copy and all
(PO decision 2026-08-08, reversing the same day's earlier call to drop it). DelayForecastModel is
Phase 23 and untrained (§22.6), so the line is the mockup's illustration of the feature rather than a
computed forecast: it is static, nothing reads it, and no field of the report is derived from it.

### Safety checklist — [`03-Safety/01-sw-safety-checklist.png`](05-site-worker/03-Safety/01-sw-safety-checklist.png)

The pre-shift daily verification: the **DAILY SAFETY VERIFICATION — n/total** counter, the project
picker, the checklist filter chips, the **AI Safety Scan** module, the items with checkboxes grouped
under their checklist, **DIGITAL AUTHORIZATION**, and **CONFIRM SAFETY** — disabled until every item
is ticked, because a partially completed safety attestation asserts something untrue.

**The counter is the screen's status line** and took the project picker's "Project" heading on
2026-08-09 (product-owner decision). It was buried under the AI panel, though the thing it counts is
the whole point of the screen — and the mockup opens on a status line of its own
("Site: … | Shift: Day"). The chips still name the selected project, so the heading was labelling
what they already showed. It is uppercased by STYLE, not by `toUpperCase()`: Thai has no case, so
that call would be a no-op there while shouting in English. It stays hidden until a checklist has
loaded — `0/0` before a project is picked would be a count of nothing.

**The filter chips lead with `All (n)`** and carry each checklist's real item count — `All (9) ·
Foundation (2) · Concrete Pour (2) · Safety Walkthrough (3) · MEP Rough-in (2)`. `All` is not a view
filter but a working mode: every item from every checklist is ticked on one page and submitted in one
action, which then writes **one inspection per checklist** (PO decision 2026-08-08 — a worker doing a
pre-shift walk does it once, not four times). The trailing word "Inspection" is stripped at display
time only; the stored `checklist_name` is untouched.

- **The role could not submit this at all until 2026-08-08.** `POST /safety/checklists` was
  `@Roles(SITE_ENGINEER, SAFETY_OFFICER, TENANT_ADMIN)`, and `sync-authz.ts` recorded the reason as an
  explicit **unresolved spec conflict** — §6.8 grants SITE_WORKER `RW` on Safety, §14 lists neither
  Safety route for it. [ADR-089](../../architecture/adr/089-site-worker-may-submit-safety-checklists.md)
  resolves it by splitting the module: the worker may submit a **checklist** (their own pre-shift act),
  but still may not file an **incident** (§14 unchanged). The offline path matches, so a checklist
  filled with no signal syncs rather than failing at the end of a shift.
- **The checklist templates were also missing from the seed.** `seed-realistic.ts` inserted inspections
  against `uid('chk/…')` and commented that they ran "against seeded checklists", but never wrote a row
  to `site_ops.safety_checklists` — so `GET /safety/checklists` returned `[]` on a fully seeded database
  and this screen had nothing to render. Four templates per project are now seeded, including the
  three-item Safety Walkthrough the mockup draws.
- **A checklist picker** appears when a project has more than one. The mockup shows a single checklist
  because it was drawn against a single-project fixture; a real worker on five projects gets four
  templates each, so the screen cannot silently pick one.
- **The AI Safety Scan module is drawn**, mockup copy included (PO decision 2026-08-08, reversing the
  same day's earlier call). SafetyVisionModel is Phase 23 and needs 10,000+ labelled site photos
  (§22.6), so **START SCAN** says so plainly rather than pretending to scan, and it gates nothing on
  this screen.
- **The signature pad is real and its strokes are stored.** Migration `20260808000002` adds
  `site_ops.inspections.signature` (JSONB, nullable, with a rollback — QM-9); the pad reuses the
  ADR-056 drawing machinery, so a mark is `[{ d, color, width }]` with `d` an SVG path in **normalised
  0..1 coordinates** — a few hundred bytes on a sync batch that flushes over site 3G, and re-renderable
  at any pad size. `POST /safety/checklists` accepts it (max 200 strokes) and attaches it to every
  inspection the confirmation creates. It is an **attestation mark, not a qualified e-signature**: no
  PKI, no non-repudiation, and the authoritative attribution stays the row's `inspected_by` /
  `inspected_at`, set server-side from the session. Contract e-signature is ADR-058's separate PKI/VC
  mechanism and must not be confused with this. The stored mark is RESTRICTED personal data (PDPA) —
  see the migration's own comment.

All seven are captured by
[`apps/mobile/scripts/capture-android-site-worker.mjs`](../../../apps/mobile/scripts/capture-android-site-worker.mjs)
(`node scripts/capture-android-site-worker.mjs`) — adb/uiautomator only, same reasoning as its siblings.
It grants `android.permission.CAMERA` after `pm clear` (the Issues screen is camera-first; without it
the capture would document a permission prompt), picks a project where the screen needs one, reaches
each screen the way a worker does — Tasks and Directory from their tabs, Issues and the daily Report
from the Home FAB's quick-action menu, the drawer from the avatar — and asserts real CONTENT before
saving: both Home stat tiles, at least one task card, at least one crew card, at least one checklist
item. An empty state cannot be committed as though it were the feature. Quick actions is a single
viewport — it is an overlay, so it never scrolls — and the rest are full-page stitches
(`apps/mobile/scripts/stitch-fullpage.py`).

**`--only <substring>` narrows a run to the screens whose name matches**, repeatable, so a one-screen
change costs one screen's worth of time rather than eight (product-owner request 2026-08-09):

```bash
node scripts/capture-android-site-worker.mjs --only 02-sw-account-settings
```

Every step opens its own screen from the shell rather than inheriting state from the step before it,
because `--only` can run any one of them alone. With no flag, all seven are captured — which is what
a full refresh wants.

> **One Hermes bug was found and fixed while capturing this set.** The first daily-report capture read
> `Structural{count, plural, one {# worker} other {# workers}}` — the raw ICU template. Hermes ships a
> partial `Intl` with **no `PluralRules` and no `Locale`**, so every `{count, plural, …}` message threw
> inside `formatIcu()` and fell into its catch, which returns the template unformatted. Three older
> strings (pending changes, unresolved conflicts, queued photos) had been doing this unnoticed; Node and
> jest both have full ICU, so no unit test could see it. `translate.ts` now installs the `@formatjs`
> polyfills in dependency order (getCanonicalLocales → Locale → PluralRules — PluralRules resolves its
> locale through a matcher that constructs `new Intl.Locale`, so adding it alone only moved the throw),
> and `i18n/__tests__/pluralPolyfill.spec.ts` reads the source to keep them imported and ordered.

## Executive — four tabs, seven screens — [`08-executive/`](08-executive/)

Captured 2026-09-07 against the seeded `EKACHAI` tenant through a real Path A (SMS OTP) login as
`+66811000001`, Wichai Ekachai.

**Every element these drawings carry is now on the screens** (standing instruction, 2026-09-07):
where this codebase has no process behind one, the code says COMING SOON in a comment — never on
the screen — and an ACTION with nothing behind it shows a "coming soon" dialog when it is pressed.
One category is still left out, and it is the same one ADR-099 carves out: a claim about WHICH
SYSTEMS produced a report. `SOURCES: BIM & ERP DATA` and the risk card's `BIM + Site Logs` chip name
integrations that do not exist, and a false provenance line changes how much of a screen a reader
believes rather than being wrong about one quantity.

**The bar has changed twice in three days**, both times because the product owner replaced the
drawings the role is built from, and the folder is laid out to match the latest one:

| Until 2026-09-05                      | 2026-09-05 (ADR-098)           | From 2026-09-07                       |
| ------------------------------------- | ------------------------------ | ------------------------------------- |
| `Home · Portfolio · Alerts · Reports` | `Home · Tasks · Safety · More` | `Home · Alerts · Portfolio · Reports` |

It is **not** the first bar restored — Alerts and Portfolio have swapped places. Safety and More kept
their screens and are reached from the navigation drawer (product-owner decision), which is why they
are photographed under [`06-Off-bar/`](08-executive/06-Off-bar/) rather than under a tab number they
no longer own. **`/tasks` is no longer an EXECUTIVE page at all**: its screen is the Alerts tab now
(see below), and the role left the derived Tasks drawer row so one screen is not offered under two
names.

> **Some figures in this folder did not come from the backend, and this is the only folder where
> that is true.** Nineteen of them, listed in
> [ADR-099](../../architecture/adr/099-mockup-figures-without-a-data-source.md) and held in one
> module (`apps/mobile/src/lib/mockupFigures.ts`): the compliance percentage and its grade, safe
> man-hours, the six-month trend, the per-project safety score, the "+2 this month" delta, the
> per-project sync chip, the Active Region caption, the portfolio health score, each project card's
> contract number and location, three of its four health pillars, its index, the Report brief's
> three metrics and its PDF button. This platform computes none of them —
> `GET /safety/compliance` returns four counts and no percentage, `finance.contracts` has no
> contract-number column, and a project carries no coordinates. **Everything else below is live**,
> and each screen says which is which.

### Home — [`01-Home/01-ex-home-dashboard.png`](08-executive/01-Home/01-ex-home-dashboard.png)

Every money figure is real and reconciles against Postgres:

| On screen                          | Where it comes from                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `PORTFOLIO BUDGET ฿ 1,213 M`       | Σ `projects.budget_amount` over the executive's five active projects — ฿1,213,000,000       |
| `ACTUAL: ฿ 929.26 M`               | Σ `finance.cost_transactions.amount` over the same five                                     |
| `REMAINING: 23.4%`                 | derived from the two above, in `decimal.js`                                                 |
| `RISKS 5 · 2 critical • 3 warning` | `/analytics/executive` rows through `executiveSeverityOf`                                   |
| `ACTIVE 5`                         | `local_projects` where status = ACTIVE, the offline cache                                   |
| per-project `VARIANCE`             | actual − budget per row; Ladprao `฿1,624,218` and Bangna `฿28,682,356` are genuine overruns |

**The budget bar has TWO segments now** (product-owner decision 2026-09-07, from the replacement
drawing). It was a single accent fill sized to the REMAINING share, which is ambiguous in the way
that matters: a filled bar reads as consumed, so a portfolio with 23.4% left LOOKED 23.4% spent. The
track is now split — accent for what is spent, a dimmed blue remainder — and the pair always fills it
exactly. When there is no budget to divide by the track stays **empty**: both readings of a drawn bar
would be a claim the data does not support.

**The AI card's footer is at the FOOT of the card** (PO 2026-09-07). It used to sit above the two
buttons, which put a provenance note in the middle of the card and left the controls hanging off the
bottom edge; the drawing has it last, under a divider. It is clamped to **one line with an ellipsis**
on this variant only — a long project name wrapped it onto two rows and pushed the card taller than
the drawing's. The other AI panels keep wrapping: their source line is body-sized rather than a caps
footer, and truncating a name a manager is reading to identify a project is a worse trade there.

**The project cards moved their status tag to the VARIANCE row** (PO 2026-09-07), hard against the
trailing edge, and **squared its corners**. On the title row the tag sat between the project name and
the chevron and squeezed the name, which is the longest string on the card and the one a reader is
scanning for. The squared corner is a deliberate exception to §32.7's "every status pill takes
radius.xl" — the drawing writes `rounded`, which its own Tailwind config maps to 4px, and the
exception is recorded in `theme/__tests__/badgeRadius.spec.ts`'s `NOT_BADGES` table rather than
waved through in code, so the platform ruling still binds every badge it was not overruled for.

**VARIANCE is spaced between the symbol and the figure** — `-฿ 47,758,122.00` (PO 2026-09-07). The
card sits under a hero that has been spaced since 2026-08-10 and the two disagreed. `formatMoney`
itself is untouched: it is behind every money figure in the product, and widening it there would
move all of them; `lib/compactMoney.ts` gained `spacedMoney()` for the surfaces that ask.

**The AI card gained a `SOURCES:` footer, and it does not say what the drawing says.** The drawing
writes `SOURCES: BIM & ERP DATA`. BIM is a Type A stub (§32.9) and there is no ERP integration, so
that line would tell an executive the report above it is grounded in two enterprise systems that are
not connected. A wrong number is wrong about one quantity; a false source is wrong about how much of
the screen to believe — which is why ADR-099's amendment draws the line there and this footer names
the source the panel CAN name, the project the report was produced for. `<ExecRiskAlerts />` reached
the same conclusion about the same drawing's "BIM + Site Logs" chip two days earlier.

**The card also gained a `CONF: NN%` chip**, and this is the ONE panel in the product where the
confidence NUMBER leads instead of the band word. `lib/aiConfidence.ts` records why every other
surface leads with the band (Google PAIR: a bare percentage assumes the reader understands
probability); the drawing puts `✓ CONF: 94%` on this header, so here the band is carried by the
chip's tone and its glyph — a tick in success green only at HIGH, an `error-outline` in warning or
danger otherwise — and the band WORD still prints whenever there is no number to print. **It is not
in this capture**: the AI gateway would not serve a report on this machine (see the note at the foot
of this section), so the card carries no confidence to show.

`+2 this month` and `ACTIVE REGION / Southeast Asia Sector` are mockup figures. `MITIGATION` and
`DISMISS` sit INSIDE the AI card, where the drawing puts them, and say so on tap: neither has an
endpoint, and master §Phase 10 makes this role read-only on mobile.

Everything the five instructions of 2026-09-07 settled is unchanged and visible here — the chevrons
centred at each tile's trailing edge, the tiles reading `ACTIVE` and `RISKS` with the glyph first,
the plain counts, and the `M` cap that keeps the hero and its ACTUAL line in one unit.

### Alerts — [`02-Alerts/01-ex-alerts.png`](08-executive/02-Alerts/01-ex-alerts.png)

**This tab is the portfolio TASK ROLL-UP, and that is a reversal.** Earlier the same day the tab
pointed at the risk feed, because §20.7.1 defines `/alerts` in exactly those words — "delay risk,
budget overrun, critical issues sorted by severity" — and an escalation resolved the name clash in
the specification's favour.

Then the drawing was measured. `02_alerts/02_ex_alerts/code.html` is the previous
`02_tasks/02_ex_tasks/code.html` with **four lines changed** — the four labels in its `<nav>` — and a
byte-identical body. Diff the two blobs either side of commit `a23b385b` and that is the whole
difference. So the drawing behind the tab named "Alerts" draws overdue / due-this-week / blocked, the
AI delay-risk feed, and the critical path. The product owner chose the drawing, directed that the
risk feed be deleted, and §20.7.1, §32.7, the Phase 10 EXEC block and ADR-098 were amended in the
same commit.

**The risk feed is gone from the product**, and that is worth stating plainly rather than leaving to
be discovered: nothing else lists projects by severity. Home's RISKS tile counts them and the
Portfolio screen bands its cards by the same rule, but neither is the list. Bringing it back is a new
page, not a revert — no file still holds it.

Everything in the frame is live: `OVERDUE 11` and `THIS WEEK 3` from `GET /tasks/portfolio-summary`,
one tenant-wide query; the critical path from `GET /tasks/portfolio-critical-path`, a forward and
backward pass over `projects.task_dependencies` (ADR-097 built the table for this screen). The risk
section calls the real `POST /ai/reports/delay-risk` and says so when it gets nothing back — which is
what this machine produces, for the reason at the foot of this section.

**The risk cards are the drawing's card in full since 2026-09-07** — severity chip, category chip,
per-card confidence, and the finding as the drawing's bold title. Three notes on what each is:

- **The confidence is the report's own, and it is the SAME number on every card**, because
  `DelayRiskOutput` carries one for the whole report. It moved here from the section header, where
  the drawing has no such chip; printed in both places it read as two different measurements. The
  footnote under the feed now says the level _and_ the number are shared.
- **The category chip is drawn** (`RISK_ALERT_CATEGORIES`, ADR-099's third amendment). `risk_factors`
  is a list of bare strings with no field to carry a category, and classifying the text here would be
  this screen labelling a finding the model did not label. It is the first drawn value in this
  product to sit INSIDE a card of real model output, so the carve-out is written narrowly: a drawn
  LABEL, never a drawn confidence and never a drawn finding.
- **It is not the drawing's "BIM + Site Logs".** That names SYSTEMS, and a claim about which systems
  produced a report is the one category these screens keep out. The drawing's own second card carries
  a subject instead — "Supply Chain" — and that is the shape used.

**The drawing's second body line is not drawn at all.** `risk_factors` gives one string per card, and
writing the second would be composing the model's finding for it.

**The feed is never empty.** It used to render one line — "the report was not produced" — wherever
the gateway said nothing, and the drawing shows a section already full of findings. Where there is no
report, the DRAWING'S OWN two cards stand instead (`RISK_ALERT_FALLBACK`), each with the level and
confidence the drawing gives it. That is what this frame shows: this machine has no LLM key, so the
gateway answers 503 and the drawn cards are what a reader sees.

**They are findings, and that is the furthest this register has gone** — see ADR-099's third
amendment for why it is survivable. It is a FALLBACK, not a source: the moment a real report arrives
every card comes from the model and none of the register is read, and
`components/__tests__/ExecRiskAlerts.spec.tsx` asserts exactly that.

**The risk cards carry the drawing's two action buttons since 2026-09-07.** "View BIM data" has no
system behind it — BIM is a Type A stub (§32.9) — and "Replan urgently" has no endpoint and could not
gain one, since master §Phase 10 makes this role read-only on mobile. Both are drawn and both say so
on tap. They are on EVERY card, where the drawing puts them on the first only: the drawing's second
card is a different severity, not a different card type, and giving one finding buttons and the next
none would read as a claim about which finding is actionable that no field of the report supports.

### Portfolio — [`03-Portfolio/01-ex-portfolio.png`](08-executive/03-Portfolio/01-ex-portfolio.png)

A new drawing (`03_portfolio/01_ex_portfolio`) and a rebuilt screen: what was here before was a list
of names with one badge, in the same static light palette the Alerts feed still uses.

Real: the search box (name and project code), the four filter chips and their counts — `All (6)`,
`Over budget (2)`, `At risk (4)`, `On track (0)` — the risk sort, `Showing 6 of 6`, `TOTAL VALUE
฿ 1,378 M`, `NEEDS ATTENTION 6 · 2 over budget • 4 at risk`, and on every card the name, the status
band, the §32.12 progress, the variance and the budget pillar's utilisation.

**The chips are one row that scrolls**, not a wrapping block (PO 2026-09-07, and the drawing's own
`overflow-x-auto`). Only that row moves — the page keeps its own vertical scroll.

**The status tag shares the title's row**, hard against the chevron, and the project name truncates
rather than letting the tag wrap (PO 2026-09-07). Inside the text block on a wrapping row, a long
name pushed the tag onto a second line and the card grew a row carrying nothing; the first words of a
name identify the project, so truncating it costs less than the row did.

**The cards that are not on track carry an advice strip** (PO 2026-09-07; the drawing puts one on its
CRITICAL card and the instruction extends it to the amber ones). It sits **below the four-cell
matrix**, where the drawing has it: the matrix is what the reader checks, the note is what to do
about it, and the note read first is an instruction before its evidence. Its shape, lead word and
**two tones** follow the drawing — measured off it, not inferred from the card's own colour: the
CRITICAL strip is `bg-mobile-danger/10 border-mobile-danger/30`, and the at-risk one is
`bg-cos-cyan/10 border-cos-cyan/30` with a `bolt` glyph. The red card's glyph is `warning`, not the
drawing's `smart_toy`: that robot marks the line as a model's advice, and there is no model here.

**What it SAYS is derived, not copied**, and that is the one place this departs: the
drawing writes a specific sentence of advice under a `smart_toy` robot glyph, and this screen makes
no AI call at all, so printing one would attribute advice to a model that never ran — which
`lib/mockupFigures.ts` forbids in as many words. The strip names the reason the card is in its band,
read from `executiveSeverityOf` in the same order that rule reads it: over budget, then flagged at
risk, then invoices overdue. An advice engine per project is COMING SOON, recorded in the code at the
element.

**The counts are over EVERY project, never over the filtered list.** A count that changed when you
pressed it would be describing your own filter rather than the portfolio, which is the one thing a
chip labelled with a number must not do.

Three deviations from the drawing, each measured rather than assumed:

- **The fourth chip is not "ahead of schedule".** Nothing in this product measures schedule variance
  per project, so the chip that would have carried it is `On track` instead — the real third band of
  the same rows, which also makes the four chips a partition rather than a set with a gap.
- **`6 projects`, not the drawing's "14 contracts".** No mobile endpoint reads `finance.contracts`,
  and the two numbers are equal only while every project has exactly one contract.
- **A card with no progress figure draws no bar.** §32.12 returns null when no task is linked to a
  BOQ line — Thonglor Park Residences in this frame — and an empty track would read as "no work
  done", which is a different claim.

The contract number, the location, and three of the four health pillars (schedule, safety, quality)
are mockup figures; the budget pillar is real. **Two cards in this frame carry the same contract
number**, because the register holds the drawing's four values and the tenant has six projects — a
visible consequence of drawing an identifier rather than a quantity, and the reason ADR-099's
amendment names `PROJECT_CONTRACT_CODES` as the entry to remove first.

### Report — [`04-Report/01-ex-report.png`](08-executive/04-Report/01-ex-report.png)

`04_report/01_ex_report` is a new drawing of a screen that already existed: the AI executive summary
`/reports` has rendered for this role since Phase 10, as a project picker, a GENERATE button and a
paragraph in the static light palette. **No new route was added for it** — two routes for one screen
is the mistake `dashboard` and `home` made.

**Two of the things the drawing appears to invent turned out to be real**, and that is why they are
not in the register:

- `Strategic recommendations` is `recommendations` on the `EXECUTIVE_SUMMARY` report — the model's
  own advice, and this screen prints all of it rather than the one line a dashboard panel shows
- the CRITICAL row's `AI Flag` is `risk_flags` on the same report, and it appears on ONE row: the
  project the report is about. A flag copied onto every card would attribute a finding to projects
  the model never looked at

Also real: the three tabs and their counts, the worst-first ordering, each row's budget gap and
utilisation, and `Re-analyse`, which is the one control here that does exactly what it says.

Drawn: the three strategic metrics (`฿ 14.2 M` cumulative saving, `96.4%` delivery forecast, `98%`
safety index) and `Export portfolio PDF`, which says so on tap — `lib/dataExport.ts` offers JSON and
CSV for the PDPA subject-access export and nothing renders a portfolio document.

**Four changes on 2026-09-07, all product-owner instructions.** The screen heading and its subtitle
are gone — on a TAB they repeat the label the bar already shows, and the reader arrived here by
pressing the word. The brief card no longer says "AI" in its eyebrow and has lost its second title
line, which said what the eyebrow said in other words; the confidence chip, the source line and the
prose all say what produced this without the word. Each project summary gained the drawing's **Full
report** link — since later the same day a **chevron alone**, because the words wrapped the row onto a
second line and the mark carries the same affordance in the space that was left; its
`accessibilityLabel` still reads "Full report", so a screen reader loses nothing. The status tags are
**squared**, recorded in `NOT_BADGES` like the Home card's.

**`Acknowledge & direct` is disabled until there is a recommendation to acknowledge.** It is a
human-in-the-loop control over the list above it; with none on screen it would offer to acknowledge
nothing. In this frame the AI gateway produced no report, so it is dimmed.

Still left out, each with its reason: a prose summary per row (one metered LLM call per project — the
fan-out `GET /tasks/portfolio-summary` exists to avoid) and the `W47-LIVE` chip (a week number is
computable, "LIVE" is a claim about a feed that does not exist, and half a chip is worse than none).
The **Full report** link and `Acknowledge & direct` are now drawn and say so on tap: there is no
full-report page to open — `/ai/reports/history` returns metadata only, which is also why the panels
regenerate rather than fetch — and no acknowledgement endpoint, nor may there be one while §Phase 10
makes this role read-only.

**One nuance was lost and is recorded rather than hidden.** The screen this replaced told a `503` —
the Phase 11 LLM stub, i.e. "not yet" — apart from a real failure, in different words. This one
reports the shared `insight.failed`, because it now reads its report through the same helpers as the
other five AI surfaces and none of them makes that distinction. Six surfaces that agree about what a
failed report looks like, at the cost of that distinction on one screen.

### Navigation drawer — [`05-Drawer/01-ex-navigation-drawer.png`](08-executive/05-Drawer/01-ex-navigation-drawer.png)

**Not a fifth tab.** `mockup/mobile/08_executive/05_profile/` draws the OVERLAY every role opens from
the TopBar — the same `<NavigationDrawer />` the whole app shares. Since 2026-09-07 it is also how
this role reaches Tasks, Safety and More.

Everything in the frame is real. The name, role and user id come from the signed-in session; the
rows come from `drawerSectionFor(EXECUTIVE)`, which derives them from the §6.4 permission matrix —
six shown, the rest behind **More (N)**, then Settings, Privacy policy and Log out. `/tasks` is
derived and came back on its own when it stopped being a tab; `/safety` and `/more` are governed by
no §6.4 module and are listed explicitly. `/alerts` lost the row it was given on 2026-09-05: it is a
tab again, and a row whose route is on the bar is suppressed, so keeping it would be dead
configuration reading as a live decision.

### Off the bar — [`06-Off-bar/`](08-executive/06-Off-bar/)

Two screens that left the bar on 2026-09-07 and kept their entry point. Each frame was taken the way
a user now reaches it: TopBar menu → expand → scroll → the row.

- [`01-ex-safety.png`](08-executive/06-Off-bar/01-ex-safety.png) — active incidents and the
  per-project ranking are real; the compliance percentage, the grade, safe man-hours and the trend
  bars are mockup figures, though the trend's MONTH AXIS is computed from today through `Intl`
- [`02-ex-more.png`](08-executive/06-Off-bar/02-ex-more.png) — the seven tiles, three of which have
  no screen behind them and say so on tap

**`/tasks` is not photographed here**, and its absence is the point rather than an omission: the
screen it held for this role is the Alerts tab, and the role left the derived Tasks drawer row in the
same change. A frame here would be the same picture under a second file name.

### Reproducing this set

`node scripts/capture-android-executive.mjs` from `apps/mobile`, with a screen name to re-shoot one
(`… executive.mjs portfolio`). The seven keys are `home`, `alerts`, `portfolio`, `reports`,
`drawer`, `safety` and `more`. The script's own header carries the prerequisites in order; the ones
below were each learned by a failed run and none is optional:

- **`node prisma/seed-analytics-clickhouse.mjs`** after seeding Postgres. The analytics tables are
  written in production by `services/analytics-worker` consuming Kafka, which fills them FORWARD from
  events and has nothing to say about rows inserted straight into Postgres. Without it the OLAP store
  is empty and every figure on Home photographs as an em dash.
- **`npx ts-node prisma/provision-keycloak-demo.ts`**, and **Keycloak running on `:8090`.**
  `seed-realistic.ts` writes Postgres only, and Path A's verify step exchanges the OTP for a session
  through the identity provider — without it the backend answers `COS-AUTH-503` and the app shows
  "Invalid or expired OTP", which points at the wrong thing entirely. Note that
  `backend/src/workers/__tests__/main.spec.ts` binds that port itself, so the unit suite fails while
  Keycloak holds it: run the tests with Keycloak stopped and the capture with it started.
- **`EXPO_PUBLIC_CAPTURE=1` on Metro.** Without it LogBox's "Open debugger to view warnings" toast
  sits across the bottom of the screen and SWALLOWS EVERY TAP ON THE NAV BAR. The run then fails at
  the first tab with "…-screen never appeared", and nothing in that message points at a toast.
- **The AI gateway must be REACHABLE OR STOPPED — not running and rejecting.** On 2026-09-07 the
  gateway was up but refused the token the backend forwarded, so `POST /ai/reports/executive-summary`
  answered `401`; the mobile client treats a 401 as an expired session, and the executive was signed
  out three seconds after landing on Home, every run. The AI cards in this set therefore read "The
  report was not produced", and that is a property of this environment, not of the screens.

  **FIXED on 2026-09-07.** `services/ai-gateway/auth.py` verifies the bearer token against
  `KEYCLOAK_URL`, and the `ai-gateway` service inherited that from `.env`, where it is
  `http://127.0.0.1:8090` — correct for the backend, which runs on the host, and self-referential
  inside a container, so the JWKS fetch failed and every token was rejected. That service's
  `environment:` block already overrode Kafka, Redis and Postgres to their in-network names;
  Keycloak had been missed. It now sets `KEYCLOAK_URL: http://keycloak:8080`, and deliberately does
  NOT override `KEYCLOAK_ISSUER`: the token's `iss` is Keycloak's public URL and must keep matching
  it — only the URL the keys are fetched from changes.

  With that fixed the gateway accepts the token and answers **503** instead of 401, because this
  machine's `OPENAI_API_KEY` is `REPLACE_ME`. A 503 does not sign anyone out, and the risk feed falls
  back to the drawing's cards, which is what the Alerts frame shows.

The script sets the device animation scales to 0 and restores them afterwards. With the AVD default
of 1.0 every `uiautomator dump` fails with "could not get idle state", which surfaces minutes later
as "… never appeared" and reads like a missing testID.

**One more trap, and it is worth reading before adding a screen reached by scrolling.** A row that is
half off the bottom of a scroll view reports INVERTED bounds on this device — `drawer-link-/safety`
came back as `[63,2254][751,2148]`, bottom above top — and the midpoint of those two numbers lands
inside the row BELOW it, which at the foot of this drawer is LOG OUT. The script found the right
node, tapped a different one, signed the session out, and failed several steps later pointing
nowhere near the cause. `hasRealBounds()` in that script is the guard; anything that scrolls to reach
a target needs it.

## Finance — four tabs, seven screens — [`09-finance/`](09-finance/)

Captured 2026-09-08 against the seeded tenant by
[`capture-android-finance.mjs`](../../../apps/mobile/scripts/capture-android-finance.mjs), as
`+66811000011`, Pimchanok Thongchai.

**THIS IS THE FIRST ROLE HERE THAT SIGNS IN THROUGH PATH B, and it has to.** Measured against a
running realm: `POST /auth/otp/verify` as `+66811000011` answers **503 COS-AUTH-503**, and the
backend log carries Keycloak's own reason — _"This role must sign in with email and password."_ The
realm's `direct-grant-mfa` flow denies direct grant where the `role` attribute matches
`^(TENANT_ADMIN|FINANCE)$`, which is
[ADR-067](../../architecture/adr/067-mfa-enforcement-keycloak-native.md) as amended on 2026-08-22:
**privileged roles are Path B only, by product-owner decision of 2026-08-21.** The same request as
`+66811000001` (EXECUTIVE) answers 200 with a token, so every other script here is unaffected.

So this script taps `office-login-button`, drives Keycloak's own page in the system browser
(Authorization Code + PKCE) and comes back through `cos://oauth2redirect`. Three things it learned
the hard way, all recorded in its header:

- **Chrome's first-run pages cover the login.** One tap on `signin_fre_dismiss_button` clears them;
  without it the run fails with "browser username field never appeared", which reads like a bad
  selector.
- **Chrome publishes each input's HTML `id` as its `resource-id`** — `username`, `password`,
  `kc-login`, `otp` — so the realm's own markup is what the script matches on, not visible text.
- **Only the first field is ever tapped.** The keyboard covers the password input (y≈1435-1575, the
  keyboard's top edge at ≈1400), so everything after the first field is reached with TAB and the
  form is submitted with ENTER. Tapping the password field's own reported centre hits the keyboard,
  the password is never typed, and Keycloak answers "Invalid username or password" — which looks
  like a wrong credential rather than a missed tap.

**The second factor is provisioned, not bypassed.** Path B for this role puts the account through
the privileged-role OTP subflow, and a seeded account with only a password answers a correct
password with `302 → required-action?execution=CONFIGURE_TOTP`.
`backend/prisma/provision-keycloak-demo.ts` now gives every role in its `MFA_ROLES` set a TOTP
credential, and the capture computes codes from the same secret (`COS_CAPTURE_TOTP_SECRET`). No
realm setting changes and no exemption is added — the demo tenant simply now HAS what the realm
already required. Two traps are recorded there: `partialImport` with `OVERWRITE` replaces the whole
account, so the representation must carry the identity and the password as well as the new
credential; and Keycloak signs with `secret.getBytes()`, so a client must use the stored value's raw
bytes rather than base32-decoding it.

**The bar did not change for this role.** `Home | Payments | Budget | Invoices` was already in
`roleTabs.ts` and in `context/phases/phase-10-mobile-offline-engine.md:192`, and
[`mockup/mobile/09_finance/`](../../../mockup/mobile/09_finance) agrees, so unlike the EXECUTIVE set
there was no navigation decision to take (product-owner decision 2026-09-08). Profile is no role's
tab (§32.7); the drawer holds it.

| Folder                                    | What is in the frame                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`01-Home/`](09-finance/01-Home/)         | The dashboard (`01`): the pending-approval total, summed in `decimal.js` over `GET /finance/payments?status=PENDING` — filtered by the SERVER, so it counts the tenant and not the page; the cash-flow tile and its risk word; the drawn burn rate; the 13-week forecast card; the priority approval queue with per-row Review and Approve.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [`02-Payments/`](09-finance/02-Payments/) | The approval queue (`01`): the PENDING count, the MFA chip, vendor cards, the analysis module, the drawn FAB. The detail (`02`): vendor, amount, project, invoice reference, the biometric note and the Approve / Dispute pair. **Approve is not pressed in the capture** — it is a real `PATCH /finance/payments/:id/approve`, so a run that pressed it would spend a demo payment and leave the queue one shorter than the last capture.                                                                                                                                                                                                                                                                                                                                                                                                               |
| [`03-Budget/`](09-finance/03-Budget/)     | The project budget (`01`): Total / Actual Spent / Remaining from `GET /finance/budget/:projectId`, with both percentages taken against the TOTAL (the drawing's own arithmetic — 84.2 / 124.5 = 68%); the forecast module; the category breakdown, whose per-line spend is `GET /finance/cost-transactions` summed by `budget_line_id`. That endpoint pages at 100 and the client walks it to the end: a sum over page one is a sum over page one, and when the walk hits its cap the screen says the figure is partial instead of showing it as the spend to date.                                                                                                                                                                                                                                                                                      |
| [`04-Invoices/`](09-finance/04-Invoices/) | The AP queue (`01`): filter chips whose counts come from the server's own `COUNT(*)` (one `limit=1` request per status, read for its `total`) rather than from the rows on screen; the drawn 3-way-matching banner, footed with a source that names the RECORDS behind the list rather than the drawing's "ERP DB & Central OCR Ledger" (ADR-099, third amendment of 2026-09-08); invoice cards carrying the vendor, the PO number and the amount over the PO — the PO's delivery state came off the card the same day, since the card is a decision to approve or dispute and the order's own progress is not part of it. Approve and Dispute appear only where the server would accept them — `RECEIVED`/`VERIFIED` for one, anything but `PAID`/`DISPUTED` for the other, which are the exact states `procurement.service.ts` answers 422 outside of. |
| [`05-Drawer/`](09-finance/05-Drawer/)     | The navigation drawer (`01`) — an OVERLAY opened from the TopBar, not a fifth tab; its rows derive from the §6.4 matrix via [`lib/drawerLinks.ts`](../../../apps/mobile/src/lib/drawerLinks.ts). Its profile zone shows the role as a tag, the employee code from `workforce.workers` where the account has one, and "MFA verified" only when `platform.users.mfa_enabled` is true. Account settings (`02`), pushed from the Settings row: MFA, biometric, Change PIN, language, notification preferences, theme, version.                                                                                                                                                                                                                                                                                                                               |

**The project picker is answered before anything else in this run, and that is new.**
`<SelectProjectSheet />` was mounted for `FINANCE` on 2026-09-08 — the third role to join it, after
`SITE_ENGINEER` (2026-08-12) and `SAFETY_OFFICER` (2026-08-13), and for the identical reason both of
those did. Two of the four screens are project-scoped (`GET /finance/cashflow-forecast/:projectId`
and `GET /finance/budget/:projectId`) and nothing but that sheet writes `projectStore`, so without
it the Active Project bar rendered nothing, Home's forecast card read "choose a project" with no way
to, and Budget's permanent state was "select a project". Writing this capture script is what
surfaced it — the same way the other two were found.

**Eight figures in these frames did not come from the backend.** They are listed in
[ADR-099](../../architecture/adr/099-mockup-figures-without-a-data-source.md)'s 2026-09-08 amendment
and live in one module, [`lib/mockupFigures.ts`](../../../apps/mobile/src/lib/mockupFigures.ts):
the "+12% vs last week" delta and the burn rate on Home; the payment detail's service period and its
"verified subcontractor" chip; the budget's "Code: 02-100"; on Invoices the ENTIRE 3-way-matching
banner, every per-card match percentage and GRN reference, and the discrepancy sentence on a disputed
card; and the drawer's "Lead Controller". **Three-way matching does not exist in `backend/src`** —
nothing reconciles a purchase order against a delivery against an invoice, and no endpoint returns a
score — which makes that banner the largest single thing the register has ever held.

**No confidence appears anywhere in these frames, and the drawings put one on four cards.** Three of
those cards read the 13-week cash-flow forecast, which is a deterministic sum of scheduled inflows
and outflows: a percentage beside it would claim a model that never ran. The fourth is the matching
banner, where nothing ran at all. Same carve-out ADR-098's second amendment and ADR-099 record — the
card names the PROJECT its figures came from instead of a source it cannot vouch for.

**Everything else in these frames is live data** from the seeded tenant: the approval queue and its
total, the cash-flow forecast and its risk grade, the budget and every category's allocation, the
per-category spend, the invoice list and its filter counts, and every invoice's vendor, PO number,
delivery state and amount-over-PO. Four figures that the first draft was going to draw turned out to
be columns and are live — the PO reference, the PO's delivery state, "Over PO +5.2%" and the drawer's
employee id.

**A payment does not name its own vendor, and these frames show the workaround.** `finance.payments`
carries `invoice_id` and nothing readable, and finance may not query `procurement.*` — master §PHASE
7 line 3216, guarded by `tests/architecture/connectivity.spec.ts` and
`tests/conformance/finance/05-constraints.spec.ts`. A join into `GET /finance/payments` was written
on 2026-09-08 and reverted the same day when both suites caught it; the join now lives in
`GET /procurement/vendor-invoices` and the screens match on `invoice_id`
([ADR-100](../../architecture/adr/100-vendor-name-joins-in-procurement.md)). If the vendor-invoice
request fails, the queue still lists every payment with an em dash where a name would be — so a
frame full of em dashes means procurement was unreachable, not that the queue is broken.

## Procurement Officer — four tabs, six screens — [`10-proc-officer/`](10-proc-officer/)

`mockup/mobile/10_proc_officer/` — the role that turns a request into an order and receives what
arrives. Captured 2026-09-08 as `+66811000005` (Nattapong Wongchai, department Procurement) over
**Path A, phone OTP**: `MFA_ROLES` in `provision-keycloak-demo.ts` is `{TENANT_ADMIN, FINANCE}` and
this role is in neither, so the browser-driven flow the FINANCE frames needed does not apply here.

The bar is `Home · RFQs · Orders · Deliveries` and was already so — `roleTabs.ts` has given this role
those four since the 2026-08-10 decision, and the drawings agree with it, so no navigation changed.

| Directory                                          | What the frames show                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`01-Home/`](10-proc-officer/01-Home/)             | The dashboard (`01`): the 2×2 queue bento — purchase requests awaiting approval, RFQs running, awards with no order open yet, deliveries arriving today — over the vendor-analysis module and the drawn activity feed.                                                                                                                                                            |
| [`02-RFQs/`](10-proc-officer/02-RFQs/)             | The RFQ queue (`01`): search, status chips with bracketed counts, the price-comparison banner, and a card per RFQ carrying its project, its deadline countdown and the action its own state allows. **No quote count** — see below.                                                                                                                                               |
| [`03-Orders/`](10-proc-officer/03-Orders/)         | The purchase orders (`01`): search, status chips, the drawn delay alert, and a card per order with the vendor, the money, the project and the stage the delivery has genuinely reached. Approve appears only on `PENDING_APPROVAL`, which is the one state `POST /purchase-orders/:poId/approve` accepts, and **is not pressed in the capture** — it would spend a demo approval. |
| [`04-Deliveries/`](10-proc-officer/04-Deliveries/) | The delivery queue (`01`): the received count over two drawn tiles, the drawn logistics alert, and a card per recorded delivery naming the order it was received against. The RECORD FORM (`02`) is behind the card's own button — pick a purchase order, enter the quantity received per line, attach photos, submit offline-queued.                                             |
| [`05-Drawer/`](10-proc-officer/05-Drawer/)         | The navigation drawer (`01`) and account settings (`02`) — the shared components every role gets, not a per-role copy.                                                                                                                                                                                                                                                            |

**The delivery cards carry no percentage, and that is the deliberate part of these frames.**
`03_orders/01_po_order` draws "Delivery Progress · 65%" on every order. The number is computable —
`delivery_items.quantity_received` against `po_line_items.quantity` — at two requests per row, 84 for
this tenant, on a screen that renders in one. So the card shows the STAGE from the order's own status
and prints no number. A percentage reads as counted in a way a status word does not, and a drawn one
would have been a fabricated measurement on a purchasing screen.

**Ten figures in these frames are drawn** and are listed in
[ADR-099](../../architecture/adr/099-mockup-figures-without-a-data-source.md)'s sixth amendment: the
activity feed, the RFQ material titles and price deltas, the vendor recommendation, the savings
target, the delay alert, and — the biggest single one — every delivery status pill, because
`procurement.deliveries` has no status column at all. A row exists once someone records a delivery,
so the table can say "this arrived" and cannot say "this is on its way".

**The RFQ cards carry no quote count, and the reason is a defect worth knowing about.**
`GET /procurement/rfqs/:rfqId/quotations` is a `@Get` whose summary reads "Compare quotations for an
RFQ", and a per-row fetch was written against it. It is not a read: `compareQuotations` asserts the
RFQ is `CLOSED`, 422s on one with no quotations, and **marks the lowest one selected**. Opening the
list would have awarded every closed RFQ in the tenant. The seeded tenant holds none, so all 45 calls
threw and nothing was mutated — a column of zeros in the first capture was what said so. The call was
removed and no figure was drawn in its place.

**Everything else is live data** from the seeded tenant: the four queue counts, every RFQ number,
status and deadline, every order's number, status, amount and vendor, every delivery's note, date and
purchase order, and both project names. Five figures the first draft was going to draw turned out to
be reachable and are live — the vendor names, the RFQ countdown, the order ETAs, the project names,
and the pending-request count.

**The drawer does not match its drawing, on purpose.** `01_po_navigation_drawer` lists the four
bottom-tab destinations again and adds a materials Marketplace and a site Stock ledger; neither
exists. The app's drawer is one shared `<NavigationDrawer />` whose per-role link set
`drawerLinks.ts` derives from spec §6.4 — projects, reports, material requests, tasks, invoices,
vendors and budget for this role — and a mockup's menu is not re-exported over it (product-owner
decision 2026-09-07). ADR-085: style is the drawing's, composition is not.

## Procurement Manager — four tabs, six screens — [`11-proc-manager/`](11-proc-manager/)

`mockup/mobile/11_proc_manager/` — the role that decides. Captured 2026-09-09, and **re-shot the
same day** after the screens were rebuilt to match the drawings (see the note at the end of this
section), as `+66811000006`
(Rungnapa Chaiyo) over **Path A, phone OTP**: `MFA_ROLES` is `{TENANT_ADMIN, FINANCE}` and this role
is in neither.

**The bar is the same four tabs as the officer's, and the screens behind three of them are not.**
Both roles shared every screen until this set arrived; the drawings are the same tab NAMES over
different jobs, so the routes now dispatch by role the way `home.tsx` always has.

| Tab        | PROCUREMENT_OFFICER sees                | PROC_MANAGER sees                                          |
| ---------- | --------------------------------------- | ---------------------------------------------------------- |
| Home       | four work queues                        | committed spend, approvals waiting, supplier scores        |
| RFQs       | the RFQ queue it is running             | the **approvals queue** — POs and RFQs awaiting a decision |
| Orders     | purchase orders                         | purchase orders — **the same screen**                      |
| Deliveries | the receiving queue and its record form | arrivals, holds and yard capacity                          |

| Directory                                          | What the frames show                                                                                                                                                                                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`01-Home/`](11-proc-manager/01-Home/)             | The dashboard (`01`): committed spend summed in decimal.js, open RFQs, the drawn savings tile, the insight module, "Action Required" from the real approvals queue, and Top Vendors with real weighted trust scores.                                                             |
| [`02-Approvals/`](11-proc-manager/02-Approvals/)   | The approvals queue (`01`): purchase orders in `PENDING_APPROVAL` and RFQs in `EVALUATED`, each with its vendor, project, amount and — on an RFQ — a **measured** countdown. **Approve is drawn** — see below.                                                                   |
| [`03-Orders/`](11-proc-manager/03-Orders/)         | The purchase orders (`01`) — the officer's screen, unchanged for this role.                                                                                                                                                                                                      |
| [`04-Deliveries/`](11-proc-manager/04-Deliveries/) | The manager's delivery view (`01`): today's arrivals and their value (real), the drawn to-inspect and dispute tiles, the logistics advisor, the yard row, and the drawing's **four card shapes** — awaiting GRN, disputed, in transit, received — each over a real delivery row. |
| [`05-Vendors/`](11-proc-manager/05-Vendors/)       | The vendor directory (`01`) — trust scores, open-order counts and state badges, all real, under the drawn insight banner.                                                                                                                                                        |
| [`06-Drawer/`](11-proc-manager/06-Drawer/)         | The navigation drawer (`01`) and account settings (`02`) — the shared components every role gets.                                                                                                                                                                                |

**THE ORDERS TAB SHOWS ORDERS, AND THE DRAWING DISAGREES WITH ITSELF ABOUT THAT.**
`03_orders/01_pom_order/code.html` sits in a directory called _orders_, its bottom nav highlights a
tab labelled _Orders_, and the page is titled "Vendor Directory" with not one purchase order on it.
The tab keeps its label and its content (§20.7.3 gives the role both pages); the drawing's vendor
content is implemented on the vendor directory, which already existed with real scores, and is
captured as `05-Vendors/`. ADR-085: composition is the implementation's.

**The Approve button is drawn, and it is the first entry of its kind** — missing AUTHORITY rather
than missing data. `POST /purchase-orders/:poId/approve` is
`@Roles(PROJECT_MANAGER, FINANCE, EXECUTIVE, TENANT_ADMIN)` and PROC_MANAGER is not on it, while
`docs/specifications/06-*.md:296` gives that role `RW + A` on purchase orders. The specification and
the route disagree, and the approval ladder has no rung for a procurement manager to sign either.
The RFQ half fails differently: the award endpoint allows this role and needs a quotation id that
only the awarding endpoint can supply. Full reasoning in
[ADR-099](../../architecture/adr/099-mockup-figures-without-a-data-source.md)'s 2026-09-09 amendment
and in the screen's own header.

**Eighteen figures are drawn across the four screens this role owns**, listed in that amendment and
the one after it. Counted, not recalled — the `mockupFigures` imports of `vendors.tsx`,
`ManagerDeliveries.tsx`, `ApprovalsQueue.tsx` and `ProcManagerHome.tsx`.
The largest is the yard row: §20.7.3 defines `/procurement/warehouses` and
`/procurement/inventory` and none of the database's 24 schemas holds a warehouse, a bin, a stock
level or a quota. The delivery cards' material names, quantities, weighbridge readings, truck
counts and shelf codes are the rest — the product owner asked for the drawing figure for figure
on 2026-09-09, and each one names the column that would delete it.

**One figure went the other way on the same day.** The "4h remaining" countdown was drawn on
every approval row; `procurement.rfqs.deadline` is a real column, so it is now measured in
`lib/approvalDeadline.ts` and the register entry was deleted. A purchase order has no decision
deadline and now shows no chip at all rather than a picture of one.

**Everything else is live data**: committed spend, open RFQs, every approval row and its vendor,
project and amount, every vendor's weighted trust score and open-order count, today's arrivals and
what those orders are worth. The category-chip counts on the vendor directory and the Urgent count
on both the dashboard and the queue joined that list on 2026-09-09 — each is computed over the
rows the screen already holds, so no chip can disagree with the list beneath it.

**These frames were re-shot after a rebuild, and the reason is worth recording.** The first set
had the right data in the wrong shape: the drawings were read and the screens were then composed
afresh rather than followed. ADR-085 lets an implemented structure that has OUTGROWN its drawing
stand; none of these four had outgrown anything. Two differences from the drawings remain, both
decided by the product owner on the day: the CONFIDENCE chip stays in the AI card's foot per the
2026-09-08 standard rather than moving to the header, and the vendor directory stays on the
drawer rather than moving onto the Orders tab.

## Viewer — six screens — [`13-viewer/`](13-viewer/)

`mockup/mobile/role_viewer/` — the read-only stakeholder. First captured **2026-09-10**, when this
was the role's **first appearance in this folder**: twelve role folders existed and none was
VIEWER's. **Re-captured whole on 2026-09-11** — see "the second round" below.

**IT COULD NOT HAVE BEEN CAPTURED BEFORE, AND THE REASON WAS UPSTREAM OF THE CAMERA.**
`backend/prisma/seed-realistic.ts` carried a demo user for eleven of the twelve roles and none for
this one, so there was nobody to sign in as. The role's Home also rendered `<MinimalHome />` — a
22-line placeholder — until the same day, so nothing had gone looking. Both were fixed in this
commit: `viewer` / `+66811000013` / Somsak Watcharawit is seeded **with a
`projects.project_members` row**, which is not a convenience for screenshots. Every screen this role
owns is a view OF its projects, so a VIEWER belonging to nothing photographs five empty states on a
fully seeded database — the same defect `sw1` was added to fix on 2026-08-08.

Shot over **Path A, phone OTP**: `MFA_ROLES` is `{TENANT_ADMIN, FINANCE}` and this role is in
neither.

| Directory                                      | What the frames show                                                                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`01-Home/`](13-viewer/01-Home/)               | `01-viewer-dashboard` — the project count and open-issue count (both real), the drawn portfolio budget, the System Insight card, two tracked projects and the activity timeline |
| [`02-Projects/`](13-viewer/02-Projects/)       | `01-project-list` — a working search over the cached rows, the drawn category chips, and a card per assigned project                                                            |
| [`03-Map/`](13-viewer/03-Map/)                 | `01-project-map` — the pins, the four map controls and the Active Sites sheet                                                                                                   |
| [`04-Insights/`](13-viewer/04-Insights/)       | `01-project-insights` — the progress curve, safety performance, the risk forecast and the issue-severity breakdown                                                              |
| [`05-Profile/`](13-viewer/05-Profile/)         | `01-account-settings` — the shared screen, plus the **System Permissions** block that renders for this role and no other                                                        |
| [`06-Procurement/`](13-viewer/06-Procurement/) | `01-procurement` — the ACCESS PROFILE banner, four PO counters, the Delivery Predictor, a four-step route tracker and four monitored PO lines                                   |
| [`07-Budget/`](13-viewer/07-Budget/)           | `01-budget` — total / committed / actual, the absorption bar and its legend, Audit & Forecast, four BOQ divisions, the progress photo and the VERIFIED LOG                      |

**THE BOTTOM BAR IN THESE FRAMES IS NOT THE ONE THE MOCKUPS DRAW, AND THAT WAS DECIDED RATHER THAN
OVERLOOKED.** The five drawings give **four different bars** — `01_home` and `05_profile` agree on
`Home · Projects · Map · Insights · Profile` and then disagree with each other about which glyph
carries which label; `02_projects`, `03_map` and `04_insights` each draw a different four-tab set
containing `Daily Logs` (not a route), `Safety` and `Directory` (neither granted to this role).
VIEWER is one of the three roles §32.7's table enumerates, so the collision was escalated under the
ADR-098 precedent and the product owner kept the enumerated bar,
`Home · Projects · Procurement · Budget`. **Nothing was lost**: `/map` and `/insights` are new
routes with a drawer row each.

**One frame is a single viewport and the other five are stitched.** The map does not scroll at page
level — a canvas with a sheet pinned under it — so it is one shot; the sheet's own list scrolls,
which is what makes its second row reachable. The heading above counts screens rather than tabs
because only four of the six are tabs: Home, Projects, Procurement and Budget. The map, the insights
page and account settings are reached from the navigation drawer.

**Almost everything on Insights is drawn, and the header of
`components/ProjectInsightsDocument.tsx` says so in those words.** No endpoint on this device
returns a planned-versus-actual series, a safe-hours ledger, a supply-chain forecast or a
portfolio-wide issue histogram. The one computed figure is the severity bar's proportions, derived
from the four counts printed above it so the bar can never disagree with them.

**What IS real, and it is the top of every screen**: the project rows — code, name and lifecycle
status, from the §17.4 cache — the project count, the open-issue count
(`GET /site/issues?status=OPEN`), the search, and on Account Settings the name, position, id and
sync state. The status chips print the REAL lifecycle status (`ACTIVE`, `ON_HOLD`), never the
drawings' "ON TRACK" / "DELAYED", which are labels for a state this product does not store.

**Cards past the third on the project list carry no progress bar or footer, and that is
deliberate.** The drawn figures are positional — three cards' worth — and a list longer than the
drawing renders the rest without them rather than repeating the last one. A figure that has run out
is absent, not recycled.

**Three permissions were added for these screens rather than assumed.** `[CosRole.VIEWER]` held
seven grants and none of `safety:read`, `analytics:read` or `ai:read` was among them, so the safety
panel, the analytics page and the two AI cards would each have been drawn against a grant the role
does not hold. Escalated the same day; the product owner added all three
([ADR-102](../../architecture/adr/102-viewer-gains-safety-analytics-ai-read.md)) and §6.8's table was
amended in the same commit. All three are `:read`, so §20.7.9's "no create/edit/approve actions are
rendered" is untouched.

### The second round — 2026-09-11: four redrawn, two added, and a defect only the camera found

The product owner asked for this set again and named six screens. **Checking the count was not
enough.** The Stitch project held the same five names plus two, so a count comparison said "two
new"; downloading all seven and comparing sha256 against the repo copies said that **four of the
five had been redrawn** — Home, Projects, Map and Analytics. Only Account Settings was
byte-identical. Every frame in this folder was therefore retaken, not just the two added ones.

`/procurement` and `/budget` are the third and fourth slots of this role's bar and had, since
2026-08-04, rendered the PROCUREMENT_MANAGER and FINANCE screens **to a viewer** — approve button
and "request an amendment" included, neither role-gated. Both routes branch on role now, the way
`/home` always has. Six read routes were opened underneath them the same day
([ADR-103](../../architecture/adr/103-viewer-read-routes-opened.md)); every figure on the two new
frames is still drawn, because the screens have not yet been rewired onto those routes.

**THE CAPTURE FOUND SOMETHING NO TEST WAS ASKING ABOUT.** Both new screens were first written with
no `onPress` anywhere, on the reasoning that a read-only role should not be handed controls. §20.7.9
does not say that — it forbids **create, edit and approve**, and opening a detail is a read. What
that shipped was eleven affordances drawn to look like controls and answering nothing: `TRACK
LIVE →`, `DISPLAYING ALL`, `DETAILS ›`, an `EXPAND` chip, and a chevron plate on every BOQ division
and audit-log row. The render specs passed, because they asserted the _absence_ of handlers and got
it. Putting `06-Procurement/01-procurement.png` beside `01-Home/01-viewer-dashboard.png` is what
made it visible: the same shapes on Home and Insights respond, and these did not.

Each now raises the coming-soon dialog, per the convention of 2026-09-04. The two specs COUNT press
handlers against the drawn-figure register rather than asserting none, so a card cannot be added
without one or quietly lose the one it has. The map sheet's grab handle and collapse chevron stay
inert and that is the one carve-out — ornament on a panel that cannot be dragged was never a
control.

**What is real on the two new frames**: nothing below the chrome. The role's own token was measured
against every endpoint these screens would read and all of them answered 403 before ADR-103; the
screens are drawn end to end and each figure is registered under
[ADR-099](../../architecture/adr/099-mockup-figures-without-a-data-source.md). What is real is the
signed-in identity in the top bar, the sync state, and the tab bar itself.

## Support Centre — two screens, one per side of login — [`02-shared/02-support-centre/`](02-shared/02-support-centre/) and [`01-authen/05-get-help/`](01-authen/05-get-help/)

Until 2026-09-11 the Support Centre was ONE document rendered at both routes, and only the pre-auth
frame had ever been captured. It is now two screens doing two jobs, and both are photographed.

| Frame                                                                                          | Screen    | What it is for                                                                                                                  |
| ---------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [`01-authen/05-get-help/01-home-support`](01-authen/05-get-help/01-home-support.png)           | pre-auth  | someone who **cannot get in** — system status, the emergency numbers, field troubleshooting, FIELD ASSISTANT                    |
| [`02-shared/02-support-centre/01-support-hub`](02-shared/02-support-centre/01-support-hub.png) | post-auth | someone **already working** — system status, search, eight Quick Help categories, Top FAQs, a featured article, a pinned footer |

**A SCREENSHOT IS WHAT SPLIT THEM.** Stitch redrew `mockup/mobile/support_center/01_dashboard` and
the four sections it adds were first built into the shared document, so both routes got them. Every
test passed. The first capture of the result came out **5,556px tall**, half of it answering "how do
I use this product" on a surface reached only by someone who cannot yet use it. Nothing in the suite
could have said so: each section rendered correctly, in order, with every affordance responding. The
defect was in WHO the page was for, and only a picture of the whole page shows that.

The post-auth frame is 4,159px because the product owner then removed its three real cards — YOUR
SESSION, DEVICE DIAGNOSTICS and WHAT YOUR ROLE CAN OPEN — leaving the route a frame around the
drawing. §32.7 records why.

### Reading these two frames

- **Everything below the chrome on the post-auth frame is DRAWN** except the status card: the eight
  categories, the four FAQs and the featured article are `SUPPORT_HELP_CATEGORIES`,
  `SUPPORT_TOP_FAQS` and `SUPPORT_FEATURED_ARTICLE` under ADR-099. Measured 2026-09-11: no
  `help_article`, `faq` or `article` model, no `backend/src/modules/support/`, no controller prefix
  for any of them. What IS real is the system status (`GET /health/live`) and LIVE CHAT.
- **The FAQ chevrons point RIGHT, not down.** The drawing puts `expand_more` on each row and gives
  none of them a body, so a downward chevron would promise a disclosure that does not exist
  (product-owner decision 2026-09-11, matching the pre-auth troubleshooting list a day earlier).
- **The search box is not an input on either frame.** Disabled since 2026-08-09 and re-affirmed
  three times since, most recently when this drawing asked for an active one.
- **The two frames word the placeholder differently** — "Search help articles…" against "Search
  guides, tutorials, or system status…" — because their drawings do, and since the split each screen
  owns its own wording.

### One thing to know before re-running the post-auth capture

`scripts/capture-android-support-hub.mjs` needs Metro started with **`EXPO_PUBLIC_CAPTURE=1`**, and
`apps/mobile/.env` does not carry the key — it must go on the command line. Without it the stitcher
reports `sad` around 1.8 on a shot pair taken at ZERO SCROLL, which is two pictures of a stationary
screen that disagree, and seams cut through content. With it that figure is 0.0. The script's header
also records two fixes that were tried and measured and made things WORSE — more overlap, and fewer
joins — so they need not be tried again.
