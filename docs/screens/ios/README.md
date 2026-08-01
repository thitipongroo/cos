---
title: Construction OS — iOS Screen Capture
last_updated: 2026-07-04
---

# Construction OS — iOS App Screens

> Part of [`docs/screens/`](../README.md) · platform: **iOS** (iPhone 17 simulator). Android and Web live in sibling folders.

❌ **No iOS screenshots are committed.** Every `.png` this file indexes was deleted by `7d2ba1b`
("update: screens out date") and has not been retaken — Android was recaptured after that commit,
iOS was not. Everything below therefore describes the **target** set and how to produce it, not
files you will find in this folder. Re-run the capture (see [How these were captured](#how-these-were-captured))
before treating any link here as live.

Full-flow screenshots of the Construction OS mobile app (Expo / React Native, iOS),
captured against the **local backend running with seeded demo data**. Every screen was
reached by a real login (Path A phone + OTP) and live API/analytics calls — not mockups.

| Device  | iPhone 17 simulator (iOS 26), `COS.app` Release build                                        |
| ------- | -------------------------------------------------------------------------------------------- |
| User    | `+66800000002` — role `PROJECT_MANAGER` (OTP `123456`, E2E bypass)                           |
| Backend | NestJS modular monolith @ `localhost:3000`, Postgres + ClickHouse + Redis + Keycloak + Kafka |
| Project | `DEMO-001` — _Bangkok Tower — Phase 1_ (tenant `…0001`)                                      |

## Screens

| #   | Screen                                    | Route             | What it shows (live data)                                                                               |
| --- | ----------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------- |
| 00  | [Login](00-login.png)                     | `(auth)/login`    | Path A phone + OTP sign-in                                                                              |
| 01  | [Home](01-home.png)                       | `home`            | 2 open issues · 0 pending sync · project picker · Check in                                              |
| 02  | [PM Dashboard](02-dashboard.png)          | `dashboard`       | Daily KPI cards from ClickHouse analytics — manpower 24, open issues 2, failed inspections 1, reports 1 |
| 03  | [Projects](03-projects.png)               | `projects`        | Offline-cached project list — DEMO-001 · Bangkok Tower — Phase 1 (ACTIVE)                               |
| 04  | [Tasks](04-tasks.png)                     | `tasks`           | Pour foundation — Zone A, Install rebar — Level 2 (0%, NOT_STARTED, SYNCED)                             |
| 05  | [Portfolio](05-portfolio.png)             | `portfolio`       | Bangkok Tower — Phase 1 (ACTIVE)                                                                        |
| 06  | [Budget](06-budget.png)                   | `budget`          | Total budget 5,000,000 THB · allocated/committed/actual · variance                                      |
| 07  | [Invoices](07-invoices.png)               | `invoices`        | INV-2026-001 (RECEIVED)                                                                                 |
| 08  | [Payments](08-payments.png)               | `payments`        | Payment 125,000 (PENDING) + Approve                                                                     |
| 09  | [Procurement](09-procurement.png)         | `procurement`     | PO-2026-001 (DRAFT)                                                                                     |
| 10  | [RFQs](10-rfqs.png)                       | `rfqs`            | RFQ-2026-001 (DRAFT)                                                                                    |
| 11  | [Purchase Orders](11-orders.png)          | `orders`          | PO-2026-001 (DRAFT)                                                                                     |
| 12  | [Deliveries](12-deliveries.png)           | `deliveries`      | Record-delivery form (PO ID, camera) + delivery record                                                  |
| 13  | [Issues](13-issues.png)                   | `issues`          | Water leak in basement — Zone B, Delayed concrete delivery (LOW, SYNCED)                                |
| 14  | [Incidents](14-incidents.png)             | `incidents`       | Safety incident report form (severity LOW→CRITICAL) — no incidents yet                                  |
| 15  | [Inspections](15-inspections.png)         | `inspections`     | Inspection checklist                                                                                    |
| 16  | [Site Reports](16-reports.png)            | `reports`         | 2 site reports — 2026-07-04, 2026-07-03 (DRAFT)                                                         |
| 17  | [Daily Report](17-report.png)             | `report`          | Report submission form — project picker + summary + Save                                                |
| 18  | [Alerts](18-alerts.png)                   | `alerts`          | Notification feed — no alerts                                                                           |
| 19  | [Conflict Review](19-conflict-review.png) | `conflict-review` | Offline sync conflict review — no conflicts 🎉                                                          |
| 20  | [Profile](20-profile.png)                 | `profile`         | User ID · role PROJECT_MANAGER · Log out                                                                |

Screens that read from the offline WatermelonDB cache (dashboard, budget, incidents, report)
gate their data behind selecting a project — the capture taps the **DEMO-001** chip before
shooting. Empty states ("No alerts", "No incidents yet", "No conflicts") are genuine — that
data was not seeded.

## How these were captured

A Detox spec ([`apps/mobile/e2e/capture.spec.ts`](../../apps/mobile/e2e/capture.spec.ts))
drives the Release build: it logs in once, then deep-links each route (`cos:///<route>`) and
writes the booted-simulator frame straight to this folder via `xcrun simctl io booted screenshot`.

```bash
# infra + backend must be up (docker compose), then:
cd apps/mobile
detox test -c ios.sim.release e2e/capture.spec.ts
```

Demo data seed: `scratchpad/demo-seed.sql` (Postgres domain rows) plus ClickHouse
`analytics.*_daily` aggregate-state inserts for project `DEMO-001`.

## Bugs found & fixed while enabling the capture

1. **Hermes networking crash (critical).** `react-native/…/dom/events/Event.js` declares
   instance fields `+NONE/+CAPTURING_PHASE/…`; under this project's `loose` class-properties
   Babel transform they compile to `this.NONE = void 0`, which hits the read-only getters on
   `Event.prototype` and throws _"Cannot assign to read-only property 'NONE'"_ under Hermes —
   breaking **every** XHR/network request (login, all data). The app could not talk to the
   backend at all until this was patched.
2. **Analytics ignored the auth context.** The analytics controllers required `tenantId` as a
   query param (a cross-tenant data-leak risk) and a mandatory `dateRange`; the mobile
   dashboard sent neither, so it always showed _"Could not load analytics"_. Now `tenantId`
   comes from the authenticated request (`req.tenantId`) and `dateRange` defaults to 90 days —
   see `backend/src/modules/analytics/analytics.request.ts`.
