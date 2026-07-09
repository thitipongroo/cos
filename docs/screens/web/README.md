---
title: Construction OS — Web Screen Capture
last_updated: 2026-07-07
---

# Construction OS — Web App Screens

> Part of [`docs/screens/`](../README.md) · platform: **Web** (Next.js + Serwist, tablet/laptop browser).

✅ **24 screens** — 1440×900 headless Chromium, live local backend + seeded `DEMO-001` data.

| Browser | Chromium (Playwright), 1440×900 viewport                                             |
| ------- | ------------------------------------------------------------------------------------ |
| User    | `e2e-admin@construction-os.io` — role `TENANT_ADMIN` (widest page access)            |
| Backend | NestJS modular monolith @ `localhost:3000`, Postgres + ClickHouse + Redis + Keycloak |
| Web app | Next.js @ `localhost:3001`                                                           |
| Project | `DEMO-001` — _Bangkok Tower — Phase 1_ (tenant `…0001`)                              |

## Screens

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
