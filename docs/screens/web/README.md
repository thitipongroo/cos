---
title: Construction OS — Web Screen Capture
last_updated: 2026-07-07
---

# Construction OS — Web App Screens

> Part of [`docs/screens/`](../README.md) · platform: **Web** (Next.js + Serwist, tablet/laptop browser).

⚠️ **4 screens committed** — the pre-auth login flow in [`01-public/`](01-public/). The 24-route table
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

Same convention as [`../android/`](../android/README.md): numbered folders for cross-role flows,
`UPPER-KEBAB` for role folders (`TENANT-ADMIN`, not `TENANT_ADMIN`).

| Folder                 | Written by                                                 |
| ---------------------- | ---------------------------------------------------------- |
| `01-public/`           | `capture-screens.mjs` — pre-auth routes                    |
| `<ROLE>/`              | `capture-screens.mjs` — every route that role reaches      |
| `<ROLE>/interactions/` | `capture-interactions.mjs` — detail pages, forms, popovers |
| `PROJECT-MANAGER/`     | `capture-graph.mjs` — the knowledge-graph pages            |

The role **keys inside those scripts** stay `UPPER_SNAKE` (`TENANT_ADMIN`) because they are CosRole
identities that the scripts branch on; only the folder name is kebab-cased, via a `folderFor()` helper.

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
