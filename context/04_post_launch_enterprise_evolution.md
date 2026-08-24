---
title: Construction OS — Post Launch Enterprise Evolution
stage: POST-LAUNCH — Enterprise Evolution (Phase 0–11)
lifecycle_position: 4
version: 1.0
last_updated: 2026-05-25
previous: 03_operationalize_execution.md
next: 05_industry_scale_transition.md
authority: context-only
master: 00_master_construction_os.md
---

# Construction OS — Post Launch Enterprise Evolution

> ---
>
> **⚠️ MASTER DOCUMENT REFERENCE — READ BEFORE EXECUTING**
>
> **Master document:** `00_master_construction_os.md`
> All technology decisions, architecture choices, EP resolutions, and platform
> specifications are defined there. This file provides execution context ONLY.
>
> **Lifecycle stage:** POST-LAUNCH — Enterprise Evolution (Phase 0–11)
> **Previous:** 03_operationalize_execution.md (operationalize first, then use this file)
> **Next:** 05_industry_scale_transition.md
> **Note:** Requires all 8 Production Adoption Gates in 00_master_construction_os.md Phase 19 SECTION B to be passed first.
> **Version:** 1.0
> **Last updated:** 2026-05-25
>
> ---

---

## CONTENTS

- [Pre-execution Readiness Checklist](#pre-execution-readiness-checklist)
- [Master Command](#master-command)
- [Phase 0 — Engineering Foundation](#phase-0--engineering-foundation)
- [Phase 1 — Operational Foundation](#phase-1--operational-foundation)
- [Phase 2 — Workflow Expansion](#phase-2--workflow-expansion)
- [Phase 3 — Data Platform Evolution](#phase-3--data-platform-evolution)
- [Phase 4 — AI Expansion](#phase-4--ai-expansion)
- [Phase 5 — Platformization](#phase-5--platformization)
- [Phase 6 — Enterprise Readiness](#phase-6--enterprise-readiness)
- [Phase 7 — Ecosystem Expansion](#phase-7--ecosystem-expansion)
- [Phase 8 — Unified Governance](#phase-8--unified-governance)
- [Phase 9 — Enterprise Customer Operations](#phase-9--enterprise-customer-operations)
- [Phase 10 — Portfolio Intelligence](#phase-10--portfolio-intelligence)
- [Phase 11 — Economic Moat Expansion](#phase-11--economic-moat-expansion)
- [Revised Execution Order](#revised-execution-order)
- [Critical Execution Rules](#critical-execution-rules)
- [Final Strategic Principle](#final-strategic-principle)

---

## PRE-EXECUTION READINESS CHECKLIST

Before executing any phase in this document, validate all items below.
If any item fails, this document does not apply — return to Priority Execution phase.

```text
Production Readiness Gates (all must pass):

[ ] DAU is measurable and non-zero for at least 30 consecutive days
[ ] At least 3 distinct operational workflows are in active daily use
[ ] Procurement or project usage has generated real financial transactions
[ ] Mobile usage is active (not just web)
[ ] Structured operational data is flowing through defined schemas
[ ] At least one team has operational dependency on the platform
    (removing access would cause workflow disruption)
[ ] On-call rotation exists and has handled at least one real incident
[ ] The platform has survived at least one unplanned outage
    and recovered without data loss

If all 8 gates pass → proceed to Phase 0.
If any gate fails → do not proceed. Platform is still in MVP phase.
```

---

## MASTER COMMAND

```text
You are evolving a production-adopted AI-native Construction Operating System
into a scalable enterprise infrastructure platform.

Context (validated by pre-execution checklist above):

- Real DAU with workflow dependency confirmed
- Real procurement, project, and mobile usage confirmed
- Real structured operational data flow confirmed
- Platform has survived production incidents

Primary objectives (in priority order):

1. Operational stability — nothing breaks what users already depend on
2. Platform reliability — SLA/SLO are measurable and met
3. Workflow expansion — extend what works into adjacent areas
4. Data platform evolution — turn operational data into strategic asset
5. AI operational intelligence — intelligence built on clean data only
6. Enterprise readiness — support enterprise customers safely
7. Governance — prevent entropy as platform scales
8. Ecosystem defensibility — emerge from real usage, not speculation
9. Long-term scalability — architecture survives 10x growth

Optimization targets:

- Operational trust above all
- Survivability over feature count
- Maintainability over cleverness
- Governance that preserves velocity, not bureaucracy
- Enterprise scalability through standards, not exceptions
- Ecosystem growth through real usage pull, not artificial push

Anti-targets (never optimize for):

- Prototype simplicity
- MVP shortcuts surviving into production
- Demo architecture in real infrastructure
- Theoretical scale without operational evidence
- Governance theater without operational necessity
- Autonomous AI before human-verified reliability

Decision rule when in doubt:
  IF a decision increases operational risk → do not proceed without rollback plan
  IF a decision increases complexity without measurable user benefit → reject
  IF a decision locks in external dependency prematurely → defer to later phase
```

---

## PHASE 0 — ENGINEERING FOUNDATION

> **Why Phase 0:** Engineering standards must exist before building anything else.
> Fragmented practices across 15 phases create irrecoverable technical debt.

```text
Build Engineering Foundation Layer.

Primary objective:
Establish engineering consistency as baseline before any feature work begins.

Requirements:

Foundation areas:

- coding standards and style guides
- service template library
- local development environment standards
- deployment standards and conventions
- CI/CD pipeline baselines
- internal SDK foundations
- feature flag strategy
- release workflow governance

Generate:
MUST-HAVE (block Phase 1 if missing):
  - service template with observability pre-wired
  - coding standards document (language-specific)
  - deployment standards (environments, promotion rules)
  - CI/CD pipeline baseline (lint, test, build, deploy)
  - feature flag framework selection and integration guide

NICE-TO-HAVE (complete within Phase 0 window):
  - internal SDK v0 for common platform operations
  - local development environment setup automation
  - release workflow runbook

Constraints:
  - Standards must be enforceable by tooling, not just documentation
  - Every new service must pass the template checklist before deployment
  - Feature flags must be the default mechanism for risky rollouts

Decision rules:
  IF a new service is being built → use the template, no exceptions
  IF a release is high-risk → feature flag is required before deploy
  IF engineering standards conflict with speed → standards win for shared infrastructure,
     speed wins for isolated features

Exit criteria (Phase 0 is complete when):
  [ ] All active services have been audited against coding standards
  [ ] CI/CD pipeline is running on every service with no manual deploy paths
  [ ] Feature flag framework is integrated and used for at least 1 live feature
  [ ] Service template is documented and adopted by all engineering teams
  [ ] docs/registers/feature-flag-cleanup-backlog.md created (registry of stale flags;
      flags at 100% rollout > 30 days = STALE; cleanup is prerequisite for Stage gates — source: spec §32.10)
```

**Effort estimate:** Medium (2–4 weeks, 2–3 engineers)
**Blocks:** All subsequent phases depend on this foundation.

---

## PHASE 1 — OPERATIONAL FOUNDATION

> **Why merged:** Phase A (Stabilization) and Phase K (Reliability Operations) are the same
> concern — treating them as separate phases at positions 1 and 11 leaves reliability
> ungoverned for 10 phases. This phase covers both.

```text
Build Operational Foundation Layer.

Primary objective:
Make the platform stable, reliable, and production-safe with measurable SLA/SLO.

Requirements:

Operational areas:

- observability (distributed tracing, centralized logging, metrics)
- alerting and incident detection
- SLA/SLO definition and tracking
- error budget management
- incident response and escalation
- rollback orchestration
- failover and disaster recovery
- production debugging tooling
- audit validation

Generate:
MUST-HAVE (block Phase 2 if missing):
  - distributed tracing (all services instrumented)
  - centralized logging with search
  - metrics dashboards (service health, business metrics)
  - alerting system (PagerDuty or equivalent, with on-call rotation)
  - SLO definitions for all critical user-facing operations
  - error budget tracking (burn rate alerting)
  - rollback procedures (documented and production-tested)
  - incident response runbook with escalation paths

NICE-TO-HAVE (complete within Phase 1 window):
  - mobile crash tracking
  - Kafka consumer lag monitoring
  - DB query performance monitoring
  - dead-letter queue dashboards
  - disaster recovery simulation schedule (quarterly)
  - sync recovery tooling
  - backup validation workflows

Constraints:
  - Every SLO must be measurable from day 1 — no aspirational SLOs
  - Rollback procedures must be tested in production, not just documented
  - Recovery from any single-service failure must be automated, not manual
  - On-call rotation must have at least 2 engineers per shift

Decision rules:
  IF incident occurs and no runbook exists → write the runbook as part of resolution
  IF SLO burn rate exceeds 50% of monthly budget → freeze non-critical feature work
  IF rollback has never been tested in production → block next Phase 2 work items

Phase-level rollback plan:
  IF observability tooling causes platform instability:
    → Roll back to previous logging/tracing configuration
    → Maintain manual monitoring until stable tooling is deployed
    → Document failure mode before retrying

Exit criteria (Phase 1 is complete when):
  [ ] All critical services have SLOs defined and tracked in dashboards
  [ ] Error budget burn rate is below 20% for 14 consecutive days
  [ ] Rollback procedure has been executed successfully in production at least once
  [ ] MTTR (mean time to recovery) for P1 incidents is below 30 minutes
  [ ] On-call rotation is staffed and has handled at least 3 real incidents
  [ ] Disaster recovery procedure is documented and scheduled for simulation
```

**Effort estimate:** Large (4–8 weeks, 3–5 engineers + DevOps)
**Blocks:** Phase 2, 3, 4. Platform must be stable before expanding.

---

## PHASE 2 — WORKFLOW EXPANSION

> **Boundary clarification vs Phase 5 and Phase 7:**
> Phase 2 owns: internal operational workflows between platform users (workers, managers, site teams)
> Phase 5 owns: external API surface for third-party integrations
> Phase 7 owns: vendor and supplier ecosystem workflows crossing organizational boundaries
> Any feature touching vendor money flow or external API → belongs in Phase 5 or 7, not here.

```text
Build Workflow Expansion Layer.

Primary objective:
Expand from operational visibility into operational coordination
for internal platform users.

Requirements:

Workflow areas:

- configurable workflow engine (internal operations only)
- approval routing and escalation rules
- task management and dependency tracking
- scheduling and milestone tracking
- inventory and warehouse tracking
- vendor collaboration (portal foundation only — deep vendor ecosystem in Phase 7)

Generate:
MUST-HAVE:
  - configurable workflow engine with state machine model
  - approval routing with escalation timeout rules
  - task dependency system (blocking / non-blocking)
  - milestone tracking with deadline alerting
  - inventory tracking system (item level)
  - warehouse movement tracking (in/out/transfer)

NICE-TO-HAVE:
  - vendor portal foundation (read-only access for vendors)
  - scheduling optimization suggestions
  - SLA tracking per workflow type

Constraints:
  - No hardcoded workflows — all must be configurable via admin interface
  - No vendor financial transactions in this phase (belongs in Phase 7)
  - No external API exposure in this phase (belongs in Phase 5)
  - Enterprise customization is limited to configuration, not code forks

Decision rules:
  IF a workflow requires vendor payment → defer to Phase 7
  IF a workflow requires external API contract → defer to Phase 5
  IF a workflow is requested by only one customer → make it configurable,
     not a dedicated feature

Phase-level rollback plan:
  IF workflow engine causes data corruption or lost state:
    → Revert to manual process documentation (runbooks)
    → Preserve all existing workflow state in read-only mode
    → Do not migrate more workflows until root cause is resolved

Exit criteria (Phase 2 is complete when):
  [ ] At least 3 distinct operational workflows are running on the engine
  [ ] Approval routing has been used for real operational decisions
  [ ] Zero hardcoded workflow logic remains in codebase
  [ ] Vendor portal (if built) is read-only with no write access
```

**Effort estimate:** Large (6–10 weeks, 4–6 engineers)
**Blocks:** Phase 7 (vendor ecosystem builds on vendor portal foundation).

---

### Post-MVP designed extensions (ADR-057 scope) — internal workflow gaps

> These six capabilities are **already designed** — authoritative design lives in the ADRs and
> `docs/specifications/` (schema §11, API §14, RBAC §06, events §16, UX §20). Each command below is the
> execution wrapper; do NOT re-derive the design — implement per its ADR. All carry `AWAITING_DECISION`
> until promoted. Integration gaps (ราคากลาง, e-GP) live in Phase 5, not here.

#### Variation Order / Change Order / Claims Command (post-MVP — ADR-059)

```text
Build Variation Order & Claims per ADR-059 (Finance service).
Objective: manage approved changes to contract scope/price + contractor claims.
Generate: VariationOrder + Claim entities (§11); /finance/{contracts/{id}/variations,claims,...} (§14);
  approve reuses AR chain (PM ≤ limit → Executive); on APPROVED auto-adjust contract_value +
  project_budgets.allocated + BOQ delta lines; events VariationOrderApproved / ClaimAccepted (§16).
AWAITING_DECISION: none open — design fixed in ADR-059.
Exit: VO approve adjusts contract/budget/BOQ in one transaction; claim ACCEPTED converts to VO.
```

#### Inventory / Warehouse (WMS) Command (post-MVP — ADR-060)

```text
Build full WMS per ADR-060 — this IS the design for the "inventory tracking + warehouse movement" items
already listed in this phase's Generate.
Objective: stock movement ledger + GRN + multi-warehouse + moving-average valuation (procurement schema).
Generate: Warehouse + StockMovement + GoodsReceiptNote entities + extend Inventory (§11);
  /procurement/{warehouses,inventory,grn,stock-movements} (§14); GRN is stock-only (cost stays
  PO→COMMITTED / invoice→ACTUAL); events GoodsReceived / StockIssued / StockTransferred / StockAdjusted.
AWAITING_DECISION: none open — design fixed in ADR-060.
Exit: GRN increments stock + recomputes moving average; no double-count against cost recognition.
```

#### Bank Guarantees / Bonds Command (post-MVP — ADR-063)

```text
Build bond register per ADR-063 (Finance service).
Objective: record bid/performance/advance/retention/warranty bonds with full lifecycle + expiry alerts.
Generate: Bond entity (§11); /finance/bonds (§14); status ISSUED→ACTIVE→RELEASED/EXPIRED/CALLED;
  BondExpiring → Notification (§19); link Contract + Tender/Bid.
AWAITING_DECISION: none open. Note: bonds are recorded, not bank-issued (no LG e-issuance).
Exit: expiry alerts fire before valid_until; CALLED records a drawn bond.
```

#### Building Permit & License Command (post-MVP — ADR-064)

```text
Extend the Permit entity per ADR-064 (do NOT create a new entity).
Objective: track building permits (อ.1/อ.6) + company licences by status & expiry.
Generate: extend permit_type (+building_permit, +license) + issuing_authority; project_id nullable
  (company licence = tenant-level); /permits (§14); PermitExpiring → Notification (§19).
AWAITING_DECISION: none open. No e-submission to the permitting authority (records only).
Exit: building permits & licences share the Permit register with site/safety permits; expiry alerts fire.
```

#### Project Risk Register Command (post-MVP — ADR-065)

```text
Build risk register per ADR-065 (Project service).
Objective: structured human-owned risk log (distinct from AI delay-risk forecasting).
Generate: ProjectRisk entity (§11); /projects/{id}/risks (§14); likelihood×impact (1–25) scoring;
  source MANUAL | AI_SUGGESTED (Layer B may create AI_SUGGESTED for triage); events RiskRaised /
  RiskStatusChanged (§16).
AWAITING_DECISION: AI-suggested feed depends on Layer B being deployed (post-MVP).
Exit: risks scored + owned; AI-suggested risks are human-triaged, not auto-accepted.
```

#### Site Instruction / Minutes / Correspondence Command (post-MVP — ADR-066)

```text
Build document-control register per ADR-066 (Project service).
Objective: unified record for site instructions / meeting minutes / correspondence + trackable action items.
Generate: CommunicationRecord + ActionItem entities (§11); /projects/{id}/communications (+ /actions) (§14);
  record_type enum; linked_task_id ties to RFI/task; events CommunicationRecorded / ActionItem* (§16).
AWAITING_DECISION: none open. Not a full DMS (versioned drawings) — that is the separate Document-management gap.
Exit: minutes carry action items tracked to DONE; records filter by type.
```

---

## PHASE 3 — DATA PLATFORM EVOLUTION

```text
Build Data Platform Evolution Layer.

Primary objective:
Transform operational application data into reliable strategic infrastructure
that all AI, analytics, and intelligence phases depend on.

Requirements:

Data areas:

- event standardization and versioning
- schema governance and registry
- warehouse pipelines
- master data management
- data quality systems
- analytics aggregation

Generate:
MUST-HAVE (required by Phase 4 data gate):
  - event versioning rules (v1/v2 schema migration policy)
  - schema registry (all operational entities registered)
  - master data normalization (project, vendor, material, worker entity models)
  - duplicate detection systems
  - anomaly detection systems
  - data quality scoring (per entity type, per pipeline)

NICE-TO-HAVE:
  - warehouse pipelines (streaming + batch)
  - analytics aggregation systems
  - operational data health dashboard

Constraints:
  - No entity may exist in more than one canonical form across services
  - Schema evolution must go through registry — no ad-hoc column additions
  - All operational events must be versioned before Phase 4 begins

Decision rules:
  IF a new entity is needed → register in schema registry first, build second
  IF schema change breaks backward compatibility → major version bump required
  IF data quality score for any core entity drops below 85% →
     pause downstream analytics until resolved

Phase-level rollback plan:
  IF warehouse pipeline causes data loss or incorrect aggregation:
    → Halt pipeline and preserve raw event log
    → Reprocess from raw events after fix
    → Do not delete raw event data under any circumstances

Exit criteria (Phase 3 is complete when, and Phase 4 data gate):
  [ ] Schema registry covers 100% of core operational entities
  [ ] Data quality score is above 90% for project, vendor, material, worker entities
  [ ] Duplicate rate is below 2% across all core entities
  [ ] All operational events are versioned (v1 minimum)
  [ ] At least 30 days of clean, versioned event history exists
  [ ] Data lineage is traceable from raw event to any dashboard metric
```

**Effort estimate:** Large (6–10 weeks, 3–5 engineers + data engineering)
**Blocks:** Phase 4 (AI requires clean data — this is a hard gate).

---

## PHASE 4 — AI EXPANSION

> **Hard prerequisite:** Phase 3 exit criteria must be 100% complete before Phase 4 begins.
> Building AI on unclean, unversioned data is the single highest-risk failure mode
> for operational AI in construction. Do not proceed if Phase 3 gate is not passed.

```text
Build AI Expansion Layer.

Primary objective:
Expand from AI assistance into operational intelligence,
built exclusively on clean structured data from Phase 3.

Data readiness gate (verify before proceeding):
  [ ] Phase 3 exit criteria: all 6 items confirmed complete
  [ ] Data quality score confirmed above 90% for all core entities
  [ ] At least 30 days of clean event history available for model training

Requirements:

AI areas:

- RAG infrastructure for operational knowledge retrieval
- semantic search on operational documents
- forecasting models (delay, cost, procurement)
- recommendation systems
- AI feedback loops and evaluation
- operational AI evaluation pipelines

Generate:
MUST-HAVE:
  - vector pipeline (document and event embedding)
  - semantic retrieval system (operational search)
  - AI evaluation pipeline (accuracy, recall, precision per use case)
  - explainability output for every recommendation (reason must be shown to user)
  - human override mechanism (every AI decision can be overridden and logged)

NICE-TO-HAVE:
  - delay prediction models (construction schedule)
  - procurement forecasting systems
  - cost overrun prediction systems
  - recommendation engines (material, vendor, scheduling)
  - retraining workflows (triggered by evaluation score drop)

Constraints:
  - AI recommendations must always show the reason (no black-box outputs)
  - No autonomous operational execution — AI suggests, humans decide
  - Every AI decision must be logged with model version and input snapshot
  - AI models must be retrained on real operational feedback, not synthetic data
  - Confidence score must be shown to user for every recommendation

Decision rules:
  IF data quality score for a domain drops below 90% →
     suspend AI recommendations for that domain immediately
  IF AI model accuracy drops below defined threshold →
     trigger retraining workflow, surface fallback to human operator
  IF a recommendation cannot be explained in plain language →
     do not surface it to users

Phase-level rollback plan:
  IF AI recommendations cause operational errors:
    → Disable AI recommendations for affected domain
    → Surface manual workflow as fallback
    → Audit all recent recommendations made by affected model
    → Do not re-enable until audit is complete and root cause is resolved

Exit criteria (Phase 4 is complete when):
  [ ] RAG pipeline is returning accurate results (evaluated against ground truth)
  [ ] Every AI recommendation shows an explanation and confidence score
  [ ] Human override is implemented and logged for all AI decision surfaces
  [ ] AI evaluation pipeline is running on schedule with alerting on score drops
  [ ] At least one model is being retrained from real operational feedback
```

**Effort estimate:** Extra-Large (10–16 weeks, 3–5 ML engineers + 2 platform engineers)
**Blocks:** Phase 10 (portfolio intelligence uses AI models from this phase).

---

## PHASE 5 — PLATFORMIZATION

> **Boundary clarification vs Phase 2 and Phase 7:**
> Phase 5 owns: the external API surface, SDK contracts, and integration middleware
> Phase 2 owns: internal workflow operations
> Phase 7 owns: ecosystem business flows (vendor networks, procurement, financing)
> Phase 5 builds the pipes. Phase 7 decides what flows through them.

```text
Build Platformization Layer.

Primary objective:
Transform the system from internal SaaS application into
extensible construction platform infrastructure with external API surface.

Requirements:

Platform areas:

- public APIs with versioning and deprecation policy
- API gateway (rate limiting, authentication, quotas)
- SDK foundations (for third-party developers)
- integration architecture (ERP, BIM, IoT middleware)
- multi-tenant scaling

Generate:
MUST-HAVE:
  - external API v1 (read-heavy, production-safe subset only)
  - API authentication (OAuth 2.0 / API key with rotation)
  - API versioning policy (v1/v2 coexistence rules, deprecation timeline)
  - API gateway with rate limiting and quota management
  - API audit log (all external calls logged with tenant context)

NICE-TO-HAVE:
  - SDK foundation (language-specific client libraries, v0)
  - integration middleware (ERP connector framework)
  - BIM integration hooks
  - IoT integration hooks
  - API monetization hooks
  - regional deployment architecture

Constraints:
  - No open marketplace expansion in this phase
  - External API must be additive-only — no breaking changes without major version
  - Every API endpoint must have an owner team responsible for SLA
  - Integration sprawl prevention: new integrations require architecture review

Decision rules:
  IF a new integration is requested → evaluate: does it serve 3+ customers?
     If yes → build as standard middleware. If no → defer or build as custom connector.
  IF API deprecation is needed → minimum 90-day notice with migration guide required
     Sunset dates and tenant notification log: docs/api/deprecation-schedule.md
     (document before initiating any deprecation — source: spec §14.4)
  IF external API causes platform instability → circuit breaker activates,
     external traffic is shed before internal operations are affected

Phase-level rollback plan:
  IF public API causes security or stability incident:
    → Disable external API gateway (internal operations unaffected)
    → Audit all external calls from the incident window
    → Patch and re-enable with additional rate limiting
    → Notify affected integrators within 24 hours

Exit criteria (Phase 5 is complete when):
  [ ] External API v1 is live with authentication and rate limiting
  [ ] API versioning policy is documented and enforced by gateway
  [ ] API audit log is capturing all external calls
  [ ] At least 1 external integration is live and production-tested
  [ ] API deprecation policy is published and communicated
```

**Effort estimate:** Large (8–12 weeks, 4–6 engineers + security review)
**Blocks:** Phase 7 (ecosystem flows use Phase 5 APIs as foundation).

---

### Post-MVP designed extensions (ADR-057 scope) — external integrations

> These two capabilities are **already designed** (ADR-061/062 + `docs/specifications/`). They sit in
> Phase 5 (external API / integration middleware) per the boundary rule "external API → Phase 5". Both use
> the adapter Strategy pattern (§13.3), same shape as the ERP connector already listed in this phase.
> Do NOT re-derive the design — implement per the ADR. Both carry `AWAITING_DECISION`.

#### ราคากลาง Central Pricing Command (post-MVP — ADR-061)

```text
Build ราคากลาง central-price integration per ADR-061 (BOQ service + platform catalog).
Objective: feed BOQ line pricing from the Comptroller-General central prices (public-works estimating).
Generate: platform.central_price_catalog (shared, RLS-exempt) + boq_items.{central_price_id,
  reference_price, price_variance} (§11); /admin/central-prices/import + /central-prices +
  /boq/projects/{id}/price-variance (§14); ingest via SYSTEM_ADMIN file import OR CentralPriceAdapter
  (Strategy §13.3); BOQ modes: reference+variance AND auto-populate (editable); event
  CentralPriceCatalogUpdated (§16).
AWAITING_DECISION: กรมบัญชีกลาง/e-GP public-API availability + auth is UNVERIFIED — until confirmed only
  the manual-import path is guaranteed; the adapter is a stub seam. Item-code mapping is a build concern.
Exit: a BOQ line shows/uses the central reference price; catalog is one shared national dataset.
```

#### e-GP Public Procurement Command (post-MVP — ADR-062)

```text
Build e-GP integration per ADR-062 (Preconstruction = CRM-service extension).
Objective: read tender feed + submit bid + import award for Thai government work.
Generate: Tender + Bid entities (crm schema) (§11); /preconstruction/{tenders,bids,...} (§14);
  ingest via EgpAdapter (Strategy §13.3) OR manual entry; bid priced from BOQ + ราคากลาง reference;
  a WON result emits TenderWon → Finance creates main_contract; events TenderImported/Won/Lost,
  BidSubmitted (§16).
AWAITING_DECISION: e-GP public-API availability + government credentials UNVERIFIED — manual path is the
  guaranteed baseline; the adapter is a stub seam. e-GP document/format conformance is a build concern.
Exit: a government tender can be tracked → bid → award → main_contract, via adapter or manual.
```

---

## PHASE 6 — ENTERPRISE READINESS

> **Target enterprise profile must be defined before executing this phase.**
> "Enterprise" means different things for a 200-person regional contractor
> vs a 50,000-person global construction group. Scope this phase to your ICP.

```text
Build Enterprise Readiness Layer.

Primary objective:
Support enterprise customers safely and reliably at the defined ICP scale.

ICP definition (fill in before executing):
  Target enterprise size: [ ] 200–1,000 users  [ ] 1,000–10,000 users  [ ] 10,000+ users
  Deployment preference: [ ] Cloud SaaS only  [ ] Hybrid  [ ] On-premise required
  Compliance requirement: [ ] Standard  [ ] SOC 2 Type II  [ ] ISO 27001  [ ] Custom

Requirements:

Enterprise areas:

- SSO / SAML 2.0 / OIDC integration
- enterprise RBAC (role and permission model at tenant level)
- SCIM provisioning and deprovisioning
- compliance controls (audit logs, data residency)
- dedicated tenant deployment models
- SLA operations and reporting

Generate:
MUST-HAVE:
  - SSO/SAML 2.0 integration (Okta, Azure AD, Google Workspace)
  - enterprise RBAC (role inheritance, permission scoping per project/org)
  - compliance audit log (user actions, data access, configuration changes)
  - SLA tracking and reporting per tenant

NICE-TO-HAVE (scope based on ICP definition above):
  - SCIM support for automated user provisioning
  - dedicated tenant deployment (single-tenant infrastructure option)
  - hybrid deployment model
  - on-premise deployment support (only if ICP requires)
  - data residency controls (region-specific storage)

Constraints:
  - Tenant isolation must be verified by security audit before GA
  - Enterprise controls must not increase per-tenant engineering overhead
    beyond what the platform can sustain at scale
  - On-premise deployment is opt-in only — do not make it the default path

Decision rules:
  IF a compliance requirement is unique to one customer →
     evaluate: is this a market requirement or a one-off? If one-off → scope it as
     professional services, not a platform feature.
  IF tenant isolation is in question → block enterprise customer onboarding
     until a security audit confirms isolation

Phase-level rollback plan:
  IF SSO integration causes authentication failures:
    → Fall back to username/password authentication for affected tenant
    → Do not affect other tenants' SSO configurations
    → Resolve and re-enable SSO per tenant after fix is confirmed

Exit criteria (Phase 6 is complete when):
  [ ] SSO/SAML is live and tested with at least 1 enterprise customer
  [ ] Enterprise RBAC is covering all permission surfaces in the platform
  [ ] Tenant isolation has passed security audit
  [ ] SLA tracking is operational and reporting to customer dashboard
  [ ] Compliance audit log meets the target compliance framework requirements
```

**Effort estimate:** Large (8–14 weeks, 4–6 engineers + security + legal review)
**Blocks:** Phase 8 (enterprise customer ops requires enterprise readiness infrastructure).

---

## PHASE 7 — ECOSYSTEM EXPANSION

> **Hard trigger condition:** Do not start Phase 7 until all conditions below are met.
> "Ecosystem expansion must emerge from real usage" is not a guideline — it is a gate.

```text
Build Ecosystem Expansion Layer.

Primary objective:
Expand from internal operational platform into ecosystem infrastructure
connecting vendors, suppliers, procurement networks, and financing.

Ecosystem trigger gate (all must pass before starting):
  [ ] Active vendor users on platform: at least 50 distinct vendor organizations
  [ ] Procurement transactions processed: at least 500 per month for 2 consecutive months
  [ ] Vendor portal (from Phase 2) is in active daily use by vendors
  [ ] At least 3 vendors have independently requested deeper integration capability
  [ ] Phase 5 (Platformization) exit criteria are 100% complete

If trigger gate is not passed → defer Phase 7 and invest in vendor adoption instead.

Requirements:

Ecosystem areas:

- supplier network systems (vendor profile, capability, rating)
- procurement ecosystem flows (RFQ, bidding, award, PO)
- pricing intelligence (market rate benchmarking)
- financing extension points (draw requests, payment milestones)
- insurance integration hooks
- smart infrastructure integration hooks (IoT, sensors, BIM live data)

Generate:
MUST-HAVE:
  - supplier network system (vendor profile, verified capability database)
  - procurement flow (RFQ → bid → award → PO lifecycle)
  - pricing intelligence feed (market rate data integration)

NICE-TO-HAVE:
  - financing extension points (draw request workflow integration)
  - insurance integration hooks
  - smart infrastructure hooks (IoT sensor data ingestion)

Constraints:
  - Ecosystem expansion must be demand-pull, not supply-push
  - No open marketplace until at least 200 verified vendors are active
  - Financing and insurance integrations require legal and compliance review
    before any live transactions

Decision rules:
  IF a new ecosystem connection is requested by fewer than 5 customers →
     defer until demand grows or build as optional integration
  IF ecosystem growth rate stalls after 3 months → pause expansion,
     audit adoption barriers, resolve before continuing

Phase-level rollback plan:
  IF procurement flow causes financial data errors:
    → Immediately suspend transaction processing
    → Preserve all transaction logs in immutable audit store
    → Revert to manual procurement coordination with email/document trail
    → Do not re-enable until financial audit is complete

Exit criteria (Phase 7 is complete when):
  [ ] Supplier network has at least 100 verified vendor profiles
  [ ] Procurement flow has processed at least 100 real transactions end-to-end
  [ ] Pricing intelligence is returning market rate data for at least 5 material categories
  [ ] Zero data integrity errors in procurement transaction history
```

**Effort estimate:** Extra-Large (12–20 weeks, 5–8 engineers + legal/compliance)
**Blocks:** Phase 11 (economic moat builds on ecosystem data).

---

## PHASE 8 — UNIFIED GOVERNANCE

> **Why unified:** Platform, Data, and AI governance are deeply interdependent.
> Sequential execution creates inconsistent policies across the three domains.
> They share ownership models, versioning rules, and audit requirements.
> Execute as one phase with three parallel workstreams under a single governance program.

```text
Build Unified Governance Layer.

Primary objective:
Prevent platform entropy across engineering, data, and AI systems
as teams and services scale — without creating governance bureaucracy.

Governance workstreams (run in parallel):

--- Workstream 1: Platform Governance ---
Areas: API governance, event governance, schema governance,
       architecture governance, dependency governance

Generate:
  - API versioning policy (coexistence rules, deprecation timeline, breaking change process)
  - backward compatibility rules (automated enforcement via CI)
  - event ownership model (who owns each event type, who can publish/consume)
  - schema evolution rules (additive-only by default, breaking changes require review)
  - service ownership registry (team → service mapping, escalation path)
  - architecture review workflow (lightweight, async — not a bottleneck committee)

--- Workstream 2: Data Governance ---
Areas: data ownership, stewardship, lineage, retention, analytics governance

Generate:
  - data ownership model (which team owns each entity and pipeline)
  - data lineage system (raw event → transformed model → dashboard metric traceable)
  - retention policy (per data category: operational, financial, audit, analytics)
  - data quality scoring standards (thresholds that trigger alerts vs actions)
  - BI governance standards (metric definitions approved by data owners)
  - executive reporting governance (single source of truth per KPI)

--- Workstream 3: AI Governance ---
Areas: AI auditability, recommendation traceability, hallucination mitigation,
       confidence scoring, human override, model monitoring

Generate:
  - AI audit trail (every recommendation: model version, input, output, user action)
  - model version tracking (which model version is live per use case)
  - explainability standards (plain-language reason required for all recommendations)
  - AI evaluation cadence (automated weekly scoring, manual monthly review)
  - AI incident handling workflow (how to respond when AI causes operational error)
  - human override controls (any AI recommendation can be overridden and logged)
  - confidence score standards (minimum confidence required per use case before display)

Constraints:
  - Governance must be enforced by tooling, not just policy documents
  - Architecture review must be async and resolve within 5 business days — not a bottleneck
  - Data lineage must be queryable, not just documented
  - Human operators retain final authority over all AI decisions
  - Governance rules must not slow down individual team feature velocity

Decision rules:
  IF a governance policy is being violated → alert owner team before escalating
  IF governance overhead exceeds 10% of engineering sprint capacity →
     audit and simplify the governance process itself
  IF AI model produces unexplainable output → suppress output, alert ML team

Exit criteria (Phase 8 is complete when):
  [ ] All 3 workstreams have delivered their MUST-HAVE outputs
  [ ] API versioning policy is enforced by CI/CD (not just documented)
  [ ] Data lineage is queryable for 100% of executive dashboard metrics
  [ ] AI audit trail is capturing all recommendations in production
  [ ] Architecture review process has completed at least 5 real reviews
  [ ] Executive metrics have single defined source of truth with no conflicts
```

**Effort estimate:** Large (8–14 weeks, 2–3 engineers per workstream = 6–9 total)
**Blocks:** Phase 10 (portfolio intelligence requires data lineage and governance).

---

## PHASE 9 — ENTERPRISE CUSTOMER OPERATIONS

> **Repositioned from Phase 13 to Phase 9:** Enterprise customer success must follow
> enterprise readiness (Phase 6), not be deferred until after ecosystem and moat phases.
> Enterprise customers who are not successfully onboarded will churn before Phase 11.

```text
Build Enterprise Customer Operations Layer.

Primary objective:
Support enterprise rollout, adoption, and long-term success
with repeatable, scalable operational patterns.

Requirements:

Operational areas:

- enterprise onboarding and rollout coordination
- migration support (from legacy systems)
- operational training and change management
- customer success operations
- adoption tracking and intervention
- account health monitoring
- escalation management

Generate:
MUST-HAVE:
  - enterprise onboarding playbook (standardized, version-controlled)
  - rollout workflow (phased deployment: pilot → department → org)
  - adoption tracking system (feature usage, active users, workflow completion)
  - account health dashboard (adoption score, support ticket volume, SLA adherence)
  - escalation management workflow (CSM → engineering → executive path)

NICE-TO-HAVE:
  - migration procedure library (from common legacy construction platforms)
  - operational training content (self-serve + facilitated)
  - change management playbook for enterprise IT departments

Constraints:
  - Every enterprise rollout must follow the playbook — no custom one-off processes
  - Adoption tracking must be automatic, not survey-based
  - Escalation path must be defined before the customer goes live

Decision rules:
  IF adoption score drops below threshold for 14 days →
     CSM intervention is triggered automatically
  IF account health is red for 30 days →
     executive sponsorship review is required
  IF a rollout requires process deviation from playbook →
     document deviation, evaluate for playbook update

Exit criteria (Phase 9 is complete when):
  [ ] At least 3 enterprise customers have completed onboarding via the playbook
  [ ] Adoption tracking is live for all enterprise accounts
  [ ] Account health dashboard is operational with alerting
  [ ] Zero enterprise customers churned due to onboarding failure
```

**Effort estimate:** Medium (6–10 weeks, 2–3 customer success + 1–2 engineers)
**Blocks:** Phase 11 (economic moat requires retained enterprise customer data).

---

## PHASE 10 — PORTFOLIO INTELLIGENCE

```text
Build Portfolio Intelligence Layer.

Primary objective:
Expand visibility from project-level operations into portfolio-level intelligence
using clean, governed data from Phase 3 and Phase 8.

Data contract (must be confirmed before building):
  - Cross-project data is accessible via the data warehouse (Phase 3)
  - All metrics used in portfolio views are governed by Phase 8 data governance
  - Executive KPI definitions are approved by data owners (Phase 8)
  - Data lineage is traceable from portfolio metric back to raw operational event

Requirements:

Intelligence areas:

- cross-project analytics and benchmarking
- portfolio-level forecasting
- resource optimization intelligence
- executive reporting

Generate:
MUST-HAVE:
  - portfolio dashboard (cross-project health, spend, schedule variance)
  - project benchmarking system (compare similar projects by type, size, region)
  - executive reporting system (single source of truth, governed by Phase 8)

NICE-TO-HAVE:
  - portfolio forecasting pipeline (cost, schedule, risk at portfolio level)
  - resource utilization tracking (cross-project resource allocation)
  - strategic risk analysis (portfolio-level risk concentration)

Constraints:
  - Portfolio analytics must only use data that has passed Phase 3 quality gates
  - No analytics built on unversioned or unvalidated data sources
  - Executive metrics must have an approved definition before being surfaced

Decision rules:
  IF a portfolio metric cannot be traced to a governed data source →
     do not surface it to executives until lineage is established
  IF data quality drops below 90% for a project's data →
     flag that project as "data quality warning" in portfolio view,
     do not exclude it silently

Exit criteria (Phase 10 is complete when):
  [ ] Portfolio dashboard is live with data from at least 5 active projects
  [ ] All executive metrics have approved definitions and traceable lineage
  [ ] Project benchmarking is returning meaningful comparisons
  [ ] Portfolio dashboard has been reviewed and approved by at least 2 executives
```

**Effort estimate:** Medium-Large (6–10 weeks, 2–3 engineers + 1 data analyst)
**Blocks:** Phase 11 (economic moat builds on portfolio-scale intelligence).

---

## PHASE 11 — ECONOMIC MOAT EXPANSION

> **Hard trigger condition:** Do not start Phase 11 until all conditions below are met.
> This phase is the culmination of every prior phase — it has no shortcut.

```text
Build Economic Moat Expansion Layer.

Primary objective:
Create long-term platform defensibility through proprietary operational intelligence
that cannot be replicated without the same operational history.

Moat trigger gate (all must pass before starting):
  [ ] Phase 7 exit criteria: 100% complete (ecosystem with real transaction history)
  [ ] Phase 9 exit criteria: 100% complete (retained enterprise customers)
  [ ] Phase 10 exit criteria: 100% complete (portfolio intelligence operational)
  [ ] Operational data history: at least 12 months of clean, governed event history
  [ ] Distinct active projects in data: at least 20 projects with full lifecycle data
  [ ] Phase 8 governance: AI audit trail operational, data lineage confirmed

If trigger gate is not passed → invest in retention and data quality instead.
The moat is only valuable when built on deep, reliable operational history.

Requirements:

Moat areas:

- vendor and supplier intelligence (performance, reliability, pricing history)
- procurement intelligence (market pricing, vendor comparison, negotiation signals)
- cross-project learning (what worked, what failed, pattern extraction)
- operational benchmarking (cost, schedule, quality benchmarks by project type)

Generate:
MUST-HAVE:
  - supplier analytics (vendor performance scoring over time)
  - procurement intelligence system (historical pricing, market rate benchmarking)
  - project similarity system (match new projects to historical comps)

NICE-TO-HAVE:
  - pricing trend analysis (forecasted material costs)
  - best-practice extraction pipeline (surfacing what worked across similar projects)
  - reusable operational recommendations (pre-generated insights for new projects)

Constraints:
  - Moat expansion must be demand-pull from real operational usage
  - No open marketplace until vendor count exceeds 200 with active transaction history
  - Proprietary intelligence must not be exposed via public API without deliberate monetization decision
  - Intelligence systems must comply with Phase 8 AI governance

Decision rules:
  IF intelligence quality degrades (accuracy below threshold) →
     pause external exposure, retrain on more recent data
  IF a competitor can replicate an intelligence feature with public data alone →
     that feature is not a moat — deprioritize in favor of deeper operational integration

Exit criteria (Phase 11 is complete when):
  [ ] Supplier analytics is scoring vendors across at least 3 performance dimensions
  [ ] Procurement intelligence is demonstrably improving negotiation outcomes
    (measured by price variance vs market rate)
  [ ] Project similarity system is returning accurate historical comps
  [ ] Intelligence features are cited as a retention reason by at least 3 enterprise customers
```

**Effort estimate:** Extra-Large (12–20 weeks, 4–6 engineers + data science)

---

## PHASE OBJECTIVES

> Per § Phase Template: one-sentence outcome per PHASE block (the block's `Generate:` list is its
> Acceptance; Exit criteria are in-block).

- **P0 — Engineering Foundation:** harden the engineering foundation (CI/CD, service template, feature flags, observability).
- **P1 — Operational Foundation:** establish operational foundations for running the platform in production.
- **P2 — Workflow Expansion:** expand workflow/approval coverage across domains.
- **P3 — Data Platform Evolution:** evolve the data platform (analytics, knowledge graph, ontology).
- **P4 — AI Expansion:** expand AI capabilities beyond MVP assist.
- **P5 — Platformization:** expose platform APIs + marketplace scaffolding.
- **P6 — Enterprise Readiness:** meet enterprise requirements (security, SLA, provisioning).
- **P7 — Ecosystem Expansion:** open supplier/contractor ecosystem integrations.
- **P8 — Unified Governance:** unify data / AI / compliance governance across the platform.
- **P9 — Enterprise Customer Operations:** operate enterprise customers (SSO, dedicated tiers).
- **P10 — Portfolio Intelligence:** deliver cross-project portfolio intelligence.
- **P11 — Economic Moat Expansion:** expand the data + network-effect moat.

---

## NON-FUNCTIONAL GATES & GOVERNANCE (all Phases inherit)

> The per-Phase Exit criteria above are the functional bar. In addition, every Phase inherits these
> cross-cutting gates — authoritative in `docs/specifications/`, never restated divergently. A Phase
> is not "done" until the gates that apply to it are green (Rule 36).

- **Reliability / SLO** — availability + latency + error-budget per tier (`31-monitoring §31.6`);
  error-budget freeze policy applies to feature rollout.
- **Delivery** — DORA targets from CI (`31 §31.12`); feature-flag cleanup is a Stage-gate prerequisite
  (Phase 0 exit).
- **Disaster recovery** — RTO/RPO per tier validated by quarterly game-day (`08 §8.2`, `31 §31.11`);
  a tier is not production-ready until it passes ≥ 1 game-day at its RTO/RPO.
- **Security** — STRIDE per external surface (`05 §5.9`); SBOM + SLSA per release (`05 §5.10`);
  PDPA hard-requirements (`05 §5.3`).
- **AI security & governance** — OWASP LLM Top 10 (`22 §22.8`) + model governance (`22 §22.9`) for
  the AI-expansion phases; AI engineering — RAG-eval + prompt registry + per-tenant token/cost cap
  (COST-001) + semantic cache (`22 §22.10`).
- **Cost & sustainability** — FinOps cost-per-tenant + unit economics (`08 §8.10`); compute
  sustainability / scale-to-zero (`08 §8.11`).
- **Accessibility** — WCAG 2.2 AA (`20 §20.8`). **Frontend performance** — Core Web Vitals
  (LCP/INP/CLS p75, `31 §31.6`) via RUM + Lighthouse CI gate (`30 §30.9`). **Capacity** — capacity
  planning + load test before each Maturity-Stage promotion (`18 §18.4`).
- **Risk & phase authoring** — active risks and the phase-authoring template are in
  `00_master_construction_os.md` § Risk Register / § Phase Template.

---

## REVISED EXECUTION ORDER

```text
Phase 0  — Engineering Foundation               [prerequisite for everything]
Phase 1  — Operational Foundation               [blocks: 2, 3, 4]
Phase 2  — Workflow Expansion                   [blocks: 7]
Phase 3  — Data Platform Evolution              [blocks: 4, 10]
Phase 4  — AI Expansion                         [blocks: 10, 11]
Phase 5  — Platformization                      [blocks: 7]
Phase 6  — Enterprise Readiness                 [blocks: 9]
Phase 7  — Ecosystem Expansion *                [trigger-gated]
Phase 8  — Unified Governance                   [parallel from Phase 3 onward]
Phase 9  — Enterprise Customer Operations       [blocks: 11]
Phase 10 — Portfolio Intelligence               [blocks: 11]
Phase 11 — Economic Moat Expansion *            [trigger-gated]

* = hard trigger gate must pass before starting

```

**What changed from v1:**

- Phase L (Engineering) → Phase 0 (run first, not 12th)
- Phase A + K (Stabilization + Reliability) → Phase 1 (merged, run second, not 1st + 11th)
- Phase H + I + J (Governance triple) → Phase 8 (unified, parallel from Phase 3)
- Phase M (Enterprise Customer Ops) → Phase 9 (moved from 13 to follow Phase 6)
- Phase G and O now have measurable trigger gates (not subjective "real usage")
- 15 phases → 12 phases (0–11)

---

## CRITICAL EXECUTION RULES

```text
Architecture rules:

1. Do not rewrite working architecture unless failure is confirmed and documented.
2. Do not introduce microservice boundaries before team ownership boundaries exist.
3. Do not build autonomous AI before human-verified operational reliability.

Data rules:

4. Do not allow inconsistent operational entities — schema registry is the authority.
5. Do not allow uncontrolled schema evolution — all changes go through registry.
6. Do not surface analytics built on ungoverned data to executives.

Platform rules:

7. Do not allow uncontrolled API evolution — versioning policy is enforced by CI.
8. Do not allow fragmented workflow implementations — workflow engine is the authority.
9. Do not allow platform entropy — architecture review process handles deviations.

Trust and safety rules:

10. Do not allow operational trust degradation — SLO burn rate triggers feature freeze.
11. Do not allow black-box AI in operational decisions — explainability is mandatory.
12. Do not allow tenant isolation weaknesses — security audit blocks enterprise onboarding.

Scale rules:

13. Do not optimize for theoretical scale before operational evidence demands it.
14. Do not create governance bureaucracy — governance overhead >10% triggers simplification.
15. Do not start ecosystem or moat phases before trigger gates pass.

ALWAYS:

1. Optimize for operational survivability — stability beats features.
2. Optimize for enterprise trust — a broken SLA costs more than a missing feature.
3. Optimize for governance that preserves velocity — bureaucracy kills both.
4. Optimize for engineering consistency — standards enforced by tooling, not documents.
5. Optimize for data quality — dirty data corrupts every downstream system.
6. Optimize for AI operational safety — human operators retain final authority.
7. Optimize for ecosystem defensibility — demand-pull, not supply-push.
8. Optimize for long-term maintainability — the team 2 years from now must understand this.

```

---

## FINAL STRATEGIC PRINCIPLE

```text
The long-term winner in construction technology is not the platform with the most features.

The long-term winner is the platform that:

- survives operational scale without degrading trust
- earns operational trust through reliability, not promises
- captures reliable operational data through governance, not luck
- maintains consistency across engineering teams as they grow
- scales across customer organizations through repeatable playbooks
- accumulates operational intelligence that competitors cannot replicate
- becomes deeply embedded in daily workflows that cannot be easily replaced
- creates ecosystem dependency through real value, not artificial lock-in
- retains enterprise customers through outcomes, not contracts

Execution priority order:

1. Engineering Foundation   — standards before code
2. Operational Foundation   — reliability before features
3. Workflow Expansion       — extend what works
4. Data Foundation          — clean data before intelligence
5. AI Intelligence          — intelligence on clean data only
6. Platformization          — open the platform carefully
7. Enterprise Readiness     — support enterprise safely
8. Ecosystem                — when vendors pull you in, not before
9. Governance               — prevent entropy as you scale
10. Enterprise Success      — retained customers before new logos
11. Portfolio Intelligence  — portfolio insight from operational depth
12. Economic Moat           — proprietary intelligence from operational history

The moat is not built last because it matters least.
It is built last because it can only be built on everything that comes before it.
```
