---
title: 'MVP Scope'
version: '1.5.0'
status: Active
last_updated: '2026-06-20'
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
- Vendor Portal (external self-service: RFQ, quotation, PO status, invoice) — MVP
- CredentialService (W3C DID/VC) — MVP. **Promoted from Enterprise-opt-in to MVP (ADR-067)** as the
  prerequisite for client contract signing. Issuer = persistent per-tenant `did:web` (Ed25519 key in Vault,
  ADR-013) for `LicenceVC`/`EquipmentCertVC`/`TrainingRecordVC`; contract signer = ephemeral `did:key`;
  VC = `Ed25519Signature2020` (JSON-LD Data Integrity); revocation = Status List 2021; offline verification
  (§5.3, BG-001). **Built before contract signing.**
- Client contract signing (e-signature workflow) — MVP. Adds the actual signing capability on top of the
  existing `Contract` entity + `signed` status (11-database-schema). **Mechanism (ADR-058, re-based onto
  ADR-067):** contractor authorized-role signs directly + client signs via magic-link (ADR-030); each
  signature = a `ContractSignatureVC` from an **ephemeral `did:key`** over the SHA-256 document hash
  (CredentialService); the contract document is uploaded **or** generated in-app; `signed` is reached when
  both signatures verify. Built on the `finance` service. See §11 (`ContractSignature`), §14
  (`/finance/contracts/{id}/sign…`), §06 (Contract signing row), §16 events.

Note on Workforce Management in MVP :

Workforce management (check-in/check-out, site attendance, daily timesheet) is included in MVP because :

- Worker attendance is required to generate accurate daily site reports (see 11-database-schema Workforce entity)
- Manpower count is a mandatory field in Site Reports and is used in cost-per-day calculations
- Offline check-in is a field operation critical path requirement (see 17-offline-mobile-sync section 17.4 — Workforce
  attendance is a high-priority sync entity)

MVP Workforce scope : daily check-in/check-out, timesheet by project, manpower count for
site reports. Advanced features (shift optimization, productivity analytics) are post-MVP.

Note on Safety and Quality Control in MVP :

Safety and QC are included in MVP because daily field operations depend on them from Day 1 :

- Safety offline sync is required for site operation (see 17-offline-mobile-sync section 17.4)
- Safety notifications are non-disableable (see 19-notification-architecture section 19.6)
- Safety permit approval is part of the core approval chain (see 15-event-driven-workflow section 15.5)
- QC inspection forms are required for construction milestone gate validation

MVP Safety scope : incident reports, safety checklists, work permits, safety permit approval workflow, and
a deterministic compliance view. MVP QC scope : inspection forms with pass/fail/conditional results and photo upload.

Advanced safety features (**AI-based** compliance detection from video/photo) are post-MVP
Layer B/C capabilities — see 22-ai-architecture section 22.2. The deterministic compliance view
(`GET /api/v1/safety/compliance`) is MVP; only the AI detection enhancement is deferred.

### Excluded Initially

Modules :

- CRM advanced UI (pipeline kanban, dashboards, proposal generation) — the basic
  leads / opportunities / customers UI + backend are MVP (see section 21.6)
- Full BIM
- IoT
- Advanced digital twin
- Autonomous AI agents
- Full ERP replacement

### Construction full-flow scope — documented future (post-MVP)

Accepted as future scope by the product owner (2026-07-20, **ADR-057**) after the scope-boundary review in
`docs/research/back-office-boundary.md`. Each item was confirmed **absent from the entire spec** (verified,
not inferred). Listed at **capability level only** — internal design (schema, API, RBAC, events, UX) is
defined when each item's phase begins, per the §20.7.12c convention; do not stub before that decision.

| Capability                                              | What it adds                                                                       | Confirmed current state                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Variation Order / Change Order / Claims                 | Manage approved changes to contract scope/price, linked to Contract + BOQ + budget | **Designed — ADR-059** (`VariationOrder` + `Claim` in finance); still post-MVP                                          |
| Inventory / Warehouse (WMS)                             | Stock movement, GRN vs PO delivery, multi-warehouse, material valuation            | **Designed — ADR-060** (Warehouse + StockMovement + GRN, procurement; moving average); still post-MVP                   |
| ราคากลาง (Comptroller-General central pricing)          | Reference-price source feeding BOQ line items                                      | **Designed — ADR-061** (`platform.central_price_catalog` + BOQ `reference_price`; import + API adapter); still post-MVP |
| e-GP (Electronic Government Procurement) integration    | Public-tender data / bidding for government work                                   | **Designed — ADR-062** (`Tender` + `Bid` in crm/Preconstruction; adapter + manual; won → Contract); still post-MVP      |
| Bank guarantees / bonds                                 | Bid / performance / retention / advance bonds, linked to Contract + e-GP           | **Designed — ADR-063** (`Bond` in finance; full lifecycle + expiry alert); still post-MVP                               |
| Building permit & license management                    | Track construction permits/licences by status & expiry                             | **Designed — ADR-064** (extends `Permit`: +building_permit/license +issuing_authority +expiry alert); still post-MVP    |
| Project risk register                                   | Structured project risk log (distinct from AI delay-risk forecasting)              | **Designed — ADR-065** (`ProjectRisk` in projects; 5×5 scoring + AI-suggested feed); still post-MVP                     |
| Site instruction / meeting minutes / correspondence log | Document-control records                                                           | **Designed — ADR-066** (`CommunicationRecord` + `ActionItem` in projects); still post-MVP                               |

> **Note — client contract signing is MVP, not here.** The signing capability (e-signature) is placed in
> MVP scope (§21.2 Included); its mechanism is decided in ADR-058 (bilateral PKI/VC + client magic-link).

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

> The basic CRM UI + backend are now MVP. The schema and the four §14 endpoints did not actually exist before;
> they were built together with the `/crm/leads · /crm/opportunities · /crm/customers` pages. Only **advanced** CRM UI
> (pipeline kanban, analytics dashboards, proposal generation) remains post-MVP.

The basic CRM UI is in MVP; the CRM database schema (`crm` schema) ships with it.

Rationale :

- CRM tables (Lead, Opportunity, Contact, Customer) are referenced by Project and Finance flows
- Customer is the existing `finance.customers` store (ADR-024); CRM `convert` populates it
- The CRM data model is defined in 11-database-schema section 11.3

What is excluded from MVP :

- CRM advanced views: lead pipeline (kanban) views
- Opportunity tracking dashboards (analytics)
- Proposal generation workflows
- CRM mobile screens

What is included in MVP :

- All CRM tables (`crm.leads`, `crm.opportunities`, `crm.contacts`) with tenant_id + RLS
- CRM entity lifecycle: Lead → Opportunity → Customer (`finance.customers`)
- Basic web UI: leads / opportunities (+ convert) / customers (§20.7.10)

### CRM API Availability During MVP

The CRM REST API endpoints (`docs/api/crm.openapi.yaml`) are **available via API from Day 1** — they are not blocked at
the Kong Gateway.

| Layer                                                                                     | MVP Status                                                    |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| CRM database schema                                                                       | ✅ Built Day 1                                                |
| CRM API endpoints (`/crm/leads`, `/crm/opportunities`, `/crm/opportunities/{id}/convert`) | ✅ Available — role-gated (EXECUTIVE, CRM_SALES_MANAGER only) |
| CRM web UI — basic (leads, opportunities + convert, customers)                            | ✅ MVP (§20.7.10)                                             |
| CRM web UI — advanced (pipeline kanban, dashboards, proposal workflows)                   | ❌ Excluded from MVP                                          |
| CRM mobile screens                                                                        | ❌ Excluded from MVP                                          |

**Rationale for API-open, UI-excluded approach:**

- CRM data (leads, opportunities) may be seeded via API before the UI ships — no manual migration needed at UI launch
- FK integrity to Project and Finance tables is enforced from Day 1
- Exposing the API without UI adds no attack surface beyond the existing JWT + role check

**Access control:** Kong Gateway enforces the JWT `tenant_id` claim. The NestJS auth guard checks
that the requesting user has `EXECUTIVE` or `CRM_SALES_MANAGER` role. No other role can reach
CRM endpoints regardless of whether the UI exists.

---

## References

| ID             | Title                                                              | Source                                                                    |
| -------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| [IEEE 830]     | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998                                                         |
| [Kafka]        | Apache Kafka Documentation                                         | [kafka.apache.org/documentation](https://kafka.apache.org/documentation/) |
| [Temporal]     | Temporal Workflow Documentation                                    | [docs.temporal.io](https://docs.temporal.io/)                             |
| [React Native] | React Native / Expo Documentation                                  | [docs.expo.dev](https://docs.expo.dev/)                                   |
| [NestJS]       | NestJS — A progressive Node.js framework                           | [docs.nestjs.com](https://docs.nestjs.com/)                               |

> 📎 See also: [03-system-design](03-system-design.md) · [13-product-architecture](13-product-architecture.md)
> · [20-ux-flow](20-ux-flow.md) · [22-ai-architecture](22-ai-architecture.md) · [11-database-schema](11-database-schema.md)
