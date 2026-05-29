---
title: "MVP Scope"
version: "1.4.0"
status: Active
last_updated: "2026-05-26"
authors:
  - thitipongroo
related_docs:
  - 03-system-design.md
  - 13-product-architecture.md
  - 20-ux-flow.md
  - 22-ai-architecture.md
  - 11-database-schema.md
---

# 21. MVP Scope

## Table of Contents

- [21.1 MVP Goal](#211-mvp-goal)
- [21.2 MVP Modules](#212-mvp-modules)
  - [Included](#included)
  - [Excluded Initially](#excluded-initially)
- [21.3 MVP KPI](#213-mvp-kpi)
- [21.4 MVP AI Scope](#214-mvp-ai-scope)
- [21.5 Multi-tenant Commitment](#215-multi-tenant-commitment)
- [21.6 CRM Schema Status](#216-crm-schema-status)

---

## 21.1 MVP Goal

Solve:

> "Project cost + procurement + site visibility"

because this creates immediate ROI.

---

## 21.2 MVP Modules

### Included

Modules :

- Project management
- BOQ
- Procurement
- Daily reports
- Cost tracking
- Workforce management (worker check-in/check-out, site attendance, daily timesheet) — see note below
- Safety (incident reporting, safety checklists, work permits) — see note below
- Quality Control (site inspections, checklist responses, photo uploads) — see note below
- Mobile field app
- Dashboard
- AI report assistant

Note on Workforce Management in MVP :

Workforce management (check-in/check-out, site attendance, daily timesheet) is included in
MVP because :

- Worker attendance is required to generate accurate daily site reports (see 11-database-schema
  Workforce entity)
- Manpower count is a mandatory field in Site Reports and is used in cost-per-day calculations
- Offline check-in is a field operation critical path requirement (see 17-offline-mobile-sync
  section 17.4 — Workforce attendance is a high-priority sync entity)

MVP Workforce scope : daily check-in/check-out, timesheet by project, manpower count for
site reports. Advanced features (shift optimization, productivity analytics) are post-MVP.

Note on Safety and Quality Control in MVP :

Safety and QC are included in MVP because daily field operations depend on them from Day 1 :

- Safety offline sync is required for site operation (see 17-offline-mobile-sync section 17.4)
- Safety notifications are non-disableable (see 19-notification-architecture section 19.6)
- Safety permit approval is part of the core approval chain (see 15-event-driven-workflow section 15.5)
- QC inspection forms are required for construction milestone gate validation

MVP Safety scope : incident reports, safety checklists, work permits, safety permit approval workflow.
MVP QC scope : inspection forms with pass/fail/conditional results and photo upload.

Advanced safety features (AI-based compliance detection from video/photo) are post-MVP
Layer B/C capabilities — see 22-ai-architecture section 22.2.

### Excluded Initially

Modules :

- CRM (UI module excluded — schema is built from Day 1, see section 21.6)
- Full BIM
- IoT
- Advanced digital twin
- Autonomous AI agents
- Full ERP replacement

---

## 21.3 MVP KPI

Targets :

- Reduce reporting time 80%
- Reduce procurement leakage 15%
- Improve budget visibility real-time
- Reduce project delays

---

## 21.4 MVP AI Scope

Layer A — Assistive AI only :

- Daily report generation
- Document summarization
- Voice transcription (field notes)
- OCR (drawings, invoices)

Layer B (Analytical) and Layer C (Autonomous) are post-MVP.

---

## 21.5 Multi-tenant Commitment

MVP is built multi-tenant from Day 1 :

- All entities include tenant_id — no shortcut to single-tenant schema
- Isolation model: Shared DB + tenant_id (SMB tier from the start)
- Keycloak: shared realm, per-tenant isolation by tenant_id claim in JWT
- Rationale: refactoring single-tenant to multi-tenant later costs more than building it right once

---

## 21.6 CRM Schema Status

CRM module UI is excluded from MVP but the CRM database schema is built from Day 1.

Rationale :

- CRM tables (Lead, Opportunity, Contact, Customer) are referenced by Project and Finance flows
- Building the schema now avoids a breaking migration when the CRM UI ships post-MVP
- The CRM data model is defined in 11-database-schema section 11.3

What is excluded from MVP :

- CRM UI pages and navigation
- Lead pipeline views
- Opportunity tracking dashboards
- Proposal generation workflows

What is included in MVP (schema-only) :

- All CRM tables with tenant_id from Day 1
- CRM entity lifecycle: Lead → Opportunity → Customer
- FK relationships from Customer to Project

### CRM API Availability During MVP

The CRM REST API endpoints (`docs/api/crm.openapi.yaml`) are **available via API from Day 1** — they are not blocked at the Kong Gateway.

| Layer | MVP Status |
| --- | --- |
| CRM database schema | ✅ Built Day 1 |
| CRM API endpoints (`/crm/leads`, `/crm/opportunities`, `/crm/opportunities/{id}/convert`) | ✅ Available — role-gated (EXECUTIVE, CRM_SALES_MANAGER only) |
| CRM web UI (pipeline views, dashboards, proposal workflows) | ❌ Excluded from MVP |
| CRM mobile screens | ❌ Excluded from MVP |

**Rationale for API-open, UI-excluded approach:**

- CRM data (leads, opportunities) may be seeded via API before the UI ships — no manual migration needed at UI launch
- FK integrity to Project and Finance tables is enforced from Day 1
- Exposing the API without UI adds no attack surface beyond the existing JWT + role check

**Access control:** Kong Gateway enforces the JWT `tenantId` claim. The NestJS auth guard checks
that the requesting user has `EXECUTIVE` or `CRM_SALES_MANAGER` role. No other role can reach
CRM endpoints regardless of whether the UI exists.

---

## References

| ID | Title | Source |
| --- | --- | --- |
| [IEEE 830] | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998 |
| [Kafka] | Apache Kafka Documentation | [kafka.apache.org/documentation](https://kafka.apache.org/documentation/) |
| [Temporal] | Temporal Workflow Documentation | [docs.temporal.io](https://docs.temporal.io/) |
| [React Native] | React Native / Expo Documentation | [docs.expo.dev](https://docs.expo.dev/) |
| [NestJS] | NestJS — A progressive Node.js framework | [docs.nestjs.com](https://docs.nestjs.com/) |

> 📎 See also: [03-system-design](03-system-design.md) · [13-product-architecture](13-product-architecture.md) · [20-ux-flow](20-ux-flow.md) · [22-ai-architecture](22-ai-architecture.md) · [11-database-schema](11-database-schema.md)
