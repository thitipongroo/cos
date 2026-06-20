---
title: Construction OS — Master Specification
role: master
version: 1.17.0
last_updated: 2026-05-31
previous: null
next: 01_build_priority_execution.md
authority: master — all stage files defer to this document
covers_stages: 01–11
---

# Construction OS — Master Specification

> ---
>
> **⚠️ AUTHORITATIVE MASTER DOCUMENT — ALL OTHER FILES DEFER TO THIS**
>
> **Role:** Master specification — source of all technology decisions, RBAC definitions,
> event contracts, financial precision rules, workflow state machines, and phase commands.
>
> **Lifecycle stage:** MASTER — covers ALL stages (01–11)
> **Previous:** None — this is the root document
> **Next:** 01_build_priority_execution.md + 02_build_deep_systems.md (BUILD stage)
> **Version:** 1.7.0
> **Last updated:** 2026-05-29
>
> **Stage files authority:** Stage files 01–11 provide execution context ONLY.
> On any conflict between a stage file and this document → this document wins.
>
> ---

---

## TABLE OF CONTENTS

| Section                                                                                |
| -------------------------------------------------------------------------------------- |
| [AGENT ROLE](#agent-role)                                                              |
| [PHASE DEPENDENCY GRAPH](#phase-dependency-graph)                                      |
| [GLOBAL TECHNOLOGY DECISION MAP](#global-technology-decision-map)                      |
| [GLOBAL SYSTEM CONTEXT COMMAND](#global-system-context-command)                        |
| [CROSS-SERVICE EVENT CONTRACT SPEC](#cross-service-event-contract-spec)                |
| [FINANCIAL PRECISION SPEC](#financial-precision-spec)                                  |
| [DESIGN TOKEN SPECIFICATION](#design-token-specification)                              |
| [WORKFLOW ENGINE SPEC](#workflow-engine-spec)                                          |
| **— Phase Commands —**                                                                 |
| [Phase 1 — Foundation Repository](#phase-1--foundation-repository-command)             |
| [Phase 2 — Auth + Tenant System](#phase-2--authentication--tenant-system-command)      |
| [Phase 3 — Project Service](#phase-3--project-service-command)                         |
| [Phase 4 — BOQ Service](#phase-4--boq-service-command)                                 |
| [Phase 5 — Procurement Service](#phase-5--procurement-service-command)                 |
| [Phase 6 — Site Operations](#phase-6--site-operations-command)                         |
| [Phase 7 — Finance Service](#phase-7--finance-service-command)                         |
| [Phase 8 — Event-driven Infrastructure](#phase-8--event-driven-infrastructure-command) |
| [Phase 9 — File + Document System](#phase-9--file--document-system-command)            |
| [Phase 10 — Mobile Offline Engine](#phase-10--mobile-offline-engine-command)           |
| [Phase 11 — AI Foundation](#phase-11--ai-foundation-command)                           |
| [Phase 12 — AI Report Assistant](#phase-12--ai-report-assistant-command)               |
| [Phase 13 — Knowledge Graph](#phase-13--knowledge-graph-command)                       |
| [Phase 14 — Analytics + Dashboard](#phase-14--analytics--dashboard-command)            |
| [Phase 15 — Observability](#phase-15--observability-command)                           |
| [Phase 16 — Security](#phase-16--security-command)                                     |
| [Phase 17 — DevOps + Deployment](#phase-17--devops--deployment-command)                |
| [Phase 18 — Testing](#phase-18--testing-command)                                       |
| [Phase 19 — Final Production Readiness](#phase-19--final-production-readiness-command) |
| [Phase 20 — Notification Service](#phase-20--notification-service-command)             |
| [Phase 21 — Equipment Service](#phase-21--equipment-service-command)                   |
| [Phase 22 — Workforce Service](#phase-22--workforce-service-command)                   |
| [Phase 23 — MLOps Pipeline](#phase-23--mlops-pipeline-command)                         |
| [Phase 24 — Digital Twin](#phase-24--digital-twin-command)                             |
| [Phase 25 — Enterprise Provisioning](#phase-25--enterprise-provisioning-command)       |
| [FINAL EXECUTION ORDER](#final-execution-order)                                        |

---

## AGENT ROLE

You are an AI engineering agent for **Construction OS** — an AI-native Construction Operating System.

This file is the **agent-optimized execution view** of the platform specifications.
Read this file completely before writing any code, making any decision, or answering any question about this platform.

**Your responsibilities:**

- Implement, review, debug, and evolve platform code according to the specs in this file
- Never invent architecture or technology decisions — every decision is already made in `../docs/specifications/`
- When this file conflicts with `../docs/specifications/` → specs win; report to product owner
- When asked to do something not covered in any spec → ask the user before proceeding

**Authority hierarchy:**

1. `../docs/specifications/` — source of truth for all architecture decisions
   - Type A (architecture): tech stack, patterns, security, data model, APIs, UX, AI layers
   - Type B (implementation): Phase Dependency Graph, Deployable Units, Event Contracts,
     Financial Precision, Workflow State Machines, Design Tokens
     → all Type B decisions are now authoritative in `32-implementation-specifications.md`
   - On any conflict between this file and `../docs/specifications/` → specs win;
     report discrepancy to product owner immediately
2. This file — agent-optimized execution view (derived from specs)
   - Contains agent commands, phase build instructions, EP resolutions, and execution rules
   - Does NOT override specs — reflects specs in agent-executable form
3. Product owner decisions in chat — when explicitly stated
4. Stage command files (01–11) — execution context only; defer to this file on conflicts

---

## PHASE DEPENDENCY GRAPH

> 📎 **Derived from:** `docs/specifications/32-implementation-specifications.md §32.1`
> Authoritative copy is in specs. This section is an agent-optimized view.

```text
Dependency Order (must complete before dependent can start):

[Phase 1: Foundation Repo]
        │
        ▼
[Phase 2: Auth + Tenant] ──────────────────────────────────────────────┐
        │                                                              │
        ▼                                                              │
[Phase 8: Event Infrastructure] ◄── MUST complete before Ph3–7         │
        │                                                              │
        ├──► [Phase 3: Project Service]                                │
        │           │                                                  │
        ├──► [Phase 4: BOQ Service] ◄─── depends on Ph3                │
        │           │                                                  │
        ├──► [Phase 5: Procurement] ◄─── depends on Ph3, Ph4           │
        │           │                                                  │
        ├──► [Phase 6: Site Operations] ◄─── depends on Ph3            │
        │           │                                                  │
        ├──► [Phase 7: Finance] ◄─── depends on Ph4, Ph5               │
        │           │                                                  │
        ├──► [Phase 20: Notification Service] ◄─── depends on Ph2, Ph3 │
        │           │                                                  │
        ├──► [Phase 21: Equipment Service] ◄─── depends on Ph2, Ph3    │
        │           │                                                  │
        ├──► [Phase 22: Workforce Service] ◄─── depends on Ph2, Ph3    │
        │           │                                                  │
        └──► [Phase 25: Enterprise Provisioning] ◄─── Ph2, Ph3, Ph20   │
                    │                                                  │
                    ▼                                                  │
         [Phase 9: File Service] ◄─── depends on Ph2 (tenant)          │
                    │                                                  │
                    ▼                                                  │
         [Phase 10: Mobile Offline] ◄─── depends on Ph3–7, Ph20–22     │
                    │                                                  │
                    ▼                                                  │
         [Phase 11: AI Foundation] ◄─── depends on Ph8, Ph9            │
                    │                                                  │
                    ▼                                                  │
         [Phase 12: AI Report Assistant] ◄─── depends on Ph11          │
                    │                                                  │
                    ▼                                                  │
         [Phase 13: Knowledge Graph] ◄─── depends on Ph3–7, Ph11       │
                    │                                                  │
                    ▼                                                  │
         [Phase 14: Analytics] ◄─── depends on Ph3–7, Ph8, Ph13        │
                    │                                                  │
                    ▼                                                  │
         [Phase 23: MLOps Pipeline] ◄─── depends on Ph11, Ph14         │
                    │                                                  │
                    ▼                                                  │
         [Phase 15: Observability] ◄─── depends on Ph1–14, Ph20–25     │
                    │                                                  │
                    ▼                                                  │
         [Phase 16: Security] ◄─── depends on Ph2, Ph15                │
                    │                                                  │
                    ▼                                                  │
         [Phase 17: DevOps] ◄─── depends on Ph1, Ph15, Ph16            │
                    │                                                  │
                    ▼                                                  │
         [Phase 18: Testing] ◄─── depends on Ph1–17, Ph20–25           │
                    │                                                  │
                    ▼                                                  │
         [Phase 19: Production Readiness] ◄─── depends on Ph1–18       │
                                                                       │
BLOCKING RULE: Phase 8 must be completed before Ph3–7 begin,           │
because all services depend on the shared event SDK from Ph8.         ◄┘

SAAS MATURITY MODEL — Phase to Stage mapping (source §32.1):
  Prevents agents from implementing features before their correct maturity stage.

  Stage 1 — Multi-tenant MVP          → Phase 1–2       (Foundation + Auth)
  Stage 2 — Multi-project SaaS        → Phase 3–7       (Core Domains)
  Stage 3 — Multi-company Enterprise  → Phase 8–14, 25  (Events + AI + Analytics + Enterprise Provisioning)
  Stage 4 — Cross-region Deployment   → Phase 17        (DevOps + Multi-region)
  Stage 5 — AI-native Ecosystem       → Phase 23–24     (MLOps + Digital Twin)

  Note: Stage command files 06–11 (ECOSYSTEM DOMINANCE through BACKGROUND CIVILIZATION) are beyond the spec Phase 25 scope. They operate under the AWAITING_DECISION protocol defined in each stage file.

  Agent rule: If a feature request maps to Stage N, implement it in Stage N phases.
  Example: "Add multi-region support" → Stage 4 = Phase 17 (MultiRegionDeploy), not earlier.
  Example: "Add AI risk scoring"      → Stage 3–5 = Phase 11–14 + Phase 23, not Phase 1–7.
```

---

## GLOBAL TECHNOLOGY DECISION MAP

> [v3 — Updated: Architecture = Modular Monolith (file 01 decision)]

```text
MOAT ARCHITECTURE CONTEXT (why these systems exist — do not deprioritize):
  The competitive moat of this platform is NOT features.
  The moat is: operational construction dataset + workflow lock-in + intelligence layer.

  Every architectural decision below serves one of three moat pillars:

  PILLAR 1 — Data accumulation (structured operational dataset)
    → PostgreSQL schema design, Kafka event sourcing, ClickHouse analytics
    → Every entity, every transaction, every event must be captured and structured
    → Agent rule: NEVER skip schema fields to save time — missing data = missing moat

  PILLAR 2 — Workflow lock-in (operational dependency)
    → Temporal workflows, offline sync, role-based mobile UX
    → Once procurement, costing, and reporting run through this platform,
       switching cost becomes extremely high
    → Agent rule: NEVER simplify workflow logic to reduce complexity

  PILLAR 3 — Intelligence compounding (AI gets better with more data)
    → Knowledge Graph (Neo4j), Vector DB (pgvector), MLOps pipeline (Phase 23)
    → More projects → more operational data → better AI → better outcomes → more customers
    → Agent rule: NEVER treat AI infrastructure (Phase 11–13, 23) as optional

ARCHITECTURE DECISION (authoritative — from file 01):
  Pattern:    Modular Monolith (NOT microservices from day 1)
  Rationale:  "Start as modular monolith. Extract a service ONLY when:
               (a) team ownership boundary is clear AND
               (b) the module is experiencing independent scaling pressure with evidence."
  Kafka:      Internal event bus WITHIN the monolith boundary in MVP.
              Kafka is external infrastructure but the application is ONE deployable.
  Exception:  AI services (Python ecosystem) and Go workers are ALWAYS separate —
              different language runtime, cannot run inside Node.js process.

DEPLOYABLE UNITS (derived from: docs/specifications/32-implementation-specifications.md §32.2):
┌────────────────────────────────┬──────────────────┬────────────────────────────┐
│ Deployable                     │ Runtime          │ Contents                   │
├────────────────────────────────┼──────────────────┼────────────────────────────┤
│ Main Application               │ NestJS (monolith)│ ALL domain modules:        │
│ (backend/)                     │                  │ identity, tenant, project, │
│                                │                  │ boq, procurement, site-ops,│
│                                │                  │ finance, notification,     │
│                                │                  │ equipment, workforce       │
├────────────────────────────────┼──────────────────┼────────────────────────────┤
│ File Service                   │ Fastify          │ Multipart upload I/O       │
│ (services/file-service/)       │                  │ (extracted for throughput) │
├────────────────────────────────┼──────────────────┼────────────────────────────┤
│ AI Gateway                     │ FastAPI (Python)  │ LLM routing, RAG          │
│ AI Embedding Worker            │ FastAPI (Python)  │ Embedding generation       │
│ AI OCR Pipeline                │ FastAPI (Python)  │ OCR processing             │
│ (services/ai-*)                │                  │                            │
├────────────────────────────────┼──────────────────┼────────────────────────────┤
│ Analytics Worker               │ Go               │ ClickHouse aggregation     │
│ KG Ingestion Worker            │ Go               │ Neo4j ingestion            │
│ (services/*-worker/)           │                  │                            │
├────────────────────────────────┼──────────────────┼────────────────────────────┤
│ Web App (apps/web/)            │ Next.js+next-pwa │ Tablet/laptop online+offline│
│ Mobile (apps/mobile/)          │ React Native     │ Smartphone native app      │
└────────────────────────────────┴──────────────────┴────────────────────────────┘

SERVICE EXTRACTION RULES (enforced — agents must NOT split prematurely):
  A module may be extracted from the monolith ONLY when BOTH conditions are true:
    Condition A: Team ownership boundary is confirmed (a dedicated team owns it)
    Condition B: The module has independent scaling pressure with evidence
  If either condition is absent → keep as module inside monolith

Internal service communication (within monolith):
  Module-to-module:  Direct NestJS module dependency injection (NOT HTTP/gRPC)
  Async events:      Kafka (internal event bus — same process, external infra)

Cross-deployable communication:
  Main App ↔ File Service:    REST API (HTTP)
  Main App ↔ AI Services:     REST API (HTTP)
  Main App ↔ Go Workers:      Kafka events for WRITE/ingestion path (no direct HTTP).
                              READ/query path: NestJS services query each database directly
                              via native driver (e.g. Neo4j driver in graph.service.ts).

RULES:

- Do NOT add HTTP calls between modules inside the monolith
- Do NOT create Helm charts for domain modules (one chart for main app)
- Do NOT treat Kafka as a microservices boundary signal
- AI services and Go workers are ALWAYS separate — never merge into monolith

```

---

## GLOBAL SYSTEM CONTEXT COMMAND

```text
You are a principal-level software architect and staff engineer responsible for
building a production-grade AI-native Construction Operating System.

The platform is NOT a generic ERP.
The platform is NOT a simple project management system.
The platform is NOT a standalone AI chatbot.

The platform must become:

- construction ERP
- procurement platform
- site operations platform
- financial synchronization system
- AI-native workflow platform
- operational intelligence layer
- multi-tenant SaaS platform
- offline-first mobile system
- event-driven enterprise platform

Core architectural principles:

- multi-tenant
- event-driven
- AI-native
- offline-first
- enterprise-ready
- API-first
- scalable
- cloud-native
- Kubernetes-native
- observability-first

Technology assignments follow the SERVICE → RUNTIME MAPPING table above.
Do NOT reassign runtimes. Do NOT combine runtimes within a service.

Infrastructure stack (all required — versions authoritative in spec §4.3 Databases + §4.4 Infrastructure; mirrored here):

- PostgreSQL 16          — primary relational store
- TimescaleDB 2.x        — time-series telemetry (equipment, IoT, workforce)
- Redis 7                — cache and session store
- Apache Kafka 3.x       — event streaming
- OpenSearch 2.x         — full-text and vector search
- Neo4j 5.x              — knowledge graph
- ClickHouse 24.x        — analytics OLAP
- pgvector (extension)   — vector embeddings in PostgreSQL
- Weaviate               — vector DB (alternative/supplement to pgvector for AI workloads)
- MinIO                  — S3-compatible object storage
- Kubernetes 1.29+       — container orchestration
- Docker                 — containerization
- Terraform 1.7+         — infrastructure as code
- Istio 1.21+            — service mesh (mTLS, traffic management, observability)
- AWS Secrets Manager + HashiCorp Vault 1.16+ — secrets management: AWS SM (cloud/EKS via External Secrets Operator); Vault (on-premise/hybrid, Vault Agent sidecar); Vault dev mode (local dev)
- NGINX                  — ingress controller (via Kubernetes ingress-nginx)
- Confluent Schema Registry — Kafka schema management
- Apache Iceberg            — data lake table format on S3 (cold archive; spec §4.3, §9.3)
- Debezium CDC              — change data capture: reads PostgreSQL WAL → Kafka → S3/Iceberg (Path 2 data replication — see spec §9.4; separate from Outbox Pattern Path 1)
- ArgoCD                    — GitOps CD to EKS (spec §4.9); GitHub Actions handles CI only (build + push to ECR); ArgoCD handles CD (sync image tag to cluster)


API Gateway Responsibilities (source §4.8, §16.2):
  Gateway:           Kong Gateway (open-source, Kubernetes-native) — runs in front of NestJS
  Authentication:    Kong validates Keycloak JWT at ingress; NestJS guards enforce authorization
  Rate limiting:     Kong Gateway per tenant and per API key (spec §4.8)
                     Default limits enforced at Kong: auth 10/min/IP, general 100/min/user,
                     file upload 20/min/user, AI 20/min/tenant (spec §05 §5.5, QM-7)
  Tenant routing:    Kong routes to upstream; NestJS middleware sets app.current_tenant_id from JWT
  API analytics:     Kong plugin collects usage; ClickHouse for aggregation (Phase 14)
  Request validation:class-validator (NestJS) + Pydantic (FastAPI) — per endpoint (business logic)
  API monetization:  Kong usage plans plugin — quota per tenant tier (SMB 50K/month, Mid-market 100K/month, Enterprise configurable)
    Kong enforces quota; metering data → ClickHouse for billing analytics (Phase 14)
    Trigger: first API-as-a-product customer or marketplace launch
    Per-API-key quota (marketplace/ERP integrations only): SMB 10K/month per key, Mid-market 20K/month per key, Enterprise configurable (default 200K/month per key); no single key may exceed 20% of tenant total
    Kong traffic distinction (spec §14.5): user JWT (Path A/B) → per-minute limits only; OAuth2 client credentials (azp = registered Kong Consumer) → per-minute + monthly quota; absent/unregistered azp → anonymous consumer, per-minute only

Mandatory architectural rules:

- Architecture: modular monolith — do NOT split into microservices prematurely
- every entity must include tenant isolation: `tenant_id UUID NOT NULL` on every domain table + PostgreSQL RLS policy (PRIMARY mechanism, spec §7.7). All SQL must use schema-qualified names (e.g., `finance.project_budgets`). Application-layer `WHERE tenant_id = $1` is SECONDARY defense-in-depth.
- all modules must emit events via shared Kafka SDK (Phase 8 output)
- all APIs must be versioned (/api/v1/, /api/v2/) — NestJS global prefix `api/v1` set in backend/src/main.ts
- APIs must be OpenAPI 3.1 compliant
- monolith must be stateless (no local state, all state in DB/Redis/Kafka)
- infrastructure must be containerized
- event contracts must be typed (TypeScript interfaces + Avro schemas)
- RBAC required everywhere (see Phase 2 for role definitions)
- audit logging mandatory (see Phase 16 for audit pipeline)
- no direct DB access across module boundaries — only via published events or shared service layer
- async cross-module coordination through Kafka
- offline sync mandatory for React Native mobile app
- AI layer must support RAG via pgvector + OpenSearch
- observability required from day one (Phase 15 stack)

You must NEVER invent business logic not specified.
You must NEVER invent accounting rules.
You must NEVER invent regional tax rules.
You must NEVER invent BIM schemas.
You must NEVER invent procurement approval chains.
You must NEVER invent workflow state transitions not defined in this document.

If information is missing:

- explicitly mark as UNSPECIFIED
- STOP immediately — escalate to product owner for decision
- do not generate stubs
- do not hallucinate implementation details
- do not proceed with assumptions — surface the gap

Target: Build a production-grade Construction Operating System.
```

---

## CROSS-SERVICE EVENT CONTRACT SPEC

> 📎 **Derived from:** `docs/specifications/32-implementation-specifications.md §32.4`
> Authoritative payload specs (field types, enum values) are in specs. This section is agent-executable form.
> ⚠️ **EVENT NAMING MIGRATION REQUIRED:**
> The canonical event naming format (spec §32.4 and §15.6) is:
> `{domain}.{entity}.{action}.v{N}` — e.g., `construction.project.created.v1`
> Agents MUST use the canonical format for ALL NEW events. Non-canonical legacy events
> must be migrated per the Schema Migration Policy in spec §32.4 before Stage 2 go-live.
> See Kafka topic naming: `{tenant_id}.{domain}.{entity}.{action}.v{N}`
> The event names below are annotated with their canonical equivalents where known.

```text
All Kafka events MUST conform to the following envelope:

┌─────────────────────────────────────────────────────────────┐
│ BASE EVENT ENVELOPE (TypeScript + Avro)                     │
├─────────────────────────────────────────────────────────────┤
│ {                                                           │
│   event_id:      string (UUID v4)                          │
│   event_type:    string — CANONICAL format:                │
│                    "{domain}.{entity}.{action}.v{N}"       │
│                    e.g. "construction.project.created.v1"  │
│                    (source: spec §32.4; M-5 resolved)      │
│   event_version: string (e.g. "1.0" — semantic patch      │
│                    version within the major version;       │
│                    source: spec §32.4)                     │
│   tenant_id:     string (UUID)                             │
│   actor_id:      string (UUID — user who triggered)        │
│   occurred_at:   string (ISO 8601 UTC)                     │
│   correlation_id: string (UUID — for tracing)              │
│   payload:       object (event-specific — see below)       │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘

CRITICAL CROSS-SERVICE EVENTS (field-level spec):
Note: Legacy names shown first → canonical name in brackets. New events use canonical name only.

1. project.created → [construction.project.created.v1]

   payload: {
     project_id:   UUID
     project_code: string
     project_name: string
     project_type: enum [RESIDENTIAL, COMMERCIAL, INFRASTRUCTURE, INDUSTRIAL]
     budget:       { amount: decimal(19,4), currency_code: ISO4217 }
     start_date:   date (YYYY-MM-DD)
     end_date:     date (YYYY-MM-DD)
     created_by:   UUID
   }

2. boq.version.created → [construction.boq.version_created.v1]

   payload: {
     boq_version_id: UUID
     project_id:     UUID
     version_number: integer
     total_estimated:{ amount: decimal(19,4), currency_code: ISO4217 }
     created_by:     UUID
   }

3. procurement.purchase_order.created → [procurement.po.created.v1]

   payload: {
     po_id:        UUID
     project_id:   UUID
     vendor_id:    UUID
     po_number:    string
     total_amount: { amount: decimal(19,4), currency_code: ISO4217 }
     delivery_date: date
     line_items:   Array<{ item_id: UUID, quantity: decimal(10,4),
                           unit: string, unit_price: decimal(19,4) }>
   }

4. procurement.vendor_invoice.received → [procurement.invoice.received.v1]

   payload: {
     invoice_id:  UUID
     po_id:       UUID
     project_id:  UUID
     vendor_id:   UUID
     amount:      { amount: decimal(19,4), currency_code: ISO4217 }
     invoice_date: date
     due_date:    date
   }

5. site.report.created → [site.report.created.v1]

   payload: {
     report_id:    UUID
     project_id:   UUID
     report_date:  date
     submitted_by: UUID
     summary:      string (max 2000 chars)
     issue_count:  integer
     photo_count:  integer
   }

6. inspection.failed → [site.inspection.failed.v1]

   payload: {
     inspection_id:  UUID
     project_id:     UUID
     checklist_id:   UUID
     failed_items:   Array<{ item_id: UUID, description: string }>
     inspected_by:   UUID
     inspected_at:   datetime
   }

7. task.completed → [construction.task.completed.v1]

   payload: {
     task_id:        UUID
     project_id:     UUID
     boq_item_id:    UUID
     completed_by:   UUID
     completed_at:   datetime
     progress_percent: integer (100 at completion)
     actual_duration_days: integer
   }

8. delay.detected → [construction.delay.detected.v1]

   payload: {
     project_id:     UUID
     task_id:        UUID  (nullable — may be project-level delay)
     delay_days:     integer
     cause:          enum [PROCUREMENT, WEATHER, WORKFORCE, EQUIPMENT, SCOPE_CHANGE, OTHER]
     detected_by:    enum [AI_FORECAST, MANUAL_REPORT]
     severity:       enum [LOW, MEDIUM, HIGH, CRITICAL]
   }

9. workforce.checkin.created → [workforce.checkin.created.v1]

   payload: {
     checkin_id:     UUID
     worker_id:      UUID
     project_id:     UUID
     checkin_at:     datetime
     method:         enum [QR_CODE, GPS, BIOMETRIC, MANUAL]
     location:       { lat: float, lng: float }  (nullable)
   }

10. site.material.consumed → [site.material.consumed.v1]

    payload: {
      consumption_id: UUID
      project_id:     UUID
      task_id:        UUID
      material_id:    UUID
      quantity:       decimal(10,4)
      unit:           string
      consumed_by:    UUID
      consumed_at:    datetime
    }

11. procurement.delivery.received → [procurement.delivery.received.v1]

    payload: {
      delivery_id:    UUID
      po_id:          UUID
      project_id:     UUID
      vendor_id:      UUID
      received_by:    UUID
      received_at:    datetime
      items_received: Array<{ item_id: UUID, quantity_received: decimal(10,4) }>
      partial:        boolean
    }

12. finance.budget.exceeded → [finance.budget.exceeded.v1]

    payload: {
      project_id:       UUID
      cost_category:    string
      budget_amount:    { amount: decimal(19,4), currency_code: ISO4217 }
      actual_amount:    { amount: decimal(19,4), currency_code: ISO4217 }
      overage_percent:  decimal(5,2)
      detected_at:      datetime
    }

13. finance.invoice.approved → [procurement.vendor_invoice.approved.v1]

    payload: {
      invoice_id:     UUID
      po_id:          UUID
      project_id:     UUID
      vendor_id:      UUID
      amount:         { amount: decimal(19,4), currency_code: ISO4217 }
      approved_by:    UUID
      approved_at:    datetime
      payment_due:    date
    }

14. finance.cashflow_risk.detected → [finance.cashflow_risk.detected.v1]

    payload: {
      project_id:     UUID
      risk_level:     enum [LOW, MEDIUM, HIGH, CRITICAL]
      projected_shortfall: { amount: decimal(19,4), currency_code: ISO4217 }
      projected_at:   date  (when shortfall is expected)
      detected_by:    enum [AI_FORECAST, RULE_ENGINE]
    }

15. ai.risk_prediction.generated → [ai.risk_prediction.generated.v1]

    payload: {
      prediction_id:  UUID
      project_id:     UUID
      model_type:     enum [DELAY_FORECAST, COST_OVERRUN, SAFETY_VISION, RISK_CLASSIFIER]
      prediction:     object  (model-specific structure)
      confidence:     decimal(5,4)  (0.0000 – 1.0000)
      generated_at:   datetime
      model_version:  string
    }

16. boq.created → [construction.boq.created.v1]

    payload: {
      project_id:     UUID
      version_id:     UUID
      version_number: integer
    }

17. boq.updated → [construction.boq.updated.v1]

    payload: {
      version_id:                   UUID
      project_id:                   UUID
      changed_items_count:           integer
      new_total_estimated_amount:    string  (decimal — never float)
      new_total_estimated_currency:  string  (ISO 4217)
    }

- Use Confluent Schema Registry (open-source, self-hosted)
- All schemas registered in Avro format
- Compatibility mode: BACKWARD_TRANSITIVE (new schema must be readable by ALL previous versions, not just the immediately preceding one; source: spec §32.4)
- Schema subject naming: {topic_name}-value
- Version increment on every schema change
- Agents must generate both TypeScript interface AND Avro schema for each event

```

---

## FINANCIAL PRECISION SPEC

> 📎 **Derived from:** `docs/specifications/32-implementation-specifications.md §32.5`

```text
FINANCIAL PRECISION RULES (apply to ALL monetary fields across ALL services):

Storage:

- All monetary amounts: DECIMAL(19, 4) in PostgreSQL
- Rationale: 4 decimal places for exchange rate calculations
- Currency: stored as ISO 4217 code (VARCHAR(3)), e.g. "THB", "USD"
- Never store money as FLOAT or DOUBLE — prohibited

Rounding:

- Default rounding mode: HALF_UP (standard commercial rounding)
- Tax calculation rounding: HALF_UP per line item, then sum
- Unit price × quantity: round final result to 4 decimal places
- Display rounding: 2 decimal places for UI (4 stored internally)

Multi-currency:

- System stores all amounts in original transaction currency
- Reporting currency: configurable per tenant (stored in tenant settings)
- Exchange rate: stored as DECIMAL(19, 6) — 6 decimal places
- Exchange rate source: Open Exchange Rates API

  Daily cache in Redis TTL 24h, fallback to last cached rate if API unavailable

- Currency conversion calculation: original_amount × exchange_rate,

  rounded to 4 decimal places

Arithmetic library:

- TypeScript/Node.js: use 'decimal.js' library — never use native JS floats
- Python: use Python 'decimal' module with ROUND_HALF_UP context
- All monetary calculations must be performed with decimal library,

  not native float arithmetic

Prohibited:

- Never store money as integer (cents) without explicit spec
- Never use JavaScript Number for monetary calculations
- Never round intermediate values — round only final results

```

---

## DESIGN TOKEN SPECIFICATION

> 📎 **Derived from:** `docs/specifications/32-implementation-specifications.md §32.7`

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BRAND IDENTITY (FINAL — approved)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Brand name:   CONSTRUCTION OS
Product name: COS (short form — favicon, app icon, monogram)
Logomark:     Hexagonal geometry mark with 3 stacked infrastructure bars
              Bottom bar: split — AI cyan (left 1/3) + white (right 2/3)
              Represents: modular architecture + infrastructure layers + AI layer
Tagline:      "AI-Native Construction Platform"
              Style: 11px, uppercase, letter-spacing 3.5px, Steel gray #64748B

Personality:  Industrial · Intelligent · Enterprise · AI-native · Mission-critical
Positioning:  Palantir / Datadog / Linear aesthetic — NOT construction contractor

Avoid in all visual work:
  ✗ Building/crane/hard hat/blueprint/gear icons
  ✗ Orange/amber color (not in approved palette)
  ✗ Rounded playful shapes
  ✗ Gradients or glow effects

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BRAND COLOR TOKENS (global — web/PWA + mobile)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Source: construction_os_wordmark_brand_palette_v_1.md §5

  --cos-navy:         #0B1020   Infrastructure Core — wordmark, headers, dark UI
  --cos-blue:         #2563EB   System Blue — CTAs, active states, navigation (desktop)
  --cos-cyan:         #06B6D4   AI Cyan — AI modules, insights, event highlights
  --cos-gray:         #64748B   Steel Gray — secondary text, borders, inactive states
  --cos-white:        #F8FAFC   Concrete White — page backgrounds, surfaces, reports

Dark theme tokens (source: brand_palette §6):
  --cos-dark-bg:          #020617   Page background
  --cos-dark-surface:     #0F172A   Card / panel surface
  --cos-dark-elevated:    #111827   Elevated modal / dropdown surface
  --cos-dark-text:        #F8FAFC   Primary text
  --cos-dark-muted:       #94A3B8   Secondary text / inactive
  --cos-dark-blue:        #2563EB   Accent blue (same as light)
  --cos-dark-cyan:        #22D3EE   AI cyan (lighter for dark bg contrast)
  --cos-dark-success:     #10B981   Success state
  --cos-dark-warning:     #F59E0B   Warning state
  --cos-dark-danger:      #EF4444   Error / danger state

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MOBILE COLOR TOKENS (field app — React Native)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Source: MOBILE_UX_GUIDELINES.md — optimized for outdoor sunlight visibility

  --mobile-primary:          #0066FF   Bright blue (outdoor visibility)
  --mobile-success:          #00C853   Confirmation green
  --mobile-warning:          #FF9500   Caution orange
  --mobile-danger:           #FF3B30   Urgent / delete red
  --mobile-bg:               #FFFFFF   Background
  --mobile-surface:          #F5F5F5   Card surface
  --mobile-surface-elevated: #FFFFFF   Elevated card
  --mobile-text-primary:     #1C1C1E   Primary text
  --mobile-text-secondary:   #6C6C70   Secondary text
  --mobile-text-tertiary:    #AEAEB2   Hint text
  --mobile-offline:          #8E8E93   Offline indicator
  --mobile-syncing:          #FFD60A   Syncing indicator
  --mobile-synced:           #00C853   Synced indicator

DESIGN DECISION — Mobile primary vs brand blue:
  --mobile-primary #0066FF ≠ --cos-blue #2563EB (intentional, not a conflict)
  Rationale: field workers use the app in direct sunlight — #0066FF has higher
  outdoor visibility than #2563EB. Desktop/web uses --cos-blue for brand consistency.
  Rule: use --mobile-primary for tap targets and CTAs in React Native only.
        use --cos-blue for all web/PWA (Next.js) surfaces.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TYPOGRAPHY TOKENS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Brand font (source: brand_palette §7):
  Primary:     Inter Tight
  Package:     @fontsource/inter-tight (via npm — add to web/PWA)
               React Native: expo-font with Inter Tight from Google Fonts
  Fallback:    Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif
  Weight used: 400 (body), 500 (labels/UI), 600 (headings), 700 (wordmark OS)

Mobile typography scale (source: MOBILE_UX_GUIDELINES.md):
  --mobile-text-hero:    28px   Page titles
  --mobile-text-title:   22px   Card titles
  --mobile-text-body:    17px   Body text (iOS standard)
  --mobile-text-caption: 15px   Metadata
  --mobile-text-label:   13px   Input labels
  --mobile-line-normal:  1.5
  --mobile-line-tight:   1.3

Web/Desktop typography scale:
  Font: Inter Tight (already decided) — same as brand
  Base unit: 14px (compact for enterprise SaaS dashboards — Linear, Notion standard)

  --web-text-display:  32px / weight 700   Hero numbers, project budgets
  --web-text-h1:       24px / weight 600   Page titles
  --web-text-h2:       20px / weight 600   Section headers, card titles
  --web-text-h3:       16px / weight 500   Sub-section headers, table headers
  --web-text-body:     14px / weight 400   Default body, table content (dashboard standard)
  --web-text-small:    12px / weight 400   Metadata, timestamps, secondary labels
  --web-text-tiny:     11px / weight 400   Badges, footnotes, fine print

  --web-line-display:  1.2
  --web-line-heading:  1.3
  --web-line-body:     1.6
  --web-line-small:    1.5

  Tailwind config mapping:
    text-[32px] → display, text-2xl → h1, text-xl → h2
    text-base(16px) → h3, text-sm(14px) → body, text-xs(12px) → small

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPACING TOKENS (mobile — source: MOBILE_UX_GUIDELINES.md)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  --mobile-space-xs: 8px    Icon padding
  --mobile-space-sm: 12px   Card internal padding
  --mobile-space-md: 16px   Section padding
  --mobile-space-lg: 24px   Screen edge padding
  --mobile-space-xl: 32px   Major section separation

Web/Desktop spacing scale:
  Base unit: 4px (industry standard — compatible with Tailwind's default scale)

  --web-space-1:   4px    Icon-to-text tight gap
  --web-space-2:   8px    Inline element gaps, icon padding
  --web-space-3:  12px    Form field internal padding
  --web-space-4:  16px    Base: card internal padding, standard gaps
  --web-space-5:  20px    Between form fields
  --web-space-6:  24px    Card padding, section internal gap
  --web-space-8:  32px    Between cards/components
  --web-space-10: 40px    Section separation
  --web-space-12: 48px    Major page section gap
  --web-space-16: 64px    Page-level gap, hero sections

  Border radius:
  --web-radius-sm:  4px   Tags, badges
  --web-radius-md:  8px   Inputs, buttons
  --web-radius-lg: 12px   Cards, modals
  --web-radius-xl: 16px   Large panels

  Tailwind mapping: p-4=16px, p-6=24px, gap-2=8px, gap-4=16px, rounded-lg=8px

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOUCH TARGET STANDARDS (mobile — source: MOBILE_UX_GUIDELINES.md)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Primary button:    min 44px, recommended 52px
  Secondary button:  min 44px, recommended 48px
  Icon button:       min 44px (WCAG AAA)
  List item:         min 52px, recommended 60px
  Form input:        min 48px, recommended 52px
  Checkbox/radio:    tap area min 44px (visual 24–28px)
  Spacing between targets: 8px minimum

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERFORMANCE TARGETS (mobile — source: MOBILE_UX_GUIDELINES.md)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Initial load:       < 2s (max 3s)
  Action feedback:    < 100ms (max 200ms)
  Photo capture:      < 500ms (max 1s)
  Form submission:    instant (optimistic UI)
  Background sync:    automatic with manual fallback
  Daily report goal:  < 2 minutes end-to-end

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MOBILE COMPONENT LIBRARY (source: MOBILE_UX_GUIDELINES.md)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Core components (React Native — implement in apps/mobile/):
  <MobileNav />         Bottom navigation, 4–5 items max, icons + labels
  <QuickActionCard />   60px min height, icon + label + badge, single tap
  <PhotoCapture />      Camera + gallery grid, inline annotation, offline queue
  <VoiceNoteButton />   Hold-to-record, waveform animation, auto-transcription
  <OfflineBanner />     Fixed top, queue count, auto-dismiss on reconnect
  <TaskCard />          Swipeable (swipe-right = done), status badge, photo count
  <StatusChip />        Visual status: Todo / InProgress / Done / Syncing / Synced
  <OptimisticList />    Instant UI update, rollback on failure, retry option

Form components:
  <MobileInput />       48px height minimum
  <NumberPicker />      Scroll wheel (no text keyboard)
  <IconPicker />        Visual category selection (Safety / Equipment / Materials)
  <LocationPicker />    Map + auto-detect GPS

DO NOT implement on mobile:
  ✗ Tables → use cards instead
  ✗ Navigation deeper than 3 levels
  ✗ Modal on modal → use bottom sheets
  ✗ Dropdowns with 50+ items → add search
  ✗ Complex charts → simplify or desktop-only
  ✗ Hover states → use press states

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REACT NATIVE DARK MODE TOKENS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  React Native uses JavaScript StyleSheet objects (no CSS variables)
  Note: --mobile-primary stays #0066FF in dark mode (self-lit screen = still outdoor use)

  DarkTheme = {
    background:   '#020617',   Page background
    surface:      '#0F172A',   Card, bottom sheet surface
    elevated:     '#111827',   Modal, dropdown surface
    border:       '#1E293B',   Dividers, card borders
    text: {
      primary:    '#F8FAFC',   Main text
      secondary:  '#94A3B8',   Labels, metadata
      tertiary:   '#64748B',   Placeholders, hints
    },
    primary:      '#2563EB',   Brand blue (buttons, active states)
    fieldPrimary: '#0066FF',   Field worker interactive elements (outdoor visibility)
    accent:       '#22D3EE',   AI features, highlights
    success:      '#10B981',
    warning:      '#F59E0B',
    danger:       '#EF4444',
    offline:      '#475569',   Offline indicator text
    syncing:      '#D97706',   Syncing badge
    synced:       '#059669',   Synced badge
  }

  Usage in React Native:
    const { colors } = useTheme()  — expo-navigation theme provider
    style={{ backgroundColor: colors.surface }}

```

---

## WORKFLOW ENGINE SPEC

> 📎 **Derived from:** `docs/specifications/32-implementation-specifications.md §32.6`
> Authoritative state machines (states, transitions, roles) are in specs.

```text
WORKFLOW ENGINE DECISION:

- Engine: Temporal (self-hosted, open-source)
- Temporal Server version: latest stable
- Temporal SDK: TypeScript SDK (@temporalio/client, @temporalio/worker)
- Reason: supports long-running workflows, retries, compensation,

           and is well-suited for procurement multi-step flows

PROCUREMENT STATE MACHINES (authoritative — agents must implement exactly):

RFQ Workflow:
  DRAFT → PUBLISHED → CLOSED → EVALUATED → [AWARDED | CANCELLED]
  Transitions:
    DRAFT → PUBLISHED:    triggered by procurement officer (ROLE: PROCUREMENT_OFFICER)
    PUBLISHED → CLOSED:   triggered by deadline expiry (Temporal timer) or manual
    CLOSED → EVALUATED:   triggered by system after quotation comparison complete
    EVALUATED → AWARDED:  triggered by ROLE: PROCUREMENT_OFFICER or PROC_MANAGER (manual approval; spec §32.6)
    EVALUATED → CANCELLED:triggered by ROLE: PROCUREMENT_OFFICER or PROC_MANAGER (spec §32.6)

Purchase Order Workflow:
  DRAFT → PENDING_APPROVAL → APPROVED → SENT → ACKNOWLEDGED →
  PARTIALLY_DELIVERED → FULLY_DELIVERED → INVOICED → PAID | DISPUTED
  Transitions:
    DRAFT → PENDING_APPROVAL: triggered by ROLE: PROCUREMENT_OFFICER
    PENDING_APPROVAL → APPROVED: threshold-based approval chain (source: spec §15.5):
      ≤ 50,000 THB:             PM (PROJECT_MANAGER) approves alone
      50,001–500,000 THB:       PM + FINANCE required
      > 500,000 THB:            PM + FINANCE + EXECUTIVE required
      All tiers: 48-hour timeout per approver → escalate to manager; final escalation → TENANT_ADMIN
      Note: thresholds are configurable per tenant; defaults above are the platform defaults
    PENDING_APPROVAL → DRAFT:   triggered by any approval-chain role (reject/revise)
    APPROVED → SENT:            triggered by system (auto) after approval
    SENT → ACKNOWLEDGED:        triggered by vendor confirmation event
    ACKNOWLEDGED → PARTIALLY_DELIVERED: triggered by delivery recording
    PARTIALLY_DELIVERED → FULLY_DELIVERED: triggered by delivery completion
    FULLY_DELIVERED → INVOICED: triggered by invoice receipt
    INVOICED → PAID:            triggered by ROLE: FINANCE
    INVOICED → DISPUTED:        triggered by ROLE: FINANCE

  Approval Chain Additional Rules (spec §15.5):
    - Vendor Invoice (AP): FINANCE approves up to configured limit; above limit requires EXECUTIVE
    - Client Billing (AR): PM approves up to configured limit; above limit requires EXECUTIVE
    - Safety permit: SITE_WORKER/SITE_ENGINEER initiates → SAFETY_OFFICER approves → PM (final)
    - All approval decisions: logged with approver_id, decision, timestamp, comment (audit_logs table)

RULES:

- Do NOT invent additional states beyond those listed above
- Do NOT invent additional approval roles — use RBAC from Phase 2
- Temporal workflow functions must be deterministic
- Compensation logic (rollback) must be implemented for CANCELLED transitions
- All state transitions must emit Kafka events

```

---

## PHASE 1 — FOUNDATION REPOSITORY COMMAND

```text
Create a production-grade monorepo for Construction OS.

Naming Conventions:

- Repository root: construction-os
- Package scope: @cos (all shared packages use this scope)
- Service directory names: kebab-case (e.g. identity-service, project-service)
- Package names in package.json: @cos/package-name (kebab-case)
- TypeScript file names: kebab-case (e.g. project.service.ts)
- Environment variables: UPPER_SNAKE_CASE

Directory Structure (authoritative — monolith architecture):
apps/
  web/                    — Next.js + next-pwa unified web app (@cos/web) — online + offline
  mobile/                 — React Native + Expo application (@cos/mobile)

backend/                  — NestJS Modular Monolith (ONE deployable)
  src/
    modules/
      identity/           — Auth + Identity module
      tenant/             — Tenant management module
      project/            — Project module
      boq/                — BOQ module
      procurement/        — Procurement module
      site-ops/           — Site Operations module
      finance/            — Finance module
      notification/       — Notification module
      equipment/          — Equipment module
      workforce/          — Workforce module
    shared/               — Cross-module utilities (guards, pipes, interceptors)
    main.ts               — Application bootstrap
  test/                   — Integration tests
  Dockerfile
  package.json

services/                 — Separately deployed services (non-monolith)
  file-service/           — Fastify File Service (@cos/file-service)
  ai-gateway/             — FastAPI AI Gateway (@cos/ai-gateway)
  ai-embedding-worker/    — FastAPI Embedding Worker (@cos/ai-embedding-worker)
  ai-ocr-pipeline/        — FastAPI OCR Pipeline (@cos/ai-ocr-pipeline)
  analytics-worker/       — Go Analytics Aggregation (@cos/analytics-worker; Phase 24 — carbon analytics module; stub only until Phase 24; see docs/specifications/33-digital-twin-iot §33.3)
  kg-ingestion-worker/    — Go Knowledge Graph Ingestion (@cos/kg-worker)

packages/                 — Shared packages (ONLY code used by 2+ apps/services)
  @cos/shared             — Typed Kafka event interfaces (Phase 1); Avro schemas added in Phase 8 alongside KafkaProducer/Consumer/OutboxPublisher
  @cos/database/          — Prisma pagination utilities, ID generation, retry helpers
  @cos/rbac/              — RBAC + ABAC role definitions, guard decorators and metadata keys (NOT concrete CanActivate guards — those live in backend/src/shared/guards/; see spec §06 §6.9)
  @cos/validation/        — Shared DTO validators (class-validator decorators)
  @cos/logger/            — Structured logging abstraction (Pino-based)
  @cos/tracing/           — OpenTelemetry setup and trace utilities
  @cos/financial/         — Decimal.js monetary calculation utilities
  @cos/types/             — Shared TypeScript types and enums
  @cos/config/            — Environment config loader and validation

Shared Package Boundary Rules:
  ✓ Belongs in packages/: event contracts, RBAC definitions, financial utils,
    logging, tracing, shared types, environment config validation
  ✗ Does NOT belong in packages/: business logic, module-specific DTOs,
    module-specific repositories
  ✗ Modules must NOT import from each other's src/ directly —
    cross-module communication via Kafka events or shared service layer only

infrastructure/
  kubernetes/             — Helm charts (ONE chart for backend, one per separate service)
  terraform/              — Terraform modules
  kafka/                  — Kafka topic definitions and configs
  monitoring/             — Prometheus + Grafana configs

backend/prisma/           — Database schema and migrations
  schema.prisma           — Prisma schema (single source of truth for all DB models)
  migrations/             — Prisma migration files (per tenant schema)

ai/
  prompts/                — Prompt templates (versioned)
  chains/                 — LangChain chain definitions
  (AI output evaluation — it is operationalized via MLflow / W&B / Evidently AI on a monthly cadence; see docs/specifications/30-testing-strategy.md §30.11)

docs/
  architecture/           — Architecture decision records (ADRs)
  api/                    — Generated OpenAPI specs
  runbooks/               — Operational runbooks
  specifications/         — Architecture diagrams and system design reference

scripts/
  setup/                  — Local environment setup scripts
  deploy/                 — Deployment helper scripts

Tooling:

- Package manager: pnpm 9.x with workspace protocol
- Monorepo orchestration: Turborepo 2.x
- TypeScript: 5.4+ (strict mode, no implicit any)
- Linting: ESLint 9.x with @cos/eslint-config
- Formatting: Prettier 3.x
- Git hooks: Husky 9.x + lint-staged
- CI/CD: GitHub Actions

Generate:

- complete directory structure with placeholder README per service AND per package:
    services/: file-service, ai-gateway, ai-embedding-worker, ai-ocr-pipeline,
               analytics-worker, kg-ingestion-worker
    apps/: web, mobile
    backend/ (root README)
    backend/src/modules/: identity, tenant, project, boq, procurement, site-ops,
                          finance, notification, equipment, workforce
    packages/@cos/: shared, database, rbac, validation, logger, tracing, financial,
                    types, config
    Each README must contain: purpose, public API, dependencies, configuration, usage example (QM-11)
- root pnpm-workspace.yaml with all packages listed
- turbo.json with build, test, lint, dev pipelines
- root tsconfig.base.json (strict, paths for @cos/* packages)
- per-service tsconfig.json extending base
- Docker Compose (local dev: PostgreSQL, TimescaleDB, Redis, Kafka, OpenSearch,

  Neo4j, ClickHouse, MinIO, Confluent Schema Registry, Vault dev mode, PgBouncer)

  PgBouncer container is REQUIRED in local dev Docker Compose (QM-18; spec §7.9);
  dev mode Vault and PgBouncer must start together with the application;
  application must connect to PgBouncer address — never directly to PostgreSQL port 5432

- Istio local dev: skip Istio for Docker Compose (use plain networking locally)

  Istio enabled from dev Kubernetes environment onwards

- HashiCorp Vault: dev mode container for local secret injection
- .env.example with all required variables documented
- GitHub Actions: CI pipeline (lint → build → test → docker build)
- Makefile with: setup, dev, test, build, migrate, seed targets
- root README with architecture overview and getting started
- Git hooks: initialize Husky (husky init); create .husky/pre-commit running lint-staged;
  lint-staged config: eslint --fix + prettier --write on staged .ts/.tsx/.js/.jsx files;
  prettier --write on staged .json/.yaml/.yml files
- Mobile tsconfig exception: apps/mobile extends expo/tsconfig.base (NOT root tsconfig.base.json —
  root base uses "module": "CommonJS" which is incompatible with React Native Metro bundler);
  add only mobile-compatible @cos/* paths: types, types/*, financial, financial/*, validation,
  validation/*, rbac, rbac/*, shared, shared/* — do NOT add logger, tracing, config, database
  (Node.js-only packages)
- jest.config.js per TypeScript package/service with coverage thresholds:
    coverage thresholds: { lines: 100, branches: 100 } per QM-1 (spec §30.3)
    collectCoverageFrom: exclude *.module.ts, *.dto.ts, *.payload.ts, index.ts, main.ts,
      event interface files (pure types — no executable code)
    moduleNameMapper: map all @cos/* workspace paths to source (not dist)
    packages requiring jest.config (Rule 35 — all packages with executable logic):
      backend/
      packages/@cos/shared/         — kafka SDK, event types
      packages/@cos/database/        — retry, pagination, id
      packages/@cos/financial/       — calculateLineTotal, convertCurrency (QM-1: mutation testing required)
      packages/@cos/rbac/            — ROLE_PERMISSIONS, decorators
      packages/@cos/validation/      — IsCurrencyCode, IsDecimalString
      packages/@cos/logger/          — createLogger
      packages/@cos/tracing/         — initTracing, shutdownTracing, getTraceId
      packages/@cos/config/          — loadConfig, getConfig
    packages EXEMPT (no executable logic — types/interfaces only):
      packages/@cos/types/
    Note: Phase 18 adds testcontainers setup and @cos/test-utils — jest.config is a Phase 1 deliverable
- pnpm lock file: run `pnpm install` after initial setup and commit pnpm-lock.yaml (Rule 28);
    pnpm-lock.yaml must be committed before CI `--frozen-lockfile` can pass;
    order: (1) create all package.json files, (2) run `pnpm install`, (3) commit pnpm-lock.yaml,
    (4) change CI from `pnpm install` to `pnpm install --frozen-lockfile`

Constraints:

- production-grade only
- scalable architecture only
- no demo code, no placeholder business logic
- all services must start with Docker Compose from day one
- Before marking Phase 1 complete: read every Generate item above line by line, run ls/grep
  to verify each exists on disk, show output — Rule 36

```

---

## PHASE 2 — AUTHENTICATION + TENANT SYSTEM COMMAND

```text
Build Identity Service and Tenant Service.

Authentication Decision (TWO PATHS — from file 01):
  Path A — Field workers (PRIMARY for SITE_WORKER, SITE_ENGINEER):
    Method:   Phone number + SMS OTP
    Rationale: "No password to forget" — field workers must never be required
               to remember a password (file 01 §A)
    Session:  JWT access token (15 min) + refresh token (7 days device-stored), issued by Keycloak
              via Direct Grant (grant_type=password) after OTP verification succeeds
    Offline:  Cached token valid 7 days without internet, re-validates on reconnect
    Biometric: OPTIONAL — device-side Face ID/fingerprint unlock after first login

  Path B — Office / Management (for PM, Finance, Admin, Executive):
    Method:   Email + password via Keycloak
    Protocol: OpenID Connect (OIDC) over OAuth2
    Token:    JWT (RS256 signed by Keycloak)
    Session:  Access token TTL 15 min, refresh token TTL 7 days
    MFA:      REQUIRED for TENANT_ADMIN and FINANCE (TOTP)

  SMS OTP Service:
    Implementation: Custom lightweight NestJS module within monolith (identity module)
    OTP send/verify: custom NestJS logic — NOT a Keycloak extension
    Token issuance: Keycloak Direct Grant (grant_type=password) after successful OTP verification
      — ephemeral credential set via Keycloak Admin API, used once, then discarded
    SMS Gateway provider: AWS SNS (ap-southeast-1)
      Implementation: AWS SDK v3 @aws-sdk/client-sns — SNSClient.publish()
      Interface: { sendOTP(phoneNumber: string, otp: string): Promise<void> }
      Fallback: Thai SMS fallback when +66 delivery rate < 95%
      Pre-launch: submit AWS Support case to exit SMS sandbox (1-2 business days)
    OTP: 6-digit numeric, TTL 5 minutes, max 3 attempts per session
    Rate limit: 10 OTP requests per phone per day

  Future SSO hook: Keycloak SAML 2.0 IdP configuration (admin console, no code change); configure per tenant realm when enterprise customer with existing IdP onboards

RBAC Role Definitions (authoritative — all modules must use these):
  Spec §6.2 roles (9 — seeded at tenant provisioning per spec §6.6):
  SYSTEM_ADMIN        — Platform admin (cross-tenant; NOT provisioned to any tenant per spec §6.7)
  TENANT_ADMIN        — Tenant administrator (full access within tenant)
  EXECUTIVE           — Company owner or C-level; sees all projects and financial data
  PROJECT_MANAGER     — Full access to assigned projects
  PROCUREMENT_OFFICER — Procurement data entry, RFQ, PO, vendors, and deliveries
  FINANCE             — Cost, billing, payments, and cash flow
  SAFETY_OFFICER      — Safety checklists, incidents, and compliance
  SITE_ENGINEER       — Site operations and daily field work
  CRM_SALES_MANAGER   — Leads, opportunities, and customer accounts

  Implementation sub-roles (not in spec §6.2; defined for implementation granularity):
  PROC_MANAGER  — Procurement approval authority tier (above PROCUREMENT_OFFICER)
  SITE_WORKER   — Site operations read + report submission (field worker sub-role)
  VIEWER        — Read-only across all modules (per project assignment)

  External principals (NOT a CosRole — external network users, spec §6.8b / ADR-030):
  VENDOR_PORTAL — vendor-network users on the Vendor Portal; authenticated via magic-link (Tier 1)
                  or a vendor session token (Tier 2), scoped by platform.vendor_trading_relationships
                  (NOT tenant RLS). Never provisioned to a tenant.

Permission granularity: resource:action (e.g. project:read, boq:write)
RBAC enforcement: NestJS Guards using JWT claims
Tenant isolation: shared-db + tenant_id + RLS (see below) — middleware sets app.current_tenant_id

Authorization: RBAC + ABAC (from source §13.2):
  RBAC (Role-Based Access Control):
    - Role assigned per user per tenant (roles defined above)
    - Enforced via NestJS Guards + JWT claims

  ABAC (Attribute-Based Access Control):
    - Required attributes checked on every resource access:
        project_membership: user must be member of project_id in request context
        tenant_match:       user's tenant must match resource's tenant (always)
        resource_ownership: for PATCH/DELETE, user must be creator OR have manager role
    - Implementation: NestJS PolicyGuard (custom, separate from RolesGuard)
    - Advanced configurable policies: custom NestJS PolicyGuard (swap in via DI when triggered)

Tenant Isolation Model (FINAL — spec §7, §7.7, §21-mvp-scope):
  Model: Shared DB + tenant_id + PostgreSQL RLS (SMB tier, MVP baseline)
  Rationale: Industry-standard SaaS pattern. Simpler operations (one migration run).
             Enables cross-tenant analytics for AI features. RLS enforces isolation at DB level.

  Implementation:
    - One PostgreSQL database (shared across all tenants)
    - One named PostgreSQL schema per domain module (global, not per-tenant):
        platform, projects, boq, procurement, site_ops, finance, files,
        notifications, equipment, workforce, ai, equipment_telemetry, workforce_telemetry,
        digital_twin (TimescaleDB, Phase 24 — see spec §7.7, §11.0, §33.4)
    - tenant_id UUID NOT NULL on every domain table (platform tables exempt)
    - All SQL must use schema-qualified names: procurement.vendors, finance.project_budgets
    - PostgreSQL RLS enabled on every domain table (MANDATORY, spec §7.7 + §9.7.3):
        SET LOCAL app.current_tenant_id = '{tenant_id}' at request start
        ENABLE and FORCE must be applied TOGETHER (FORCE = table owner cannot bypass RLS):
          ALTER TABLE {schema}.{table} ENABLE ROW LEVEL SECURITY;
          ALTER TABLE {schema}.{table} FORCE ROW LEVEL SECURITY;
          CREATE POLICY tenant_isolation ON {schema}.{table}
            AS RESTRICTIVE
            USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);
        The application role (app_user) must NEVER be granted BYPASSRLS (spec §9.7.3).
        RLS migration rollback must DISABLE ROW LEVEL SECURITY and DROP POLICY for every policy created.
    - Application layer also filters WHERE tenant_id = $1 as secondary defense-in-depth
    - Migrations run once (not per-tenant) — CREATE SCHEMA IF NOT EXISTS {schema}
    - identity module tables live in schema "platform" (cross-tenant, no RLS needed)

  ORM configuration (Prisma):
    - Prisma multiSchema: schemas listed in datasource.schemas
    - Raw SQL via $queryRaw / $executeRaw using schema-qualified table names
    - No TenantPrismaService search_path routing — tenant isolation via RLS + tenant_id

  Future model — Dedicated DB (ENTERPRISE plan):
    Trigger: tenant.dedicated_db_url IS NOT NULL

Secret Management: conditional per deployment type (spec §5.2)
  Cloud (AWS EKS):   AWS Secrets Manager — External Secrets Operator syncs SM secrets → K8s Secret → pod env
  On-premise/hybrid: HashiCorp Vault 1.16+ — Vault Agent sidecar injector
  Local dev:         HashiCorp Vault: dev mode container (Docker Compose)
  Secret injection: environment variables at pod startup (both paths)
  Dynamic secrets: cloud → AWS SM rotation Lambda (per resource type); on-prem → Vault DB engine (PostgreSQL TTL 24h)

Entities (PostgreSQL — all in schema: identity):
  tenants:
    tenant_id        UUID PK DEFAULT gen_random_uuid()
    tenant_code      VARCHAR(50) UNIQUE NOT NULL
    tenant_name      VARCHAR(255) NOT NULL
    keycloak_realm   VARCHAR(100) UNIQUE NOT NULL
    plan_type        ENUM('STARTER','PROFESSIONAL','ENTERPRISE') NOT NULL
    is_active        BOOLEAN DEFAULT true
    dedicated_db_url VARCHAR(500) NULL  -- NULL = shared DB; non-NULL = enterprise dedicated DB URL
    data_region      VARCHAR(20) NOT NULL DEFAULT 'ap-southeast-1'  -- data-residency region; Thai→ap-southeast-7, EU→eu-west-1, default→ap-southeast-1 (spec §5.6); immutable after first write
    created_at       TIMESTAMPTZ DEFAULT now()
    updated_at       TIMESTAMPTZ DEFAULT now()

  users:
    user_id         UUID PK DEFAULT gen_random_uuid()
    tenant_id       UUID FK → tenants NOT NULL
    keycloak_user_id VARCHAR(255) UNIQUE NOT NULL
    email           VARCHAR(255) NOT NULL
    display_name    VARCHAR(255) NOT NULL
    is_active       BOOLEAN DEFAULT true
    mfa_enabled     BOOLEAN DEFAULT false
    mfa_totp_secret VARCHAR(255) NULL
    created_at      TIMESTAMPTZ DEFAULT now()
    updated_at      TIMESTAMPTZ DEFAULT now()
    INDEX: (tenant_id, email)

  tenant_memberships:
    membership_id   UUID PK
    tenant_id       UUID FK NOT NULL
    user_id         UUID FK NOT NULL
    role            ENUM(role list above) NOT NULL
    assigned_at     TIMESTAMPTZ DEFAULT now()
    UNIQUE: (tenant_id, user_id)

  audit_logs:
    log_id          UUID PK
    tenant_id       UUID NOT NULL (denormalized for query performance)
    actor_id        UUID NOT NULL
    action          VARCHAR(255) NOT NULL
    resource_type   VARCHAR(100) NOT NULL
    resource_id     UUID
    ip_address      INET
    user_agent      TEXT
    occurred_at     TIMESTAMPTZ DEFAULT now()
    metadata        JSONB
    INDEX: (tenant_id, occurred_at DESC)

Generate:

- Keycloak Docker Compose service with realm import template
    IMPORTANT: realm import template MUST include protocol mappers for tenant_id, user_id, role
    (see spec §05-security-compliance §5.4.2 and §07-multi-tenant-architecture §7.6 step 3)
- NestJS Identity Service: Keycloak adapter, JWT validation middleware
- NestJS Tenant Service: tenant CRUD, realm assignment on tenant create
    Realm model (spec §05 §5, §07 §7.6 step 3):
      STARTER/PROFESSIONAL → shared realm 'construction-os'
      ENTERPRISE → dedicated realm 'cos-{tenantCode}' (Phase 25 EnterpriseProvisioningWorkflow)
- @cos/rbac package: role enum, permission map, NestJS guard decorators and metadata keys
    (@cos/rbac contains: CosRole enum, ROLE_PERMISSIONS map, @Roles/@RequirePermissions decorators,
     ROLES_KEY/PERMISSIONS_KEY metadata constants — NOT concrete CanActivate implementations;
     concrete guards RolesGuard and PolicyGuard live in backend/src/shared/guards/ because they
     depend on JwtPayload and ExecutionContext which are application-layer concerns;
     source: spec §06-rbac-permission-matrix §6.9)
- PostgreSQL migration files for all entities above
- DTOs with class-validator decorators for all API inputs
- OpenAPI 3.1 specs — two separate files (QM-2: one file per service):
    docs/api/auth.openapi.yaml   — OTP request/verify, refresh, logout endpoints
    docs/api/tenant.openapi.yaml — tenant lifecycle endpoints (SYSTEM_ADMIN) AND
                                   user management endpoints (TENANT_ADMIN):
                                     GET  /api/v1/users                         — list users (paginated)
                                     POST /api/v1/users                         — create user (Path A: phone_number; Path B: email)
                                     PATCH /api/v1/users/{userId}/role          — change role
                                     PATCH /api/v1/users/{userId}/deactivate    — deactivate user
                                     GET  /api/v1/admin/tenants                 — list all tenants (SYSTEM_ADMIN, §20.4.1)
                                     GET  /api/v1/tenant/settings               — get tenant settings (TENANT_ADMIN, ADR-028)
                                     PATCH /api/v1/tenant/settings              — update tenant settings (variance/retention/LINE/notif)
- Refresh token rotation flow
- MFA enrollment and verification endpoints (TOTP) — required for TENANT_ADMIN and FINANCE roles:
    POST /api/v1/auth/mfa/enroll    — initiate TOTP setup (returns QR code URI)
    POST /api/v1/auth/mfa/verify    — confirm TOTP code to complete enrollment
    POST /api/v1/auth/mfa/authenticate — verify TOTP during login (Path B office users only)
- Tenant isolation middleware
- Unit tests: guards, middleware, token validation
- Integration tests: full OTP auth flow with Testcontainers (PostgreSQL + Redis containers, real DB)
    Implemented in Phase 2 — NOT deferred to Phase 18
    Covers: requestOtp → verifyOtp → issueTokens (Keycloak Direct Grant) → refresh → logout
    packages: @testcontainers/postgresql, @testcontainers/redis (devDependencies)
- User management API (TENANT_ADMIN only — see spec §14.3 User Management APIs and §6.4):
    Module location: backend/src/modules/tenant/ (tenant module owns user lifecycle)
    Endpoints:
      GET    /api/v1/users                    — list users in tenant (paginated)
      POST   /api/v1/users                    — create user (Path A: phone; Path B: email+Keycloak)
      PATCH  /api/v1/users/:userId/role       — change user role
      PATCH  /api/v1/users/:userId/deactivate — deactivate user
    Service:  UserService (new — separate from TenantService)
    Guards:   JwtAuthGuard + RolesGuard (TENANT_ADMIN only)
    DTOs:     CreateUserDto, ChangeRoleDto (class-validator)
    Path A user creation (TWO STEPS — via KeycloakAdminService):
      Step 1 — Keycloak: KeycloakAdminService.provisionPhoneUser(phone, displayName, realm)
               POST /admin/realms/{realm}/users → get keycloakUserId
               PUT /admin/realms/{realm}/users/{id}/reset-password (ephemeral one-time credential)
               Set user attributes: tenant_id, user_id, role (see spec §5.4.2)
      Step 2 — COS: create platform.users record with keycloak_user_id = keycloakUserId
               create platform.tenant_memberships record; emit user.created
    Path B user creation (TWO STEPS — via KeycloakAdminService):
      Step 1 — Keycloak: KeycloakAdminService.createEmailUser(email, displayName, realm)
               POST /admin/realms/{realm}/users → get keycloakUserId
               Set user attributes: tenant_id, user_id, role (see spec §5.4.2)
      Step 2 — COS: create platform.users record with keycloak_user_id = keycloakUserId
               create platform.tenant_memberships record; emit user.created
    Keycloak Admin API integration implemented in Phase 2 — KD-AUTH-001 READY
    (see spec §32-implementation-specifications §32.8 for full implementation spec)

- Kafka events:

    tenant.created                     { tenant_id, tenant_code, tenant_name, plan_type, dedicated_db_url? }
    tenant.deactivated                 { tenant_id }
    platform.enterprise.contract_signed  { tenant_id, contract_reference? }  ← Phase 25; Admin Panel OR CRM webhook
    platform.enterprise.db_provisioned   { tenant_id, rds_endpoint }         ← Phase 25; EnterpriseProvisioningWorkflow completion
    user.created       { tenant_id, user_id, email, role }  ← emitted from POST /api/v1/users
    user.role_changed  { tenant_id, user_id, old_role, new_role }  ← emitted from PATCH /api/v1/users/:userId/role

npm packages required in backend/package.json — add BEFORE implementing (Rule 26):
  dependencies:    @nestjs/passport, @nestjs/jwt, passport, passport-jwt, @aws-sdk/client-sns, @keycloak/keycloak-admin-client
  devDependencies: @types/passport-jwt, @types/passport, @types/express, @testcontainers/postgresql, @testcontainers/redis

Constraints:

- No insecure auth patterns (no MD5 passwords, no symmetric JWT signing)
- No business logic in auth layer
- Enterprise-ready: stateless JWT validation, no server-side session store
- Keycloak must be the single source of truth for authentication
- Before marking Phase 2 complete: read every Generate item above line by line, run ls/grep
  to verify each exists on disk, show output — Rule 36

Decisions in Phase 2 (documented in spec):

  AdvancedABACPolicy:
    DECIDED: custom NestJS PolicyGuard; swap in via NestJS DI (no change to guard interface);
    implement when enterprise customer requires configurable per-tenant ABAC rules beyond
    default (project_membership, tenant_match, resource_ownership)

  EnterpriseSSOProvider:
    DECIDED: Keycloak Identity Provider configuration (admin console, no code change);
    configure SAML 2.0 IdP per tenant realm when enterprise customer with existing IdP
    (Active Directory, Okta, etc.) onboards; Keycloak supports SAML 2.0 out of the box

  DedicatedDBIsolation:
    DECIDED: 6-step process — (1) provision new RDS instance, (2) run migrations,
    (3) copy data from shared PostgreSQL schema, (4) update TenantPrismaService routing,
    (5) validate, (6) cut over; trigger: tenant.plan_type = ENTERPRISE AND dedicated DB requested

  BiometricCheckIn (spec §13.5):
    DECIDED: generic SDK interface — vendor SDK injected via DI at deployment time
    Interface: { verifyCheckIn(workerId, projectId, method: FINGERPRINT/FACE_ID/IRIS): Promise<boolean> }
    Each site configures their vendor adapter; credentials stored in AWS SM / Vault per-site
              this covers dedicated hardware scanners at site entry points
```

---

## PHASE 3 — PROJECT SERVICE COMMAND

```text
Build Project Service.

Project Status State Machine (authoritative):
  States:
    DRAFT → ACTIVE → ON_HOLD → ACTIVE (resume)
    ACTIVE → COMPLETED
    ACTIVE → CANCELLED
    DRAFT → CANCELLED
    ON_HOLD → CANCELLED

  Transition rules:
    DRAFT → ACTIVE:     requires ROLE: PROJECT_MANAGER or TENANT_ADMIN
    ACTIVE → ON_HOLD:   requires ROLE: PROJECT_MANAGER or TENANT_ADMIN
                        must record: on_hold_reason (VARCHAR 500), on_hold_at
    ON_HOLD → ACTIVE:   requires ROLE: PROJECT_MANAGER or TENANT_ADMIN
    ACTIVE → COMPLETED: requires ROLE: TENANT_ADMIN only
                        requires: end_date must be <= today
    ANY → CANCELLED:    requires ROLE: TENANT_ADMIN only
                        must record: cancellation_reason (VARCHAR 500), cancelled_at
                        CANCELLED is terminal — no further transitions allowed

  Do NOT invent additional states or transitions.

Entities (PostgreSQL — schema: projects):
  projects:
    project_id      UUID PK DEFAULT gen_random_uuid()
    tenant_id       UUID NOT NULL
    project_code    VARCHAR(50) NOT NULL
    project_name    VARCHAR(255) NOT NULL
    project_type    ENUM('RESIDENTIAL','COMMERCIAL','INFRASTRUCTURE','INDUSTRIAL') NOT NULL
    status          ENUM('DRAFT','ACTIVE','ON_HOLD','COMPLETED','CANCELLED') DEFAULT 'DRAFT'
    budget_amount   DECIMAL(19,4)
    budget_currency VARCHAR(3)    — ISO 4217
    start_date      DATE
    end_date        DATE
    on_hold_reason  VARCHAR(500)
    on_hold_at      TIMESTAMPTZ
    cancellation_reason VARCHAR(500)
    cancelled_at    TIMESTAMPTZ
    created_by      UUID NOT NULL
    created_at      TIMESTAMPTZ DEFAULT now()
    updated_at      TIMESTAMPTZ DEFAULT now()
    UNIQUE: (tenant_id, project_code)
    INDEX: (tenant_id, status)

  project_members:
    membership_id   UUID PK
    project_id      UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    user_id         UUID FK NOT NULL
    role            ENUM(roles from Phase 2) NOT NULL
    assigned_at     TIMESTAMPTZ DEFAULT now()
    assigned_by     UUID NOT NULL
    UNIQUE: (project_id, user_id)

  project_documents:
    document_id     UUID PK
    project_id      UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    file_id         UUID   — FK to File Service (loose coupling — no FK constraint)
    document_type   VARCHAR(100)
    uploaded_by     UUID NOT NULL
    uploaded_at     TIMESTAMPTZ DEFAULT now()

APIs:
  POST   /api/v1/projects                    — create (DRAFT status)
  GET    /api/v1/projects                    — list (paginated, filterable by status/type)
  GET    /api/v1/projects/:id                — get by ID
  PATCH  /api/v1/projects/:id               — update metadata (not status)
  POST   /api/v1/projects/:id/transitions   — trigger status transition (body: {to, reason?})
  POST   /api/v1/projects/:id/members       — add member
  DELETE /api/v1/projects/:id/members/:userId — remove member
  GET    /api/v1/projects/:id/members       — list members
  GET    /api/v1/projects/:id/documents     — list documents

Generate:

- PostgreSQL migration files for all entities
- NestJS module, service, repository, controller
- DTOs for create, update, transition (with class-validator)
- State machine guard (validates allowed transitions before processing)
- OpenAPI 3.1 spec with all endpoints documented
- Pagination utility (cursor-based preferred over offset)
- Full-text search via OpenSearch (project_name, project_code)
- Unit tests: state machine, business rules
- Integration tests: full CRUD + transition flows
- Kafka event producers:

    project.created   (envelope + project.created payload — see Event Contract spec)
    project.updated   (envelope + changed fields as patch payload)
    project.status_changed (envelope + { project_id, from_status, to_status, reason })
    project.archived  (envelope + { project_id })

Decisions in Phase 3 (generate stub — implement when triggered):

  CRMIntegration (spec §13.4):
    DECIDED: Strategy pattern — generic webhook receiver + per-CRM field mapper
    3 sub-stubs (each STUB until tenant with that CRM onboards):
      SalesforceAdapter: Salesforce REST API
      HubSpotAdapter:    HubSpot Webhooks
      PipedriveAdapter:  Pipedrive Webhooks
    Interface: { createProjectFromLead(crmLeadId, tenantId): Promise<Project> }
    Data flow: CRM won deal → webhook → COS project creation (one direction only)

  BIMIntegration — project structure import (spec §13.4):
    DECIDED: IFC format (ISO 16739-1:2018 IFC4 preferred); IFC.js parser (platform-agnostic)
    Interface: { importProjectStructure(bimFileUrl, projectId, tenantId): Promise<BIMStructureResult> }
    IFC mapping: IfcBuildingStorey → project phases, IfcSpace → milestones
    BIM quantities → BOQ auto-population handled in Phase 4 (same interface, second entry point)

Constraints:

- Before marking Phase 3 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36
- docs/i18n/localization-gaps.md must exist by Phase 3 completion (create stub if not yet
  populated); tag TH-specific logic in source with // i18n: TH-SPECIFIC and document before
  each feature merges (source: context.md §Compliance, spec §20.5)

```

---

## PHASE 4 — BOQ SERVICE COMMAND

```text
Build BOQ (Bill of Quantities) Service.

Financial Precision: follow FINANCIAL PRECISION SPEC section above.
All monetary fields: DECIMAL(19,4) + currency_code VARCHAR(3).
All calculations: use decimal.js library — never native JS float.

Entities (PostgreSQL — schema: boq):
  boq_versions:
    version_id      UUID PK DEFAULT gen_random_uuid()
    project_id      UUID NOT NULL
    tenant_id       UUID NOT NULL
    version_number  INTEGER NOT NULL
    version_name    VARCHAR(100)
    status          ENUM('DRAFT','APPROVED','SUPERSEDED') DEFAULT 'DRAFT'
    total_estimated_amount   DECIMAL(19,4) NOT NULL DEFAULT 0
    total_estimated_currency VARCHAR(3) NOT NULL
    approved_by     UUID
    approved_at     TIMESTAMPTZ
    created_by      UUID NOT NULL
    created_at      TIMESTAMPTZ DEFAULT now()
    updated_at      TIMESTAMPTZ DEFAULT now()
    UNIQUE: (project_id, version_number)
    INDEX: (project_id, tenant_id)

  boq_categories:
    category_id     UUID PK
    version_id      UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    parent_category_id UUID FK (self-ref, nullable — for hierarchy)
    category_code   VARCHAR(50) NOT NULL
    category_name   VARCHAR(255) NOT NULL
    sort_order      INTEGER DEFAULT 0
    subtotal_amount DECIMAL(19,4) DEFAULT 0  — computed, stored for query perf
    INDEX: (version_id)

  boq_items:
    item_id         UUID PK
    category_id     UUID FK NOT NULL
    version_id      UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    item_code       VARCHAR(100)
    description     TEXT NOT NULL
    unit            VARCHAR(50) NOT NULL
    quantity        DECIMAL(10,4) NOT NULL
    unit_cost       DECIMAL(19,4) NOT NULL
    estimated_total DECIMAL(19,4) NOT NULL  — computed: ROUND(quantity × unit_cost, 4)
    currency_code   VARCHAR(3) NOT NULL
    sort_order      INTEGER DEFAULT 0
    carbon_factor_kg_co2e DECIMAL(10,6) NULL  — kgCO2e per unit (NULL until CarbonCalculationEngine activated)
    carbon_total_kg_co2e  DECIMAL(14,4)  NULL  — computed: ROUND(quantity × carbon_factor, 4)
    created_at      TIMESTAMPTZ DEFAULT now()
    updated_at      TIMESTAMPTZ DEFAULT now()
    INDEX: (version_id, category_id)

  Note: carbon_factor_kg_co2e and carbon_total_kg_co2e are NULLABLE from day one.
        Data capture hook only — analytics require CarbonCalculationEngine.
        Carbon data is forward-compatible: populate when factor is known, NULL is valid.

Calculation Rules:
  estimated_total = ROUND(quantity × unit_cost, 4)    — HALF_UP
  category.subtotal = SUM(item.estimated_total) for all items in category
  version.total_estimated = SUM(category.subtotal) for all root categories
  Recalculation: triggered on any item create/update/delete (synchronous)
  Rounding mode: HALF_UP throughout — use decimal.js ROUND_HALF_UP constant

Versioning Rules:
  - New project starts with version_number = 1
  - Creating a new version: copies all items from latest APPROVED version
  - Only one DRAFT version per project at a time
  - Approving a version: sets previous APPROVED to SUPERSEDED
  - APPROVED and SUPERSEDED versions are immutable

APIs:
  POST   /api/v1/projects/:projectId/boq/versions           — create new version
  GET    /api/v1/projects/:projectId/boq/versions           — list versions
  GET    /api/v1/projects/:projectId/boq/versions/:versionId — get version detail
  POST   /api/v1/projects/:projectId/boq/versions/:versionId/approve
  POST   /api/v1/boq/versions/:versionId/categories         — add category
  POST   /api/v1/boq/versions/:versionId/items              — add item
  PATCH  /api/v1/boq/items/:itemId                          — update item (DRAFT only)
  DELETE /api/v1/boq/items/:itemId                          — delete item (DRAFT only)
  GET    /api/v1/boq/versions/:versionId/export             — export as JSON/CSV

Generate:

- PostgreSQL migration files with all constraints
- NestJS module, service, repository, controller
- Decimal.js calculation service (unit-tested)
- Versioning service with copy-on-create logic
- DTOs with financial field validation
- OpenAPI 3.1 spec
- Unit tests: calculation accuracy (test: 0.1 + 0.2 precision, edge cases)
- Integration tests: full BOQ lifecycle
- Kafka event producers:

    boq.created        (envelope + { project_id, version_id, version_number })
    boq.updated        (envelope + { version_id, changed_items_count })
    boq.version.created(envelope + boq.version.created payload — see Event Contract)
    boq.version.approved(envelope + { project_id, version_id, total_estimated })

Decisions in Phase 4 (generate stub — implement when triggered):

  BIMIntegration — BOQ auto-population (spec §13.4):
    DECIDED: IFC.js parser (platform-agnostic) as primary; optional Autodesk Forge / Trimble Connect API connectors
    Interface: { importQuantities(bimFileUrl, boqVersionId, tenantId): Promise<BIMImportResult> }
    IFC mapping: IfcElement quantities → BOQ line items
    Data flow: IFC file → parse quantities → map to BOQ items (~80% entry reduction)
    See also: BIMIntegration Phase 3 (project structure import) — same IFC parser

Constraints:

- Before marking Phase 4 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```

---

## PHASE 5 — PROCUREMENT SERVICE COMMAND

```text
Build Procurement Service.

Workflow Engine: Temporal (see WORKFLOW ENGINE SPEC section above).
Financial Precision: follow FINANCIAL PRECISION SPEC section above.

Entities (PostgreSQL — schema: procurement):
  vendors:
    vendor_id       UUID PK
    tenant_id       UUID NOT NULL
    vendor_code     VARCHAR(50) NOT NULL
    vendor_name     VARCHAR(255) NOT NULL
    tax_id          VARCHAR(100)    — stored as-is, not validated (multi-country format, no validation by design)
    contact_email   VARCHAR(255)
    contact_phone   VARCHAR(50)
    address         TEXT
    is_active       BOOLEAN DEFAULT true
    created_at      TIMESTAMPTZ DEFAULT now()
    UNIQUE: (tenant_id, vendor_code)

  purchase_requests:
    pr_id           UUID PK
    project_id      UUID NOT NULL
    tenant_id       UUID NOT NULL
    pr_number       VARCHAR(50) NOT NULL
    status          ENUM('DRAFT','SUBMITTED','APPROVED','REJECTED','PO_CREATED')
    requested_by    UUID NOT NULL
    required_date   DATE
    created_at      TIMESTAMPTZ DEFAULT now()
    UNIQUE: (tenant_id, pr_number)

  rfqs:
    rfq_id          UUID PK
    pr_id           UUID FK
    project_id      UUID NOT NULL
    tenant_id       UUID NOT NULL
    rfq_number      VARCHAR(50) NOT NULL
    status          ENUM('DRAFT','PUBLISHED','CLOSED','EVALUATED','AWARDED','CANCELLED')
    deadline        TIMESTAMPTZ NOT NULL
    temporal_workflow_id VARCHAR(255)  — Temporal workflow run ID
    created_by      UUID NOT NULL
    created_at      TIMESTAMPTZ DEFAULT now()

  quotations:
    quotation_id    UUID PK
    rfq_id          UUID FK NOT NULL
    vendor_id       UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    total_amount    DECIMAL(19,4) NOT NULL
    currency_code   VARCHAR(3) NOT NULL
    validity_days   INTEGER NOT NULL
    submitted_at    TIMESTAMPTZ NOT NULL
    is_selected     BOOLEAN DEFAULT false

  purchase_orders:
    po_id           UUID PK
    rfq_id          UUID FK
    vendor_id       UUID FK NOT NULL
    project_id      UUID NOT NULL
    tenant_id       UUID NOT NULL
    po_number       VARCHAR(50) NOT NULL
    status          ENUM('DRAFT','PENDING_APPROVAL','APPROVED','SENT','ACKNOWLEDGED',
                         'PARTIALLY_DELIVERED','FULLY_DELIVERED','INVOICED',
                         'PAID','DISPUTED')
    total_amount    DECIMAL(19,4) NOT NULL
    currency_code   VARCHAR(3) NOT NULL
    delivery_date   DATE NOT NULL
    temporal_workflow_id VARCHAR(255)
    created_by      UUID NOT NULL
    created_at      TIMESTAMPTZ DEFAULT now()
    UNIQUE: (tenant_id, po_number)

  po_line_items:
    line_id         UUID PK
    po_id           UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    boq_item_id     UUID            — optional link to BOQ item
    description     TEXT NOT NULL
    quantity        DECIMAL(10,4) NOT NULL
    unit            VARCHAR(50) NOT NULL
    unit_price      DECIMAL(19,4) NOT NULL
    line_total      DECIMAL(19,4) NOT NULL  — ROUND(quantity × unit_price, 4)

  deliveries:
    delivery_id     UUID PK
    po_id           UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    delivery_note   VARCHAR(100)
    delivered_at    TIMESTAMPTZ NOT NULL
    received_by     UUID NOT NULL
    notes           TEXT

  invoices:
    invoice_id      UUID PK
    po_id           UUID FK NOT NULL
    vendor_id       UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    invoice_number  VARCHAR(100) NOT NULL
    amount          DECIMAL(19,4) NOT NULL
    currency_code   VARCHAR(3) NOT NULL
    invoice_date    DATE NOT NULL
    due_date        DATE NOT NULL
    status          ENUM('RECEIVED','VERIFIED','APPROVED','PAID','DISPUTED')
    file_id         UUID  — reference to File Service

Workflow Implementation:
  Use Temporal TypeScript SDK
  RFQ Workflow: implements RFQ state machine from WORKFLOW ENGINE SPEC
  PO Workflow:  implements PO state machine from WORKFLOW ENGINE SPEC
  Temporal Worker: dedicated worker service within procurement-service
  Workflow compensation: on CANCELLED, emit compensation events to Finance Service

Generate:

- PostgreSQL migration files for all entities
- NestJS module, service, repository, controller
- Temporal workflow definitions for RFQ and PO
- Temporal worker setup and registration
- Quotation comparison service (sort by total_amount, mark is_selected)
- DTOs with validation for all APIs
- OpenAPI 3.1 spec
- APIs (authoritative: spec §14 Procurement APIs + Vendor APIs; AIP-132 List /
  AIP-159 cross-collection; tenant-scoped server-side via RLS + JWT; see ADR-022).
  Canonical prefix `/api/v1/procurement/*` for the ENTIRE module — vendors included
  (ADR-022 override: §14's separate `/api/v1/vendors` namespace was unified under
  `/api/v1/procurement/vendors`; §14 updated to match). There are NO project-scoped
  procurement list routes — per-project views use the tenant-wide lists with `?project_id=`:
    Vendors:
      POST   /api/v1/procurement/vendors
      GET    /api/v1/procurement/vendors
      GET    /api/v1/procurement/vendors/:vendorId
      GET    /api/v1/procurement/vendors/:vendorId/quotations  (vendor quotation history)
      DELETE /api/v1/procurement/vendors/:vendorId
    Purchase requests:
      POST   /api/v1/procurement/purchase-requests          (project_id in body)
      GET    /api/v1/procurement/purchase-requests           (filterable: status, project_id)
    RFQs:
      POST   /api/v1/procurement/rfqs
      GET    /api/v1/procurement/rfqs                         (filterable: status, project_id)
      POST   /api/v1/procurement/rfqs/:rfqId/publish|close|cancel|award
      GET    /api/v1/procurement/rfqs/:rfqId/quotations       (compare; RFQ CLOSED)
      POST   /api/v1/procurement/rfqs/:rfqId/quotations       (submit quotation)
      POST   /api/v1/procurement/rfqs/:rfqId/invitations      (invite a vendor — issues a Vendor Portal magic-link; ADR-030)
    Purchase orders:
      POST   /api/v1/procurement/purchase-orders
      GET    /api/v1/procurement/purchase-orders              (filterable: status, project_id)
      GET    /api/v1/procurement/purchase-orders/:poId
      GET    /api/v1/procurement/purchase-orders/:poId/deliveries
      POST   /api/v1/procurement/purchase-orders/:poId/submit|approve|reject|acknowledge|mark-paid|dispute
    Deliveries:
      POST   /api/v1/procurement/deliveries                  (po_id in body)
      GET    /api/v1/procurement/deliveries                  (filterable: po_id)
    Vendor invoices:
      POST   /api/v1/procurement/vendor-invoices             (po_id in body)
      GET    /api/v1/procurement/vendor-invoices?po_id=
      POST   /api/v1/procurement/vendor-invoices/:invoiceId/approve
    Vendor Portal — external vendor self-service (ADR-030; brought into MVP, overrides §28 Year 1–2
    timeline; spec §14 Vendor Portal + docs/api/vendor.openapi.yaml; pages §20.7.12 under /vendor):
      GET    /api/v1/vendor/rfq/:token                       (Tier-1 magic-link: open invited RFQ — no account)
      POST   /api/v1/vendor/rfq/:token/quotation             (Tier-1: submit quotation; returns a Tier-2 vendor session)
      GET    /api/v1/vendor/purchase-orders                  (Tier-2: track PO status; Bearer session + x-vendor-tenant-id)
      GET    /api/v1/vendor/invoices                          (Tier-2: list own invoices)
      POST   /api/v1/vendor/invoices                          (Tier-2: submit invoice)
      Entities: platform.vendor_identities + platform.vendor_trading_relationships (cross-tenant, no RLS)
                + procurement.rfq_invitations (RLS; magic-link token_hash). Reuses procurement
                rfqs/quotations/purchase_orders/invoices — no duplicate data model.
      Auth: VENDOR_PORTAL principal (not a CosRole); magic-link HMAC token (spec §5.4.3).
- Decimal.js used for all financial calculations
- Unit tests: workflow state transitions, financial calculations
- Integration tests: full procurement lifecycle with Temporal test server
- Kafka event producers (conform to Event Contract envelope):

    procurement.rfq.created
    procurement.rfq.status_changed  { rfq_id, from_status, to_status }
    procurement.po.created          (see Event Contract spec)
    procurement.po.status_changed   { po_id, from_status, to_status }
    procurement.delivery.received   { po_id, delivery_id, delivered_at }
    procurement.invoice.received    (see Event Contract spec)

Do not invent:

- approval hierarchy (use ROLE: PROC_MANAGER from Phase 2)
- accounting posting rules
- tax logic:

    Tax calculation uses Avalara AvaTax API
    Interface: { calculate(amount, currency, fromAddress, toAddress, lineItems, tenantId): TaxResult }
    Trigger: on invoice creation and PO generation
    WHT rules: Thailand default 3% services / 5% rent; TENANT_ADMIN configures other jurisdictions via wht_rules table (spec §13.3)

- vendor scoring/rating logic (3 criteria — see below)

Decisions in Phase 5 (documented in spec):

  VendorScoring:
    DECIDED: 3 scoring criteria — on-time delivery, quality, price competitiveness
    Weights: TENANT_ADMIN configures weights per criteria (default: equal 1/3 each)
    stored in vendor_score_weights table (tenant_id, criteria_name, weight DECIMAL(5,2))
    Interface: { score(vendorId: string, criteria: ScoreCriteria[]): VendorScore }
    ScoreCriteria: { name: 'on_time_delivery'|'quality'|'price', weight: number, value: number }
    VendorScore:   { vendorId: string, totalScore: number, breakdown: ScoreCriteria[], grade: ENUM(A,B,C,D,F) }

  WithholdingTaxRules (spec §13.3):
    DECIDED: Thailand default (3% services, 5% rent); TENANT_ADMIN configures other jurisdictions via wht_rules table
    Interface: { calculate(amount: Decimal, vendorType: string, jurisdiction: string): WHTResult }
    WHTResult: { whtAmount: Decimal, rate: number, certificateRef: string }
    Implementation: hook inside Avalara AvaTax flow

Constraints:

- Before marking Phase 5 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```

---

## PHASE 6 — SITE OPERATIONS COMMAND

```text
Build Site Operations Service.

Offline Conflict Resolution Strategy (authoritative):
  Entity: site_reports
    Strategy: LAST_WRITE_WINS based on client_submitted_at timestamp
    Rationale: one report per day per submitter — concurrent edits are rare
    Implementation: compare client_submitted_at on sync; newer timestamp wins
    Conflict flag: if server version modified_at differs from client's
                   last_known_modified_at, flag as CONFLICT for manual review

  Entity: issues
    Strategy: FIELD_LEVEL_MERGE
    Fields merged independently:
      - description:  last writer wins (client_submitted_at)
      - status:       server wins (status changes are authoritative)
      - photos:       union of both (no conflict — additive)
      - resolution_note: last writer wins
    Conflict flag: if status was changed server-side while client had offline edit,
                   create ConflictRecord for ROLE: SITE_ENGINEER to review

  Entity: safety_checklists
    Strategy: SERVER_WINS
    Rationale: safety data must be authoritative — no client override
    On conflict: reject client version, return server version with CONFLICT_REJECTED status

  Entity: tasks (progress_percent field)
    Strategy: MAX_WINS — higher value wins; progress is monotonic
    Rationale: progress_percent must never decrease; a worker cannot un-complete work
    Implementation: compare client progress_percent vs server progress_percent; apply max(client, server)
    Conflict flag: none — Max-wins resolves silently (no human review required)

  Financial entities (BOQ line items, payment approvals, budget entries, invoice records):
    Strategy: NO_AUTO_RESOLUTION — financial data must never be auto-merged or auto-overwritten
    Rationale: financial integrity requires human review of all concurrent-edit conflicts
    Implementation:
      - Offline WRITE operations on financial entities are held in sync_queue with status PENDING
      - Before applying: server checks for concurrent server-side modification since client's last sync
      - If conflict detected → set status CONFLICT_FLAGGED; push notification to FINANCE
        or PROJECT_MANAGER for manual resolution
      - NEVER auto-merge, auto-overwrite, or silently discard financial data
      - Conflict must be resolved manually by FINANCE or PROJECT_MANAGER before payload
        is applied to server state
    Entities covered: BOQ line items, payment_approvals, budget_entries, invoice_records
    Note: this rule was added to QM-9 (context.md v3.1.0 GAP-2) — authoritative source is here

  Sync Protocol:
    Client sends: { entity_type, entity_id, client_version, payload, client_submitted_at }
    Server returns: { resolved_payload, conflict_status, server_version }
    conflict_status: ACCEPTED | CONFLICT_FLAGGED | CONFLICT_REJECTED

Task Completion Gates (server-side validation — not enforced offline):
  A task may only transition to status = COMPLETED when ALL hard-block gates pass.
  Evaluated at PATCH /api/v1/tasks/:id { status: 'completed' }.
  On any hard-block failure → return HTTP 422 with error code COS-TASK-001 and the list
  of blocking gate names.

  Hard blocks — system returns 422 if any gate fails:
    1. Inspections  — no linked inspection (task_id = task.task_id) with
                      result = 'FAIL' or status = 'REQUIRES_REINSPECTION'
    2. Issues       — no linked issue (task_id = task.task_id) with
                      issue_type IN ('DEFECT','REWORK','PUNCH') and status = 'OPEN'
    3. Dependencies — all predecessor tasks derived from BOQ parent-child hierarchy
                      (boq_item_id parent → child = DEPENDS_ON) have status = 'COMPLETED'
    4. Permit       — no linked permit (linked_task_id = task.task_id) with
                      status IN ('EXPIRED','REVOKED')
    5. Safety       — no linked safety incident (task_id = task.task_id) with
                      status = 'OPEN' and severity IN ('HIGH','CRITICAL')
    6. Delay        — task.status != 'BLOCKED'
                      (construction.delay.detected.v1 event auto-sets task.status = BLOCKED)
    7. Material     — linked BOQ item's purchase order has at least one delivery record
                      with status != 'PENDING' (partial or complete delivery required)

  Warn only — HTTP 200 returned; response includes warnings[] array:
    8. Budget 85%–99%  — BOQ item actual_cost >= 85% of budget → warning level: ORANGE
    9. Budget >= 100%  — BOQ item actual_cost >= 100% of budget → warning level: RED;
                         requires PM acknowledgement flag in request body: { acknowledge_budget_overrun: true }

Entities (PostgreSQL — schema: site_ops):
  site_reports:
    report_id       UUID PK
    project_id      UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    report_date     DATE NOT NULL
    submitted_by    UUID NOT NULL
    status          ENUM('DRAFT','SUBMITTED','ACKNOWLEDGED')
    summary         TEXT   — max 2000 chars, enforced in DTO
    weather         VARCHAR(100)
    manpower_count  INTEGER
    client_submitted_at TIMESTAMPTZ  — from device clock
    server_received_at  TIMESTAMPTZ DEFAULT now()
    modified_at         TIMESTAMPTZ DEFAULT now()
    UNIQUE: (project_id, report_date, submitted_by)

  issues:
    issue_id        UUID PK
    project_id      UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    report_id       UUID FK (optional — FK → site_reports)
    task_id         UUID nullable FK → projects.tasks (completion gate #2; see §11)
    title           VARCHAR(255) NOT NULL
    description     TEXT
    issue_type      ENUM('DEFECT','REWORK','PUNCH','GENERAL') DEFAULT 'GENERAL'
    severity        ENUM('LOW','MEDIUM','HIGH','CRITICAL')
    status          ENUM('OPEN','IN_PROGRESS','RESOLVED','CLOSED')
    assigned_to     UUID
    resolution_note TEXT
    client_submitted_at TIMESTAMPTZ
    modified_at     TIMESTAMPTZ DEFAULT now()
    created_at      TIMESTAMPTZ DEFAULT now()

  inspections:
    inspection_id   UUID PK
    project_id      UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    checklist_id    UUID FK NOT NULL
    task_id         UUID nullable FK → projects.tasks (completion gate #1; see §11)
    status          ENUM('PENDING','PASSED','FAILED','REQUIRES_REINSPECTION')
    inspected_by    UUID NOT NULL
    inspected_at    TIMESTAMPTZ NOT NULL
    notes           TEXT

  safety_checklists:
    checklist_id    UUID PK
    project_id      UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    checklist_name  VARCHAR(255) NOT NULL
    version         INTEGER DEFAULT 1
    items           JSONB NOT NULL  — array of { item_id, description, is_required }
    created_at      TIMESTAMPTZ DEFAULT now()

  manpower_logs:
    log_id          UUID PK
    report_id       UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    trade_type      VARCHAR(100) NOT NULL
    worker_count    INTEGER NOT NULL
    hours_worked    DECIMAL(5,2) NOT NULL

  conflict_records:
    conflict_id     UUID PK
    tenant_id       UUID NOT NULL
    entity_type     VARCHAR(100) NOT NULL
    entity_id       UUID NOT NULL
    client_payload  JSONB NOT NULL
    server_payload  JSONB NOT NULL
    conflict_type   ENUM('FIELD_CONFLICT','STATUS_CONFLICT','REJECTED')
    reviewed_by     UUID
    reviewed_at     TIMESTAMPTZ
    created_at      TIMESTAMPTZ DEFAULT now()

APIs (mobile-first; canonical /api/v1/site/* and /api/v1/safety/* — ADR-025/027):
  POST  /api/v1/site/reports                    — create or sync offline report
  GET   /api/v1/site/reports                    — list (paginated, date range filter)
  GET   /api/v1/site/reports/:id                — get by ID
  POST  /api/v1/site/reports/sync               — bulk offline sync (array of changes)
  POST  /api/v1/site/reports/:reportId/materials — log material consumption
  POST  /api/v1/site/issues                     — create or sync offline issue
  PATCH /api/v1/site/issues/:id                 — update issue (field-level merge)
  GET   /api/v1/site/issues                     — list issues (severity/status/project)
  POST  /api/v1/site/inspections                — submit inspection result
  GET   /api/v1/site/inspections                — list inspection results
  GET   /api/v1/site/inspections/:id            — get inspection
  PATCH /api/v1/site/inspections/:id            — approve / request re-inspection (ADR-025)
  GET   /api/v1/site/conflict-records           — list unresolved conflicts (ROLE: SITE_ENGINEER)
  PATCH /api/v1/site/conflict-records/:id/resolve — manual conflict resolution
  # Tasks + completion gate (1–7 hard blocks + budget warnings 8–9; see Task Completion Gates):
  GET   /api/v1/projects/:projectId/tasks       — list tasks; POST creates; PATCH /api/v1/tasks/:id updates
  # Safety (incidents, permits §15.5, checklists, compliance — ADR-027):
  POST  /api/v1/safety/incidents                — report incident; GET lists; PATCH :id/acknowledge
  POST  /api/v1/safety/permits                  — create; GET lists; PATCH :id/approve|:id/reject (§15.5)
  GET   /api/v1/safety/checklists               — list; POST submit completed checklist (= inspection)
  GET   /api/v1/safety/compliance               — deterministic compliance view (open incidents + bad permits)

Safety APIs (authoritative: spec §14 Safety APIs; MVP scope: spec §21.2 = incident reports,
  safety checklists, work permits, safety permit-approval workflow). Enumerated here so the
  execution view matches §14 and the Procurement/Phase-5-style context-derivation drift is not
  repeated. Backend NOT yet implemented — tracked as the deferred safety workstream (DECISION-2;
  ADR-022 follow-up):
  POST  /api/v1/safety/incidents                         — report safety incident (Site Engineer, Safety Officer)
  PATCH /api/v1/safety/incidents/:incidentId/acknowledge — acknowledge incident (Safety Officer)
  GET   /api/v1/safety/checklists                        — list safety checklists (any role)
  POST  /api/v1/safety/checklists                        — submit completed safety checklist (Site Engineer, Safety Officer)
  Note: §21.2 also mandates WORK PERMITS + a safety permit-approval workflow, but §14's Safety
  table does NOT yet enumerate their API paths — flagged as a spec-level gap (§14 incomplete vs
  §21.2). Do not invent permit endpoint paths until §14 is updated.

  material_consumptions:
    consumption_id  UUID PK
    project_id      UUID NOT NULL
    tenant_id       UUID NOT NULL
    report_id       UUID FK → site_reports (optional)
    material_name   VARCHAR(255) NOT NULL
    material_id     UUID NOT NULL DEFAULT gen_random_uuid()
                    — own identity now; future FK → materials.material_id when catalogue built
    task_id         VARCHAR(255)   — nullable free-text; no FK until Task entity exists
    quantity        DECIMAL(10,4) NOT NULL
    unit            VARCHAR(50) NOT NULL
    consumed_by     UUID NOT NULL
    consumed_at     TIMESTAMPTZ NOT NULL

APIs (addition):
  POST /api/v1/site/reports/:reportId/materials — log material consumption; emits site.material.consumed.v1

Generate:

- PostgreSQL migration files for all entities (including material_consumptions — KD-SITE-001 RESOLVED)
- NestJS module with offline sync controller
- Conflict resolution service implementing all three strategies above
- ConflictRecord persistence and notification
- Photo upload integration via File Service API (not direct — API call)
- OpenSearch indexing for site_reports and issues (full-text search)
- Response DTOs optimized for mobile (minimal payload option via ?minimal=true)
- Unit tests: all three conflict resolution strategies
- Integration tests: sync flow including conflict scenarios
- Kafka event producers:

    site.material.consumed  { consumption_id, project_id, task_id (nullable free-text),
                              material_id, quantity: DECIMAL(10,4), unit, consumed_by,
                              consumed_at }  — emitted on POST /api/v1/site/reports/:reportId/materials
    site.report.created   (see Event Contract spec)
    site.report.submitted { report_id, project_id, report_date, submitted_by }
    inspection.passed     { inspection_id, project_id, inspected_by }
    inspection.failed     (see Event Contract spec)
    issue.created         (see Event Contract spec)
    issue.status_changed  { issue_id, project_id, from_status, to_status }

Decision in Phase 6 (documented in spec):

  CarbonCalculationEngine:
    DECIDED: two complementary standards (see spec §33.4 + 09-data-architecture.md):
      - Material-level factors: EN 15804:2012+A2:2019 / ISO 21930:2017 (EPD source, configurable per tenant)
      - Project-level reporting: GHG Protocol (Scope 1/2/3 classification)
    Implementation: populate boq_items.carbon_factor_kg_co2e from EPD per EN 15804; aggregate via GHG Protocol Scope 3 for project footprint report
    Interface: { calculateProjectFootprint(projectId, tenantId): Promise<{ total_kg_co2e, breakdown_by_material, scope_breakdown }> }
    Data sources (already in schema from Phase 4+):
      - boq_items.carbon_factor_kg_co2e (nullable, populate on EP activation)
      - boq_items.quantity + site.material.consumed events (Phase 6)
    Trigger: implement when tenant requests carbon reporting or regulation requires it

Constraints:

- Before marking Phase 6 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```

---

## PHASE 7 — FINANCE SERVICE COMMAND

```text
Build Finance Service.

IMPORTANT SCOPE CLARIFICATION:
  This service is a PROJECT COST TRACKING system, NOT a full accounting system.
  It does NOT implement double-entry bookkeeping.
  It does NOT implement chart of accounts.
  It does NOT implement GL posting.
  It does NOT integrate with external ERP or accounting software.
  All of the above are UNSPECIFIED — escalate to product owner for decision; do not generate stubs.

  What it DOES implement:
  - Project-level budget tracking (budget vs actual cost)
  - Cost transaction recording (inbound from Procurement via Kafka)
  - Payment status tracking
  - Budget variance reporting
  - Project-level financial summary views
  - AR Client Billing (§11/§15): create → approve (Finance → PM ≤ limit → Executive) → paid
  - AR Receipts (client payments; settle billing to PAID) + Contracts + Customers (§11)
  - Cash Flow Forecast — deterministic 13-week direct method (ADR-024; §09 AI forecast deferred)

Financial Precision: follow FINANCIAL PRECISION SPEC section above.

Entities (PostgreSQL — schema: finance):
  project_budgets:
    budget_id         UUID PK
    project_id        UUID NOT NULL UNIQUE
    tenant_id         UUID NOT NULL
    total_budget_amount   DECIMAL(19,4) NOT NULL
    total_budget_currency VARCHAR(3) NOT NULL
    allocated_amount  DECIMAL(19,4) DEFAULT 0   — sum of budget_lines
    committed_amount  DECIMAL(19,4) DEFAULT 0   — sum of approved POs
    actual_amount     DECIMAL(19,4) DEFAULT 0   — sum of paid invoices
    created_at        TIMESTAMPTZ DEFAULT now()
    updated_at        TIMESTAMPTZ DEFAULT now()

  budget_lines:
    line_id           UUID PK
    budget_id         UUID FK NOT NULL
    project_id        UUID NOT NULL
    tenant_id         UUID NOT NULL
    boq_category_id   UUID     — loose reference to BOQ category (no FK)
    line_name         VARCHAR(255) NOT NULL
    allocated_amount  DECIMAL(19,4) NOT NULL
    currency_code     VARCHAR(3) NOT NULL
    created_at        TIMESTAMPTZ DEFAULT now()

  cost_transactions:
    transaction_id    UUID PK
    project_id        UUID NOT NULL
    tenant_id         UUID NOT NULL
    source_type       ENUM('PURCHASE_ORDER','INVOICE','ADJUSTMENT') NOT NULL
    source_id         UUID NOT NULL  — PO ID or Invoice ID from Procurement
    budget_line_id    UUID FK (nullable — manual assignment)
    amount            DECIMAL(19,4) NOT NULL
    currency_code     VARCHAR(3) NOT NULL
    transaction_date  DATE NOT NULL
    description       TEXT
    recorded_at       TIMESTAMPTZ DEFAULT now()
    recorded_by       UUID  — actor_id from event, or user for manual entry
    INDEX: (project_id, tenant_id, transaction_date)

  payments:
    payment_id        UUID PK
    invoice_id        UUID NOT NULL  — from Procurement
    project_id        UUID NOT NULL
    tenant_id         UUID NOT NULL
    amount            DECIMAL(19,4) NOT NULL
    currency_code     VARCHAR(3) NOT NULL
    payment_date      DATE NOT NULL
    payment_reference VARCHAR(255)
    status            ENUM('PENDING','PROCESSED','FAILED')
    recorded_by       UUID NOT NULL
    created_at        TIMESTAMPTZ DEFAULT now()

  retention_records:
    retention_id      UUID PK
    po_id             UUID NOT NULL
    project_id        UUID NOT NULL
    tenant_id         UUID NOT NULL
    retention_percentage DECIMAL(5,2)  — set by TENANT_ADMIN per PO (nullable; no system default)
    retention_amount  DECIMAL(19,4)  — calculated: contract_amount × retention_percentage / 100
    currency_code     VARCHAR(3)
    status            ENUM('HELD','RELEASED','PARTIAL_RELEASE')
    — DECIDED: retention_percentage is entered by TENANT_ADMIN per PO in UI; no automatic calculation

Kafka Consumers (Finance subscribes to these events):
  procurement.po.created         → create cost_transaction (COMMITTED, source: PO)
  procurement.invoice.received   → create cost_transaction (ACTUAL, source: INVOICE)
  procurement.po.status_changed  → update committed_amount if PO CANCELLED

APIs (canonical prefix /api/v1/finance/*; spec §14 Financial APIs; AIP-132; see ADR-023.
  Budget is project-scoped; cost-transactions and payments are tenant-wide lists filterable
  by ?project_id=. Vendor invoices (AP) live in procurement /api/v1/procurement/vendor-invoices
  — Finance views/approves/pays them; no duplicate finance invoice store):
  GET  /api/v1/finance/budget/:projectId              — budget summary with lines (vs actual/committed)
  POST /api/v1/finance/budget/:projectId              — create/update budget
  POST /api/v1/finance/budget/:projectId/lines        — add budget line
  GET  /api/v1/finance/cost-transactions              — list cost transactions (tenant-wide; ?project_id=)
  POST /api/v1/finance/payments                       — record payment vs vendor invoice (project_id in body)
  GET  /api/v1/finance/payments                       — list payments / AP queue (tenant-wide; ?project_id=)
  GET  /api/v1/finance/reports/variance               — budget variance across projects
  POST /api/v1/finance/customers                       — register a client/customer (§11)
  GET  /api/v1/finance/customers                       — list customers
  POST /api/v1/finance/contracts                       — create a contract (client-/vendor-side, §11)
  GET  /api/v1/finance/contracts                       — list contracts (tenant-wide; ?project_id=)
  POST /api/v1/finance/billing                         — create AR client billing (DRAFT)
  GET  /api/v1/finance/billing                         — list AR billings (tenant-wide; ?project_id=&status=)
  GET  /api/v1/finance/billing/:billingId              — get a single AR billing
  PATCH /api/v1/finance/billing/:billingId/approve     — approve billing DRAFT→ISSUED (§15: PM≤limit, Exec above)
  POST /api/v1/finance/ar-receipts                     — record client payment; settles billing → PAID (§11)
  GET  /api/v1/finance/cashflow-forecast/:projectId    — 13-week direct-method cash flow forecast (ADR-024)

Generate:

- PostgreSQL migration files for all entities
- NestJS module with Kafka consumer handlers for procurement events
- Budget aggregation service (recalculates on each transaction)
- Variance calculation: (actual + committed) vs allocated per budget_line
- Decimal.js used for all calculations
- DTOs with validation
- OpenAPI 3.1 spec
- Unit tests: aggregation accuracy, Kafka consumer handlers
- Integration tests: full budget lifecycle + procurement event consumption
- Kafka event producers:

    finance.budget.created   { project_id, budget_id, total_budget_amount }
    finance.payment.processed { project_id, payment_id, invoice_id, amount }
    finance.variance.alert   { project_id, variance_percentage, threshold_exceeded }
      — DECIDED: default threshold = 10% (fires when actual cost exceeds budget by 10%)
        TENANT_ADMIN can override per project via project settings; stored in project_budgets.variance_alert_threshold DECIMAL(5,2)

Constraints:

- Do NOT implement double-entry bookkeeping
- Do NOT implement chart of accounts
- Tax calculation: implement via Avalara AvaTax API

    Avalara handles VAT, GST, Sales Tax globally — pluggable per tenant jurisdiction
    WHT (Withholding Tax): Thailand default (3% services, 5% rent); TENANT_ADMIN configures per jurisdiction (spec §13.3)
    Do NOT hardcode tax rates — use wht_rules table for all jurisdictions

- ERP integration: Strategy pattern; 3 sub-stubs (SAPAdapter, OracleAdapter, DynamicsAdapter); implement each when first tenant with that ERP onboards (spec §13.3)
- Multi-currency conversion: implement via Open Exchange Rates API

    Rates cached in Redis TTL 24h, refreshed daily at 00:00 UTC
    Fallback: use last cached rate if API unavailable (stale-while-revalidate)
    Do NOT implement custom exchange rate logic

- All cross-service data arrives via Kafka — no direct DB queries to Procurement

Decisions in Phase 7 (documented in spec):

  ERPIntegration (spec §13.3):
    DECIDED: Strategy pattern — common ERPIntegration interface { postCostTransaction, postInvoice, syncVendor }
    3 sub-stubs (each STUB until first customer with that ERP onboards):
      SAPAdapter:      SAP Business One / S/4HANA (webhook + iDoc format)
      OracleAdapter:   Oracle Fusion Finance (REST API)
      DynamicsAdapter: Microsoft Dynamics 365 Finance (REST API)
    Implementation: per-source adapter; credentials stored per-tenant in AWS SM / Vault

  ConstructionFinancing (spec §13.5):
    DECIDED: Invoice factoring (AR factoring); COS exports invoice data → fintech partner API; Strategy pattern — per-partner adapter
    Interface: { submitFactoringApplication(invoiceId, tenantId): Promise<FinancingRef> }
    Data export to fintech: verified invoices (invoice.status = VERIFIED), cash flow data
    Candidates: Funding Societies (SEA), Validus (SEA) — per-partner adapter implemented on first tenant request

- Before marking Phase 7 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36
```

---

## PHASE 8 — EVENT-DRIVEN INFRASTRUCTURE COMMAND

```text
Build event-driven infrastructure.

Schema Registry:

- Solution: Confluent Schema Registry (open-source, self-hosted)
- Version: confluent-schema-registry 7.x
- Deployment: containerized alongside Kafka
- Schema format: Avro (primary) + TypeScript interfaces generated from Avro
- Subject naming convention: {topic-name}-value  (e.g. "project.created-value")
- Compatibility mode: BACKWARD_TRANSITIVE

  (new schema must be readable by ALL previous versions, not just the immediately preceding one;
   this is stricter than BACKWARD — every historical consumer can read any newer schema version;
   source: spec §32.4)

- Schema evolution rules:

    ALLOWED:   add optional field with default value
    ALLOWED:   add new enum value (at end of enum list)
    FORBIDDEN: rename field
    FORBIDDEN: remove field
    FORBIDDEN: change field type
    FORBIDDEN: reorder enum values

Event Versioning Strategy:

- Version carried in event envelope: event_version field (semver string, e.g. "1.0")
- Minor version: new optional fields added (backward compatible — same schema subject)
- Major version: breaking change → new schema subject

  (e.g. "project.created.v2-value") and migration consumer bridge

- Version in topic name: NOT used (version only in envelope and schema registry)

Kafka Configuration:
  Cluster: 3 brokers minimum (production) / 1 broker (development)
  Replication factor: 3 (production) / 1 (development)
  Min ISR: 2 (production)
  Topic naming: {service}.{entity}.{event}
                e.g. project.project.created, procurement.po.created
  Default retention: 7 days
  Log compaction: enabled for entity state topics (project.project.*, etc.)
  Max message size: 1MB (large payloads → store in S3, reference in event)

Shared Event SDK (@construction-os/shared package):
  Exports:
    - TypeScript interfaces for all event envelopes and payloads
    - Avro schema files (generated, versioned)
    - KafkaProducer abstraction (wraps KafkaJS with schema validation)
    - KafkaConsumer abstraction (wraps KafkaJS with idempotency support)
    - OutboxPublisher (for outbox pattern — see below)

Outbox Pattern:
  Purpose: guarantee event delivery with database transaction atomicity
  Implementation:
    - outbox_events table in each service's PostgreSQL schema
    - outbox_events: { id UUID, event_type, payload JSONB, published BOOLEAN,
                       created_at TIMESTAMPTZ, published_at TIMESTAMPTZ }
    - Service: write to outbox_events in same transaction as business entity
    - OutboxPoller: background process, polls every 500ms, publishes unpublished
    - OutboxPoller: marks published=true after successful Kafka produce
    - Idempotency: consumers check event_id in Redis (TTL 24h) before processing

Dead Letter Queue (DLQ):
  Pattern: failed messages → {original-topic}.dlq topic
  Retry: 3 attempts with exponential backoff (1s, 5s, 30s)
  After max retries: publish to DLQ topic + alert via observability

Monitoring:
  - Consumer lag: Prometheus consumer_group_lag metric
  - Producer errors: Prometheus kafka_producer_error_total counter
  - DLQ depth: alert when DLQ topic message count > 0

DATA FLOW ARCHITECTURE (spec §9.4 — two independent paths):
  Path 1 — Business Event Flow (THIS PHASE — Outbox Pattern):
    Operational App → Operational DB (PostgreSQL) → Outbox Pattern → Kafka → Downstream Services
    Purpose: real-time domain event coordination between services
    Implementation: OutboxPoller above

  Path 2 — Data Replication to Data Lake (FUTURE — Debezium CDC, implement with Phase 17 DevOps):
    PostgreSQL → Debezium CDC (reads WAL directly — NOT Kafka consumer) → Kafka → Kafka Connect S3 Sink → Data Lake (S3 + Apache Iceberg) → ClickHouse → AI Pipeline / Analytics
    Purpose: row-level DB change replication for full data fidelity in the lake (even for direct DB writes that bypass the business event bus)
    Note: Debezium reads PostgreSQL WAL independently of Outbox Pattern — these are NOT the same mechanism
    DebeziumCDCPipeline:
      DECIDED: Debezium 2.x + Kafka Connect 3.x; implement with Phase 17 data lake infrastructure
      Interface: { configureDebeziumConnector(pgSource, kafkaSink): void }
      Trigger: Phase 17 (data lake infrastructure ready); required by spec §4.4 and §9.4

Generate:

- Docker Compose: Kafka (KRaft mode, no ZooKeeper), Schema Registry
- Kubernetes manifests at infrastructure/kubernetes/kafka/:
    kafka-statefulset.yaml         — Kafka 3-broker StatefulSet (KRaft mode, production)
    schema-registry-deployment.yaml — Confluent Schema Registry Deployment + Service
- @construction-os/shared package:

    - all TypeScript event interfaces (from Event Contract spec section)
    - Avro schemas for all events
    - KafkaProducer class with schema validation before publish
    - KafkaConsumer class with idempotency Redis check
    - OutboxPublisher with OutboxPoller

- DLQ consumer and retry middleware
- OpenTelemetry trace propagation via Kafka headers
- Prometheus metrics for producer, consumer, DLQ
- Confluent Schema Registry client integration
- Unit tests: producer, consumer, outbox pattern, idempotency
- Integration tests: packages/@cos/shared/test/kafka/kafka.integration.spec.ts
    - Add to @cos/shared devDependencies: testcontainers ^10.9.0, @testcontainers/kafka ^10.9.0 (Rule 26)
    - Add script to @cos/shared package.json: "test:integration": "jest --testPathPattern='test/'" (Rule 27)
      Note: turbo.json test:integration task already exists — no change needed
    - Use @testcontainers/kafka KafkaContainer for a real single-broker Kafka instance
    - Mock Schema Registry (Avro encoding covered in src/kafka/__tests__/schema-registry.client.spec.ts)
    - Mock Redis idempotency store (logic covered in src/kafka/__tests__/consumer.idempotency.spec.ts)
    - Test cases: (a) producer publishes event → consumer receives same payload
                  (b) same event_id processed exactly once (idempotency gate)

Constraints:

- Schema Registry must be running before first KafkaProducer deployment (QM-9 BACKWARD_TRANSITIVE)
- Before marking Phase 8 complete: read every Generate item above line by line, run ls/grep
  to verify each exists on disk, show output — Rule 36

```

---

## PHASE 9 — FILE + DOCUMENT SYSTEM COMMAND

```text
Build File Service.

Runtime: Fastify (for multipart upload throughput — see Technology Decision Map)

File Constraints (authoritative):
  Max file size per upload:
    Images (JPEG, PNG, WebP):     20 MB
    PDF documents:                100 MB
    CAD/Drawing files (DXF, DWG): 200 MB
    Video files:                  1,024 MB (1 GB) max — MIME types: video/mp4, video/quicktime, video/webm, video/x-msvideo, video/x-ms-wmv

  Allowed MIME types:
    Images:     image/jpeg, image/png, image/webp, image/gif
    Documents:  application/pdf
    CAD:        application/dxf, application/acad, image/vnd.dwg
                (Note: DWG parsing/viewing — PO decision required; store only until decided)
    Spreadsheets: application/vnd.ms-excel,
                  application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
    Archives:   application/zip (for bulk upload — extraction logic requires PO decision)

  NOT allowed: executable files (.exe, .sh, .bat, .js), BLOCKED at upload

  Antivirus scanning: ClamAV (no EP — implementation known)
    Implementation: ClamAV open-source scanner; scan every uploaded file before marking CLEAN; QUARANTINE on threat detected — infected files moved to cos-quarantine/{tenant_id}/ bucket (separate from cos-files; 30-day retention); emit file.document.quarantined.v1 event; SYSTEM_ADMIN notified; recovery is SYSTEM_ADMIN-only action via platform admin API; files auto-deleted after 30-day retention
    interface AntivirusHook { scan(fileId: UUID): Promise<ScanResult> }
    ScanResult: { clean: boolean, threat?: string }
    Upload flow: upload → store → scan (async) → update file status
    File status: PENDING_SCAN → CLEAN | QUARANTINED

  File retention:
    Default: indefinite (tenant-configurable — retention policies require PO decision)
    Soft delete: files are soft-deleted (deleted_at timestamp), not immediately removed
    Hard delete: 30 days after soft delete (deleted_at + 30 days) — automated cleanup job (Temporal scheduled workflow)

Storage:
  Backend: MinIO (S3-compatible)
  Bucket naming: cos-{tenant_id} (one bucket per tenant)
  Key structure: {year}/{month}/{file_id}/{original_filename}
  Signed URLs: GET signed URL TTL 1 hour (configurable per file type)
  Upload: POST to File Service → File Service streams to MinIO (no direct client upload)
  Tenant isolation: enforced via bucket-level policy in MinIO

Entities (PostgreSQL — schema: files):
  files:
    file_id           UUID PK
    tenant_id         UUID NOT NULL
    original_filename VARCHAR(512) NOT NULL
    stored_key        VARCHAR(1024) NOT NULL  — MinIO object key
    bucket_name       VARCHAR(255) NOT NULL
    mime_type         VARCHAR(255) NOT NULL
    file_size_bytes   BIGINT NOT NULL
    file_status       ENUM('PENDING_SCAN','CLEAN','QUARANTINED') DEFAULT 'PENDING_SCAN'
    uploaded_by       UUID NOT NULL
    uploaded_at       TIMESTAMPTZ DEFAULT now()
    deleted_at        TIMESTAMPTZ  — soft delete
    INDEX: (tenant_id, uploaded_by)
    INDEX: (tenant_id, file_status)

  file_metadata:
    metadata_id       UUID PK
    file_id           UUID FK NOT NULL
    tenant_id         UUID NOT NULL
    entity_type       VARCHAR(100)  — e.g. "site_report", "purchase_order"
    entity_id         UUID          — reference to owning entity
    metadata_key      VARCHAR(255) NOT NULL
    metadata_value    TEXT
    INDEX: (file_id)
    INDEX: (entity_type, entity_id)

APIs:
  POST /api/v1/files/upload                — upload file (multipart/form-data)
  GET  /api/v1/files/:fileId/url           — get signed download URL
  GET  /api/v1/files/:fileId               — get file metadata
  DELETE /api/v1/files/:fileId             — soft delete
  GET  /api/v1/files                       — list files (tenant-scoped, paginated)
  GET  /api/v1/files/by-entity/:entityType/:entityId — list files for entity

OpenSearch Indexing:
  Index name: files-{tenant_id}
  Indexed fields: original_filename, mime_type, entity_type, entity_id,
                  uploaded_by, uploaded_at, metadata key-value pairs
  Full-text search: on original_filename and metadata values

Generate:

- Fastify application with multipart plugin (@fastify/multipart)
- MinIO client integration (minio npm package)
- File validation middleware (size, MIME type, extension check)
- Antivirus hook (ClamAV integration — deferred to Phase 9 spec; do not implement until spec defines it)
- Signed URL generation service
- OpenSearch indexing on upload complete
- PostgreSQL migration files
- OpenAPI 3.1 spec
- Unit tests: validation, MIME type checking, signed URL generation
- Integration tests: full upload → MinIO → metadata → signed URL flow
- Kafka event producers:

    file.document.uploaded.v1   { file_id, tenant_id, entity_type, entity_id, mime_type }
    file.document.quarantined.v1 { file_id, tenant_id, threat_type }

Constraints:

- Before marking Phase 9 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```

---

## PHASE 10 — MOBILE OFFLINE ENGINE COMMAND

```text
Build offline-first mobile sync engine.

ARCHITECTURE DECISION (resolves previous contradiction — aligned with source §18.2):
  Source file §8.1 specifies BOTH React Native AND IndexedDB in same section.
  Source file §18.2 clarifies: "IndexedDB (PWA-native; IndexedDB for web/PWA builds)"
  — meaning Web App (apps/web/) uses IndexedDB for offline via next-pwa, not React Native.

  PLATFORM DECISION — FINAL (confirmed by product owner):
  ทุก role สามารถใช้ได้ทุก platform โดยเลือกตามอุปกรณ์:

  ┌──────────────────────────────┬─────────────────────────────────┐
  │ อุปกรณ์                        │ Platform                        │
  ├──────────────────────────────┼─────────────────────────────────┤
  │ Smartphone (online/offline)  │ React Native เท่านั้น              │
  │ Tablet/laptop                │ Web App (Next.js + next-pwa)    │
  └──────────────────────────────┴─────────────────────────────────┘

  Rules:
  - React Native: smartphone เท่านั้น — ทั้ง online และ offline
  - Web App:      tablet/laptop เท่านั้น — online AND offline (unified, no switching)
  - ไม่มี overlap ระหว่าง platform — แต่ละ device มี platform เดียว

  TWO PLATFORMS (ทุก role เข้าถึงได้ทุก platform ตาม device):

  Target A: React Native App (Expo) — smartphone only, online + offline
    Users:         ALL roles
    Device:        iOS/Android smartphone — ไม่รองรับ tablet browser
    Connectivity:  offline-first, sync เมื่อ online
    Local Storage: WatermelonDB 0.28.x with custom ExpoSQLiteAdapter
                   (expo-sqlite ~15.x underneath, WAL mode enabled)
                   NOT plain expo-sqlite — WatermelonDB provides observable queries,
                   lazy loading, and batch writes required for offline construction data

  Target B: Web App (Next.js + next-pwa) — tablet/laptop browser, online + offline
    Users:         ALL roles
    Device:        tablet/laptop browser — ไม่รองรับ smartphone
    Connectivity:  online AND offline — Service Worker handles both transparently
    Local Storage: IndexedDB via idb library (offline entity cache)
    Background sync: Background Sync API via Workbox — mutation replay on reconnect

  SCOPE IMPACT — สำคัญมาก:
    React Native ต้องรองรับ ALL roles ไม่ใช่แค่ on-site roles
    Screen set ครบทุก role — ระบุด้านล่าง

  Role-based navigation (React Native — authoritative, ทุก role):
    SITE_WORKER:
      Bottom nav: Home | Tasks | Report | Issues | Profile
      Workflows:  daily report, quick issue, task list, safety checklist

    SITE_ENGINEER:
      Bottom nav: Home | Reports | Issues | Inspections | Profile
      Workflows:  review reports, conflict resolution, inspection approval,
                  manpower overview, issue escalation
      Extra:      ConflictBadge, conflict review screen

    PROJECT_MANAGER:
      Bottom nav: Home | Projects | Procurement | Dashboard | Profile
      Workflows:  project status, procurement status, budget variance (read),
                  site report summary, issue triage

    EXEC role (source §4.2):
      Bottom nav: Home | Portfolio | Alerts | Reports | Profile
      Screens:
        Home:      KPI summary — active projects count, total budget vs actual,
                   open critical issues count (read-only, offline-capable)
        Portfolio: project list with status chips + budget variance badge
                   tap project → project health card (cost, schedule, issues)
        Alerts:    risk alerts feed — delay risk, budget overrun, critical issues
                   sorted by severity (CRITICAL → HIGH → MEDIUM)
        Reports:   AI-generated executive summaries per project (offline: last cached)
        Profile:   account settings, notification preferences
      Offline:    cached last-known data with "last updated X mins ago" timestamp
                  no write operations — EXEC is read-only on mobile

    FINANCE role (source §4.2):
      Bottom nav: Home | Payments | Budget | Invoices | Profile
      Screens:
        Home:      pending payment approvals count + overdue invoices count
        Payments:  list of payments pending approval — swipe right to approve,
                   tap to view PO reference and invoice detail (read offline)
        Budget:    budget vs actual vs committed per project (read-only)
                   variance badge: green < 5%, amber 5-10%, red > 10%
        Invoices:  invoice list — filter by status (Received/Verified/Approved)
                   tap to view detail, add note
        Profile:   account settings
      Offline:    all lists cached, approve action queued and synced when online

    PROCUREMENT_OFFICER / PROC_MANAGER roles (source §4.2):
      Bottom nav: Home | RFQs | Orders | Deliveries | Profile
      Screens:
        Home:      action required — RFQs closing soon, POs awaiting acknowledgment,
                   overdue deliveries count
        RFQs:      RFQ list with status chips (Draft/Published/Closed/Evaluated)
                   PROC_MANAGER: tap → approve/cancel RFQ
                   PROCUREMENT_OFFICER: tap → view quotation comparison
        Orders:    PO list with delivery status timeline
                   tap → view line items, expected delivery date
        Deliveries:record delivery receipt — photo capture + quantity confirmation
                   works offline, syncs when online
        Profile:   account settings
      Offline:    lists cached, delivery recording works fully offline

    RBAC enforcement: JWT role claim → bottom nav + screen access
    Shared components: PhotoCapture, VoiceNoteButton, OfflineBanner, SyncStatusBar

  React Native App Stack:
    Framework:      React Native + Expo (managed workflow)
    Navigation:     Expo Router (file-based, role-aware routing)
    State:          Zustand + React Query
    Local DB:       WatermelonDB 0.28.x with custom ExpoSQLiteAdapter
                   (expo-sqlite ~15.x underneath, WAL mode enabled)
                   sync_queue infrastructure uses expo-sqlite directly (no WatermelonDB)
    Media cache:    expo-file-system for offline photo queue
    Background sync: expo-background-fetch + expo-task-manager
    Network detect: @react-native-community/netinfo

  Web App Stack (Target B — apps/web/ directory):
    Framework:      Next.js + next-pwa plugin (Workbox-based)
    Local Storage:  IndexedDB via idb library (typed wrapper)
    State:          Zustand + React Query
    Background sync: Service Worker + Background Sync API
    Offline pages:  precached via Workbox during build
    Target users:   ALL roles — tablet/laptop browser ONLY
    Device:         NOT smartphone (product owner confirmed)
    Connectivity:   online + offline — no app switching; Service Worker handles transparently
    Sync engine:    same REST API endpoints as React Native (shared server-side)

  Generate (React Native):
    - expo-sqlite schema setup and migration utility
    - SyncManager class with full queue processing logic
    - ConflictHandler implementing three resolution strategies from Phase 6
    - DeltaSyncClient (Axios-based, handles auth token injection)
    - BackgroundSyncTask (expo-task-manager registration)
    - PhotoUploadQueue with chunked upload support
    - React hooks: useSyncStatus(), usePendingCount(), useConflicts()
    - Zustand store slices: syncStore, offlineStore
    - Unit tests: SyncManager, ConflictHandler, DeltaSyncClient
    - UI components: SyncStatusBar, ConflictBadge, OfflineBanner

  Generate (Web App — apps/web/):
    - next-pwa configuration with Workbox strategies
    - IndexedDB schema using idb library (typed, versioned)
    - PWA sync service using Background Sync API + IndexedDB queue
    - Service worker registration in Next.js _app.tsx
    - Offline fallback pages
    - Install prompt component (beforeinstallprompt handler)
    - Web authentication: login (Path A SMS OTP + Path B email/password), MFA challenge,
      session/refresh, role-based post-login routing — per spec §20.6 (no new auth mechanism)
    - Web operational pages for ALL roles (full operational client, not dashboard-only) —
      build the per-role page inventory in spec §20.7 (Executive, PM, Procurement, Finance,
      Site Engineer, Site Worker, Safety Officer, Tenant Admin, Viewer, CRM/Sales Manager
      (basic CRM UI — MVP per ADR-029; the §21.6 UI-excluded note was overridden); SYSTEM_ADMIN
      uses the separate /admin panel §20.4)
    - Web app shell: role-filtered navigation, SSE notification bell, offline/sync indicator,
      th/en language switcher, data-table list views (spec §20.6.2)
    - CRM module (ADR-029, retrofitted — no dedicated phase): `crm` schema
      (crm.leads / crm.opportunities / crm.contacts); Customer = finance.customers (convert writes
      there). APIs (spec §14 CRM, docs/api/crm.openapi.yaml):
        GET|POST /api/v1/crm/leads · GET|POST /api/v1/crm/opportunities
        PATCH /api/v1/crm/opportunities/:id/convert · GET|POST /api/v1/crm/contacts
        GET /api/v1/crm/customers
      RBAC: read = EXECUTIVE + CRM_SALES_MANAGER; write = CRM_SALES_MANAGER (+ TENANT_ADMIN).

Local SQLite Schema (mirrors server entities for offline use):
  sync_queue:
    id            INTEGER PK AUTOINCREMENT
    entity_type   TEXT NOT NULL
    entity_id     TEXT NOT NULL  — UUID as string
    operation     TEXT NOT NULL  — CREATE | UPDATE
    payload       TEXT NOT NULL  — JSON string
    status        TEXT DEFAULT 'PENDING'  — PENDING | SYNCING | SYNCED | FAILED
    retry_count   INTEGER DEFAULT 0
    client_submitted_at TEXT NOT NULL  — ISO 8601
    last_attempt_at TEXT
    error_message TEXT

  local_site_reports:
    (mirrors server schema — subset of fields needed offline)
    report_id     TEXT PK
    project_id    TEXT NOT NULL
    report_date   TEXT NOT NULL
    summary       TEXT
    status        TEXT DEFAULT 'DRAFT'
    sync_status   TEXT DEFAULT 'PENDING'  — PENDING | SYNCED | CONFLICT

  local_issues:
    (mirrors server schema — subset of fields needed offline)
    ...

  local_photos:
    photo_id      TEXT PK
    entity_type   TEXT NOT NULL
    entity_id     TEXT NOT NULL
    local_path    TEXT NOT NULL  — expo-file-system URI
    upload_status TEXT DEFAULT 'PENDING'
    server_file_id TEXT         — populated after upload

Sync Engine Architecture:
  SyncManager (core class):
    - processQueue(): reads PENDING items from sync_queue, sends to server
    - markSynced(id): updates status to SYNCED
    - markFailed(id, error): increments retry_count; after 5 retries → calls handleExhaustion(item)
    - handleExhaustion(item): entity-specific behavior per spec §17.2 —
        safety_incidents:      publish to platform.sync.exhausted → tenant admin review queue;
                               push alert to PM and Safety Officer; preserve on device
        workforce_attendance:  publish to platform.sync.exhausted → tenant admin review queue;
                               push alert to PM; preserve on device
        inspection_results:    publish to platform.sync.exhausted → tenant admin review queue;
                               push alert to PM; preserve on device
        material_consumption:  publish to platform.sync.exhausted → tenant admin review queue;
                               preserve on device
        task_progress_updates: discard sync attempt; notify user in-app; preserve on device
        site_report_drafts:    discard sync attempt; notify user in-app; preserve on device
        equipment_usage_logs:  discard sync attempt; preserve on device
    - Tenant admin review queue: server-side queue (platform schema) visible to TENANT_ADMIN;
                                 records never deleted from device until synced or admin-resolved
    - handleConflict(item, serverResponse): updates local record with conflict_status

  Conflict Handling (client-side):
    - ACCEPTED: update local record to SYNCED
    - CONFLICT_FLAGGED: update local record sync_status to CONFLICT,
                        show badge in UI for user awareness
    - CONFLICT_REJECTED: replace local payload with server version,
                         show notification to user

  Delta Sync:
    - Server provides: GET /api/v1/sync/delta?since={timestamp}&entity_types[]=...
    - Client requests delta on foreground resume and after background sync
    - Delta response: { updated: [...], deleted: [...], server_timestamp }
    - Client applies delta to local SQLite

  Background Sync:
    - Uses expo-background-fetch (fires every 15 min minimum — OS-imposed limit)
    - On sync: process up to 20 items from queue
    - Photos: uploaded separately via expo-file-system chunked upload
    - Background sync respects battery saver mode (skip if battery < 15%)

  Media Cache:
    - Photos taken offline: stored in expo-file-system cache directory
    - Upload queue: processed in order, 1 at a time on background sync
    - Upload target: File Service /api/v1/files/upload via multipart
    - Retry: up to 3 times per photo, then mark as UPLOAD_FAILED

Constraints:

- Before marking Phase 10 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```

---

## PHASE 11 — AI FOUNDATION COMMAND

```text
Build AI foundation layer.

AI Provider Decision:
  LLM Provider: OpenAI GPT-4o (primary) / gpt-4o-mini (cost fallback)
    LLMProvider (implement via interface — never call OpenAI SDK directly)
    Interface (Python):
      class LLMProvider(ABC):
        @abstractmethod
        async def complete(
          self, messages: list[Message], model_hint: str
        ) -> LLMResponse: ...
    model_hint mapping: "report-generation" → gpt-4o, "summarization" → gpt-4o-mini
    Consuming: LLM Gateway — ทุก AI call ผ่าน interface นี้เสมอ
    Swap path: Claude API (cloud fallback) + Ollama (on-premise); drop-in replacement via LLMProvider interface (see spec §22.6)

  Embedding Model: OpenAI text-embedding-3-small
    Dimensions: 1536
    EmbeddingProvider (implement via interface)
    Interface (Python):
      class EmbeddingProvider(ABC):
        @abstractmethod
        async def embed(self, texts: list[str]) -> list[list[float]]: ...
        @property
        @abstractmethod
        def dimensions(self) -> int: ...  # returns 1536
    Consuming: Embedding Worker — ทุก embedding call ผ่าน interface นี้
    Embedding storage: pgvector (vector(1536)) + OpenSearch k-NN index

  LangChain: langchain>=0.3, langchain-openai>=0.2 (langgraph: candidate only — LAYER-C-001 decision pending)
    LangChainProviderConfig
    Interface: { getProviderPackage(): str, getModelClass(): type }

  OCR Engine: pytesseract + pdf2image (open-source, self-hosted) for basic PDF extraction
    Cloud OCR: AWS Textract AnalyzeDocument API (FORMS feature) for invoice photo extraction; IAM IRSA auth (see spec §22.6)
    High-accuracy extraction: OCR text → LLM Gateway document-extraction (gpt-4o) for layout-variable/handwritten docs (RESOLVED — see spec §22.7 OCR-001)

AI Services (FastAPI — all in ai/ directory):

1. LLM Gateway (ai-gateway):

   Purpose: single entrypoint for all LLM calls from other services
   Responsibilities:
     - LLM client management via LLMProvider interface (no direct SDK calls)
     - Model routing: route to model_hint based on task type (RESOLVED — two-tier
       configurable routing table; store in env/YAML, never hardcode model names)
       Tier POWERFUL (gpt-4o):   report-generation, risk-analysis, document-extraction
       Tier FAST (gpt-4o-mini):  summarization, classification, autocomplete
       Routing evolution: static tiering (now) → cascade → predictive (RESOLVED — see spec §22.7 RT-001)
     - Token usage tracking (persisted to PostgreSQL for billing/monitoring)
     - Prompt template rendering (Jinja2 templates from ai/prompts/)
     - Response caching (Redis, TTL configurable per template)
     - Gateway resilience: provider fallback/failover, per-tenant token budget enforcement, virtual keys (RESOLVED — see spec §22.7 GW-001)
     - RAG Pipeline (LangChain chain — implemented inside ai-gateway, not a separate service;
       see spec §22-ai-architecture §22.7 LangChain Configuration):
         Retrieval: hybrid search (keyword via OpenSearch + vector via pgvector), fused via Reciprocal Rank Fusion (RRF) (RESOLVED — see spec §22.7 RAG-001)
         Reranking: sentence-transformers cross-encoder/ms-marco-MiniLM-L-6-v2; activate when RAG p95 relevance < 0.7
         Context assembly: top-k=5 chunks, max context 4000 tokens
         Chunking strategy:
           - Documents: recursive character splitter, chunk_size=500, overlap=100
           - Site reports: treat each report as one chunk (typically <500 tokens)
         Chain config: stored in ai/chains/ as YAML per chain type
         Interface: LangChainProviderConfig.buildChain(chainType, tenantId): Chain
   API: POST /api/v1/ai/completions  { template_name, variables, model_hint? }
        POST /api/v1/rag/query       { query, tenant_id, entity_types?, top_k? }

2. Embedding Worker (ai-embedding-worker):

   Purpose: generate and store vector embeddings
   Responsibilities:
     - Embed text documents via EmbeddingProvider interface
     - Store in pgvector: vector column dimensions set per provider config
     - Store in OpenSearch: index to {tenant_id}-embeddings index (k-NN)
     - Batch processing: Kafka consumer on file.uploaded and report.submitted events
   API: POST /api/v1/embeddings/generate  { text, entity_type, entity_id, tenant_id }

3. OCR Pipeline (ai-ocr-pipeline):

   Input: file_id (fetch from File Service signed URL)
   Process: pdf2image → pytesseract → extracted text → embedding worker
   Supported: PDF (scanned), image files (JPEG, PNG)
   Output: { file_id, extracted_text, confidence_score }
   API: POST /api/v1/ocr/process  { file_id, tenant_id }
   Triggered by: Kafka consumer on file.uploaded (mime_type = PDF or image)

Token Tracking Schema (PostgreSQL — schema: ai):
  ai_usage_logs:
    log_id          UUID PK
    tenant_id       UUID NOT NULL
    service_caller  VARCHAR(100) NOT NULL  — which service requested
    template_name   VARCHAR(255)
    model_used      VARCHAR(100) NOT NULL
    prompt_tokens   INTEGER NOT NULL
    completion_tokens INTEGER NOT NULL
    total_tokens    INTEGER NOT NULL
    latency_ms      INTEGER
    created_at      TIMESTAMPTZ DEFAULT now()
    INDEX: (tenant_id, created_at)

Prompt Template Management:
  Storage: ai/prompts/ directory, Jinja2 .j2 files, version-controlled
  Naming: {phase}-{use-case}-v{version}.j2 (e.g. report-summary-v1.j2)
  No hardcoded prompts in source code — all via template files
  Template variables: always typed via Pydantic model

Generate:

- FastAPI application for each AI service (ai-gateway, ai-embedding-worker, ai-ocr-pipeline)
- LLMProvider stub + interface (StubLLMProvider raises NotImplementedError)
- EmbeddingProvider stub + interface
- LangChainProviderConfig stub + interface
- LLM Gateway: routing table config (YAML-based, no hardcoded model names)
- Embedding Worker: pgvector schema with vector(1536) — dimensions from text-embedding-3-small
- Hybrid RAG retrieval service (keyword + vector, provider-agnostic)
- Chunking utility (LangChain text splitter)
- OCR pipeline with pytesseract (open-source, runs without provider decision)
- Token usage logger (middleware on every LLM call — logs model_used as string)
- Prompt template loader (Jinja2 — provider-agnostic)
- Redis response cache for LLM Gateway
- PostgreSQL migration for ai_usage_logs (Prisma — add to backend/prisma/migrations/ consistent with all other schemas)
- Unit tests: chunking, RAG retrieval logic, OCR, stub provider behavior
- Integration tests: full RAG query pipeline using StubLLMProvider (no real API call)

MLOps Stack (from source §19.4 — separate Phase 23, referenced here):
  MLflow 2.x          — experiment tracking, model registry
  Apache Airflow 2.x  — training pipeline orchestration
  Kubeflow Pipelines  — Kubernetes-native ML workflows
  Feast               — feature store
  Weights & Biases    — experiment monitoring (RESOLVED: W&B Cloud, wandb.ai; source: spec §22-ai-architecture §22.6)
  Full MLOps implementation: Phase 23
  Phase 11 generates: interfaces for model versioning and deployment
    ModelRegistry — interface for MLflow model registration post-training
    FeatureStore — interface for Feast feature retrieval in inference

AI Operating Modes (from source §22.3 — all three modes are specified):
  Mode A: Assistive — AI helps users compose content (active in Phase 12)
  Mode B: Advisory  — AI recommends actions (active in Phase 12)
  Mode C: Autonomous — AI executes low-risk workflows automatically
    Autonomous mode is SPECIFIED in source but NOT implemented in Phase 11–12.
    Autonomous mode: ONLY for notifications + report generation; financial actions require human approval (see spec §22.6)
      Low-risk (autonomous): send notifications, generate report drafts, flag risks
      High-risk (human required): PO approval, budget changes, workflow state transitions
      HIGH-RISK PROHIBITION: autonomous mode must NEVER trigger financial transactions,
        status transitions requiring human approval, or data deletions
      Interface: { execute(workflowType: string, payload: object,
                           tenantId: string): Promise<AutonomousResult> }

Stubs in Phase 11 (generate stub, do NOT implement yet):
  CloudOCRProvider:
    Trigger:  invoice photo OCR pipeline is ready to activate
    Interface: { extract(fileUrl: string): Promise<OCRResult> }
    OCRResult: { text: string, fields: Record<string, string>, confidence: float }
    Candidates: AWS Textract, Google Document AI, Azure Form Recognizer
    Note:     provider RESOLVED — AWS Textract (AnalyzeDocument API, FORMS feature)
              Auth: IAM role (EKS IRSA); source: spec §22-ai-architecture §22.6

  AlternativeLLMProvider:
    Trigger:  need to swap from OpenAI (cost, latency, compliance, or availability)
    Interface: same as LLMProvider — drop-in, zero refactor
    Candidates: Anthropic Claude (claude-sonnet-4-6), Azure OpenAI, Ollama (self-hosted)
    Note:     LLMProvider interface was designed for this swap — no code change required
              outside of identity.module.ts DI token swap

Constraints:

- Before marking Phase 11 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```

---

## PHASE 12 — AI REPORT ASSISTANT COMMAND

```text
Build AI Report Assistant.

Depends on: Phase 11 (AI Foundation) — must be complete first.

Hallucination Guard (mandatory — all AI outputs must pass through):
  Implementation: output validation layer before returning to client
  Checks:
    1. Length check: summary must be 50–500 words
    2. Source attribution: every factual claim must be traceable to input context
       (implementation: require LLM to cite source in structured output)
    3. Confidence score: LLM returns confidence field (0.0–1.0) via structured output
    4. Low confidence threshold: if confidence < 0.7 → return fallback response
       Fallback response: { status: "LOW_CONFIDENCE", summary: null,
                            message: "Insufficient data for reliable summary",
                            raw_data_available: true }
    5. Contradiction check: if summary contains data not in input context,
       flag as POTENTIAL_HALLUCINATION (logged, not returned to user)

  Confidence score implementation:
    Prompt instructs LLM to output JSON with:
    {
      "summary": "...",
      "confidence": 0.85,   — 0.0 to 1.0
      "data_points_used": 12,
      "data_gaps": ["manpower data missing for 3 days"]
    }
    Parse confidence from structured output — do NOT ask LLM to estimate confidence
    in a separate call (latency cost)

Capabilities:
  1. Daily Site Report Summary
     Input: site_reports (last 7 days), issues (open), manpower_logs
     Output: { summary, key_issues, manpower_trend, confidence, data_gaps }
     Prompt template: report-daily-summary-v1.j2

  2. Procurement Status Summary
     Input: rfqs (open), pos (pending delivery), invoices (overdue)
     Output: { summary, overdue_count, risk_items, confidence, data_gaps }
     Prompt template: report-procurement-status-v1.j2

  3. Executive Summary
     Input: project_health (from Finance), procurement_summary, site_summary
     Output: { executive_summary, risk_flags, recommendations, confidence }
     Prompt template: report-executive-v1.j2

  4. Delay Risk Detection
     Input: project end_date, PM-entered estimated_completion_date (nullable DATE field on project entity —
            PM updates via PATCH /api/v1/projects/:id; if null, falls back to planned end_date)
            procurement delivery dates, open critical issues
     Output: { delay_risk_level: ENUM(LOW,MEDIUM,HIGH,CRITICAL),
               risk_factors: string[],
               confidence,
               disclaimer: "AI-generated estimate — verify with project schedule" }
     Risk level thresholds (days of projected delay): LOW=1-2, MEDIUM=3-6, HIGH=7-13, CRITICAL=14+

APIs:
  POST /api/v1/ai/reports/site-summary        { project_id, date_range }
  POST /api/v1/ai/reports/procurement-summary { project_id }
  POST /api/v1/ai/reports/executive-summary   { project_id }
  POST /api/v1/ai/reports/delay-risk          { project_id }
  GET  /api/v1/ai/reports/history             { project_id }  — past generated reports

Orchestration:
  Framework: plain Python sequential pipeline (no Agent Orchestrator — Layer A scope;
             LangGraph deferred to LAYER-C-001 decision for Layer C autonomous AI;
             see docs/specifications/22-ai-architecture.md §22.3)
  Step 1: RAG retrieval (via Phase 11 RAG API)
  Step 2: Context assembly and token budget check
  Step 3: LLM generation with structured output (JSON mode)
  Step 4: Hallucination guard validation
  Step 5: Persist report to database
  Step 6: Return to caller

  ai_generated_reports:
    report_id       UUID PK
    tenant_id       UUID NOT NULL
    project_id      UUID NOT NULL
    report_type     ENUM('SITE_SUMMARY','PROCUREMENT_SUMMARY',
                         'EXECUTIVE_SUMMARY','DELAY_RISK') NOT NULL
    content         JSONB NOT NULL
    confidence      DECIMAL(4,3)
    model_used      VARCHAR(100) NOT NULL
    tokens_used     INTEGER NOT NULL
    generated_at    TIMESTAMPTZ DEFAULT now()
    generated_by    UUID  — user who requested
    INDEX: (project_id, report_type, generated_at DESC)

Generate:

- LangGraph orchestration chain for each report type
- HallucinationGuard class with all 5 checks above
- Structured output Pydantic models for each report type
- Prompt templates (ai/prompts/): one per report type
- Report persistence service
- PostgreSQL migration for ai_generated_reports
- APIs (FastAPI routes on ai-gateway)
- Unit tests: HallucinationGuard (test each check independently)
- Integration tests: full generation pipeline using StubLLMProvider (no real API call)
- Token budget enforcement: max 4000 tokens input context, 1000 tokens output

Constraints:

- All AI outputs are advisory — no autonomous actions to other services
- Hallucination guard is mandatory — never skip
- Confidence score must accompany every report
- Fallback response must be graceful — never surface raw LLM errors to user

Stubs in Phase 12 (generate stub, do NOT implement yet):
  CrossEncoderReranking:
    Trigger:  retrieval quality insufficient — when RAG top-k results are irrelevant
    Interface: { rerank(query: string, documents: Document[]): RankedDocument[] }
    Candidates: cohere-rerank, bge-reranker, cross-encoder/ms-marco
    Note:     model RESOLVED — sentence-transformers cross-encoder/ms-marco-MiniLM-L-6-v2
              Trigger: activate when RAG p95 relevance < 0.7 over 7-day window
              source: spec §22-ai-architecture §22.6

- Before marking Phase 12 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36
```

---

## PHASE 13 — KNOWLEDGE GRAPH COMMAND

```text
Build Construction Knowledge Graph.

Neo4j Sync Strategy (authoritative):
  Method: Event-Driven Sync via Kafka (NOT CDC, NOT batch ETL)
  Implementation: kg-ingestion-worker (Go) consumes Kafka events from all services
  Consistency model: Eventually Consistent
    - Graph may lag PostgreSQL by seconds to minutes under normal load
    - Graph is NOT the source of truth — PostgreSQL is authoritative
    - Graph is for traversal and relationship queries only

  Consumer groups for kg-ingestion-worker:
    kg-consumer-group: subscribes to all cross-service events
    Topics consumed (regex): ^[^.]+\.(construction|procurement|site|finance)\..*
      (cross-tenant wildcard — all tenant-scoped topics for these domains;
       see docs/specifications/07-multi-tenant-architecture §7.3 and
       docs/specifications/15-event-driven-workflow §15.6)
  Go Kafka client: github.com/IBM/sarama (pure Go; see docs/specifications/32-implementation-specifications)

  Conflict handling: last-event-wins (graph is derived, not authoritative)
  Replay: on kg-worker restart, replay from last committed offset
  Full rebuild: triggered manually via admin API — replays all events from beginning
    (needed after schema migration or bug fix)

Neo4j Node Labels and Properties:
  (:Project)
    project_id:   String (UUID)
    tenant_id:    String
    project_name: String
    status:       String
    budget_amount: Float

  (:Task)
    task_id:     String  — maps to boq_item_id (BOQ line items are the authoritative task source in Phase 13)

  (:Material)
    material_id:  String (maps to boq_item_id)
    description:  String
    unit:         String

  (:Vendor)
    vendor_id:    String
    vendor_name:  String
    tenant_id:    String

  (:Inspection)
    inspection_id: String
    status:        String
    inspected_at:  DateTime

  (:Invoice)
    invoice_id:    String
    amount:        Float
    currency:      String
    status:        String

  (:Contract)
    contract_id:   String  — maps to po_id of APPROVED Purchase Orders (APPROVED PO = contractual agreement; no separate Contract module needed)

  (:Delay)
    delay_id:    String (UUID — maps to event_id from CloudEvents envelope; MERGE key)
    project_id:  String (UUID)
    task_id:     String (UUID, nullable — may be project-level only)
    delay_days:  Integer
    cause:       String (enum: PROCUREMENT/WEATHER/WORKFORCE/EQUIPMENT/SCOPE_CHANGE/OTHER)
    detected_by: String (enum: AI_FORECAST/MANUAL_REPORT)
    severity:    String (enum: LOW/MEDIUM/HIGH/CRITICAL — LOW=1-2d, MEDIUM=3-6d, HIGH=7-13d, CRITICAL=14+d)
    tenant_id:   String
    occurred_at: DateTime
    Source: construction.delay.detected.v1 payload (see docs/specifications/32-implementation-specifications §32.4)

Relationships:
  (:Project)-[:HAS_MATERIAL]->(:Material)
  (:Material)-[:SUPPLIED_BY]->(:Vendor)
  (:Material)-[:DELIVERED_BY]->(:Vendor)    — fulfillment relationship (source: procurement.delivery.received)
  (:Vendor)-[:SUBMITTED]->(:Invoice)
  (:Invoice)-[:BELONGS_TO]->(:Project)
  (:Inspection)-[:VALIDATES]->(:Project)
  (:Project)-[:HAS_INSPECTION]->(:Inspection)
  (:Delay)-[:IMPACTS]->(:Project)           — source: delay.detected event (delay_days, cause, severity)
  (:Delay)-[:IMPACTS]->(:Task)              — task-level delay (nullable — may be project-level only)

  Note: DEPENDS_ON and USES relationships for Tasks derive from BOQ item hierarchy
        (task_id = boq_item_id; BOQ parent-child = DEPENDS_ON)

Additional graph queries enabled by new relationships:
  6. Delivery chain per vendor per project (DELIVERED_BY traversal)
  7. All delays impacting a project (Delay → IMPACTS → Project)
  8. Procurement risk propagation: if vendor delayed → which tasks/projects at risk?
     (traverse: Vendor → DELIVERED_BY ← Material ← HAS_MATERIAL ← Project)

Graph Queries (required):
  1. All vendors supplying to a project (traverse: Project → Material → Vendor)
  2. All invoices for a vendor on a project
  3. All inspections for a project (pass/fail summary)
  4. Material supply chain for a project
  5. Vendor relationship map (which vendors share projects)

Graph APIs (NestJS thin API — delegates to Neo4j):
  GET /api/v1/graph/projects/:projectId/vendors
  GET /api/v1/graph/projects/:projectId/supply-chain
  GET /api/v1/graph/projects/:projectId/inspections
  GET /api/v1/graph/vendors/:vendorId/projects
  GET /api/v1/graph/vendors/:vendorId/invoices

Generate:

- kg-ingestion-worker (Go): Kafka consumer, Neo4j writer
- Neo4j Cypher queries for all node/relationship types
- Relationship mapper (event payload → Cypher MERGE statement)
- Graph query service (NestJS — for graph APIs)
- Neo4j schema constraints (uniqueness on {label}.{id} + tenant_id)
- Full rebuild admin endpoint
- Unit tests: Kafka event → Cypher transformation
- Integration tests: full ingest pipeline with Neo4j test container
- OpenAPI 3.1 spec: docs/api/graph.openapi.yaml (per spec §14.3 canonical table — Knowledge Graph, MVP Phase 13)


Constraints:

- Before marking Phase 13 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```

---

## PHASE 14 — ANALYTICS + DASHBOARD COMMAND

```text
Build Analytics Service and dashboards.

Performance SLA (authoritative — all dashboard queries must meet these):
  Executive Dashboard:   P95 < 3 seconds
  PM Dashboard:          P95 < 2 seconds
  Data freshness:        15 minutes (acceptable lag from transaction to dashboard)
  Real-time metrics:     < 30 seconds lag (for critical alerts only)

ClickHouse Strategy:
  Version: ClickHouse 24.x
  Data ingestion: Kafka → ClickHouse via Kafka engine tables (native integration)
  Materialized views: pre-aggregate metrics at ingestion time
    (NOT query-time aggregation — ensures P95 SLA is met)
  Table engine: ReplacingMergeTree for fact tables, AggregatingMergeTree for aggs
  Partitioning: by toYYYYMM(event_date) for all fact tables
  TTL: raw events retained 2 years, aggregated tables indefinite

ClickHouse Tables (analytics schema):
  project_cost_daily (AggregatingMergeTree):
    tenant_id:        UUID
    project_id:       UUID
    event_date:       Date
    committed_amount: AggregateFunction(sum, Decimal(19,4))
    actual_amount:    AggregateFunction(sum, Decimal(19,4))
    budget_amount:    Decimal(19,4)  — from project_budgets snapshot

  procurement_activity_daily (AggregatingMergeTree):
    tenant_id:        UUID
    project_id:       UUID
    event_date:       Date
    po_count:         AggregateFunction(count, UInt32)
    rfq_count:        AggregateFunction(count, UInt32)
    invoice_count:    AggregateFunction(count, UInt32)
    overdue_invoice_count: AggregateFunction(count, UInt32)

  site_activity_daily (AggregatingMergeTree):
    tenant_id:        UUID
    project_id:       UUID
    event_date:       Date
    report_count:     AggregateFunction(count, UInt32)
    issue_open_count: AggregateFunction(sum, Int32)
    inspection_fail_count: AggregateFunction(count, UInt32)
    manpower_total:   AggregateFunction(sum, Int32)

Caching Strategy:
  Layer 1: Redis (TTL 5 minutes) — for dashboard API responses
  Layer 2: ClickHouse materialized views — for aggregation queries
  Cache invalidation: event-driven (on relevant Kafka event, clear Redis cache key)
  Cache key format: analytics:{tenant_id}:{dashboard_type}:{project_id}:{date_range}

Dashboards:
  Executive Dashboard (data from project_cost_daily, procurement_activity_daily):
    - Budget utilization % per project (actual/budget)
    - Projects at risk (variance > 10% from budget — threshold is configurable)
    - Procurement overdue invoices count
    - Active projects count by status

  PM Dashboard (data from site_activity_daily, procurement_activity_daily):
    - Daily manpower trend (last 30 days)
    - Open issues by severity
    - Inspection pass rate
    - RFQ pending count, PO delivery overdue count

APIs (NestJS Analytics Service, backed by ClickHouse + Redis):
  GET /api/v1/analytics/executive?projectIds[]=...&dateRange=...
  GET /api/v1/analytics/pm/:projectId?dateRange=...
  GET /api/v1/analytics/projects/:projectId/cost-trend
  GET /api/v1/analytics/projects/:projectId/procurement-trend
  GET /api/v1/analytics/projects/:projectId/site-trend

Generate:

- ClickHouse Docker Compose service
- Kafka engine table definitions (ClickHouse DDL)
- Materialized view DDL for all aggregation tables
- Analytics NestJS service with ClickHouse client (clickhouse-js)
- Redis cache layer around all analytics queries
- Dashboard API controllers (one per dashboard type)
- Frontend Next.js dashboard components (use Recharts)
- Unit tests: cache logic, aggregation query building
- Integration tests: Kafka → ClickHouse → API flow
- Load tests: verify P95 < 3s SLA under 100 concurrent dashboard loads
- OpenAPI 3.1 spec: docs/api/analytics.openapi.yaml (per spec §14.3 canonical table — Analytics, MVP Phase 14)


Constraints:

- Before marking Phase 14 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```

---

## PHASE 15 — OBSERVABILITY COMMAND

```text
Build observability stack.

Tools:
  Metrics:  Prometheus 2.x + Grafana 10.x
  Logs:     Loki 3.x + Grafana
  Tracing:  Jaeger 1.x + OpenTelemetry Collector
  SDK:      OpenTelemetry (@cos/tracing package from Phase 1)

Metrics to instrument (mandatory per service):
  http_request_duration_seconds (histogram, labels: service, method, path, status)
  http_requests_total (counter, labels: service, endpoint, method, status_code, tenant_tier) — spec §31.3
  kafka_messages_produced_total (counter, labels: service, topic)
  kafka_messages_consumed_total (counter, labels: service, topic, consumer_group)
  kafka_consumer_lag (gauge)
  kafka_dlq_depth (gauge, alert: > 0)
  db_query_duration_seconds (histogram)
  ai_token_usage_total (counter, labels: model, template)
  ai_request_duration_seconds (histogram, labels: model)
  sync_queue_depth (gauge — mobile sync queue)
  file_upload_bytes_total (counter)
  workflow_started_total (counter, labels: workflow_type) — spec §31.3
  workflow_completed_total (counter, labels: workflow_type, outcome) — spec §31.3
  approval_pending_duration_seconds (histogram, labels: workflow_type) — spec §31.3
  llm_request_duration_seconds (histogram, labels: model) — spec §31.3 AI metrics
  llm_tokens_consumed_total (counter, labels: tenant_id, model) — spec §31.3 AI metrics
  rag_retrieval_duration_seconds (histogram) — spec §31.3 AI metrics
  ocr_pages_processed_total (counter, labels: tenant_id) — spec §31.3 AI metrics
  notification_delivery_duration_seconds (histogram, labels: channel, notification_type) — spec §31.3; Notification Service
  notification_pending_total (gauge, labels: notification_type) — spec §31.3; Notification Service polls PostgreSQL every 30s
  active_sessions_total (gauge, labels: tenant_id) — spec §31.3; Identity Service (JWT issue/expiry)
  storage_used_bytes (gauge, labels: tenant_id, storage_type) — spec §31.3; backend telemetry job (postgresql|s3)
  tenant_isolation_check_result (gauge, labels: check_name) — spec §31.3; synthetic probe CronJob (spec §30.6)

Alerting rules (mandatory):
  KafkaDLQNonEmpty:            kafka_dlq_depth > 0 for 5 min
  APIHighErrorRate:            http_requests_total{status=~"5.."} / total > 1% for 5 min
  APIHighLatency:              http_request_duration_seconds P99 > 5s for 5 min
  DBHighQueryTime:             db_query_duration_seconds P95 > 1s for 5 min
  AnalyticsSLABreach:          http_request_duration_seconds{path="/api/v1/analytics/*"} P95 > 3s
  AIHighTokenUsage:            ai_token_usage_total > 80% of tenant monthly quota — alert FINANCE and TENANT_ADMIN (see spec §31-monitoring-observability)
  ServiceDown:                 pod not ready for > 2 min — page on-call; severity: critical (spec §31.7)
  DBConnectionExhausted:       PostgreSQL connection pool > 95% — page on-call; severity: critical (spec §31.7)
  KafkaConsumerLagCritical:    consumer lag > 50,000 messages on any topic — page on-call; severity: critical (spec §31.7)
  SafetyNotificationFailed:    notification_pending_total{notification_type="safety"} > 0 — page security; severity: critical (spec §31.7)
  TenantIsolationBreach:       tenant_isolation_check_result == 0 (synthetic probe CronJob every 5 min — spec §30.6) — page security lead immediately; severity: critical (spec §31.7)
  DiskUsageHigh:               any PV > 80% full — Slack notification; severity: warning (spec §31.7)
  MemoryPressure:              pod memory > 85% of limit for > 10 min — Slack notification; severity: warning (spec §31.7)

Distributed Tracing:
  All NestJS services: trace every HTTP request, Kafka produce/consume, DB query
  FastAPI services: trace every HTTP request, LLM provider API call, embedding call
  Go workers: trace every Kafka consume iteration and DB write
  Trace propagation: W3C TraceContext headers on HTTP, Kafka headers for async
  Sampling: 1% of requests in production (100% for errors — tail-based sampling; source: spec §31.5 — production rate corrected from 10% staging rate to 1% production rate)

Grafana Dashboards (required):
  Implementation dashboards (technology-based — spec §31.8):
  - Per-service: latency P50/P95/P99, error rate, throughput
  - Kafka: consumer lag per group, DLQ depth, throughput
  - Database: connection pool, slow query count, index hit rate
  - AI: token usage per tenant, latency per model, error rate
  - Infrastructure: CPU, memory, disk per pod (Kubernetes metrics)
  Audience dashboards (purpose-based — spec §31.8):
  - Platform Overview: service health matrix (all pods), request rate/error rate, active tenants, Kafka lag summary
  - Tenant Operations (per tenant): API volume/latency (Prometheus), active users (active_sessions_total gauge), storage usage (storage_used_bytes gauge), AI token quota (llm_tokens_consumed_total)
  - Business Metrics (internal): daily active tenants (PostgreSQL audit_logs), procurement value THB (PostgreSQL purchase_orders), site reports (ClickHouse site_activity_daily), approval completion rate (Prometheus workflow metrics)
  - SLO Burn Rate: error budget remaining per tier (30-day), fast burn (1h), slow burn (6h), historical SLO compliance
  Dashboard IDs and SLO targets per dashboard: docs/slo/dashboard-registry.md (source: spec §31.8)

Generate:

- OpenTelemetry setup in @cos/tracing package (NestJS + FastAPI + Go)
- Prometheus scrape configs for all services
- Grafana dashboard JSON definitions (all dashboards above)
- Loki log pipeline configs (structured JSON logs from all services)
- Jaeger deployment manifests
- OpenTelemetry Collector config (receives from services, exports to Jaeger + Prometheus)
- Alert rule YAML for all alerting rules above
- NestJS interceptor for automatic HTTP metrics
- Kafka metrics middleware for producer/consumer
- Unit tests: metric collection, trace propagation
- Log retention schedule: docs/compliance/log-retention-policy.md
  (application logs 30-day hot / 1-year cold; audit logs indefinite / 7-year WORM — source: spec §31.4)
- Synthetic health check probe definitions: infrastructure/synthetics/
  (≥2 AWS regions, 60s interval, OTel Collector + Grafana Synthetic Monitoring;
  adding a new endpoint requires a probe definition in the same PR — source: spec §31.10)

Constraints:

- Before marking Phase 15 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```

---

## PHASE 16 — SECURITY COMMAND

```text
Implement enterprise security controls.

Compliance Targets (source §13.3):
  ISO 27001  — Information security management system (target: certification within 24 months)
  SOC 2 Type II — Trust service criteria: security, availability, confidentiality (target: 18 months)
  PDPA      — Thai Personal Data Protection Act (mandatory for Thai market)
  GDPR      — EU General Data Protection Regulation (mandatory for EU tenant data)
  Construction safety regulations — local jurisdiction per deployment region

  Note: compliance audit workflow (Temporal) covers SOC 2 Type II + ISO 27001 + PDPA; see spec §05-security-compliance §5.3.1
    ComplianceAuditWorkflow (Phase 16)
    Trigger: 6 months before target certification date
    Stub: follow §32.9 Integration Stub Pattern (Type A — fail-fast)

  Compliance documentation (must exist before Phase 16 sign-off):
    docs/compliance/soc2-controls.md     — SOC 2 Type II control tracking (required before Stage 2→3)
    docs/compliance/data-flow-map.md     — PDPA/GDPR personal data flow map (reviewed before each
                                           new feature that processes PII; required before Stage 1→2)
    docs/compliance/data-retention-policy.md — retention period per entity type (reviewed annually)

Security Requirements:
  Encryption algorithm: AES-256 minimum for all at-rest data encryption — custom field-level
    or file encryption outside AWS infrastructure MUST use AES-256 or stronger (source: spec §5.2)
  TLS: TLS 1.3 minimum on all ingress (Kubernetes Ingress + cert-manager)
  RBAC: enforced via Phase 2 Keycloak + @cos/rbac guards (all services)
  Audit logging: all write operations logged to audit_logs (Phase 2 schema)
  Immutable logging: audit_logs table: no UPDATE or DELETE via application
    (PostgreSQL RLS policy: DENY UPDATE/DELETE on audit_logs for app role)
  Rate limiting: NestJS throttler guard (configurable per endpoint)
    Default limits: 100 req/min per user per endpoint
    Auth endpoints: 10 req/min per IP (brute force protection)
  Secret management: Kubernetes Secrets + sealed-secrets (kubeseal)
    No plaintext secrets in code, ConfigMaps, or environment files
  Tenant isolation: validated at middleware layer (every request)
    Cross-tenant data access: IMPOSSIBLE via API layer
    PostgreSQL RLS: PRIMARY enforcement on all domain schema tables (mandatory from MVP, spec §7.7)
      Purpose: prevents cross-tenant data access at DB level — enforced even if application layer is bypassed
      Policy: USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)
      Note: RLS is PRIMARY isolation. Application-layer WHERE tenant_id = $1 is SECONDARY defense-in-depth.

WAF:
  Solution: Cloudflare WAF — CLOUD DEPLOYMENTS ONLY (Shared SaaS, Dedicated Tenant)
    Source: spec §05-security-compliance §5.5 + §08-enterprise-deployment §8.7
    On-premise: Cloudflare WAF is NOT applicable — Kong Gateway handles rate limiting;
      customer MUST provide their own WAF (OWASP CRS paranoia level 2 minimum)
      See: spec §08-enterprise-deployment §8.7 for full on-premise WAF requirements
  Architecture (cloud only): Internet → Cloudflare Edge → AWS ALB → EKS Ingress → NestJS
  Plan: Cloudflare Pro minimum (Enterprise for large tenants)
  CloudflareWAFIntegration (Phase 16)

  Enabled rule sets:
    - Cloudflare Managed Ruleset (OWASP Top 10, known CVEs)
    - OWASP Core Rule Set (CRS) paranoia level 2
    - Custom: Construction OS rules (API path patterns, tenant header validation)

  Rate limits (spec §05 §5.5):
    Note: API path convention is /api/v1/ — backend setGlobalPrefix('api/v1') confirmed (source: main.ts)
    Auth endpoints (/api/v*/auth/*):   10 req/min per IP — block 429
    General API  (/api/v*/):          100 req/min per user — block 429
    File upload  (/api/v*/files/*):    20 req/min per user — block 429 (spec §05 §5.5)
    Health/metrics:                    60 req/min per IP — block 429

  Origin protection (MANDATORY):
    AWS ALB security group MUST restrict port 443 inbound to Cloudflare IP ranges only
    Cloudflare IPs: https://api.cloudflare.com/client/v4/ips (fetch at deploy time)
    Terraform: infrastructure/terraform/cloudflare/
    Kubernetes: infrastructure/kubernetes/security/cloudflare-origin-protection.yaml

  Application integration (MANDATORY in every NestJS service):
    - Trust CF-Connecting-IP header as real client IP (NOT X-Forwarded-For)
    - Validate CF-Ray header present on every request (confirms WAF was traversed)
    - Log CF-Ray in structured logs for end-to-end tracing
    Middleware: backend/src/shared/middleware/cloudflare-waf.middleware.ts

  IaC: infrastructure/terraform/cloudflare/ (main.tf, waf.tf, variables.tf, outputs.tf)

Secure Headers (all HTTP responses):
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self' (adjust per frontend needs;
    policy definition: docs/security/csp-policy.md — no unsafe-inline/unsafe-eval; report-only in staging)
  Referrer-Policy: strict-origin-when-cross-origin

Input Security:
  All API inputs: validated via class-validator (NestJS) or Pydantic (FastAPI)
  SQL injection: impossible via Prisma parameterized queries
  File uploads: MIME type validation + extension whitelist (Phase 9)

Generate:

- PostgreSQL RLS policies for all tables (migration files)
- sealed-secrets manifests for all service secrets
- Kong Gateway declarative config (rate limits per route, JWT validation plugin, tenant routing)
- Secure headers NestJS middleware
- Audit log interceptor (auto-logs all mutating operations)
- cert-manager Kubernetes manifests (for TLS)
- Cloudflare WAF: infrastructure/terraform/cloudflare/ (main.tf + waf.tf + variables.tf + outputs.tf)
- Cloudflare WAF middleware: backend/src/shared/middleware/cloudflare-waf.middleware.ts
- Cloudflare origin protection: infrastructure/kubernetes/security/cloudflare-origin-protection.yaml
- CloudflareWAFIntegration (EP-WAF-001 RESOLVED): implemented as backend/src/shared/middleware/cloudflare-waf.middleware.ts (see line above)
- Security scanning: Trivy in GitHub Actions (container image scanning)
- OWASP dependency check in CI pipeline
- Unit tests: RBAC guards, rate limiting, tenant isolation middleware
- Integration tests: cross-tenant isolation (must not leak data)
- CORS policy: docs/security/cors-policy.md (allowed origins per environment; no * in production;
  max-age ≤ 86400s; update policy before adding any new origin — source: spec §5.8)
- External pentest: docs/security/pentest-findings.md (findings and resolution status;
  required before Stage 1→2 — source: spec §5.3.1, context.md §Security)

Constraints:

- Before marking Phase 16 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```

---

## PHASE 17 — DEVOPS + DEPLOYMENT COMMAND

```text
Build production deployment pipeline.

Cloud Provider Decision:
  Primary: AWS (EKS + RDS + ElastiCache + MSK + S3) — this is the authoritative default
    GCP and on-premises are supported deployment targets but agents implement AWS first
  Agent must implement AWS as DEFAULT; no EP needed — decision made.
  Note to agent: mark all cloud-specific resources with comment: # CLOUD: AWS

Kubernetes Cluster Specification (production):
  Control plane: managed (EKS, GKE) or self-managed — follows cloud provider decision
  Node groups:
    system-pool:    2x nodes, t3.medium (control plane components)
    app-pool:       min 3, max 10 nodes, t3.xlarge (application services)
    ai-pool:        min 1, max 4 nodes, t3.2xlarge (AI workers — GPU optional)
    analytics-pool: min 1, max 3 nodes, r5.xlarge (ClickHouse — memory optimized)
  Auto-scaling: Cluster Autoscaler (scale up: 2 min, scale down: 10 min cooldown)
  Resource requests/limits per NestJS service (default):
    requests: cpu 100m, memory 256Mi
    limits:   cpu 500m, memory 512Mi
  Resource requests/limits per FastAPI service (AI):
    requests: cpu 500m, memory 1Gi
    limits:   cpu 2000m, memory 2Gi
  Resource requests/limits per Go worker:
    requests: cpu 200m, memory 128Mi
    limits:   cpu 1000m, memory 256Mi

Environments:
  local:    Docker Compose (all services + dependencies on single machine)
  dev:      Kubernetes single-node (k3s or minikube) — auto-deployed on PR merge to dev
  staging:  Kubernetes multi-node — mirrors production spec at 50% size
  production: Kubernetes multi-node — full spec above

Secret Management: conditional per deployment type (spec §5.2)
  Cloud (AWS EKS):   AWS Secrets Manager + External Secrets Operator (ESO)
  On-premise/hybrid: HashiCorp Vault 1.16+ (Vault Agent sidecar injector)
  Git secrets:       sealed-secrets (kubeseal) — works across all deployment types
  All secrets:       committed to git as SealedSecret (encrypted) — never plain Secret
  Rotation:          cloud → AWS SM automated rotation; on-prem → Vault DB engine (see SecretRotation decision in Phase 17)
  Secret categories:
    DATABASE_URL: per service, per environment
    REDIS_URL: shared across services
    KAFKA_BROKERS: shared
    OPENAI_API_KEY: AI services only
    KEYCLOAK_CLIENT_SECRET: Identity Service
    MINIO_ACCESS_KEY + MINIO_SECRET_KEY: File Service
    NEO4J_PASSWORD: KG worker
    CLICKHOUSE_PASSWORD: Analytics service

Deployment Strategy:
  Method: Rolling deployment (default)
  Max surge: 1 pod
  Max unavailable: 0 pods (zero-downtime rolling)
  Rollback: automatic on health check failure (liveness probe 3 consecutive fails)
  Canary: Argo Rollouts (open-source Kubernetes progressive delivery) — no EP needed; decision made
  Production deployment window registry: docs/runbooks/deployment-windows.md
    (production deployments execute only within approved windows;
    emergency hotfixes exempt with product owner approval on record — source: spec §8.2)

CI/CD Pipeline (ArgoCD GitOps):

  GitHub Actions — CI ONLY (no kubectl, no helm upgrade):
    on: push to any branch
    Steps:
      1. lint (ESLint, Prettier)
      2. type-check (tsc --noEmit)
      3. unit-tests (all services in parallel)
      4. build Docker images (parallel per service)
      5. Trivy security scan (per image)
      6. push to ECR (on main/staging/production branch only)
      7. update image tag in GitOps repo (commit new tag → triggers ArgoCD sync)
      8. smoke tests + E2E tests (post-deploy, staging only — ArgoCD PostSync wave 1: smoke
         health/auth/core-read < 30s; Playwright wave 2: critical user journeys)
      9. load tests (weekly scheduled, staging only — k6; spec §30.9; NOT per-deploy)

  ArgoCD — CD (GitOps, self-healing):
    - Monitors GitOps repo for image tag changes
    - Syncs cluster state to match git (auto-sync on staging, manual gate on production)
    - Self-healing: reverts manual kubectl changes within sync interval (default 3 min)
    - Rollback: argocd app rollback <app> <revision> (instant — no pipeline re-run needed)
    - Production promotion: manual sync gate in ArgoCD UI

Testing Tool: k6 (for load testing — see Phase 18)

Data Scaling Strategy (source §24.2):
  Hot storage (active data — < 90 days):
    PostgreSQL: primary RDS instance (multi-AZ) — all current project data
    Redis: session cache, real-time event state, leaderboards
    ClickHouse: recent analytics (90-day rolling window, fast query)
    TimescaleDB: recent telemetry (equipment + workforce — 90-day retention)

  Cold storage (historical data — > 90 days):
    PostgreSQL: automated archival → S3 in Apache Iceberg format via Debezium CDC → Kafka Connect S3 Sink (source: spec §9.4 Path 2; replaces "S3 Parquet via pg_partman" which conflicted with spec)
    ClickHouse: tiered storage — local NVMe for hot, S3-backed for cold (ClickHouse S3 integration); fed from Iceberg data lake via ClickHouse S3 import
    TimescaleDB: chunk compression after 30 days, chunk move to S3 after 90 days (to Iceberg layer)
    Raw files (photos, PDFs): MinIO lifecycle policy → S3 Glacier after 1 year

  Partition strategy:
    PostgreSQL: partition large tables by tenant_id + month
      (e.g. site_reports, cost_transactions, audit_logs — all high-volume tables)
    ClickHouse: partition by tenant_id + toYYYYMM(date)
    TimescaleDB: hypertable chunk interval = 1 day (equipment), 1 week (workforce)

  Multi-region replication:
    DECIDED: active-passive; primary ap-southeast-7 (Bangkok, Thailand) — GLOB-001 spec §8.8; DR ap-southeast-1 (Singapore); DR region via Terraform multi-region module; Route 53 latency routing; trigger: first tenant with data residency requirement
    Active-passive: primary ap-southeast-7 (Bangkok), DR ap-southeast-1 (Singapore)
    Data residency: EU tenants → eu-west-1, Thai PDPA → ap-southeast-7 (Bangkok)

- Terraform modules (AWS EKS, RDS, ElastiCache, MSK, S3 — default to AWS)

  with clear comments: # CLOUD: AWS — replace with GCP/on-prem equivalent

- Helm charts for all services (values-dev, values-staging, values-prod)
- GitHub Actions workflow files (all steps above)
- Dockerfile per service (multi-stage builds, non-root user)
  Exception: apps/mobile/ — uses Expo EAS Build; no Dockerfile required or permitted
  (source: docs/specifications/08-enterprise-deployment.md — Dockerfile table line "Mobile")
- Kubernetes HPA (Horizontal Pod Autoscaler) per service
- Kubernetes PodDisruptionBudget per service (minAvailable: 1)
- PgBouncer Kubernetes manifests: Deployment (transaction mode) + Service + ConfigMap +
  PodDisruptionBudget (minAvailable: 1) in infrastructure/kubernetes/pgbouncer/ (QM-18; spec §7.9)
  Config baseline: default_pool_size=25, max_client_conn=1000, server_idle_timeout=600
  pool_mode=transaction (REQUIRED; session mode and statement mode are PROHIBITED)
  Application DATABASE_URL must resolve to PgBouncer service, never to PostgreSQL port 5432
- sealed-secrets SealedSecret examples for all secret types
- Cluster Autoscaler manifests
- Resource quota per namespace
- Rollback script (helm rollback on failure)

Decisions in Phase 17 (documented in spec):

  SecretRotation:
    DECIDED: cloud → AWS SM automated rotation Lambda (per resource type);
    on-prem → Vault database secrets engine (dynamic secrets, TTL 24h)
    Interface: N/A — AWS SM rotation config (cloud) / Vault lease policy (on-prem)
    PostgreSQL: max_ttl 24h; JWT signing keys: rotation via JWKS endpoint (zero-downtime)

  MultiRegionDeploy:
    DECIDED: active-passive; primary ap-southeast-7 (Bangkok, Thailand) — GLOB-001 spec §8.8; DR ap-southeast-1 (Singapore); Terraform multi-region module;
    Route 53 latency routing; trigger: first tenant with data residency requirement
    Active-passive: primary ap-southeast-7 (Bangkok), DR ap-southeast-1 (Singapore) via Terraform module
    Active-active: NOT planned (requires CockroachDB or Aurora Global)
    Data residency routing: tenant metadata → region assignment → connection routing

Constraints:

- Before marking Phase 17 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36
  Cross-reference: docs/specifications/08-enterprise-deployment.md (Dockerfile table + mobile Expo EAS note)

```

---

## PHASE 18 — TESTING COMMAND

```text
Build testing strategy.

Testing Tools (authoritative):
  Unit testing (TypeScript):   Jest 29.x + @nestjs/testing
  Unit testing (Python):       pytest 8.x + pytest-asyncio
  Unit testing (Go):           testing package (stdlib) + testify
  Integration testing:         Jest + Supertest (NestJS) + testcontainers-node
  E2E testing:                 Playwright 1.x (web) + Detox (React Native mobile)
  API contract testing:        Pact 12.x (consumer-driven contract tests)
  Kafka event testing:         testcontainers Kafka module
  Load testing:                k6 (open-source, Grafana k6)
  Security testing:            OWASP ZAP (in CI pipeline, staging only)

Testing Pyramid:
  Unit tests:        70% — test business logic, calculations, guards, state machines
  Integration tests: 20% — test service + DB + Kafka with testcontainers
  E2E tests:          5% — critical user journeys only
  Load tests:         5% — SLA validation per Phase 14

Required Unit Test Coverage:
  Minimum: 100% line coverage AND 100% branch coverage for all NestJS services (source: spec §30.3)
  Mandatory coverage for:
    - All state machine transitions (Phase 3, Phase 5)
    - All financial calculations (Phase 4, Phase 7) — include decimal edge cases
    - All RBAC guards (Phase 2)
    - HallucinationGuard (Phase 12)
    - SyncManager conflict resolution (Phase 10)
    - Kafka consumer idempotency (Phase 8)

k6 Load Test Scenarios:
  Scenario 1: Dashboard SLA validation
    Target: GET /api/v1/analytics/executive — 100 VUs, 5 min
    Pass criteria: P95 < 3s, error rate < 0.1%

  Scenario 2: Concurrent file uploads
    Target: POST /api/v1/files/upload — 20 VUs, 5 MB file, 5 min
    Pass criteria: P95 < 10s, error rate < 0.5%

  Scenario 3: API gateway throughput
    Target: mixed read endpoints — 200 VUs, 10 min
    Pass criteria: P95 < 1s, error rate < 0.1%

  Scenario 4: AI report generation
    Target: POST /api/v1/ai/reports/site-summary — 10 VUs, 5 min
    Pass criteria: P95 < 15s (AI calls are slow), error rate < 1%

Pact Contract Tests:
  Define consumer-provider pairs:
    Finance (consumer) ← Procurement (provider): invoice received event
    Analytics (consumer) ← All services (providers): event schema validation
    Mobile (consumer) ← all services (providers): API response shape

Testcontainers Setup:
  Shared test setup (all integration tests):
    - PostgreSQL container (per service schema)
    - Redis container
    - Kafka + Schema Registry container
    - MinIO container (File Service tests only)
    - Neo4j container (KG tests only)
    - ClickHouse container (Analytics tests only)

Generate:

- Jest config per service (coverage thresholds: 100% lines + 100% branches — source: spec §30.3)
  Note: jest.config.js is a Phase 1 deliverable — Phase 18 adds testcontainers and @cos/test-utils only
- pytest config for Python services
- Shared testcontainers setup utility (@cos/test-utils package)
- packages/@cos/test-utils/README.md (required per QM-11 — purpose, public API, dependencies, configuration, usage example; same README standard as all packages/@cos/* per Rule 31; per spec §30.13)
- k6 load test scripts for all 4 scenarios above
- Playwright E2E tests (web — location: tests/e2e/; runs on merge to `main`; source: spec §30.5 + Phase 18 Generate):
    1. login — user authentication via SMS OTP and email/password flows; JWT issued; protected route accessible
    2. project create — PM creates project; status transitions DRAFT → ACTIVE
    3. report submit — Site Engineer submits daily site report; Kafka event emitted; PM notified
    4. dashboard view — Executive loads analytics dashboard; ClickHouse queries complete within P95 < 3s SLA
    5. Procurement flow — Create PR → generate RFQ → receive quotation → approve PO → record delivery → approve vendor invoice
    6. Daily site report — Site Engineer submits report with manpower count and blockers
    7. Budget exceeded alert — Cost transaction pushes project over budget → Executive receives push notification
    8. Safety incident — Safety Officer reports incident → PM receives push notification → acknowledged within 30 min SLA
    9. QC inspection — Inspector fills checklist → result recorded as fail → issue_severity populated → photo uploaded
    10. Approval escalation — Approver does not respond in 48 hours → next approver is notified
- Detox E2E tests (React Native mobile — location: apps/mobile/e2e/; runs on merge to `main`; source: spec §30.5, §30.7):
    1. Offline check-in — Worker checks in with no connectivity → record queued → sync on reconnect
    2. Offline inspection — Inspector fills checklist offline → photo attached → sync on reconnect
    3. Sync conflict resolution — Two users update same task progress_percent while offline → Max-wins applied on sync (higher value wins; progress is monotonic)
- Pact consumer test examples for Finance ← Procurement
- GitHub Actions integration: unit tests on every PR, load tests weekly scheduled on staging (not per-deploy; spec §30.9)
- Test data factories (factory_bot pattern — plain TypeScript functions, minimal required fields, spread overrides) per entity — location: packages/@cos/test-utils/src/factories.ts, naming: build<EntityName>Dto for request DTOs; RESOLVED 2026-06-13, see spec §30.13
- Database reset utility for integration tests (truncate + reseed)
- API version sunset dates and tenant notification log: docs/api/deprecation-schedule.md
  (must exist before any endpoint sunset; minimum 90-day notice — source: spec §14.4, context.md §API)

Async fake timer test pattern (Rule 30 — required for retry helpers, pollers, backoff logic):
  Use jest.runAllTimersAsync() NOT jest.runAllTimers() for async functions that sleep internally.
  Correct pattern:
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())
    // For each retry/sleep step: await jest.runAllTimersAsync()
  Wrong pattern (causes test hangs with multi-step retries):
    jest.runAllTimers(); jest.runAllTimers(); // synchronous — microtask queue not drained between calls
  Applies to: withRetry, OutboxPoller, any class using setTimeout/setInterval internally


Constraints:

- Before marking Phase 18 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```

---

## PHASE 19 — FINAL PRODUCTION READINESS COMMAND

```text
Prepare system for production readiness.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION A — PRE-LAUNCH CHECKLIST (Build quality gates)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Legend:
  [AUTO] = verified automatically via CI/CD script — see scripts/verify-production-readiness.sh
  [MANUAL] = requires human verification — cannot be automated

Architecture:
  [MANUAL] [ ] All services stateless (no local file system state)
  [AUTO]   [ ] All services have health check endpoints (/health/live, /health/ready)
               → curl http://<service>/health/live for each service in cluster
  [AUTO]   [ ] All services have Kubernetes liveness + readiness probes configured
               → kubectl get deployment -o json | jq '.spec.template.spec.containers[].livenessProbe'
  [MANUAL] [ ] No direct DB cross-service queries (only via Kafka or API)
  [MANUAL] [ ] Outbox pattern implemented in all services that emit Kafka events
  [AUTO]   [ ] Schema Registry enforcing BACKWARD_TRANSITIVE compatibility on all topics
               → curl http://schema-registry:8081/config (check compatibility=BACKWARD_TRANSITIVE)
               Note: BACKWARD_TRANSITIVE is stricter than BACKWARD — all historical consumers can read any newer schema (spec §32.4)
  [AUTO]   [ ] Temporal worker has at least 2 replicas in production
               → kubectl get deployment temporal-worker -o jsonpath='{.spec.replicas}'

Security:
  [AUTO]   [ ] TLS 1.3 on all ingress
               → nmap --script ssl-enum-ciphers -p 443 <ingress-host>
  [MANUAL] [ ] PostgreSQL RLS enabled on all tenant-scoped tables
  [AUTO]   [ ] All secrets managed via sealed-secrets (no plaintext)
               → kubectl get secrets -A -o json | jq '[.items[] | select(.type != "kubernetes.io/service-account-token") | select(.metadata.annotations["sealedsecrets.bitnami.com/cluster-wide"] == null)] | length'
  [AUTO]   [ ] Trivy scan passes with no CRITICAL vulnerabilities
               → GitHub Actions: trivy image --exit-code 1 --severity CRITICAL <image>
  [AUTO]   [ ] OWASP ZAP scan passes on staging
               → GitHub Actions: zap-baseline.py -t https://staging.cos.app
  [MANUAL] [ ] Audit logs table has RLS DENY UPDATE/DELETE
  [MANUAL] [ ] MFA enforced for TENANT_ADMIN and FINANCE roles in Keycloak

Observability:
  [AUTO]   [ ] All services emit metrics to Prometheus
               → curl http://prometheus:9090/api/v1/targets | jq '[.data.activeTargets[] | select(.health == "up")] | length'
  [AUTO]   [ ] All services emit structured JSON logs to Loki
               → curl -G http://loki:3100/loki/api/v1/query --data-urlencode 'query={job=~".+"}'
  [AUTO]   [ ] All services emit traces to Jaeger via OpenTelemetry
               → curl http://jaeger:16686/api/services | jq '.data | length'
  [AUTO]   [ ] All alerting rules configured in Grafana
               → curl -H "Authorization: Bearer $GRAFANA_TOKEN" http://grafana:3000/api/ruler/grafana/api/v1/rules | jq 'keys | length'
  [AUTO]   [ ] All Grafana dashboards accessible and populated
               → curl -H "Authorization: Bearer $GRAFANA_TOKEN" http://grafana:3000/api/dashboards/home
  [AUTO]   [ ] DLQ depth alert verified (trigger test message to DLQ)
               → kafka-console-producer.sh --topic <dlq-topic> --message "test" then check alert fires

Data:
  [AUTO]   [ ] PostgreSQL: automated backups enabled (daily, 30-day retention)
               → aws rds describe-db-instances --query 'DBInstances[*].BackupRetentionPeriod'
  [AUTO]   [ ] PostgreSQL: point-in-time recovery (PITR) enabled
               → aws rds describe-db-instances --query 'DBInstances[*].MultiAZ'
  [MANUAL] [ ] Neo4j: neo4j-admin backup daily — stored to S3, 7-day retention
               Note: KG is rebuildable from Kafka event stream — daily backup is sufficient
               Command: neo4j-admin database backup --to-path=/backup neo4j
  [AUTO]   [ ] ClickHouse: clickhouse-backup daily — stored to S3, 7-day retention
               Note: analytics data is re-ingestible from Kafka — daily backup is sufficient
               Tool: altinity/clickhouse-backup via CronJob in Kubernetes
               → kubectl get cronjob clickhouse-backup -o jsonpath='{.status.lastSuccessfulTime}'
  [MANUAL] [ ] MinIO: replication configured (3 drives minimum)
  [AUTO]   [ ] Redis: persistence enabled (AOF mode)
               → redis-cli CONFIG GET appendonly (expect: yes)
  [AUTO]   [ ] Kafka: topic replication factor = 3, min ISR = 2
               → kafka-topics.sh --describe --bootstrap-server kafka:9092 | grep -E "ReplicationFactor|Isr"

Disaster Recovery:
  [AUTO]   [ ] RTO target: 30 minutes (production SLA — confirmed by product owner)
               Requires: automated failover via Kubernetes + health checks, not manual intervention
               PostgreSQL: RDS Multi-AZ automatic failover (~60 seconds)
               Application: Kubernetes liveness probe triggers pod restart automatically
               DNS: Route 53 health check + failover routing policy
               → aws rds describe-db-instances --query 'DBInstances[*].MultiAZ' (expect: true)
  [AUTO]   [ ] RPO target: 15 minutes (near zero loss)
               Achieved via: PostgreSQL PITR (continuous WAL archiving to S3)
               Neo4j: daily backup + KG rebuild from events (acceptable — KG is derived data)
               ClickHouse: daily backup + re-ingest from Kafka (acceptable — analytics is derived data)
               Redis: AOF persistence (sub-second RPO for cache)
               → aws rds describe-db-instances --query 'DBInstances[*].BackupRetentionPeriod'
  [MANUAL] [ ] Failover procedure: documented in docs/runbooks/disaster-recovery.md
  [MANUAL] [ ] Database restore test: performed and documented

CI/CD (ArgoCD GitOps):
  [AUTO]   [ ] ArgoCD installed and running in argocd namespace
               → kubectl get pods -n argocd | grep argocd-server
  [AUTO]   [ ] All environments (staging, production) deploy via ArgoCD (not kubectl/helm in CI)
               → argocd app list --output=wide | grep -E "Synced|Healthy"
  [AUTO]   [ ] GitHub Actions CI pipeline does NOT contain kubectl or helm upgrade commands
               → grep -r "kubectl apply\|helm upgrade" .github/workflows/ | wc -l  (expect: 0)
  [AUTO]   [ ] Staging auto-syncs on image tag update (ArgoCD syncPolicy.automated enabled)
               → argocd app get cos-staging -o json | jq '.spec.syncPolicy.automated'
  [MANUAL] [ ] Production promotion requires manual sync gate in ArgoCD UI — tested
  [MANUAL] [ ] Rollback procedure: argocd app rollback — documented and tested in staging

AI Monitoring:
  [AUTO]   [ ] Token usage tracked per tenant (ai_usage_logs table)
               → SELECT COUNT(*) FROM ai_usage_logs WHERE created_at > NOW() - INTERVAL '1 day'
  [AUTO]   [ ] Hallucination guard enabled on all AI report endpoints
               → grep -r "HallucinationGuard" ai/services/ | wc -l (expect > 0 per endpoint)
  [AUTO]   [ ] AI latency metrics visible in Grafana (AI dashboard)
               → curl -H "Authorization: Bearer $GRAFANA_TOKEN" http://grafana:3000/api/dashboards/uid/ai-monitoring
  [MANUAL] [ ] LLM provider API key rotation procedure: documented

Tenant Isolation Validation:
  [AUTO]   [ ] Integration test confirms: user in Tenant A cannot access Tenant B data
               → pytest tests/integration/test_tenant_isolation.py --env=staging
  [AUTO]   [ ] PostgreSQL RLS policies tested with direct DB connection
               → pytest tests/integration/test_rls_policies.py
  [AUTO]   [ ] Keycloak realm isolation verified
               → pytest tests/integration/test_keycloak_isolation.py

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION B — POST-LAUNCH ADOPTION GATES (from 04_post_launch_enterprise_evolution.md)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Purpose: validate that platform is PRODUCTION ADOPTED, not just production deployed.
Must pass ALL 8 gates before treating the platform as production-grade.
If any gate fails → platform is still in MVP phase. Do not proceed to
post-launch evolution phases (file 02 Phase 0–11).

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

If all 8 gates pass → platform is production-adopted.
Proceed to post-launch evolution (04_post_launch_enterprise_evolution.md — Stage 3 file).

Generate:

- Production readiness checklist markdown (docs/runbooks/production-readiness.md)
- Deployment checklist per environment (docs/runbooks/deployment.md)
- Rollback runbook (docs/runbooks/rollback.md)
- Incident response runbook (docs/runbooks/incident-response.md)
- Architecture documentation with service interaction diagram (docs/architecture/)
- ADR (Architecture Decision Record) for each major technology choice

  (runtime mapping, Keycloak, Temporal, k6, ClickHouse strategy)

- Extension point decisions: documented in docs/specifications/ (§13.3-13.5, §22.6, §05-security-compliance §5.3.1)
- Adoption gate dashboard: track all 8 SECTION B gates in Grafana
- cos-audit/ directory committed at repository root (log file contents git-ignored via .gitignore entry: cos-audit/*.log; directory must exist for run-all-checks.sh to write sign-off logs; required as Stage 1→2 transition gate — per spec §32.11)
- docs/slo/monthly-reviews/ directory committed (monthly SLO review notes written here as YYYY-MM.md; Engineering Lead writes on first business day of each month covering previous month; escalate to product owner if error budget < 20% — per spec §31.6)


Constraints:

- Before marking Phase 19 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```

---

## PHASE 20 — NOTIFICATION SERVICE COMMAND

```text
Build Notification Service.

Purpose: centralized multi-channel notification delivery for all services.
All other services emit events → Notification Service consumes and delivers.
No service should send notifications directly — route through this service only.

Channels (source: spec §19.2):
  In-app:  SSE (Server-Sent Events) per authenticated user session — NOT WebSocket;
           spec §19.2 explicitly prohibits WebSocket for notifications (unidirectional only)
  Push:    Expo Push Notifications → APNs (iOS) + FCM (Android) — NOT direct FCM;
           direct FCM misses all iOS users; use expo-server-sdk on the backend
  Email:   SendGrid (MVP), AWS SES (production with bounce/complaint handling);
           implement SendGrid adapter in Phase 20; SES migration before Stage 2 go-live (spec §19.7)
  LINE:    LINE Messaging API (push message);
           tenant configures LINE Channel Access Token in tenant settings;
           parallel channel alongside FCM/APNs
  SMS:     DELETED — removed (LINE, WhatsApp, Slack, Teams, Telegram,
           Discord cover all MVP notification channels)

Notification triggers (consumed from Kafka — canonical event names per spec §32.4):
  site.inspection.failed.v1                 → notify: SITE_ENGINEER, PROJECT_MANAGER
  site.issue.created.v1 (CRITICAL)           → notify: SITE_ENGINEER, PROJECT_MANAGER
  procurement.po.status_changed.v1             → notify: PROCUREMENT_OFFICER (actor)
  finance.variance.alert.v1                 → notify: FINANCE, TENANT_ADMIN
  site.report.created.v1                    → notify: PROJECT_MANAGER (spec §32.4 #5; corrected from construction.site_report.submitted.v1)
  procurement.invoice.received.v1           → notify: FINANCE

Entities (PostgreSQL — schema: notifications):
  notification_templates:
    template_id     UUID PK
    tenant_id       UUID  (nullable — null = system template)
    event_type      VARCHAR(255) NOT NULL  — maps to Kafka event_type
    channel         ENUM('IN_APP','EMAIL','LINE','PUSH','SMS')  -- PUSH = Expo push (mobile); SMS enum value has no MVP adapter (spec §19.2)
    subject_template TEXT    — Jinja2 template
    body_template   TEXT NOT NULL  — Jinja2 template
    is_active       BOOLEAN DEFAULT true

  notifications:
    notification_id UUID PK
    tenant_id       UUID NOT NULL
    recipient_id    UUID NOT NULL   — user_id
    channel         ENUM('IN_APP','EMAIL','LINE','PUSH','SMS')  -- PUSH = Expo push (mobile); SMS enum value has no MVP adapter (spec §19.2)
    event_type      VARCHAR(255) NOT NULL
    subject         TEXT
    body            TEXT NOT NULL
    status          ENUM('PENDING','SENT','FAILED','READ')
    sent_at         TIMESTAMPTZ
    read_at         TIMESTAMPTZ
    created_at      TIMESTAMPTZ DEFAULT now()
    INDEX: (tenant_id, recipient_id, status)

  notification_preferences:
    pref_id         UUID PK
    tenant_id       UUID NOT NULL
    user_id         UUID NOT NULL
    event_type      VARCHAR(255) NOT NULL
    channel         ENUM('IN_APP','EMAIL','LINE','PUSH','SMS')  -- PUSH = Expo push (mobile); SMS enum value has no MVP adapter (spec §19.2)
    is_enabled      BOOLEAN DEFAULT true
    UNIQUE: (user_id, event_type, channel)

APIs:
  GET  /api/v1/notifications                  — list my notifications (paginated)
  PATCH /api/v1/notifications/:id/read        — mark as read
  PATCH /api/v1/notifications/read-all        — mark all as read
  GET  /api/v1/notifications/preferences      — get my channel preferences
  PATCH /api/v1/notifications/preferences     — update channel preferences

Generate:

- NestJS module with Kafka consumer group: notification-consumer-group
- Template rendering service (Jinja2-style via handlebars in TypeScript)
- SSE (Server-Sent Events) endpoint per authenticated user session (NestJS @Sse decorator) —
  NOT Socket.IO; spec §19.2: "SSE is used for in-app delivery; WebSocket is not used for notifications"
- Expo Push Notifications integration via expo-server-sdk (routes to APNs for iOS + FCM for Android) —
  NOT direct firebase-admin FCM; direct FCM misses all iOS users (spec §19.2)
- Email: SendGrid adapter for MVP, migrate to AWS SES before production (spec §19.7)
- LINE: LINE Messaging API push message; tenant configures LINE Channel Access Token in tenant settings
- SMS: not included in MVP (LINE, WhatsApp, Slack, Teams, Telegram, Discord cover MVP notification needs)
- PostgreSQL migration files
- OpenAPI 3.1 spec
- Unit tests: template rendering, consumer routing, preference filtering
- Integration tests: end-to-end event → notification delivery


Constraints:

- Before marking Phase 20 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```

---

## PHASE 21 — EQUIPMENT SERVICE COMMAND

```text
Build Equipment Service.

Purpose: track construction equipment, assignments, utilization, and maintenance.
Time-series data (utilization, telemetry): stored in TimescaleDB.

Entities (PostgreSQL — schema: equipment):
  equipment:
    equipment_id    UUID PK
    tenant_id       UUID NOT NULL
    equipment_code  VARCHAR(50) NOT NULL
    equipment_name  VARCHAR(255) NOT NULL
    equipment_type  ENUM('CRANE','EXCAVATOR','CONCRETE_MIXER','GENERATOR',
                         'SCAFFOLD','VEHICLE','OTHER')
    status          ENUM('AVAILABLE','IN_USE','MAINTENANCE','RETIRED')
    purchase_date   DATE
    purchase_cost   DECIMAL(19,4)
    currency_code   VARCHAR(3)
    created_at      TIMESTAMPTZ DEFAULT now()
    UNIQUE: (tenant_id, equipment_code)

  equipment_assignments:
    assignment_id   UUID PK
    equipment_id    UUID FK NOT NULL
    project_id      UUID NOT NULL
    tenant_id       UUID NOT NULL
    assigned_by     UUID NOT NULL
    assigned_at     TIMESTAMPTZ NOT NULL
    returned_at     TIMESTAMPTZ
    notes           TEXT

  equipment_maintenance:
    maintenance_id  UUID PK
    equipment_id    UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    maintenance_type ENUM('SCHEDULED','UNSCHEDULED','REPAIR')
    status          ENUM('PENDING','IN_PROGRESS','COMPLETED')
    scheduled_at    TIMESTAMPTZ NOT NULL
    completed_at    TIMESTAMPTZ
    cost            DECIMAL(19,4)
    currency_code   VARCHAR(3)
    performed_by    VARCHAR(255)
    notes           TEXT

TimescaleDB Tables (schema: equipment_telemetry):
  equipment_utilization (TimescaleDB hypertable, partitioned by time):
    recorded_at     TIMESTAMPTZ NOT NULL  — partition key
    equipment_id    UUID NOT NULL
    tenant_id       UUID NOT NULL
    project_id      UUID
    hours_operated  DECIMAL(5,2)
    fuel_consumed   DECIMAL(8,2)
    operator_id     UUID
    INDEX: (equipment_id, recorded_at DESC)

  IoT telemetry: MQTT 5.0; broker = EMQX self-hosted on EKS (RESOLVED — AWS IoT Core deferred, Azure IoT Hub excluded; see Phase 21 stub note below + spec §13.5, §33.8); topic: cos/v1/devices/{device_id}/telemetry
    Trigger: equipment has IoT sensor attached
    Interface: { streamTelemetry(equipmentId: string): AsyncIterable<TelemetryEvent> }

APIs:
  POST /api/v1/equipment                          — create equipment
  GET  /api/v1/equipment                          — list (filterable by status, type)
  GET  /api/v1/equipment/:id                      — get detail
  PATCH /api/v1/equipment/:id/status             — update status
  POST /api/v1/equipment/:id/assignments          — assign to project
  PATCH /api/v1/equipment/:id/assignments/:aid/return — return from project
  POST /api/v1/equipment/:id/maintenance          — log maintenance
  POST /api/v1/equipment/:id/utilization          — record daily utilization
  GET  /api/v1/projects/:projectId/equipment      — equipment on project

Generate:

- NestJS module, service, repository, controller
- TimescaleDB schema and hypertable creation migration
- PostgreSQL migration for equipment entities
- OpenAPI 3.1 spec
- Unit tests: status transitions, assignment logic
- Kafka event producers:

    equipment.unit.assigned.v1              { equipment_id, project_id, assigned_by }
    equipment.unit.returned.v1              { equipment_id, project_id }
    equipment.unit.maintenance_scheduled.v1 { equipment_id, scheduled_at }

Stub in Phase 21 (generate stub — implement when triggered):

  IoTIntegration:
    Trigger:  fleet includes GPS-tracked equipment or machinery with
              onboard telematics (fuel sensors, engine hours, location)
    Interface: { streamTelemetry(equipmentId: string,
                                 tenantId: string): AsyncIterable<TelemetryEvent> }
    TelemetryEvent: { equipmentId: string, timestamp: Date, eventType: string,
                      payload: Record<string, unknown> }
    Data pipeline: IoT device → MQTT broker → Kafka → TimescaleDB hypertable
                   TimescaleDB is already deployed in Phase 21 — infrastructure ready
    Common event types: GPS_POSITION, FUEL_LEVEL, ENGINE_HOURS, IGNITION_ON/OFF,
                        IDLE_ALERT, GEOFENCE_BREACH
    Candidates: AWS IoT Core, Azure IoT Hub, self-hosted EMQX (MQTT broker)
    Note:     IoT platform RESOLVED — EMQX self-hosted on EKS (MQTT broker)
              EMQX → Kafka (MSK) connector built-in; consistent with AWS-native stack
              Azure IoT Hub excluded; AWS IoT Core deferred (device mgmt at scale only)

Constraints:

- Before marking Phase 21 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```

---

## PHASE 22 — WORKFORCE SERVICE COMMAND

```text
Build Workforce Service.

Purpose: manage workers, attendance, timesheets, and workforce allocation.
Time-series data (attendance, hours): stored in TimescaleDB.

Entities (PostgreSQL — schema: workforce):
  workers:
    worker_id       UUID PK
    tenant_id       UUID NOT NULL
    employee_code   VARCHAR(50) NOT NULL
    full_name       VARCHAR(255) NOT NULL
    trade_type      VARCHAR(100) NOT NULL  — e.g. "Carpenter", "Welder", "Electrician"
    employment_type ENUM('PERMANENT','CONTRACT','SUBCONTRACT')
    contact_phone   VARCHAR(50)
    is_active       BOOLEAN DEFAULT true
    created_at      TIMESTAMPTZ DEFAULT now()
    UNIQUE: (tenant_id, employee_code)

  project_workforce:
    allocation_id   UUID PK
    project_id      UUID NOT NULL
    worker_id       UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    role_on_project VARCHAR(100)
    start_date      DATE NOT NULL
    end_date        DATE
    daily_rate      DECIMAL(19,4)
    currency_code   VARCHAR(3)

TimescaleDB Tables (schema: workforce_telemetry):
  attendance_logs (TimescaleDB hypertable):
    log_id          UUID NOT NULL
    recorded_at     TIMESTAMPTZ NOT NULL  — partition key
    worker_id       UUID NOT NULL
    project_id      UUID NOT NULL
    tenant_id       UUID NOT NULL
    check_in_at     TIMESTAMPTZ
    check_out_at    TIMESTAMPTZ
    hours_worked    DECIMAL(5,2)
    INDEX: (worker_id, recorded_at DESC)
    INDEX: (project_id, recorded_at DESC)

  timesheets (TimescaleDB hypertable):
    timesheet_id    UUID NOT NULL
    period_date     DATE NOT NULL         — partition key (by month)
    worker_id       UUID NOT NULL
    project_id      UUID NOT NULL
    tenant_id       UUID NOT NULL
    regular_hours   DECIMAL(6,2) DEFAULT 0
    overtime_hours  DECIMAL(6,2) DEFAULT 0
    status          ENUM('DRAFT','SUBMITTED','APPROVED')

  Biometric / QR check-in: generic SDK interface; vendor SDK injected via DI (see spec §13.5)
    Trigger: project uses biometric or QR attendance
    Interface: { verifyCheckIn(workerId: string, projectId: string,
                               method: 'QR'|'FINGERPRINT'|'FACE'): Promise<boolean> }

APIs:
  POST /api/v1/workers                              — create worker
  GET  /api/v1/workers                              — list workers (tenant-scoped)
  GET  /api/v1/workers/:id                          — get detail
  POST /api/v1/projects/:projectId/workforce        — allocate worker to project
  GET  /api/v1/projects/:projectId/workforce        — list project workforce
  POST /api/v1/workers/:id/attendance               — record check-in/check-out
  GET  /api/v1/workers/:id/attendance               — attendance history (date range)
  POST /api/v1/timesheets                           — submit timesheet
  PATCH /api/v1/timesheets/:id/approve             — approve timesheet (ROLE: SITE_ENGINEER)
  GET  /api/v1/projects/:projectId/workforce/summary — manpower summary for analytics

Generate:

- NestJS module, service, repository, controller
- TimescaleDB hypertable migrations (attendance_logs, timesheets)
- Biometric check-in (deferred — do not implement until spec defines it)
- OpenAPI 3.1 spec
- Unit tests: attendance calculation, timesheet aggregation
- Integration tests: check-in/out cycle
- Kafka event producers:

    workforce.checkin.created.v1    { worker_id, project_id, checked_in_at }
    workforce.checkout.created.v1   { worker_id, project_id, hours_worked }
    workforce.timesheet.approved.v1 { worker_id, project_id, period_date, total_hours }

Constraints:

- Before marking Phase 22 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```

---

## PHASE 23 — MLOPS PIPELINE COMMAND

```text
Build MLOps Pipeline for continuous model training and deployment.

Depends on: Phase 11 (AI Foundation), Phase 14 (Analytics — training data source)

MLOps Stack (from source §19.4):
  MLflow 2.x        — experiment tracking and model registry
  Apache Airflow 2.x — pipeline orchestration (DAG-based)
  Kubeflow Pipelines — Kubernetes-native ML workflow execution
  Feast             — feature store (serving layer for ML features)
  Weights & Biases  — experiment monitoring
    W&B Cloud (wandb.ai); API key in AWS SM (see spec §22.6)

Training Data Sources (from source §19.1):
  - site_reports (PostgreSQL → Data Lake)
  - cost_history (ClickHouse analytics tables)
  - procurement_data (PostgreSQL)
  - inspection_failures (PostgreSQL)
  - photos/documents (MinIO → OCR extracted text)

Data Flow (from source §19.2):
  Operational Data (PostgreSQL/ClickHouse)
  → Data Lake (MinIO — parquet format)
  → Airflow DAG: Cleaning → Feature Engineering → Training
  → MLflow: experiment logging, model versioning
  → Kubeflow: model evaluation and deployment
  → AI Gateway: model endpoint updated (canary or blue-green)
  → Monitoring: Prometheus metrics on model performance

Model Types (from source §19.3):
  LLM fine-tuning:       OpenAI GPT-4o primary; Claude/Ollama fallback (see spec §22.6)
  Time-series forecasting (DelayForecastModel): XGBoost regressor; features: procurement delays, task completion %, weather, workforce; requires 90+ days data (see spec §22.6)
  Computer vision (SafetyVisionModel):       XGBoost classifier on ViT image embeddings; requires 10,000+ labeled site photos (see spec §22.6)
  Graph ML (GraphMLModel):              XGBoost on Neo4j graph-derived features (PageRank, centrality); requires 6+ months data (see spec §22.6)
  Classification (RiskClassifier):        XGBoost multi-class (LOW/MEDIUM/HIGH/CRITICAL); features: budget variance, schedule delay, procurement, safety incidents; requires 50+ projects (see spec §22.6)

Feature Store (Feast):
  Feature views:
    project_features:     budget_variance, days_to_deadline, open_issue_count
    procurement_features: avg_delivery_delay, rfq_to_po_days, overdue_invoice_count
    site_features:        manpower_7d_avg, inspection_fail_rate, report_submission_rate
  Online store: Redis (for real-time inference)
  Offline store: ClickHouse (for training)

Airflow DAGs (generate stubs for all):
  dag-export-training-data:    daily export from PostgreSQL/ClickHouse → MinIO (parquet)
  dag-train-delay-model:       weekly retraining of delay prediction model
  dag-train-risk-classifier:   weekly retraining of risk classifier
  dag-update-feature-store:    daily refresh of Feast feature views
  dag-model-evaluation:        post-training: evaluate on holdout set, log to MLflow

Generate:

- Airflow DAG files for all 5 DAGs above (as stubs with clear TODO markers)
- MLflow tracking server Docker Compose + Kubernetes deployment
- Feast feature store configuration (feature_store.yaml + feature view definitions)
- Kubeflow pipeline YAML for model training workflow
- MinIO bucket for data lake: cos-datalake-{tenant_id}
- Data export utility: PostgreSQL → Parquet (using pandas + pyarrow)
- Model serving integration: update AI Gateway endpoint post-deployment
- AI provider decisions documented in docs/specifications/22-ai-architecture.md §22.6
- Unit tests: DAG task functions (with mocked data sources)
- Integration tests: end-to-end Airflow DAG run with test data

Stubs in Phase 23 (generate stub — algorithms RESOLVED in spec §22-ai-architecture §22.6, implement when data thresholds met):

  ModelRegistry:
    Integrated with: MLflow tracking server (deployed in this phase)
    Interface: { registerModel(name: str, version: str, artifactPath: str): ModelRef }
    Note:     implement concrete class after MLflow server is running

  FeatureStore:
    Integrated with: Feast (deployed in this phase)
    Interface: { getOnlineFeatures(entityRows: list[dict]): list[FeatureVector] }
    Note:     implement concrete class after Feast feature store is configured

  AutonomousWorkflowExecutor:
    Status:   Phase 23+ — do NOT activate in Phase 23 itself
    Interface: { execute(workflowType: str, payload: dict,
                         tenantId: str): AutonomousResult }
    Constraint: NEVER trigger financial transactions, human-approval workflows,
                or data deletions — generate stub only, governance review required

  ExperimentMonitoring:
    Integrated with: W&B Cloud (wandb.ai) — RESOLVED: cloud, not self-hosted
    Interface: { logRun(experimentName: str, metrics: dict, params: dict): RunRef }
    Auth:     W&B API key stored in AWS Secrets Manager
    Note:     provider RESOLVED — W&B Cloud; source: spec §22-ai-architecture §22.6

  DelayForecastModel:
    Trigger:  after Phase 23 DAG dag-train-delay-model has run with 90+ days production data
    Interface: { predict(features: DelayFeatures): DelayPrediction }
    DelayFeatures: { weather, workforce_count, procurement_delay_days,
                     historical_velocity, days_to_deadline }
    DelayPrediction: { delay_probability: float, estimated_delay_days: int,
                       confidence_interval: tuple[int, int] }
    Algorithm: RESOLVED — XGBoost regressor; source: spec §22-ai-architecture §22.6
    Framework: scikit-learn + XGBoost

  SafetyVisionModel:
    Trigger:  after 10,000+ labeled site photos accumulated in production
    Interface: { analyze(image_url: str): SafetyAnalysisResult }
    SafetyAnalysisResult: { violations: list[str], confidence: float, severity: str }
    Algorithm: RESOLVED — XGBoost classifier on HOG + ViT image embeddings; source: spec §22-ai-architecture §22.6
    Framework: scikit-learn + XGBoost

  GraphMLModel:
    Trigger:  after Neo4j graph has 6+ months of relationship data
    Interface: { inferRelationship(node_a: str, node_b: str,
                                   node_type: str): RelationshipScore }
    RelationshipScore: { score: float, relationship_type: str }
    Algorithm: RESOLVED — XGBoost on Neo4j graph-derived features (PageRank, centrality); source: spec §22-ai-architecture §22.6
    Framework: scikit-learn + XGBoost

  RiskClassifier:
    Trigger:  after 50+ projects with full lifecycle data in production
    Interface: { classify(project_features: ProjectFeatures): RiskLevel }
    RiskLevel: ENUM(LOW, MEDIUM, HIGH, CRITICAL)
    Algorithm: RESOLVED — XGBoost multi-class (LOW/MEDIUM/HIGH/CRITICAL); source: spec §22-ai-architecture §22.6
    Framework: scikit-learn + XGBoost

Constraints:

- Before marking Phase 23 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```

---

## PHASE 24 — DIGITAL TWIN COMMAND

```text
Build Construction Digital Twin Layer.

Prerequisites (ALL must be complete before Phase 24 begins):
  Phase 13 — Knowledge Graph     (graph structure of project entities)
  Phase 21 — Equipment Service   (IoT telemetry pipeline — MQTT 5.0, see spec §13.5)
  Phase 23 — MLOps Pipeline      (ML models for prediction)
  BIM Integration — implement IFC.js parser per spec §13.4 (source geometry and structure)
  IoT Integration — live telemetry feeds (MQTT 5.0, see spec §13.5)

Purpose:
  Unify physical construction site state with operational data model.
  A digital twin in construction context is NOT a 3D visualization tool —
  it is a real-time data synchronization layer between:
    - Physical site (IoT sensors, GPS, inspections)
    - Digital model (BIM geometry, WBS, project schedule)
    - Operational intelligence (KG relationships, ML predictions)

Digital Twin data model:
  TwinEntity: { id, projectId, entityType, physicalRef, digitalRef,
                lastSyncedAt, confidence, tenantId }
  EntityType: ENUM(STRUCTURE, EQUIPMENT, MATERIAL_STOCK, WORKFORCE_ZONE,
                   INSPECTION_ZONE)
  TwinState:  { entityId, timestamp, attributes: Record<string, unknown>,
                source: ENUM(IOT, MANUAL, AI_INFERRED) }

Core capabilities:
  1. State synchronization:
     IoT telemetry → TwinState update → Knowledge Graph node update
     Frequency: real-time for critical assets, batch 15min for others

  2. Divergence detection:
     Compare planned (BIM/schedule) vs actual (IoT/inspections)
     Alert when divergence > configured threshold per entity type

  3. AI-enhanced inference:
     Where IoT coverage is incomplete, use ML models (Phase 23) to
     infer probable state (DelayForecastModel feeds twin schedule)

  4. Query interface:
     { getTwinState(projectId, entityType, timestamp): TwinSnapshot }
     { getDivergenceReport(projectId): DivergenceReport }
     { subscribeToStateChanges(projectId): AsyncIterable<TwinStateEvent> }

TwinSnapshot:  { projectId, asOf: Date, entities: TwinEntity[],
                 overallConfidence: number, divergenceScore: number }
DivergenceReport: { projectId, generatedAt: Date,
                    divergences: Divergence[], riskLevel: RiskLevel }
Divergence:   { entityId, plannedState, actualState, gap: number,
                severity: ENUM(LOW, MEDIUM, HIGH) }

Infrastructure:
  Storage:   TimescaleDB (time-series twin states — same instance as Phase 21/22)
  Graph:     Neo4j (twin entity relationships — same instance as Phase 13)
  Streaming: Kafka topic: twin.state.updated (consumers: AI Gateway, Analytics)
  Cache:     Redis (current twin state per project — TTL 5 min)

Generate:

- TwinEntity and TwinState TimescaleDB schema + hypertable
- State synchronization service (IoT event consumer → twin state update)
- Divergence detection engine (scheduled job, configurable thresholds)
- Twin query API (FastAPI — ai-gateway service, Python for ML integration)
- Kafka consumer: equipment.telemetry.* → twin state update
- Kafka producer: twin.state.updated, twin.divergence.detected
- OpenAPI 3.1 spec for twin query endpoints
- Unit tests: divergence calculation, state merge logic
- Integration tests: end-to-end IoT event → twin state → divergence alert
- services/analytics-worker/ — carbon analytics module: consumes carbon.record.created.v1
    → aggregates carbon_kgco2e to ClickHouse (GHG Protocol Scope 1/2/3);
    source: docs/specifications/33-digital-twin-iot §33.3 Service Assignment

Constraints:

- Digital Twin is READ-OPTIMIZED — do not use as write-path for operational data
- All writes come from source systems (IoT, inspection, schedule) via Kafka
- Twin state is eventually consistent — not a transactional system
- Confidence score mandatory on every inferred state
- Phase 24 MUST NOT block Phase 15–19 (deploy as post-production layer)

- Before marking Phase 24 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```

---

## PHASE 25 — ENTERPRISE PROVISIONING COMMAND

```text
Automate end-to-end dedicated DB provisioning for Enterprise tenants upon contract signing.

Triggers (both paths start the same Temporal workflow):
  Path A: SYSTEM_ADMIN → PATCH /api/v1/admin/tenants/:tenantId/mark-contracted
  Path B: CRM webhook  → POST /api/v1/platform/webhooks/enterprise-contract-signed
          (generic payload: { tenant_id, contract_reference? } — CRM-agnostic)

Workflow: EnterpriseProvisioningWorkflow (Temporal, task queue: enterprise-provisioning)
  Activity 1 — createRdsActivity:         AWS SDK CreateDBInstance
                                           class: db.t3.medium, 100 GB GP3, per-tenant KMS key
  Activity 2 — runMigrationsActivity:     prisma migrate deploy against new DB URL
  Activity 3 — assignDedicatedDbActivity: SET platform.tenants.dedicated_db_url
  [HUMAN GATE] notify SYSTEM_ADMIN; wait for signal (approve / abort) — no timeout
  Activity 4 — migrateDataActivity:       pg_dump + psql from shared DB
                                           (conditional: only if tenant has existing data AND signal = approve)
  Activity 5 — verifyRoutingActivity:     test query against dedicated DB; assert connectivity

Compensation (rollback per activity):
  createRds        → AWS SDK DeleteDBInstance
  assignDedicatedDb → SET dedicated_db_url = NULL
  migrateData      → no auto-rollback; SYSTEM_ADMIN must coordinate manually

Events emitted:
  platform.enterprise.contract_signed.v1  { tenant_id, contract_reference? }
  platform.enterprise.db_provisioned.v1   { tenant_id, rds_endpoint }

npm packages required in backend/package.json — add BEFORE implementing (Rule 26):
  dependencies: @aws-sdk/client-rds

Generate:

- PATCH /api/v1/admin/tenants/:tenantId/mark-contracted (NestJS controller + service + DTO)
- POST /api/v1/platform/webhooks/enterprise-contract-signed (new module: platform-webhook)
    SECURITY (MANDATORY — spec §34.6): verify HMAC-SHA256 signature on every webhook request.
      env: PLATFORM_WEBHOOK_SECRET
      1. Capture raw request body as Buffer via Fastify addContentTypeParser
      2. expectedSig = "sha256=" + HMAC-SHA256(secret, rawBody).hexDigest()
      3. Compare X-Webhook-Signature header vs expectedSig using timingSafeEqual (constant-time)
      4. Missing secret or missing rawBody → 500; missing or invalid signature → 401
- EnterpriseProvisioningWorkflow + 5 activities + compensation + worker (enterprise-provisioning)
- TypeScript interfaces: platform.enterprise.contract_signed.v1.ts + platform.enterprise.db_provisioned.v1.ts
- Avro schemas: platform.enterprise.contract_signed.v1.avsc + platform.enterprise.db_provisioned.v1.avsc
- Terraform module: infrastructure/terraform/modules/rds-tenant/ (main.tf + variables.tf + outputs.tf)
- Unit tests: 100% line + branch coverage (Rule 11)

Constraints:
- Workflow MUST be idempotent — re-triggering for same tenant_id must not create duplicate RDS
- Human gate (before Activity 4) must NOT timeout — wait indefinitely for approve/abort signal
- platform.* tables always stay on shared DB — never moved to dedicated (platform isolation rule)
- CRM webhook: generic payload only — no CRM-specific adapter in Phase 25
- Before marking Phase 25 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```

---

```text
GLOBAL EXECUTION RULES:

1.  Never generate toy architecture.
2.  Never generate tutorial-level code.
3.  Never tightly couple services (no direct cross-service DB access).
4.  Never ignore tenant isolation.
5.  Never hardcode business rules.
6.  Never invent accounting rules.
7.  Never invent tax rules.
8.  Never invent approval flows beyond those defined in WORKFLOW ENGINE SPEC.
9.  Always use typed contracts (TypeScript interfaces + Avro schemas).
10. Always emit events via shared @construction-os/shared package.
11. Always generate tests (minimum 100% line coverage AND 100% branch coverage — source: spec §30.3).
12. Always support scalability.
13. Always support observability (metrics, logs, traces from day one).
14. Always support containerization (every service must have Dockerfile).
15. Always support Kubernetes deployment (every service must have Helm chart).
16. Always generate OpenAPI 3.1 specs.
17. Always enforce RBAC using roles defined in Phase 2.
18. Always include audit logging for all mutating operations.
19. Always design for AI extensibility (AI Foundation is a separate layer).
20. Always mark unspecified requirements with: UNSPECIFIED — escalate to product owner immediately; do not generate stubs
21. Always follow FINANCIAL PRECISION SPEC for all monetary fields.
22. Always follow SERVICE → RUNTIME MAPPING — do not reassign runtimes.
23. Always use decimal.js (TypeScript) or Python decimal module for money math.
24. Always use BACKWARD_TRANSITIVE-compatible schema evolution in Schema Registry (source: spec §32.4; ensures new schema reads ALL historical versions, not just the immediately preceding one).
25. Always follow the Integration Stub Pattern when generating stubs (source: spec §32.9):
    Type A (CRM, BIM, ERP and all integration stubs not listed as Type B) — log WARN + fail-fast.
    Type B (IoT only, as specified in §32.9) — log WARN + return safe defaults.
ROOT CAUSE PREVENTION RULES (prevent recurring bugs):

  Rule 26 — Package dependency sync (prevents Bug-class-A: missing package.json deps):
    Before adding any `import { X } from 'package-name'` to a package's source file,
    verify 'package-name' is listed in that package's package.json (dependencies or
    devDependencies as appropriate). Never add imports without updating package.json first.
    Check: grep the package.json of the package being modified, not the root or another package.

  Rule 27 — turbo.json sync (prevents Bug-class-B: missing turbo task):
    When adding ANY new script to ANY package.json (build/test/lint/dev family),
    add the corresponding task to root turbo.json before committing.
    If the task is already covered by an existing turbo task, add a comment explaining why.

  Rule 28 — pnpm lock file (prevents Bug-class-C: CI frozen-lockfile failing):
    After ANY package.json change (add/remove/update dependency), run `pnpm install`
    locally to regenerate pnpm-lock.yaml and commit it in the same PR.
    pnpm-lock.yaml must exist and be up-to-date before CI `--frozen-lockfile` will pass.
    If pnpm-lock.yaml does not exist: run `pnpm install` immediately before any other work.

  Rule 29 — ADR reference verification (prevents Bug-class-D: referencing non-existent ADRs):
    Before writing `(see ADR-NNN)` in ANY spec file or code comment, verify:
    (a) `docs/architecture/adr/NNN-*.md` exists on disk, AND
    (b) its content covers the topic being referenced.
    If the ADR does not exist yet, create it first or write `(ADR-NNN — TO BE CREATED)`.

  Rule 30 — Async fake timer test pattern (prevents Bug-class-E: wrong jest timer pattern):
    When testing async functions that use setTimeout internally (retry helpers, pollers,
    backoff logic), use this pattern in Jest (requires jest ^29.1.0):
      beforeEach(() => jest.useFakeTimers())
      afterEach(() => jest.useRealTimers())
      await jest.runAllTimersAsync()  ← NOT jest.runAllTimers() (synchronous)
    Reason: jest.runAllTimers() fires timers synchronously but does NOT drain the microtask
    queue between retries — subsequent retries haven't queued their timers yet, causing tests
    to hang. jest.runAllTimersAsync() correctly interleaves timer firing with microtask draining.

  Rule 31 — Generate section completeness (prevents Bug-class-F: incomplete scope):
    Every Phase spec Generate section MUST be exhaustive. Specifically:
    (a) "Generate: complete directory structure with placeholder README per service" means
        EVERY service/package directory listed in the Directory Structure section above it,
        including all services/ subdirectories and all packages/@cos/* packages.
    (b) "Tooling: X" in a Phase spec means X must be fully initialized, not just declared
        in package.json. Example: "Git hooks: Husky" means .husky/ directory + pre-commit
        hook must exist — not just husky: "^9.0.0" in devDependencies.
    (c) Any tsconfig.json exception (e.g., React Native cannot extend CommonJS base) must be
        documented inline in the Generate section before implementation begins.

  Rule 32 — Single source of truth for jest config (prevents duplicate/conflicting jest config):
    jest configuration MUST live in ONE place per package: the external `jest.config.js` file.
    NEVER embed jest configuration under a "jest" key in package.json when jest.config.js exists
    in the same package — jest uses jest.config.js first, creating a silent conflict where the
    wrong config may be loaded depending on jest version and resolution order.
    Check: before committing, verify each package has AT MOST ONE of: jest.config.js OR "jest"
    key in package.json — never both.

  Rule 33 — `import type` for non-runtime dependencies (prevents bundling Node.js-only packages):
    When a TypeScript file imports from an external package ONLY for type annotations
    (no runtime usage — the imported symbol is only used in type positions), use
    `import type { X } from 'package'` instead of `import { X } from 'package'`.
    Reason: `import type` is erased at compile time and never bundled by any bundler
    (Metro, webpack, Rollup). `import { X }` creates a runtime dependency even if X is
    only used as a TypeScript type — this causes Metro to fail on Node.js-only packages.
    Examples requiring `import type`: PrismaClient in @cos/shared, express types in NestJS services
    using Fastify, any server-only type in packages imported by mobile.

  Rule 34 — @cos/shared must remain framework-agnostic (prevents mobile bundle failures):
    @cos/shared is imported by ALL platforms: mobile (React Native/Metro), PWA (Service Worker),
    and Node.js services. Therefore:
    (a) NO runtime import of Node.js-only packages (PrismaClient, native addons, file system).
        Use `import type` when types are needed (Rule 33).
    (b) NO runtime import of server-framework packages (express, fastify, NestJS decorators).
    (c) Classes/functions that require a Node.js runtime (e.g., OutboxPoller which polls a DB)
        must be moved to backend/src/ — NOT placed in @cos/shared.
    (d) Before adding any dependency to @cos/shared, verify it works in React Native/Metro bundler.
    Verify: check @cos/shared/package.json — every package listed in dependencies must be
    mobile-safe (pure JS, no native addons, no Node.js built-in-dependent runtime behavior).

  Rule 35 — Every @cos package with executable logic must have unit tests in CI (prevents untested logic):
    Definition of "executable logic": any exported function, method, or class with a body
    (not just TypeScript type aliases, interfaces, or enum declarations).
    Packages with executable logic MUST have:
    (a) jest.config.js with coverage thresholds { lines: 100, branches: 100 } (QM-1)
    (b) test:cov script in package.json
    (c) jest + ts-jest in devDependencies
    (d) Unit test files covering all exported functions/methods
    (e) Package included in CI coverage step (.github/workflows/ci.yml)
    Packages with executable logic as of Phase 1–8: @cos/financial (calculateLineTotal,
    convertCurrency, sumDecimals — QM-1 ALSO requires mutation testing for financial logic),
    @cos/rbac (ROLE_PERMISSIONS, decorators), @cos/validation (IsCurrencyCode, IsDecimalString),
    @cos/logger (createLogger), @cos/tracing (initTracing, shutdownTracing, getTraceId),
    @cos/config (loadConfig, getConfig).
    Packages exempt (no executable logic — only types/interfaces): @cos/types.

  Rule 36 — Exhaustive verification before claiming completion (prevents overstating completion confidence):
    Before reporting any Phase, task, or bug-fix set as "complete" or "all done":
    (a) Read the relevant spec section (Generate / Constraints / Exit Criteria) LINE BY LINE
    (b) For EACH item: run ls/grep/cat to verify it exists on disk — show the actual output
    (c) Only summarize after all items have ✅ filesystem evidence
    Never claim "complete" based on memory, partial checks, or only verifying known issues.
    The distinction that must be maintained: "I verified X" ≠ "everything is complete".
    This rule is the mandatory check at the end of EVERY Phase — not optional.

  Rule 37 — After modifying any file in docs/specifications/, immediately grep context.md and
    context/00_master_construction_os.md for the changed section number, technology name, or keyword:
      grep -n "<changed-keyword>" context.md context/00_master_construction_os.md
    If grep finds a match:
    (a) Read the matched section in the context file
    (b) Check for consistency with the spec change just made
    (c) Update the context file in the same commit if inconsistent
    If grep finds no match: no context update needed — proceed.
    Keywords to grep: section number (e.g. §5.5), technology name (e.g. Cloudflare),
    or the specific concept changed (e.g. tenant_id, WAF, protocol mapper).
    (prevents spec/context drift — root cause of WAF on-premise gap and JWT claim name
    inconsistency agent had to be explicitly reminded both times)

  Rule 38 — Pre-implementation spec extraction with mandatory product owner approval:
    BEFORE writing the first line of code for any Phase, task, or multi-step deliverable:
    (a) Read the Generate / Deliverables / Constraints section of the spec LINE BY LINE
    (b) Create one TodoWrite task per line item — before writing any code;
        tag each item as either READY or NEEDS_ESCALATION: <reason>
    (c) PRESENT the full list to the product owner — do NOT begin implementing until
        the product owner has reviewed and explicitly approved the list
    (d) For any item tagged NEEDS_ESCALATION — wait for product owner decision;
        do not implement a stub, do not skip, do not proceed unilaterally
    (e) Mark each task complete ONLY when it has filesystem evidence (ls/grep/cat output);
        Rule 36 is the per-item gate — not a single post-hoc check at the end
    Never begin implementation with a mental model of "what seems needed" —
    the spec Generate list is the complete and exhaustive obligation list.
    The product owner approval in step (c) is the human gate that closes the reasoning
    gap that automation cannot close.
    (root cause of Phase 6 gaps: OpenSearch indexing, integration tests,
    ConflictRecord notification, site.material.consumed)

25. When a rule in this document conflicts with a command in a Phase:

    THIS RULE SECTION takes precedence — surface the conflict, do not guess.

RULE CONFLICT RESOLUTION (Structural Fix #3):
  Apparent conflict example: Rule 8 says "never invent approval flows"
  but Phase 5 requires workflow implementation.
  Resolution: WORKFLOW ENGINE SPEC above provides the authoritative state
  machines. Rule 8 means: do not ADD states or transitions not in WORKFLOW
  ENGINE SPEC. Implement exactly what is specified — nothing more, nothing less.
```

---

## FINAL EXECUTION ORDER

> [v4 — อัปเดต Execution Order รวม Phase 24–25]

```text
Execution Order (respects dependency graph above):

1.  Foundation Repo          — no dependencies
2.  Auth + Tenant            — depends on: Phase 1
3.  Event Infrastructure     — depends on: Phase 2

      *** BLOCKING: Phases 4–8, 20–22, 25 cannot start until Phase 3 is complete ***

4.  Project Service          — depends on: Phase 2, 3
5.  BOQ Service              — depends on: Phase 2, 3, 4
6.  Procurement Service      — depends on: Phase 2, 3, 4, 5
7.  Site Operations          — depends on: Phase 2, 3, 4
8.  Finance Service          — depends on: Phase 2, 3, 5, 6
9.  File Service             — depends on: Phase 2, 3
10. Mobile Offline Engine    — depends on: Phase 2, 3, 4, 5, 7, 8, 9, 20, 21, 22
11. AI Foundation            — depends on: Phase 3, 9
12. AI Report Assistant      — depends on: Phase 11
13. Knowledge Graph          — depends on: Phase 4, 5, 6, 7, 8, 11
14. Analytics                — depends on: Phase 4, 5, 6, 7, 3, 13
20. Notification Service     — depends on: Phase 2, 3 (parallel with Phase 4–9)
21. Equipment Service        — depends on: Phase 2, 3 (parallel with Phase 4–9)
22. Workforce Service        — depends on: Phase 2, 3 (parallel with Phase 4–9)
25. Enterprise Provisioning  — depends on: Phase 2, 3, 20
23. MLOps Pipeline           — depends on: Phase 11, 14
24. Digital Twin             — depends on: Phase 13, 21, 23
15. Observability            — depends on: Phase 1–14, 20–25
16. Security                 — depends on: Phase 2, 15
17. DevOps                   — depends on: Phase 1, 15, 16
18. Testing                  — depends on: Phase 1–17, 20–25
19. Production Readiness     — depends on: Phase 1–18, 20–25

Note: Phases 20, 21, 22, 25 can be built in parallel with Phases 4–9
      after Phase 3 (Event Infrastructure) is complete.
      Phase 25 additionally requires Phase 20 (Notification Service).
      Phase 24 can be built after Phase 23 (MLOps Pipeline) completes.
```
