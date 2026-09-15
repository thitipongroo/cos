---
title: Construction OS — Web Screen Capture
last_updated: 2026-07-07
---

# Construction OS — Web App Screens

> Part of [`docs/screens/`](../README.md) · platform: **Web** (Next.js + Serwist, tablet/laptop browser).

⚠️ **6 screens committed** — the pre-auth login flow in [`01-public/`](01-public/), and the SYSTEM_ADMIN
panel's Tenant List and Create Tenant in [`SYSTEM_ADMIN/`](SYSTEM_ADMIN/) (2026-09-14). The 24-route table
below is the set [`web-screens.mjs`](../../../scripts/capture/web-screens.mjs) _can_ produce; those
files are **not** in the repo. The earlier per-role captures were deleted by `7d2ba1b`
("update: screens out date") and have not been retaken.

| File                                                           | Route         |
| -------------------------------------------------------------- | ------------- |
| [`00-login.png`](01-public/00-login.png)                       | `/login`      |
| [`01-login-otp-verify.png`](01-public/01-login-otp-verify.png) | `/login/otp`  |
| [`02-login-password.png`](01-public/02-login-password.png)     | Keycloak page |
| [`03-login-loading.png`](01-public/03-login-loading.png)       | post-submit   |

> No script currently reproduces these four filenames. They were committed by hand
> (`983a935`, `829b8fa`). `capture/web-screens.mjs` writes `00-login.png` to the folder **root**, and
> `capture-screens.mjs` names its pre-auth shots `login.png` / `login_otp.png` — neither matches.
> Re-running either tool will not refresh this set in place.

| Browser | Chromium (Playwright), 1440×900 viewport                                             |
| ------- | ------------------------------------------------------------------------------------ |
| User    | `e2e-admin@construction-os.io` — role `TENANT_ADMIN` (widest page access)            |
| Backend | NestJS modular monolith @ `localhost:3000`, Postgres + ClickHouse + Redis + Keycloak |
| Web app | Next.js @ `localhost:3001`                                                           |
| Project | `DEMO-001` — _Bangkok Tower — Phase 1_ (tenant `…0001`)                              |

## Folder layout

Numbered folders for cross-role flows, `UPPER_SNAKE` for role folders (`TENANT_ADMIN`) — the canonical
CosRole spelling, used verbatim. **This differs from [`../android/`](../android/README.md) on purpose:**
that tree numbers its role folders in flow order and spells them lower-kebab (`04-tenant-admin/`), so
its folders sort into the order a user meets them. It used `UPPER-KEBAB` (`TENANT-ADMIN/`) until the
2026-08-11 restructure. The two conventions are not being harmonised; each matches the tree that is
actually committed under it (product-owner decision 2026-08-07).

| Folder                  | Written by                                                 |
| ----------------------- | ---------------------------------------------------------- |
| `01-public/`            | `capture-screens.mjs` — pre-auth routes                    |
| `SYSTEM_ADMIN/`         | `capture/web-system-admin.mjs` — the `/admin` panel        |
| `<ROLE>/`               | `capture-screens.mjs` — every route that role reaches      |
| `<ROLE>/_interactions/` | `capture-interactions.mjs` — detail pages, forms, popovers |
| `PROJECT_MANAGER/`      | `capture-graph.mjs` — the knowledge-graph pages            |

The role **keys inside those scripts** are the same `UPPER_SNAKE` strings — they are CosRole identities
that the scripts branch on _and_ the folder names, so no conversion happens when a path is built. Until
2026-08-07 a `folderFor()` helper kebab-cased them and the subfolder was spelled `interactions/`, so a
run wrote `PROJECT-MANAGER/interactions/` alongside the committed `PROJECT_MANAGER/_interactions/`
instead of into it.

`capture/web-screens.mjs` is the exception — it still writes its 24-route dump flat into this folder's
root, not into a subfolder.

## Screens the capture script targets (not committed)

| #   | Screen              | Route                       |
| --- | ------------------- | --------------------------- |
| 00  | Login               | `/login`                    |
| 01  | Projects            | `/projects`                 |
| 02  | Portfolio           | `/portfolio`                |
| 03  | Tasks               | `/tasks`                    |
| 04  | Executive dashboard | `/analytics/executive`      |
| 05  | Purchase requests   | `/procurement/requests`     |
| 06  | RFQs                | `/procurement/rfqs`         |
| 07  | Purchase orders     | `/procurement/orders`       |
| 08  | Deliveries          | `/procurement/deliveries`   |
| 09  | Vendors             | `/procurement/vendors`      |
| 10  | Budget              | `/finance/budget`           |
| 11  | Invoices            | `/finance/invoices`         |
| 12  | Payments            | `/finance/payments`         |
| 13  | Variance report     | `/finance/reports/variance` |
| 14  | Site reports        | `/site/reports`             |
| 15  | Issues              | `/site/issues`              |
| 16  | Inspections         | `/site/inspections`         |
| 17  | Sync conflicts      | `/site/conflicts`           |
| 18  | Safety incidents    | `/safety/incidents`         |
| 19  | Alerts              | `/alerts`                   |
| 20  | Reports             | `/reports`                  |
| 21  | CRM leads           | `/crm/leads`                |
| 22  | User management     | `/settings/users`           |
| 23  | Profile             | `/settings/profile`         |

## How these were captured

A standalone Playwright script ([`scripts/capture/web-screens.mjs`](../../../scripts/capture/web-screens.mjs))
logs in via Keycloak Path B (office/management OIDC) as `e2e-admin`, then visits each route and
writes the viewport frame here. The app polls continuously (SSE notification bell + React Query), so
the script waits on `domcontentloaded` + a settle delay rather than `networkidle` (which never fires).

```bash
# full docker stack + backend :3000 (E2E_AUTH_BYPASS) + web :3001, then:
bash scripts/dev/seed-e2e-users.sh          # once — provisions the Keycloak login
node scripts/capture/web-screens.mjs
```

Demo data: `backend/prisma/demo-seed.sql` (Postgres domain rows for `DEMO-001`) + the seeded
ClickHouse `analytics.*_daily` aggregates.

## SYSTEM_ADMIN — the `/admin` panel (§20.4)

| File                                                        | Route            | Stitch screen                                                  |
| ----------------------------------------------------------- | ---------------- | -------------------------------------------------------------- |
| [`01-tenant-list.png`](SYSTEM_ADMIN/01-tenant-list.png)     | `/admin`         | Tenant List & DB Provisioning - SYSTEM_ADMIN (`013fc8f09450…`) |
| [`02-create-tenant.png`](SYSTEM_ADMIN/02-create-tenant.png) | `/admin` (modal) | Create Tenant - Modal Overlay - SYSTEM_ADMIN (`00b09850702f…`) |

Captured 2026-09-15, full page at a 1440×900 viewport, signed in as the local dev SYSTEM_ADMIN. Rebuilt that day
(revision R10) to the Tenant List screen's HTML as it stood on 2026-09-15 — the 2026-09-14 frames followed an older
version of it and substituted global tokens for its colours.

### What these frames are evidence of

- **Every row was written through the panel.** The capture creates `bkk_metro_corp`, `siam_infra_eng`,
  `cpac_precast_group` and `lanna_steel_works` (ENTERPRISE), `apex_construct_th` (PROFESSIONAL) and
  `northeastern_build` (STARTER) with the real Create Tenant form, and deactivates `northeastern_build` with the
  real row action — each with a justification, each audited in `platform.audit_logs`. `EKC` is the seeded home
  tenant of the dev account. `02` is the form filled in for `siam_infra_eng`, not submitted; `01` is the list in
  its §20.4.2 success state for that tenant.
- **The provisioning states come from real runs of the real workflow** (revision R11, product-owner decisions
  2026-09-15), started and decided through the row actions:
  - `bkk_metro_corp` — Mark as Contracted, the run reaches the gate, Approve, `✓ Ready`; then Assign DB.
  - `siam_infra_eng` — Mark as Contracted, parked at the gate: the banner, `Transit`, `Waiting`, the gavel.
  - `lanna_steel_works` — Mark as Contracted, held in `CREATING_RDS`: `Pending`, `Creating database`.
  - `cpac_precast_group` — Assign DB, no run: `Active`.

  The runs execute on `backend/test/dev/provisioning-stub-worker.ts`: the production
  `enterpriseProvisioningWorkflow` with its activities replaced by stubs, so no AWS instance, migration, event
  or notification is produced. The two hosts (`db-ent-042`, `db-ent-039`) do not exist; those dev tenants' own
  queries would route nowhere.

- **Two small tenants share the realm `construction-os`.** That was impossible until migration
  `20260914000001`: the second one failed on `UNIQUE (keycloak_realm)`. The name column's second line is
  each tenant's Keycloak realm.
- **Every figure is computed from the list endpoints.** Seven tenants, six active, one inactive; two
  dedicated hosts; one run at the gate. "+N this week" counts tenants created in the last 7 × 24 h.
- **The STATUS column reads the run** (decision 3): at the gate `Transit`, in progress `Pending`, otherwise the
  tenant's `is_active`. A row whose run is in progress offers only View and Audit Log; a tenant with any run is
  not offered Mark as Contracted again.
- **The layout is the drawing's**, element by element, compared region by region against the drawing's HTML
  rendered at the same 1440px width: fixed top bar (brand, the global search centred in the bar — R14 — status pill,
  bell, avatar), a side menu that does not scroll with the page — only the workspace scrolls, so the Cluster Pulse
  card is always at its bottom edge (R13) — breadcrumb chips, four metric cards, search with plan chips, the eight
  table columns with icon row actions, and the Cluster Zone footer — in the drawing's own colours and type
  (`cos-op-*`, spec §32.7 "SYSTEM_ADMIN Operator Panel Tokens"). Because only the workspace scrolls, the capture
  makes the viewport as tall as the workspace's content so the whole list is in `01`.
- **Create Tenant is a modal over the list** (R13, product-owner decisions 2026-09-15), opened by the list's Create
  Tenant button; `/admin/tenants/new` shows the list with it open. `02` is the modal filled in for `siam_infra_eng`,
  not submitted, with a URL typed into the URI field so its valid state shows; the viewport is made tall enough that
  the modal's form does not scroll. While it is open the panel underneath is dimmed and no gate banner is drawn.
- **Not drawn, still announced** (revision R12, product-owner decision 2026-09-15): the Tenant List title and
  its "Tenant created:" line are screen-reader only. The buttons beside the title stay right-aligned; the new
  tenant's row stays highlighted.
- **Sign out and the language switch are in the avatar menu.** The drawing has neither; an operator still
  needs both (product-owner decision, R10).
- **The Justification field is mandatory** (§6.7). The drawing has no such field; it sits under the URI field.
- **The modal's copy is the drawing's, every word** (R13 decision 3), and some of it claims what the system does
  not do: "identifier is available" (no availability check — a taken code is a 409), "Port … Open" and "Host is
  reachable on cluster internal network" (nothing probes the host), the "Automatic Provisioning Lifecycle" notice
  (HashiCorp Vault, a schema catalog, mTLS for EMQX — the provisioning run uses AWS Secrets Manager and does none of
  these), "Zone: ap-southeast-1a (Headroom: 72%)" and the plan tier lines (no source). Each note and badge appears on
  the format checks the form performs. Listed in `CreateTenantModal.tsx` so they can be cleared later.

### Drawn without a data source

Laid out as drawn and showing `—` or disabled, because nothing in the repository is a source for them yet
(product-owner decision): the EMQX and PG Fleet chips, the Platform Compute card, Avg Gate Time, the four
Cluster Pulse rows (whose `LIVE` badge is not drawn), the sidebar's version and Central Prices period, the Cluster
Zone, Import Central Prices, the View Detail and Audit Log row actions, and six of the seven sidebar entries. Their
sources are drafted in spec §20.4.6 for round 2. The disabled row actions keep the drawing's colour; they do not
respond and show a not-allowed cursor.

### What is NOT in these frames, and why

- **The drawing's STARTER "Provisioning…" row.** The workflow runs for ENTERPRISE tenants only, so the
  in-progress row is `lanna_steel_works`, an ENTERPRISE tenant.
- **A host on the row at the gate** (the drawing's "→ db-ent-043"). The stub activities write no host, and
  nothing else puts one on a tenant before its run is approved.
- **The Next.js dev overlay badge.** The capture hides it with CSS. It counted two issues that are the
  dev environment's, not the panel's: the Serwist service worker refusing to register behind a dev
  redirect, and a note about a report-only CSP directive. Both appear on `/login` too.

### Re-running

```bash
# docker stack up · backend :3000 · seed-realistic.ts loaded · prisma migrate deploy
bash scripts/dev/seed-dev-system-admin.sh                   # once — local SYSTEM_ADMIN login
(cd apps/web && set -a && . ../../.env && set +a && npx next dev -p 3001)
# the stub provisioning worker — refuses any Temporal or database host but localhost;
# never alongside the real worker (src/workers/main.ts), which would call AWS
(cd backend && set -a && . ../.env && set +a && \
  COS_DEV_STUB_HOLD=lanna_steel_works npx ts-node test/dev/provisioning-stub-worker.ts)
node scripts/capture/web-system-admin.mjs
```

The web app reads no `.env` of its own — `KEYCLOAK_ISSUER`, `NEXTAUTH_*` and `NEXT_PUBLIC_API_URL` come
from the root `.env`, which is why it is sourced first. A second run finds the codes taken (the form answers
`409`), `northeastern_build` already inactive, the runs started and the hosts assigned, skips those writes, and
shoots the same frames. The held run stays in `CREATING_RDS` for about 75 minutes (three 25-minute attempts)
and then fails; after that `lanna_steel_works` reads `Active` again, so re-shoot within that window or with a
freshly created held tenant.

The dev account is `sysadmin@construction-os.dev`, realm `construction-os-dev`, home tenant `EKC`. It
exists only on a local Keycloak — the seed refuses any other host. §6.7 says SYSTEM_ADMIN "is NOT
provisioned to any tenant"; the account carries a home tenant anyway because the web client refuses a
token without `tenant_id` and `audit_logs.actor_id` needs a `platform.users` row. That reading is recorded
in §6.7 for the product owner to confirm.
