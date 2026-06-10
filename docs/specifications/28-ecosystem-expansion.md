---
title: 'Future Ecosystem Expansion Strategy'
version: '1.1.0'
status: Active
last_updated: '2026-05-25'
authors:
  - thitipongroo
related_docs:
  - 18-enterprise-saas-scaling.md
  - 25-go-to-market.md
  - 26-pricing-model.md
  - 27-long-term-moat.md
  - 29-final-strategic-positioning.md
---

# 28. Future Ecosystem Expansion Strategy

## Table of Contents

- [28.1 Ecosystem Philosophy](#281-ecosystem-philosophy)
- [28.2 Expansion Layers](#282-expansion-layers)
- [28.3 Platform Flywheel](#283-platform-flywheel)
- [28.4 Phase Success Metrics](#284-phase-success-metrics)
- [28.5 Phase Dependencies and Entry Criteria](#285-phase-dependencies-and-entry-criteria)
- [28.6 Risks and Mitigations](#286-risks-and-mitigations)
- [28.7 Ecosystem Architecture Decisions](#287-ecosystem-architecture-decisions)
- [28.8 V2 Infrastructure Strategic Framework](#288-v2-infrastructure-strategic-framework)
- [28.9 V3 Real Estate Strategic Framework](#289-v3-real-estate-strategic-framework)

---

## 28.1 Ecosystem Philosophy

The long-term winner is not software.

The winner becomes:

> The construction ecosystem infrastructure layer.

Software can be copied. Ecosystems cannot. The goal is to become the indispensable
infrastructure that construction businesses depend on — not just for internal operations,
but for their entire supply chain, financing, and physical asset management.

Each expansion phase:

- Creates a new revenue stream
- Deepens switching costs
- Adds new data signals that compound AI quality
- Attracts new participants who bring network effects

---

## 28.2 Expansion Layers

### Phase 1 — Internal Operations _(MVP scope — see 21-mvp-scope)_

Timeline: Year 1

Capabilities:

- Projects and scheduling
- Procurement (PR → RFQ → PO → Delivery)
- Costing (BOQ, budget tracking, cost transactions)
- Reporting (daily site reports, QC inspections, safety)

Value delivered: Replace spreadsheets and disconnected tools with a single operational platform.

Target customers: General contractors, 20–500 person construction companies in Thailand.

---

### Phase 2 — External Collaboration _(Post-MVP Stage 1–2)_

Timeline: Year 1–2

Capabilities:

- **Vendor portal** — vendors receive RFQs, submit quotations, track PO status, submit
  invoices. No platform account required to respond to RFQs (frictionless onboarding).
- **Contractor portal** — subcontractors track assigned tasks, submit progress updates,
  upload daily reports
- **Customer portal** — clients (property developers, building owners) view project
  progress, milestone billing status, QC inspection results, handover documentation

Value delivered: Remove email/phone-tag friction from external collaboration.
Each portal participant added creates a bilateral network effect — they become
dependent on the platform to interact with the contractor.

---

### Phase 3 — Marketplace Economy _(Post-MVP Stage 2–3)_

Timeline: Year 2–3

Prerequisites: ≥ 200 active vendor relationships on platform (see section 28.5).

Capabilities:

- **Material marketplace** — contractors source materials from platform-verified vendors;
  price benchmarking from aggregated procurement data; bulk purchasing negotiation
- **Workforce marketplace** — daily labor sourcing; subcontractor discovery; skill-based
  matching; compliance verification (work permits, insurance)
- **Equipment marketplace** — equipment rental matching; cross-project equipment sharing;
  utilization optimization

Revenue model: Transaction fee / take rate on marketplace volume (see 26-pricing-model).

Value delivered: Reduce procurement lead time and unit costs through market aggregation.
Platform captures a share of every construction input transaction.

---

### Phase 4 — Financial Infrastructure _(Stage 3–5)_

Timeline: Year 3–5

Prerequisites: Proven risk scoring accuracy from Layer B AI (see 22-ai-architecture);
regulatory approvals for financial services.

Capabilities:

- **Construction financing** — project-milestone-linked draw-down loans; underwritten
  using platform data (project progress, cash flow, vendor payment history)
- **Invoice factoring** — contractors sell approved vendor invoices for immediate cash;
  underwritten by platform payment data
- **Insurance underwriting** — construction all-risk and liability insurance priced using
  platform risk scores; claims correlated against platform safety and inspection records
- **Risk scoring as a service** — AI-generated project risk score sold to banks,
  insurers, and project owners as an API product

Revenue model: Interest spread, factoring fee, insurance premium sharing, API subscription.

Value delivered: Remove the cash flow bottleneck that kills construction companies.
Platform becomes the financial infrastructure layer — the most defensible position possible.

---

### Phase 5 — Smart Infrastructure Layer _(Stage 5+)_

Timeline: Year 5+

Prerequisites: Dominant market position in Phase 1–4; partner ecosystem for IoT hardware.

Capabilities:

- **IoT integration** — site sensors (concrete cure sensors, structural monitoring, dust,
  noise), equipment telemetry, worker location tracking
- **Digital twins** — living 3D model of each project linked to platform operational data;
  real-time progress visualization; BIM integration
- **Carbon analytics** — embodied carbon tracking per material consumption record;
  carbon footprint reporting for ESG compliance
- **Smart city integration** — data feeds to municipal building inspection systems,
  infrastructure asset registries, urban planning platforms

Revenue model: IoT platform subscription, digital twin SaaS, carbon credit verification service.

Value delivered: Platform becomes the data infrastructure layer for physical construction —
from breaking ground to building lifecycle management.

---

## 28.3 Platform Flywheel

```text
More projects
→ more vendors
→ more operational data
→ better AI
→ better forecasting
→ lower project risk
→ stronger ecosystem dependency

```

Each expansion phase accelerates the flywheel:

- Phase 2 (External Collaboration) → multiplies data inputs (vendor, contractor, client activity)
- Phase 3 (Marketplace) → adds transaction data → better price benchmarks → better procurement AI
- Phase 4 (Financial) → adds cash flow and risk data → better risk models → lower default rates
- Phase 5 (IoT/Digital Twin) → adds physical world data → ground truth for AI predictions

---

## 28.4 Phase Success Metrics

### Phase 1 Metrics

| Metric             | Target                               | Timeframe     |
| ------------------ | ------------------------------------ | ------------- |
| Paying tenants     | ≥ 10                                 | End of Year 1 |
| Active projects    | ≥ 50                                 | End of Year 1 |
| 90-day retention   | ≥ 80%                                | Ongoing       |
| Daily active usage | ≥ 60% of licensed users active daily | Ongoing       |

### Phase 2 Metrics

| Metric                         | Target                                            | Timeframe     |
| ------------------------------ | ------------------------------------------------- | ------------- |
| Vendors with portal accounts   | ≥ 200                                             | End of Year 2 |
| RFQs sent via vendor portal    | ≥ 70% of all RFQs                                 | End of Year 2 |
| Vendor quotation response rate | ≥ 60%                                             | End of Year 2 |
| Customer portal adoption       | ≥ 30% of tenants have at least 1 client on portal | End of Year 2 |

### Phase 3 Metrics

| Metric                            | Target                      | Timeframe |
| --------------------------------- | --------------------------- | --------- |
| Marketplace GMV                   | ≥ 100M THB per year         | Year 3    |
| Materials sourced via marketplace | ≥ 20% of platform PO volume | Year 3    |
| Take rate                         | ≥ 1.5% of GMV               | Year 3    |
| Workforce placements              | ≥ 1,000 per month           | Year 3    |

### Phase 4 Metrics

| Metric                   | Target                             | Timeframe |
| ------------------------ | ---------------------------------- | --------- |
| Loan book originated     | ≥ 500M THB                         | Year 4    |
| Default rate             | ≤ 2% (vs. industry average ~5%)    | Ongoing   |
| Invoice factoring volume | ≥ 200M THB per year                | Year 4    |
| AI risk score accuracy   | ≥ 80% default prediction precision | Year 4    |

### Phase 5 Metrics

Defined at Phase 24 planning gate (see [33-digital-twin-iot.md](33-digital-twin-iot.md)
§33.10 and §28.5 entry criteria for Phase 5 — IoT/Digital Twin). Target: Year 5+.

---

## 28.5 Phase Dependencies and Entry Criteria

| Phase                      | Entry Criteria                                                           | Key Dependency                                                                        |
| -------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Phase 2 — Vendor Portal    | ≥ 10 tenants live; ≥ 100 vendor contacts in system                       | Vendor portal product built; frictionless invite flow                                 |
| Phase 2 — Customer Portal  | ≥ 5 tenants with active billing workflows                                | AR/Billing module live (MVP scope)                                                    |
| Phase 3 — Marketplace      | ≥ 200 vendors on portal; ≥ 500M THB annual procurement on platform       | Payment infrastructure ready; marketplace trust and safety policies                   |
| Phase 4 — Financial        | Phase 3 live; risk scoring model accuracy validated; regulatory approval | Financial services license (BoT / SEC depending on product); legal entity for lending |
| Phase 5 — IoT/Digital Twin | Phase 4 revenue base sustainable; IoT hardware partner                   | BIM integration partner; IoT device certification; digital twin rendering engine      |

---

## 28.6 Risks and Mitigations

| Risk                                               | Phase    | Likelihood | Impact    | Mitigation                                                                                                            |
| -------------------------------------------------- | -------- | ---------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| Vendor adoption too slow for marketplace           | Phase 3  | Medium     | High      | Phase 2 vendor portal provides the base; marketplace is incremental for existing vendors                              |
| Regulatory barrier for financial products          | Phase 4  | High       | High      | Engage BoT early; structure initial products as B2B (corporate lending, not consumer) to reduce regulatory complexity |
| IoT hardware complexity and cost                   | Phase 5  | Medium     | Medium    | Partner with established IoT vendors (Autodesk Construction Cloud, Trimble) rather than building hardware             |
| Phase 1 retention failure derails expansion        | Phase 1  | Medium     | Very High | Customer success program; executive sponsor program for Year 1 tenants; NPS monitoring at 30/60/90 days               |
| Competitor copies marketplace before moat is built | Phase 3  | Medium     | Medium    | Phase 3 entry requires proprietary procurement data as the trust anchor — no data = no credible marketplace           |
| Currency / macro risk in SEA expansion             | Phase 2+ | Low        | Medium    | Start Thailand-only; expand to SEA only after Thailand market leadership confirmed (see 25-go-to-market)              |

## 28.7 Ecosystem Architecture Decisions

### Marketplace Transaction Model (ECO-002)

**Decision:** Commission + SaaS hybrid; transparent take rate published in pricing.
**Resolved:** 2026-06-10

| Revenue stream                  | Model             | Rate                            |
| ------------------------------- | ----------------- | ------------------------------- |
| Marketplace transaction fee     | Commission on GMV | 2-5% per transaction            |
| Platform subscription           | Monthly SaaS      | Included in tier pricing        |
| Ecosystem partner revenue share | 70/30 split       | 30% to platform, 70% to partner |

Take rate starts at 2% for Phase 3 entry; increases to 5% at scale when platform has
established price discovery advantage. Rate disclosed in platform terms before vendor onboarding.

---

### Vendor Minimum Threshold (ECO-005)

**Decision:** 3 verified projects + quality score ≥ 70 + 90-day probationary period.
**Resolved:** 2026-06-10

- **Verified projects:** ≥ 3 completed projects with documented on-time delivery records
- **Quality score:** ≥ 70 / 100 from ECO-004 trust scoring algorithm at activation date
- **Response time:** Average RFQ response time < 48 hours over 30-day evaluation window
- **Probation:** 90 days post-activation; quality score drop below 60 triggers suspension
  and human review
- **Re-qualification:** Suspended vendors re-qualify after 60 days with fresh project evidence

---

### Multi-Industry Expansion Priority (COORD-002)

**Decision:** Construction → Infrastructure → Real Estate; 18-month maturity gate per vertical.
**Resolved:** 2026-06-10

- **Vertical 1 — Construction:** Phase 1–4 (current strategy; must achieve Phase 4 metrics)
- **Vertical 2 — Infrastructure:** Civil works, roads, utilities; see §28.8 for full V2 spec
- **Vertical 3 — Real Estate:** Property development, leasing, facility management; see §28.9
- **Maturity gate:** Each vertical requires 18 months production stability before next begins;
  regulatory clearance required per target country
- **Horizontal expansion:** Adjacent industries (logistics, manufacturing) evaluated post-V3 only

---

### Payment Orchestration Model (COORD-005)

**Decision:** Single orchestration API with regional PSPs and automatic fallback chain.
**Resolved:** 2026-06-10

| Region                    | Primary PSP | Fallback PSP |
| ------------------------- | ----------- | ------------ |
| Thailand                  | Omise       | 2C2P         |
| Vietnam                   | VNPay       | MoMo         |
| Singapore / International | Stripe      | Braintree    |

**Orchestration pattern:** `PaymentService.charge(amount, currency, tenantId)` routes to
primary PSP; auto-falls back to secondary on timeout (> 10 s) or error response.
PSP selection is infrastructure — invisible to domain services.

**PromptPay / Thai QR:** Additional TH payment channel via Omise PromptPay API; scope
limited to B2B transactions ≤ THB 2,000,000 per BoT transaction limit; QR code generated
at checkout; settlement within T+1 business day. Enabled as opt-in channel per tenant
configuration.

---

### Multi-Domain Expansion (CIV-003)

**Decision:** Vertical expansion first (depth), then horizontal (breadth); regulated gates.
**Resolved:** 2026-06-10

- **Strategy:** Build moat in construction vertically before expanding laterally
- **Vertical path:** Construction (V1) → Infrastructure (V2) → Real Estate (V3); see COORD-002
- **Horizontal path:** After V3 stable — in order: (1) Energy / utilities, (2) Transportation /
  smart cities, (3) logistics / manufacturing; regulatory clearance required per domain group
- **Regulatory gate:** Each new domain requires country-specific legal review and regulatory
  clearance before product launch; no domain expansion without cleared legal basis
- **Data separation:** Domain-specific data models isolated; cross-domain AI intelligence
  only via the GLOB-004 Shared Foundation layer (see 22-ai-architecture §22.7 GLOB-004)

---

---

## 28.8 V2 Infrastructure Strategic Framework

### UX Paradigm

| Dimension        | V1 Construction            | V2 Infrastructure                                       |
| ---------------- | -------------------------- | ------------------------------------------------------- |
| Primary view     | Project list + Gantt       | Map-first — GIS primary pane                            |
| Location model   | Project site (polygon)     | Linear Referencing System — km marker / offset / lane   |
| Core object      | Task, Milestone, RFI       | Asset (road segment, bridge span, pipe section)         |
| Time horizon     | Project duration (months)  | Asset lifecycle (decades)                               |
| Primary user     | PM, site super, engineer   | Inspector, maintenance crew, capital planner            |
| Key metric       | Schedule / cost variance   | Condition score, maintenance backlog, capital budget    |

### APIs and Standards

| Standard                  | Version          | Scope                                                       | Status                                     |
| ------------------------- | ---------------- | ----------------------------------------------------------- | ------------------------------------------ |
| IFC 4.3                   | ISO 16739-1:2024 | ifcRoad, ifcBridge, ifcAlignment, ifcCourse, ifcTunnel      | Ratified Jan 2024 — extends existing stack |
| OGC API Features          | OGC Standard 2.0 | REST/JSON geospatial vector data transport                  | Production-ready                           |
| CityGML 3.0               | OGC 3DCityDB 5.0 | Urban digital twin — IoT + BIM interoperability             | Released early 2025                        |
| MQTT 5.0                  | OASIS 2019       | IoT sensor telemetry — extends `33-digital-twin-iot §33.2` | Already in stack                           |
| IFC+SG (building + ext.)  | BCA/LTA/PUB ext. | Building works + external civil works (CORENET X scope); standalone civil infra NOT covered | Excel mapping Dec 2025 — freely downloadable from info.corenet.gov.sg; no registration required |

### Stack Additions Required

| Component                  | Purpose                                              | Notes                                                  |
| -------------------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| GIS engine                 | Map-first UI + spatial queries                       | Esri / Mapbox / OpenLayers — decide at V2-1 entry      |
| Linear Referencing System  | km marker + offset + lane asset identification       | Extends existing asset registry data model             |
| IFC 4.3 parser extension   | ifcRoad / ifcBridge / ifcAlignment import            | Extends IFC parser in `13-product-architecture §13.4`  |

### Phase Breakdown

| Phase                    | Content                                                                          | Duration     | Entry Criteria                        |
| ------------------------ | -------------------------------------------------------------------------------- | ------------ | ------------------------------------- |
| V2-1 Asset Registry      | GIS integration, asset schema, LRS setup, IFC 4.3 import                        | 3–6 months   | V1 Phase 4 metrics + 18 months stable |
| V2-2 Condition Assess.   | Mobile inspection workflows, condition scoring 0–100, inspection history         | 3–6 months   | V2-1 complete                         |
| V2-3 Work Orders         | Preventive / corrective maintenance, crew scheduling (extends V1 Workforce)      | 3–6 months   | V2-2 complete                         |
| V2-4 Capital Planning    | Multi-year improvement plans, budget modelling, what-if scenarios                | 3–6 months   | V2-3 complete                         |
| V2-5 Digital Twin + IoT  | IoT sensor integration (extends `33-digital-twin-iot`), predictive maintenance   | 6–12 months  | V2-4 complete + IoT partner confirmed |
| V2-6 Integrations        | Agency portals (DOH, MEA/PEA, LTA), ERP, GIS, SCADA                             | Concurrent   | Per agency readiness                  |

### Regulatory per Country

| Country   | Agency / Mandate       | Status                                                             | Platform Action                                         |
| --------- | ---------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| Thailand  | กรมทางหลวง (DOH)       | No BIM mandate for contractors; data via MOT Data Catalog          | Optional: embed MOT Data Catalog for asset base map     |
| Thailand  | DEPA Smart City        | 37 active zones, 105-city target 2027; no mandatory tech stack     | Optional: apply for DEPA Digital Transformation Fund    |
| Vietnam   | Bộ Xây dựng BIM        | Mandatory Grade II+ public investment from 2026; ISO 19650 aligned | Support IFC export for VN public sector projects        |
| Vietnam   | Law on Data            | Effective July 1, 2025                                             | VN data residency applies to all V2 tenant data         |
| Singapore | CORENET X              | Building works only — standalone civil infra (roads, MRT, bridges) confirmed outside scope | No CORENET X obligation for V2 standalone civil infra tenants |
| Singapore | LTA (standalone infra) | No BIM mandate — LTA ISO 19650 certified internally (LRQA Singapore); no published IFC requirement for contractors on standalone civil works | Optional: align to ISO 19650 as market differentiator |

### REST API Endpoint Spec

**Pattern basis:** Maximo OSLC + Infor EAM + ArcGIS LRS (publicly documented).

```text
# Infrastructure Assets
GET    /api/v1/assets                          $filter, $select, $top, $skip, $orderby
POST   /api/v1/assets
GET    /api/v1/assets/{id}
PATCH  /api/v1/assets/{id}
DELETE /api/v1/assets/{id}
GET    /api/v1/assets/{id}/inspections
GET    /api/v1/assets/{id}/work-orders

# Inspections
POST   /api/v1/inspections
GET    /api/v1/inspections/{id}
PATCH  /api/v1/inspections/{id}

# Work Orders
POST   /api/v1/work-orders
GET    /api/v1/work-orders/{id}
PATCH  /api/v1/work-orders/{id}

# Linear Referencing (ArcGIS LRS pattern)
GET    /api/v1/lrs/networks                    route / alignment index
GET    /api/v1/lrs/networks/{id}/events        conditions / defects at linear position
POST   /api/v1/lrs/networks/{id}/events
GET    /api/v1/lrs/networks/{id}/events/{eid}
PATCH  /api/v1/lrs/networks/{id}/events/{eid}
```

**Asset resource:**

| Field             | Type          | Notes                                           |
| ----------------- | ------------- | ----------------------------------------------- |
| `asset_id`        | UUID          | PK                                              |
| `tenant_id`       | UUID          | FK                                              |
| `ifc_global_id`   | VARCHAR(22)   | IfcRoad / IfcBridge GlobalId (base64 IFC GUID)  |
| `asset_type`      | ENUM          | ROAD / BRIDGE / UTILITY / TUNNEL                |
| `name`            | VARCHAR(255)  |                                                 |
| `route_id`        | VARCHAR(100)  | LRS route identifier                            |
| `from_measure`    | DECIMAL(10,3) | km start along route                            |
| `to_measure`      | DECIMAL(10,3) | km end along route                              |
| `condition_score` | SMALLINT      | 0–100; 0 = critical, 100 = excellent            |
| `status`          | ENUM          | ACTIVE / UNDER_MAINTENANCE / DECOMMISSIONED     |
| `installed_at`    | DATE          |                                                 |
| `country_code`    | CHAR(2)       | ISO 3166-1 alpha-2                              |

**Inspection resource:**

| Field              | Type          | Notes                                                          |
| ------------------ | ------------- | -------------------------------------------------------------- |
| `inspection_id`    | UUID          | PK                                                             |
| `asset_id`         | UUID          | FK                                                             |
| `inspection_date`  | DATE          |                                                                |
| `inspector_id`     | UUID          | FK users                                                       |
| `condition_rating` | SMALLINT      | 0–9 NBI scale (bridges); 0–100 road pavement index             |
| `defects`          | JSONB         | `[{ defect_type, class, severity, dimension_m, photo_ids[] }]` |
| `lrs_from_measure` | DECIMAL(10,3) | km start of defect                                             |
| `lrs_to_measure`   | DECIMAL(10,3) | km end of defect; NULL for point defects                       |
| `submitted_at`     | TIMESTAMP     |                                                                |

**Work Order resource:**

| Field            | Type          | Notes                                                         |
| ---------------- | ------------- | ------------------------------------------------------------- |
| `work_order_id`  | UUID          | PK                                                            |
| `asset_id`       | UUID          | FK                                                            |
| `work_type`      | ENUM          | PREVENTIVE / CORRECTIVE                                       |
| `status`         | ENUM          | DRAFT / SCHEDULED / IN_PROGRESS / COMPLETE / CANCELLED        |
| `trade_code`     | VARCHAR(50)   | e.g. CIVIL, ELECTRICAL, DRAINAGE                              |
| `crew_id`        | UUID          | FK workforce                                                  |
| `scheduled_date` | DATE          |                                                               |
| `completed_date` | DATE          |                                                               |
| `cost_estimate`  | DECIMAL(15,2) |                                                               |
| `currency`       | CHAR(3)       | ISO 4217                                                      |

**Pagination and filtering:** OData-style `$filter`, `$select`, `$top`, `$skip`, `$orderby` on all list endpoints — consistent with V1.

**Singapore spatial export:** Internal storage WGS84; proj-transform to SVY21 (EPSG:3414) at IFC+SG export time — no change to internal data model.

---

### Screen-Level UX Spec

**Pattern basis:** ArcGIS / Geocortex / FacilityForce (map-first consensus), Bentley AssetWise Inspections (mobile form pattern), confirmed from publicly available product documentation.

| Screen                     | Primary content                                                                                                                                                    | Key interactions                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Map view (home)            | GIS map with asset layers — roads as polylines, bridges as points, utilities as polylines; colour-coded by condition score (green ≥ 70, amber 40–69, red < 40)    | Click asset → info panel: type, condition score, last inspection date, last WO; "Inspect" and "Create WO" CTAs from info panel       |
| Asset detail               | Tabs: Attributes, Inspection history, Work order history, IFC viewer (3D if IFC file present)                                                                     | Edit attributes; open inspection / WO records; download IFC; "Create inspection" CTA                                                |
| Mobile inspection form     | Asset auto-populated from map tap; condition rating dropdown 0–9 (NBI) with per-value criteria text; defect type / class / severity dropdowns; photo; GPS auto-set | Offline-first: data buffered on device, syncs on reconnect; submit emits `asset.inspection.submitted.v1` Kafka event                 |
| Work order form            | Asset linked; work type PREVENTIVE / CORRECTIVE; trade code; crew assignment; scheduled date; cost estimate                                                        | Submit emits `asset.workorder.created.v1`; crew notified via `19-notification-architecture`                                         |
| Capital planning dashboard | Condition distribution histogram (0–100); maintenance backlog table sorted by condition score ascending; budget vs forecast bar chart by year                      | Filter by asset_type, country_code; export PDF / Excel                                                                              |

---

### Known Gaps (V2)

| Gap                            | Reason                                                                  | Resolve When      |
| ------------------------------ | ----------------------------------------------------------------------- | ----------------- |
| Legal review — Thailand  | Cybersecurity Act B.E. 2562 CII supply-chain obligations; DGA government cloud data classification (Protected data must reside in domestic cloud); PDPA data processor agreements with government clients; Digital Platform Act ETDA notification (THB 50M revenue / 5,000 MAU threshold) | In-country counsel (Tilleke & Gibbins / Baker McKenzie / DFDL) before V2-1 |
| Legal review — Vietnam   | Cybersecurity Law No. 116/2025/QH15 (eff. 1 Jul 2026) local presence + 24h data handover obligation; Law on Data No. 60/2024/QH15 "important data" classification for gov infrastructure + data localization ≥ 24 months; penalty up to 5% annual revenue | In-country counsel (VILAF / Tilleke & Gibbins VN) before V2-1; data classification confirmed before V2-3 |
| Legal review — Singapore | Cybersecurity Act CCoP 2.0 supply-chain flow-down obligations (LTA / PUB customers); PDPA DPO appointment mandatory (from 1 Jun 2025); LTA DataMall commercial use terms and NDA for on-request datasets | In-country counsel (Allen & Gledhill / Bird & Bird ATMD) before V2-1 |

---

## 28.9 V3 Real Estate Strategic Framework

### UX Paradigm

| Dimension        | V1 Construction             | V3 Real Estate                                          |
| ---------------- | --------------------------- | ------------------------------------------------------- |
| Primary view     | Project list + Gantt        | Portfolio dashboard — occupancy %, NOI, lease expiry    |
| Core object      | Task, Milestone, Submittal  | Property, Unit, Lease, Tenant                           |
| Revenue model    | Fixed-fee / milestone       | Recurring rent, occupancy rate, cap rate                |
| Primary user     | PM, engineer, subcontractor | Leasing agent, property manager, investor               |
| Key metric       | Schedule / cost variance    | Occupancy %, NOI, lease expiry profile                  |
| AI pattern       | Schedule / cost forecasting | Predictive demand, tenant churn risk, dynamic pricing   |

### APIs and Standards

| Standard                 | Scope                                                              | Status                                             |
| ------------------------ | ------------------------------------------------------------------ | -------------------------------------------------- |
| Vietnam Decree 357/2025  | National property digital ID — unique code ≤ 40 chars per property | Mandatory VN; effective March 1, 2026              |
| URA Data Service API     | Singapore real-time property data + quarterly RE statistics         | Available — Singapore Government Developer Portal  |
| กรมที่ดิน Thailand        | Portal-only; 34M land plots via LandsMaps; no public API           | No direct integration; display via LandsMaps embed |
| RESO Web API             | MLS standard — North America only; not applicable in SEA           | Not used                                           |

### Stack Additions Required

| Component                 | Purpose                                                    | Notes                                                |
| ------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| Lease management engine   | Lease creation, rent roll, automated invoicing             | New module                                           |
| Property CRM              | Presales lead management, unit reservation, contract flow  | Extends but distinct from V1 B2B Procurement CRM     |
| VN national property ID   | `property.national_id` field + Decree 357 validation       | Mandatory V3-1 Day 1 for VN tenants                  |
| URA Data API integration  | SG market benchmarking in V3-6 Analytics                   | Optional — SG tenants only                           |

### Phase Breakdown

| Phase                   | Content                                                                                  | Duration    | Entry Criteria         |
| ----------------------- | ---------------------------------------------------------------------------------------- | ----------- | ---------------------- |
| V3-1 Property Registry  | Property database, unit catalog, title data, VN national property ID (Decree 357)       | 2–3 months  | V2 stable + 18 months  |
| V3-2 Presales CRM       | Lead management, unit reservation, sales contract workflow, dynamic pricing              | 2–4 months  | V3-1 complete          |
| V3-3 Leasing            | Lease creation, rent roll, automated invoicing, tenant portal, expiry alerts             | 3–4 months  | V3-2 complete          |
| V3-4 Facility Mgmt      | Work orders, preventive maintenance (extends V1 Site Operations), BMS integration       | 3–6 months  | V3-3 complete          |
| V3-5 Financial          | GL/AP/AR, NOI reporting, investor dashboards, RE tokenization (TH SEC 2025–2029 exempt) | 3–6 months  | V3-4 complete          |
| V3-6 Analytics + ESG    | Portfolio analytics, ESG reporting, predictive occupancy, URA API benchmarking (SG)     | 3–6 months  | V3-5 complete          |

### Regulatory per Country

| Country   | Agency / Mandate       | Status                                                                          | Platform Action                                             |
| --------- | ---------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Thailand  | กรมที่ดิน              | Portal-only; no public API                                                      | Display via LandsMaps embed; no direct integration          |
| Thailand  | SEC RE Tokenization    | Allowed via licensed ICO portal; capital gains tax exempt Jan 2025 – Dec 2029   | V3-5: connect to licensed ICO portal (per-partner adapter)  |
| Thailand  | P2P Lending            | 12 licensed operators Oct 2025 (7 operational)                                  | Extends INT-005 BaaS strategy — per-partner adapter         |
| Vietnam   | Decree 357/2025        | National property digital ID effective March 1, 2026; permanent through lifecycle| Mandatory: `property.national_id` in V3-1 Day 1            |
| Vietnam   | Housing Law Amendment  | Finalisation for National Assembly Oct 2026                                     | Monitor; update lease module when effective                 |
| Vietnam   | Law on Data            | Effective July 1, 2025                                                           | VN data residency applies to all V3 tenant data             |
| Singapore | URA Data Service API   | Available via developer.tech.gov.sg                                              | V3-6 Analytics: integrate for SG market benchmarking        |
| Singapore | CORENET X              | Property development submissions covered; developers must onboard               | CORENET X integration from V1 covers V3 submissions         |
| Singapore | IRAS Property Tax      | myTax Portal only; no mandatory platform integration                             | No action required                                          |

### REST API Endpoint Spec

**Pattern basis:** Yardi Voyager entity model + RESO OData conventions + VTS 3-resource public API (all publicly documented).

```text
# Properties
GET    /api/v1/properties                  $filter, $select, $top, $skip, $orderby
POST   /api/v1/properties
GET    /api/v1/properties/{id}
PATCH  /api/v1/properties/{id}

# Units
GET    /api/v1/properties/{id}/units
POST   /api/v1/units
GET    /api/v1/units/{id}
PATCH  /api/v1/units/{id}

# Leases
GET    /api/v1/units/{id}/leases
POST   /api/v1/leases
GET    /api/v1/leases/{id}
PATCH  /api/v1/leases/{id}               status: DRAFT→ACTIVE→RENEWAL→AMENDMENT→TERMINATED

# Charges (rent roll)
GET    /api/v1/leases/{id}/charges
POST   /api/v1/leases/{id}/charges
PATCH  /api/v1/leases/{id}/charges/{chargeId}

# Analytics
GET    /api/v1/analytics/rent-roll        $filter=property_id
GET    /api/v1/analytics/noi              $filter=period, property_id
GET    /api/v1/analytics/occupancy        $filter=property_id
```

**Property resource:**

| Field                  | Type          | Notes                                                             |
| ---------------------- | ------------- | ----------------------------------------------------------------- |
| `property_id`          | UUID          | PK                                                                |
| `tenant_id`            | UUID          | FK                                                                |
| `country_code`         | CHAR(2)       | ISO 3166-1 alpha-2                                                |
| `national_id_vn`       | VARCHAR(40)   | VN Decree 357 electronic ID; NULL until assigned by MOC           |
| `assignment_status_vn` | ENUM          | PENDING / ASSIGNED — VN tenants only; NULL for non-VN             |
| `land_title_ref`       | VARCHAR(100)  | sổ đỏ (VN) / Chanote No. (TH) / SG title number — separate field |
| `property_type`        | ENUM          | RESIDENTIAL / COMMERCIAL / INDUSTRIAL / MIXED                     |
| `total_gfa_sqm`        | DECIMAL(12,2) |                                                                   |
| `address`              | JSONB         | structured address; schema per country_code                       |
| `coordinates`          | POINT         | WGS84                                                             |

**Unit resource:**

| Field            | Type          | Notes                                             |
| ---------------- | ------------- | ------------------------------------------------- |
| `unit_id`        | UUID          | PK                                                |
| `property_id`    | UUID          | FK                                                |
| `floor`          | SMALLINT      |                                                   |
| `unit_number`    | VARCHAR(50)   |                                                   |
| `net_area_sqm`   | DECIMAL(10,2) |                                                   |
| `status`         | ENUM          | AVAILABLE / RESERVED / LEASED / SOLD              |
| `reserved_by`    | UUID          | FK contacts; populated when status = RESERVED     |
| `reserved_until` | TIMESTAMP     | reservation expiry; NULL if not reserved          |

**Lease resource:**

| Field                 | Type          | Notes                                              |
| --------------------- | ------------- | -------------------------------------------------- |
| `lease_id`            | UUID          | PK                                                 |
| `unit_id`             | UUID          | FK                                                 |
| `tenant_contact_id`   | UUID          | FK contacts                                        |
| `status`              | ENUM          | DRAFT / ACTIVE / RENEWAL / AMENDMENT / TERMINATED  |
| `start_date`          | DATE          |                                                    |
| `end_date`            | DATE          |                                                    |
| `rent_amount`         | DECIMAL(15,2) |                                                    |
| `currency`            | CHAR(3)       | ISO 4217                                           |
| `rent_escalation_pct` | DECIMAL(5,2)  | annual escalation %                                |
| `lease_type`          | ENUM          | RESIDENTIAL / COMMERCIAL / INDUSTRIAL              |

**VN Decree 357 — event schema:**

```typescript
// Emitted when Bộ Xây dựng assigns property electronic ID
interface PropertyElectronicIdAssignedV1 {
  event_type: 'property.electronic_id.assigned.v1';
  tenant_id: string;        // UUID
  property_id: string;      // UUID
  national_id_vn: string;   // VARCHAR(40) — system-generated by MOC; immutable after assignment
  assigned_at: string;      // ISO 8601
  land_title_ref: string | null;
}
```

Platform action on receipt: set `national_id_vn` + `assignment_status_vn = ASSIGNED`; emit internal event to downstream services.

**Pagination and filtering:** OData-style `$filter`, `$select`, `$top`, `$skip`, `$orderby` on all list endpoints — consistent with V1 and V2.

---

### Screen-Level UX Spec

**Pattern basis:** Yardi Voyager Commercial (portfolio dashboard, stacking plan), VTS Lease (leasing pipeline), confirmed from publicly available product documentation. Presales CRM: no world-class published template for SEA condo presales — designed from market requirements.

| Screen              | Primary content                                                                                                                                                             | Key interactions                                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portfolio dashboard | KPI tiles: Occupancy %, NOI vs Budget, Delinquency %; lease expiry bar chart (sqm / units expiring by month, next 24 months); property list with per-property occupancy %  | Click property → property detail; click expiry bar → lease list for that month; KPI tiles drill to underlying records                                          |
| Property detail     | Unit stacking plan (floor grid: green = LEASED, amber = RESERVED, white = AVAILABLE, grey = SOLD); occupancy % per floor; open maintenance count                            | Click unit → unit panel with lease history; "Add lease" CTA from unit panel                                                                                   |
| Lease wizard        | 5-step flow: (1) Unit select, (2) Tenant info, (3) Lease terms — dates / rent / escalation %, (4) Approval, (5) Activate                                                   | Status DRAFT on create; ACTIVE on step 5; emits `lease.activated.v1`; unit status auto-sets to LEASED                                                         |
| Presales CRM        | Unit matrix (grid: rows = floors, columns = unit positions); colour by AVAILABLE / RESERVED / SOLD; reservation queue sorted by `reserved_until`; deposit and contract status | Reserve unit → `status = RESERVED` + `reserved_until`; cancel → back to AVAILABLE; deposit confirmed → contract generated; handover → `status = SOLD`         |
| Rent roll           | Table: property / floor / unit / tenant / lease start–end / monthly rent / escalation / status; sortable by any column; subtotal per property                              | Filter by property, status, expiry range; export PDF / Excel; bulk rent review trigger                                                                         |

---

### Known Gaps (V3)

| Gap                                      | Reason                                                                                          | Resolve When                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------- |
| VN Decree 357 — 40-char sub-field spec   | Circular 08/2026/TT-BXD (Feb 15, 2026) exists; structure partially in Decree (land plot ID + project code + location + sequence); separator chars and exact sub-field lengths not yet specified | MOC implementing circular       |
| VN Decree 357 — external access method   | No public API — external access via written request (Decree 357 Appendix III, 7 working days); government-to-government API only; pilot Q3 2026, official Q4 2026                               | MOC API publication / Q4 2026   |
| Thailand กรมที่ดิน integration           | No public API; LandsMaps (landsmaps.dol.go.th) is official DOL portal — not a commercial service; embed display only                                                                           | DOL digital transformation      |
| Legal review — Thailand  | PDPA B.E. 2562 sensitive financial / location data processing; FBA B.E. 2542 licensing for foreign-owned entity (software development NOT delisted in May 2026 Cabinet process); Digital Platform Act ETDA notification if platform facilitates property matching | In-country counsel (Tilleke & Gibbins / DFDL) before V3-1 — **FBA blocks foreign-owned entity if not exempt** |
| Legal review — Vietnam   | Cybersecurity Law No. 116/2025/QH15 local presence requirement; Law on Data No. 60/2024/QH15 cross-border transfer restrictions for tenant / financial data; Real Estate Law No. 29/2023/QH15 "trading floor" scope — confirm presales CRM does not trigger trading floor license | In-country counsel (VILAF / Baker McKenzie VN) before V3-1 |
| Legal review — Singapore | PDPA DPO appointment mandatory (from 1 Jun 2025); URA Data Service API full commercial use terms require direct review at ura.gov.sg; MAS Payment Services Act applicability if platform processes rental payments directly | In-country counsel (Allen & Gledhill / Bird & Bird ATMD) before V3-1 |

---

> 📎 See also: [27-long-term-moat](27-long-term-moat.md) · [29-final-strategic-positioning](29-final-strategic-positioning.md) · [26-pricing-model](26-pricing-model.md) · [25-go-to-market](25-go-to-market.md)
