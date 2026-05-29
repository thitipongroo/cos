---
title: "Construction OS — Master Architecture Specification"
version: "1.32.0"
status: Active
last_updated: "2026-05-29"
authors:
  - thitipongroo
related_docs:
  - context.md
  - context/00_master_construction_os.md
---

# Construction And Real Estate Platform — END TO END Master Architecture

> **Status:** Active  
> **Scope:** Full platform architecture — All domains, All layers  
> **Audience:** Engineering, Product, Executive  
> **Last Updated:** 2026-05-29

---

## What Is This?

This is the master architecture specification suite for the **Construction Operating System (Construction OS)** — an AI-native, multi-tenant SaaS platform for the construction and real estate industry, built first for the Thai and Southeast Asian market.

These 35 documents cover everything from business architecture and data models to API contracts, security, AI layers, and go-to-market strategy. New team members should start with the [Reading Order](#reading-and-development-order) for their role. Developers building the MVP should read [03-system-design](03-system-design.md) and [21-mvp-scope](21-mvp-scope.md) first.

---

## 🚀 Quick Start for New Team Members

**Read in this order — takes approximately 2 hours:**

1. **[00-executive-overview](00-executive-overview.md)** (5 min) — What we're building and why
2. **[00-glossary](00-glossary.md)** (15 min) — Learn the terminology before reading anything else
3. **[03-system-design](03-system-design.md)** (10 min) — System topology at a glance
4. **[21-mvp-scope](21-mvp-scope.md)** (10 min) — What ships first; what is deferred
5. **Then read for your role** (see [Reading Order by Role](#reading-order-by-role) below)

> 💡 If you only have 30 minutes: read 00-executive-overview → 03-system-design → 21-mvp-scope.

---

## This document is the Construction OS master architecture specification

---

## Section Map

> **Naming note:** The Glossary and Executive Overview both use the `00-` filename prefix.
> The Glossary is a pre-numbered reference companion (read first); the Executive Overview is the
> first numbered document in the reading sequence. Both are listed in the 00-series below.
>
> **Versioning convention:** The `version` field in this README tracks the **specification suite** version.
> Individual spec files maintain their own `version` field tracking that file's content history.
> All files were initialised at `1.0.0`. Bump a file's individual version (→ `1.1.0`, `1.2.0`, etc.)
> when making substantive edits to that file — this enables engineers to track which spec version
> their implementation was written against. Record the change in the Changelog below.

| # | Section | File | Domain | Status |
| --- | --- | --- | --- | --- |
| 00 | Glossary | [00-glossary](00-glossary.md) | Terms, acronyms | Active |
| 00 | Executive Overview | [00-executive-overview](00-executive-overview.md) | Vision & scope | Active |
| 01 | Business Architecture | [01-business-architecture](01-business-architecture.md) | Business problems, domains, operating model | Active |
| 02 | System-wide Integration | [02-system-wide-integration](02-system-wide-integration.md) | End-to-end lifecycle, unified architecture | Active |
| 03 | System Design | [03-system-design](03-system-design.md) | High-level architecture, service decomposition | Active |
| 04 | Tech Stack | [04-tech-stack](04-tech-stack.md) | Frontend, backend, infra, observability, CI/CD | Active |
| 05 | Security & Compliance | [05-security-compliance](05-security-compliance.md) | Security controls, compliance targets | Active |
| 06 | RBAC Permission Matrix | [06-rbac-permission-matrix](06-rbac-permission-matrix.md) | Role definitions, module permissions, ABAC rules | Active |
| 07 | Multi-tenant Architecture | [07-multi-tenant-architecture](07-multi-tenant-architecture.md) | Isolation models, isolation layers | Active |
| 08 | Enterprise Deployment | [08-enterprise-deployment](08-enterprise-deployment.md) | Deployment options, enterprise requirements | Active |
| 09 | Data Architecture | [09-data-architecture](09-data-architecture.md) | Data domains, storage, flow, reporting | Active |
| 10 | Construction Ontology | [10-construction-ontology](10-construction-ontology.md) | Object model, relationships, cardinality | Active |
| 11 | Database Schema | [11-database-schema](11-database-schema.md) | Core entities, schema principles | Active |
| 12 | Construction Knowledge Graph | [12-construction-knowledge-graph](12-construction-knowledge-graph.md) | Graph nodes, relationships, use cases | Active |
| 13 | Product Architecture | [13-product-architecture](13-product-architecture.md) | Product layers, packaging | Active |
| 14 | API Architecture | [14-api-architecture](14-api-architecture.md) | API philosophy, gateway, versioning, endpoint patterns | Active |
| 15 | Event-driven Workflow | [15-event-driven-workflow](15-event-driven-workflow.md) | Event model, workflows, approvals, infrastructure | Active |
| 16 | Enterprise Event Flow | [16-enterprise-event-flow](16-enterprise-event-flow.md) | Enterprise event topology, cross-functional flows | Active |
| 17 | Offline-first Mobile Sync | [17-offline-mobile-sync](17-offline-mobile-sync.md) | Offline architecture, sync engine, conflict resolution | Active |
| 18 | Enterprise SaaS Scaling | [18-enterprise-saas-scaling](18-enterprise-saas-scaling.md) | Scaling layers, maturity model | Active |
| 19 | Notification Architecture | [19-notification-architecture](19-notification-architecture.md) | Channels, routing, escalation, preferences | Active |
| 20 | UX Flow | [20-ux-flow](20-ux-flow.md) | UX philosophy, role-based flows | Active |
| 21 | MVP Scope | [21-mvp-scope](21-mvp-scope.md) | MVP modules, KPIs, exclusions, CRM schema status | Active |
| 22 | AI Architecture | [22-ai-architecture](22-ai-architecture.md) | AI layers, components, LLM strategy | Active |
| 23 | AI-native Operating Model | [23-ai-native-operating-model](23-ai-native-operating-model.md) | Human+AI collaboration, operational modes | Active |
| 24 | AI Training Pipeline | [24-ai-training-pipeline](24-ai-training-pipeline.md) | Data sources, pipeline, RAG, MLOps | Active |
| 25 | Go-to-market | [25-go-to-market](25-go-to-market.md) | Entry strategy, wedge, expansion | Active |
| 26 | Pricing Model | [26-pricing-model](26-pricing-model.md) | SaaS tiers, revenue streams | Active |
| 27 | Long-term Moat Strategy | [27-long-term-moat](27-long-term-moat.md) | Data moat, workflow lock-in, ecosystem | Active |
| 28 | Ecosystem Expansion | [28-ecosystem-expansion](28-ecosystem-expansion.md) | Expansion phases, platform flywheel | Active |
| 29 | Final Strategic Positioning | [29-final-strategic-positioning](29-final-strategic-positioning.md) | Competitive positioning, end-state vision | Active |
| 30 | Testing Strategy | [30-testing-strategy](30-testing-strategy.md) | Test pyramid, CI/CD gates, quality gates | Active |
| 31 | Monitoring & Observability | [31-monitoring-observability](31-monitoring-observability.md) | Metrics, logging, tracing, SLOs, alerting | Active |
| 32 | Implementation Specifications | [32-implementation-specifications](32-implementation-specifications.md) | Phase Dependency Graph, Deployable Units, Extension Points, Event Contracts, Financial Precision, Workflow State Machines, Design Tokens | Active |
| 33 | Digital Twin and IoT Layer | [33-digital-twin-iot](33-digital-twin-iot.md) | Phase 24 spec — IoT integration, digital twins, carbon analytics, smart city | Active |

---

## Reading and Development Order

Files are numbered to match the recommended reading sequence for understanding the full architecture.
Reading 00 → 33 in order is the intended path for new team members.

Note : This is a **documentation reading order**, not a build sequence. Engineers building MVP
should read file [21](21-mvp-scope.md) (MVP Scope) immediately after [03](03-system-design.md)
(System Design) to understand which capabilities are in scope before reading platform details
in files 14–19.

**Phase 1 — Foundation** (00–08) : system topology, infrastructure decisions, security, permissions

[00](00-executive-overview.md) → [01](01-business-architecture.md) → [02](02-system-wide-integration.md) → [03](03-system-design.md) → [04](04-tech-stack.md) → [05](05-security-compliance.md) → [06](06-rbac-permission-matrix.md) → [07](07-multi-tenant-architecture.md) → [08](08-enterprise-deployment.md)

**Phase 2 — Data & Domain Model** (09–12) : what data exists, how it's stored, how it relates

[09](09-data-architecture.md) → [10](10-construction-ontology.md) → [11](11-database-schema.md) → [12](12-construction-knowledge-graph.md)

**Phase 3 — Platform Capabilities** (13–19) : APIs, events, offline, scaling, notifications

[13](13-product-architecture.md) → [14](14-api-architecture.md) → [15](15-event-driven-workflow.md) → [16](16-enterprise-event-flow.md) → [17](17-offline-mobile-sync.md) → [18](18-enterprise-saas-scaling.md) → [19](19-notification-architecture.md)

**Phase 4 — UX & Product Scope** (20–21) : who uses it, what ships in MVP

[20](20-ux-flow.md) → [21](21-mvp-scope.md)

**Phase 5 — AI** (22–24) : AI architecture, human collaboration model, training pipeline

[22](22-ai-architecture.md) → [23](23-ai-native-operating-model.md) → [24](24-ai-training-pipeline.md)

**Phase 6 — Business & GTM** (25–29) : go-to-market, pricing, long-term strategy

[25](25-go-to-market.md) → [26](26-pricing-model.md) → [27](27-long-term-moat.md) → [28](28-ecosystem-expansion.md) → [29](29-final-strategic-positioning.md)

---

## Reading Order by Role

**First-Time Readers:** [00](00-executive-overview.md) → [01](01-business-architecture.md) → [02](02-system-wide-integration.md) → [03](03-system-design.md) → [20](20-ux-flow.md)

> Vision and business context → full end-to-end lifecycle → system topology → who uses it.

**Engineering:** [03](03-system-design.md) → [21](21-mvp-scope.md) → [04](04-tech-stack.md) → [09](09-data-architecture.md) → [10](10-construction-ontology.md) → [11](11-database-schema.md) → [12](12-construction-knowledge-graph.md) → [07](07-multi-tenant-architecture.md) → [14](14-api-architecture.md) → [08](08-enterprise-deployment.md) → [05](05-security-compliance.md) → [06](06-rbac-permission-matrix.md) → [15](15-event-driven-workflow.md) → [16](16-enterprise-event-flow.md) → [17](17-offline-mobile-sync.md) → [19](19-notification-architecture.md) → [18](18-enterprise-saas-scaling.md)

**AI/ML:** [09](09-data-architecture.md) → [10](10-construction-ontology.md) → [22](22-ai-architecture.md) → [23](23-ai-native-operating-model.md) → [24](24-ai-training-pipeline.md) → [12](12-construction-knowledge-graph.md)

**Product/Strategy:** [01](01-business-architecture.md) → [13](13-product-architecture.md) → [20](20-ux-flow.md) → [21](21-mvp-scope.md) → [25](25-go-to-market.md) → [26](26-pricing-model.md) → [08](08-enterprise-deployment.md) → [27](27-long-term-moat.md) → [28](28-ecosystem-expansion.md) → [29](29-final-strategic-positioning.md)

---

## 📊 Document Status Dashboard

| Category | Files | Active | Draft |
| --- | --- | --- | --- |
| Pre-numbered (00-series) | 2 | 2 | 0 |
| Foundation (01–08) | 8 | 8 | 0 |
| Data & Domain (09–12) | 4 | 4 | 0 |
| Platform Capabilities (13–19) | 7 | 7 | 0 |
| UX & Product Scope (20–21) | 2 | 2 | 0 |
| AI (22–24) | 3 | 3 | 0 |
| Business & GTM (25–29) | 5 | 5 | 0 |
| Operations (30–31) | 2 | 2 | 0 |
| Implementation Specifications (32) | 1 | 1 | 0 |
| Platform Expansion (33) | 1 | 1 | 0 |
| **Total** | **35** | **35** | **0** |

Status Legend: **Active** = approved for implementation reference · **Review** = complete, pending team sign-off · **Draft** = in progress, not final

---

## Changelog

| Date | Version | Change | Author |
| --- | --- | --- | --- |
| 2026-05-29 | 1.32.0 | Docs audit follow-up (2026-05-29): [m-02/m-03] ADR-002–008 — added formal `## Alternatives Considered` tables and `## References` sections to all 7 ADRs (user-authorized per ADR immutability rule); `last_updated` updated on all 7; [m-05] `auth.openapi.yaml` (→v1.1.0) — removed `VIEWER` from `UserRole` enum (aligns with spec §6.2 canonical 9-role set; VIEWER retained in `ProjectMemberRole` for project-scope use only) | docs-spec-auditor |
| 2026-05-29 | 1.31.0 | Docs audit (2026-05-29): [C-01] created `docs/README.md` (doc-index v1.5.0) — entry point for all sub-trees with Quick Start table; [C-02] created `docs/api/README.md` (OpenAPI index v1.0.0) — 15-domain API file table with auth/pagination conventions; [M-01] corrected broken path `docs/runbooks/` → `docs/03-runbooks/` in `incident-response.md` (postmortem path), `rollback.md` (postmortem path), `production-readiness.md` ×2 (disaster-recovery + rollback links); [M-02] `production-readiness.md` §CI/CD — updated 3 deployment gate items to reflect ArgoCD GitOps model per ADR-012 (GitHub Actions = CI only, ArgoCD = CD); [M-03] `03-runbooks/README.md` SLA table corrected P0–P3 values to match `incident-response.md` (P0 5 min→<15 min; P1 15 min→<30 min; P2 1 h→<2 h; P3 4 h→<24 h); [m-01] ADR-010–014 body blockquote `ACCEPTED`→`Accepted` (status casing normalization — allowed per immutability exception); `last_updated` updated on all 5 ADRs; [m-04] added `related_docs` frontmatter to `02-manual/README.md` (→v1.2.0) and `03-runbooks/README.md` (→v1.1.0); added `Docs Index` link to Related Documents | docs-spec-auditor |
| 2026-05-28 | 1.30.0 | Spec re-audit (2026-05-28): [m-06] RFC 2119 normative language — 14 lowercase `must be` → `MUST be` in binding normative contexts across 6 files: 20-ux-flow (→1.2.0), 22-ai-architecture (→1.6.0), 30-testing-strategy (→1.4.0), 31-monitoring-observability (→1.7.0), 32-implementation-specifications (→1.8.0), 33-digital-twin-iot (→1.3.0). Code comments and table-cell shorthand excluded. | docs-spec-auditor |
| 2026-05-28 | 1.29.0 | Spec audit (2026-05-28): [m-01] README.md §Section Map versioning note corrected `1.25.0`→`1.29.0` (stale inline text); [m-02] README.md inline status corrected `ACTIVE`→`Active` (Title-case convention); [m-03] 05-security-compliance.md `changelog` frontmatter block removed (non-standard schema; suite uses README Changelog table); 05 bumped `1.4.0`→`1.5.0`; [m-05] 22-ai-architecture.md §22.3 normative language corrected: `will be orchestrated`→`MUST be orchestrated` (RFC 2119); 22 bumped `1.4.0`→`1.5.0` | docs-spec-auditor |
| 2026-05-27 | 1.28.0 | Spec audit pass (2026-05-27 v4 — docs-spec-auditor): [M-01/02] 01-architecture/README.md (→1.2.0) — added ADR-010–014 to ADR index; [M-03] deployment.md (→2.0.0) + rollback.md (→2.0.0) — rewritten to reflect ArgoCD GitOps per ADR-012; [M-04] docs/README.md (→1.4.0, renamed from readme.md) — api/ count corrected 10→15, 5 missing rows added; [M-05] SUPER_ADMIN→SYSTEM_ADMIN propagated to auth.openapi.yaml, ADR-003 canonical role table, 08_user-roles.md (→last_updated 2026-05-27); [M-06] docs/README.md frontmatter added; [m-01] readme.md renamed README.md; [m-02] 03-runbooks/README.md H1 corrected 04→03; [m-03] ADR-010–014 YAML frontmatter added; [m-05] ADR-001 + ADR-009 Alternatives Considered + References sections added | docs-spec-auditor |
| 2026-05-27 | 1.27.0 | Spec audit pass (2026-05-27 v3): [ISSUE-2701] 32-implementation-specifications §32.1 SaaS Maturity Model — added "Build-order exception — Phase 8" clarifying note resolving the apparent contradiction between Phase 8 being classified as Stage 3 while simultaneously being a BLOCKING prerequisite for Stage 2 (Phase 3–7); the note explains that the Stage classification reflects capability category (enterprise event bus), not build position, and that the "Stage N+1" agent rule applies to domain feature work, not infrastructure prerequisites; 32 bumped `1.6.0` → `1.7.0` | docs-spec-auditor |
| 2026-05-27 | 1.26.0 | Spec audit pass (2026-05-27 v2): [C-01] README.md frontmatter `version` was never bumped from `1.24.0` to `1.25.0` in the prior session — corrected to `1.26.0`; `last_updated` corrected `2026-05-26` → `2026-05-27`; inline **Last Updated** date corrected; [m-02] README.md reading order note corrected `00 → 29` → `00 → 33` (file 33 exists); [m-03] 33-digital-twin-iot §33.6 API endpoint table — added Auth column to all 5 endpoints (consistent with 14-api-architecture pattern); 33 bumped `1.1.0` → `1.2.0`; [R-01] GDPR/PDPA right-to-erasure pattern implemented in 11-database-schema §11.4 — added `pii_erased_at` field spec, PII-bearing entity table (Employee / Vendor / CRM–Lead / CRM–Contact), 5-step erasure procedure, and 4-state lifecycle table (PDPA §37 / GDPR Art. 17 compliance); 11 bumped `1.2.0` → `1.3.0`; [R-02] Kafka topic lifecycle management added to 07-multi-tenant-architecture §7.3 — retention policy table (SMB 7 days / Enterprise 30 days / DLQ 14 days), 7-step tenant offboarding topic cleanup procedure with audit log requirement; 07 bumped `1.3.0` → `1.4.0`; [R-03] pgvector HNSW upgrade trigger quantified in 22-ai-architecture §22.3 enforcement rule 3 — threshold: 500K rows OR p95 > 200 ms (7-day rolling window) per SMB tenant triggers mid-market tier migration; migration path documented; 22 bumped `1.3.0` → `1.4.0` | docs-spec-auditor |
| 2026-05-27 | 1.25.0 | Spec audit pass (2026-05-27): [M-01] README §Section Map versioning note updated `1.20.0`→`1.24.0` (stale inline text); [M-02] 26-pricing-model §26.1 token counting note updated — replaced `Claude, GPT-4o, Gemini Pro` with `OpenAI GPT-4o and gpt-4o-mini by default; additional providers via LLMProvider interface` (aligns with 22-ai-architecture §22.5 resolved provider strategy); 26 bumped 1.1.0→1.2.0; [m-01] 31-monitoring-observability References: replaced `[Tempo]` (Grafana Tempo — not used) with `[Jaeger]` (actual tracing tool per 04-tech-stack §4.5); 31 bumped 1.5.0→1.6.0; [m-02] 23-ai-native-operating-model References: replaced irrelevant `[Claude]` (Anthropic) with `[OpenAI]` (actual LLM provider); 23 bumped 1.2.0→1.3.0; [m-03] 32-implementation-specifications §32.4: resolved 2 ⚠️ event schema annotations — `site.report.submitted.avsc` canonical confirmed as `site.report.submitted.v1` (distinct from created; no draft state); `operational.event.avsc` marked REMOVE (CloudEvents v1.0 envelope replaces it); 32 bumped 1.5.0→1.6.0; [R-01] **EXPERT RECOMMENDATION**: GDPR/PDPA right-to-erasure gap — `deleted_at` soft-delete preserves PII indefinitely; recommend `pii_erased_at` + field nullification pattern; [R-02] **EXPERT RECOMMENDATION**: Kafka topic lifecycle management unspecified — add retention policy, tenant offboarding topic cleanup to 07-multi-tenant-architecture §7.3; [R-03] **EXPERT RECOMMENDATION**: pgvector HNSW upgrade trigger unquantified — recommend threshold of 500K rows / p95 > 200ms per tenant as the upgrade trigger | docs-spec-auditor |
| 2026-05-26 | 1.24.0 | AI stack propagation fixes (re-audit pass): [M-01] updated 00-glossary §AI & ML Terms — replaced stale `LiteLLM` entry with `LangChain` entry (langchain==0.2.*, langchain-openai==0.1.*); updated `LLM Gateway` entry to reference LangChain; replaced `multilingual-e5-large` entry with `text-embedding-3-small` entry (OpenAI, 1536 dim, EmbeddingProvider interface, EP-AI-012); updated `Embedding` entry to reference text-embedding-3-small; 00-glossary bumped 1.2.0→1.3.0; [m-01] removed non-standard `## See Also` heading from 00-glossary (keep inline `> 📎 See also:` blockquote); [m-02] updated 27-long-term-moat §27.6 Thai LLM row — replaced `multilingual-e5-large; Claude primary` with `text-embedding-3-small (OpenAI); GPT-4o primary`; [m-03] fixed extension-points.md EP-MOBILE-003 `FINANCE_OFFICER` → `FINANCE` (canonical role name from 06-rbac) | docs-spec-auditor |
| 2026-05-26 | 1.23.0 | Expert recommendation implementations: [R-01] added AI Provider Interfaces section to 32-implementation-specifications §32.3 — formal TypeScript + Python interfaces for LLMProvider and EmbeddingProvider (EP-AI-001/012), error types, resolved implementation table; 32 bumped 1.4.0→1.5.0; [R-02] added Vector Store Tenant Isolation section to 22-ai-architecture §22.3 — SQL schema with VECTOR(1536), HNSW index, tier-by-tier isolation strategy (SMB row-level/Mid-market schema/Enterprise dedicated), 5 enforcement rules; updated LAYER-C-001 note with evaluation rubric reference; added §22.6 LAYER-C-001 Evaluation Rubric (5-axis scoring, Thai construction benchmark, ADR template — decision deferred until trigger fires); 22 bumped 1.2.0→1.3.0; [R-03] added CRM API Availability section to 21-mvp-scope §21.6 — API open, UI excluded, role-gated access, rationale; 21 bumped 1.3.0→1.4.0; [R-04] replaced legacy Avro migration notice in 32 §32.4 with full categorized migration table — Group A (16 files with canonical equivalent, ready to migrate) + Group B (32 files needing canonical schema creation first, with suggested canonical names) | docs-spec-auditor |
| 2026-05-26 | 1.22.0 | [C-01] Resolved AI stack contradiction — extension-points.md is authoritative: updated 22-ai-architecture §22.3 LLM Gateway (LiteLLM proxy → LangChain 0.2.*) and §22.5 Provider Hierarchy (GPT-4o primary / gpt-4o-mini cost fallback, text-embedding-3-small 1536-dim replaces multilingual-e5-large); updated 24-ai-training-pipeline §24.2 Path B and §24.5 RAG Pipeline with same corrections; References sections updated in both files; 22 bumped 1.1.0→1.2.0, 24 bumped 1.2.0→1.3.0 | docs-spec-auditor |
| 2026-05-26 | 1.21.0 | Spec audit fixes: [M-01] created 5 missing OpenAPI 3.1 stub files — site.openapi.yaml, safety.openapi.yaml, ai.openapi.yaml, crm.openapi.yaml, vendor.openapi.yaml — each with full schemas, standard response envelope, role-based auth notes, and Kafka event emission references; stubs match endpoint patterns from 14-api-architecture §14.3; [M-02] added Legacy Avro Schema migration notice to 32-implementation-specifications §32.4 Schema Registry Rules documenting 48 non-canonical legacy files and deprecation/migration policy; 32 bumped 1.3.0→1.4.0; [m-01] replaced non-standard `## See Also` section in 30-testing-strategy with inline `> 📎 See also:` blockquote format; 30 bumped 1.2.0→1.3.0; [m-02] same See Also fix in 31-monitoring-observability; 31 bumped 1.4.0→1.5.0; [m-03] updated 00-executive-overview last_updated 2026-05-24→2026-05-26 and version 1.0.0→1.1.0; [m-04] fixed phantom role names PROC_OFFICER/PROC_MANAGER in extension-points.md EP-MOBILE-004 → canonical "Procurement Officer"; ⚠️ C-01 (AI stack contradiction between 22/24 spec and extension-points EP-AI-001/012/013) deferred — requires user decision; see Phase 5 note in audit report | docs-spec-auditor |
| 2026-05-25 | 1.20.0 | Spec audit fixes: [m-01] fixed MD051 broken ToC anchors in 02-system-wide-integration — Phase A–F headings use em-dash (`—`) which GFM converts to double-hyphen anchor; ToC links were using single-hyphen form (#phase-a-pre-construction → #phase-a--pre-construction, and same for B–F); 02 bumped 1.1.0→1.2.0 | docs-spec-auditor |
| 2026-05-25 | 1.19.0 | Spec audit fixes (pass 2): [m-01] backfilled version bumps for 5 files confirmed edited but never bumped — 27-long-term-moat 1.0.0→1.1.0 (§27.5 Moat Maturity/Stage Gate + §27.6 Key Dependencies + §27.7 Risks added in v1.1.0), 28-ecosystem-expansion 1.0.0→1.1.0 (§28.4 Phase Metrics + §28.5 Entry Criteria + §28.6 Risks added in v1.1.0), 33-digital-twin-iot 1.0.0→1.1.0 (§33.0 Standards Reference + MQTT5/IFC4/EN15804 normative specs + EP-DOMAIN updates + §33.8/33.10 content corrections in v1.6.0), 01-business-architecture 1.0.0→1.1.0 (ToC added in v1.1.0), 02-system-wide-integration 1.0.0→1.1.0 (ToC added in v1.1.0); [m-02] fixed MD012 double blank lines after H1 in 01 and 02 (same pattern as 13/20 fixed in v1.18.0) | docs-spec-auditor |
| 2026-05-25 | 1.18.0 | Spec audit fixes: [M-01] corrected misleading "shared Kafka topics" language in 07-multi-tenant-architecture §7.3 → "shared Kafka cluster/infrastructure; topics are per-tenant using `{tenant_id}.` prefix" (topics are per-tenant for ALL tiers; the word "shared" referred to infrastructure, not topics — confirmed by 15-event-driven-workflow §15.6); added cross-reference note to §15.6 for topic-name vs CloudEvents-type distinction; 07 bumped 1.2.0→1.3.0; [m-01] backfilled version bumps for 2 files edited but never bumped: 13-product-architecture 1.0.0→1.1.0 (Document Service note + AI forecasting note), 20-ux-flow 1.0.0→1.1.0 (RFI cross-reference note + MVP AI scope section); [m-02] fixed MD012 double blank line after H1 in 13 and 20; [m-03] fixed MD051 broken ToC anchors in 13 (em-dash anchors: #layer-N-core-platform→#layer-N--core-platform) and in 20 (#crm-sales-manager→#crm--sales-manager) | docs-spec-auditor |
| 2026-05-25 | 1.17.0 | Spec audit fixes: [M-01] corrected Stage 1 name in 32-implementation-specifications §32.1 "Single Tenant MVP"→"Multi-tenant MVP" (aligns with 18-enterprise-saas-scaling §18.3 and 21-mvp-scope §21.5 — MVP is built multi-tenant from Day 1); 32 bumped 1.2.0→1.3.0; [m-01] fixed MD012 double blank lines after H1 in 7 files — 07 (→1.2.0), 10 (→1.2.0), 12 (→1.2.0), 16 (→1.3.0), 19 (→1.2.0), 21 (→1.3.0), 24 (→1.2.0); [m-02] fixed MD060 mixed-style table in 24 §24.3 (tight rows + spaced separator → full spaced style); [m-03] fixed MD051 broken ToC anchors in 24 §24.2 (Path A/B em-dash anchors: #path-a-traditional→#path-a--traditional, #path-b-llm→#path-b--llm--rag-based-features) and in 07 §7.1 (Shared DB + tenant_id: #shared-db-tenant_id→#shared-db--tenant_id); [m-04] replaced non-standard `## See Also` section in 32 with inline `> 📎 See also:` blockquote pattern consistent with all other spec files | docs-spec-auditor |
| 2026-05-25 | 1.16.0 | Spec audit — IEEE 830-1998 §1.4 full compliance pass: [m-03] added `## References` sections (with inline-linked, MD034-compliant URLs) to all 18 remaining technical specification files — 03-system-design (→1.3.0), 04-tech-stack (→1.1.0), 06-rbac-permission-matrix (→1.1.0), 07-multi-tenant-architecture (→1.1.0), 08-enterprise-deployment (→1.2.0), 09-data-architecture (→1.1.0), 10-construction-ontology (→1.1.0), 11-database-schema (→1.2.0), 12-construction-knowledge-graph (→1.1.0), 16-enterprise-event-flow (→1.2.0), 17-offline-mobile-sync (→1.1.0), 18-enterprise-saas-scaling (→1.2.0), 19-notification-architecture (→1.1.0), 21-mvp-scope (→1.2.0), 23-ai-native-operating-model (→1.2.0), 24-ai-training-pipeline (→1.1.0), 32-implementation-specifications (→1.2.0), 00-glossary (→1.2.0); 33-digital-twin-iot marked N/A (§33.0 Standards Reference table satisfies IEEE 830); business/strategy docs 00-executive-overview, 01, 02, 13, 20, 25, 26, 27, 28, 29 marked N/A (no external standards to cite); pre-existing MD012/MD051 linter fixes in 04-tech-stack (double blank line, broken ToC anchor #46-ai-mlops→#46-ai--mlops) | docs-spec-auditor |
| 2026-05-25 | 1.15.0 | Spec audit fixes: [M-01] 14-api-architecture §14.3 OpenAPI table now complete — added 5 missing domain rows (Site, Safety, AI, CRM, Vendor) with `Planned — MVP` scope; renamed Finance→Financial to match section header; added Equipment APIs and Files APIs endpoint sections; 14-api-architecture bumped 1.1.0→1.2.0; [m-01] 16-enterprise-event-flow bumped 1.0.0→1.1.0 (content edited in v1.7.0, version never incremented); [m-03] added IEEE 830-1998 `## References` sections (with inline-linked URLs, MD034-compliant) to 5 remaining key technical files — 05-security-compliance (→1.2.0), 15-event-driven-workflow (→1.2.0), 22-ai-architecture (→1.1.0), 30-testing-strategy (→1.2.0), 31-monitoring-observability (→1.4.0); [m-04] 22-ai-architecture §22.3 renamed `DECISION PENDING [M-03]`→`[LAYER-C-001]` to eliminate collision with audit issue numbering convention | docs-spec-auditor |
| 2026-05-25 | 1.14.0 | Spec audit fixes: [M-01] added Auth (RBAC role) column to 8 of 9 API endpoint tables in 14-api-architecture that were missing it — Procurement, Financial, Site, Workforce, Safety, AI, CRM, and Vendor API tables now consistent with the Project APIs table pattern; per-endpoint role values cross-referenced against 06-rbac-permission-matrix; 14-api-architecture bumped 1.0.0→1.1.0; [m-01] corrected stale suite version in README §Section Map versioning note (1.12.0→1.14.0) | docs-spec-auditor |
| 2026-05-25 | 1.13.0 | Spec audit fixes: [M-01] corrected Section Map status for 31-monitoring-observability Draft→Active (aligning with frontmatter, Dashboard, and v1.11.0 changelog); [M-02] corrected stale versioning convention note in §Section Map (1.8.0→1.12.0); [m-01] backfilled individual file version bumps for 9 files edited in prior audit sessions but never version-bumped: 03-system-design 1.0.0→1.2.0 (diagram update v1.2.0 + ToC v1.4.0), 05-security-compliance 1.0.0→1.1.0 (ToC v1.2.0), 11-database-schema 1.0.0→1.1.0 (project_type enum v1.4.0), 15-event-driven-workflow 1.0.0→1.1.0 (approval diagram v1.4.0), 18-enterprise-saas-scaling 1.0.0→1.1.0 (ToC v1.2.0), 23-ai-native-operating-model 1.0.0→1.1.0 (ToC v1.2.0), 25-go-to-market 1.0.0→1.1.0 (ToC v1.4.0), 26-pricing-model 1.0.0→1.1.0 (ToC v1.7.0), 29-final-strategic-positioning 1.0.0→1.1.0 (ToC v1.2.0); [m-02] fixed heading case in 29 §29.1 "Comparable strategic layer"→"Comparable Strategic Layer", §29.2 "The long-term winner"→"The Long-term Winner" | docs-spec-auditor |
| 2026-05-25 | 1.12.0 | Keycloak backup correctness fix: [C-01] replaced non-standard backup method (kcadm.sh get realms) with official Keycloak partial-export REST API (POST /admin/realms/{realm}/partial-export?exportClients=true&exportGroupsAndRoles=true) in keycloak-realm-backup.md; [C-02] replaced full Keycloak JVM image with minimal python:3.12-slim + curl + awscli backup image — includes Dockerfile and ECR build steps; [C-03] corrected false master realm recovery claim — Helm re-apply does not restore DB records; master realm requires database-level PITR restore (disaster-recovery.md Section E); keycloak-realm-backup.md bumped to v1.1.0 | thitipongroo |
| 2026-05-25 | 1.11.0 | Recommendation implementation: [R-01] promoted 31-monitoring-observability status Draft→Active (v1.3.0); [R-02] added Pre-flight section to kafka-partition-rebalance.md — live consumer group discovery via kafka-consumer-groups.sh --list removes dependency on hardcoded names; [R-03] created keycloak-realm-backup.md — full daily CronJob spec (schedule, YAML manifest, IRSA policy, S3 lifecycle rule, deployment steps, verification checklist, limitations table); linked from keycloak-realm-recovery.md See Also and 31-monitoring-observability §31.9 runbook table; updated README v1.10.0→v1.11.0 | thitipongroo |
| 2026-05-25 | 1.10.0 | Second-pass audit fixes: [M-01] 31-monitoring-observability §31.9 BLOCKING notice removed — all 4 runbooks now exist; runbook table updated with links to db-failover, kafka-partition-rebalance, keycloak-realm-recovery, temporal-worker-restart; [M-02] keycloak-realm-recovery.md access token expiry corrected 5 min → 15 min (aligned with 05-security-compliance §5.4); [m-01] kafka-partition-rebalance.md DLQ topic example updated to match spec format ({tenant_id}.{domain}.dlq); [m-02] kafka-partition-rebalance.md consumer group names replaced with spec-convention placeholders ({service_name}.shared); markdown linter fixes (MD032, MD040, MD060) across all 4 new runbooks; version bump 1.9.0 → 1.10.0 | docs-spec-auditor |
| 2026-05-25 | 1.9.0 | Post-audit implementation: [I-01] created 4 BLOCKING runbooks in docs/03-runbooks/ — db-failover.md (PostgreSQL RDS Multi-AZ, Sections A–D + failure patterns), kafka-partition-rebalance.md (MSK consumer lag, rebalance, DLQ triage), keycloak-realm-recovery.md (pod restart, realm import from S3, dedicated realm recovery, JWKS key rotation), temporal-worker-restart.md (crashed worker restart, stuck workflow triage, workflow reset, graceful shutdown); [I-02] individual file version bump 1.0.0→1.1.0 on all files edited in audit session: 00-glossary, 08-enterprise-deployment, 21-mvp-scope, 30-testing-strategy, 31-monitoring-observability, 32-implementation-specifications; [I-03] promoted 30-testing-strategy status Review→Active; updated Status Dashboard (Operations: 2 Active / 0 Draft; Total: 35/35 Active) | thitipongroo |
| 2026-05-25 | 1.8.0 | Spec audit fixes: [M-01] fixed NestJS glossary entry (microservices → Modular Monolith) in 00-glossary; [M-02] fixed Helm chart packaging line (microservice → deployable unit) in 08-enterprise-deployment §8.6; [M-03] corrected internal cross-reference 21.5→21.6 in 21-mvp-scope §21.2; [M-04] clarified 31-monitoring-observability §31.9 BLOCKING runbooks with numbered list + label; [m-01] added versioning convention note to README §Section Map; [m-02] promoted 30-testing-strategy status Draft→Review + added 32 to related_docs; [m-03] added bidirectional cross-references between 30-testing-strategy ↔ 32-implementation-specifications; updated Status Dashboard (Operations: 1 Active 1 Review); MD028 linter fixes in 00-glossary and README | docs-spec-auditor |
| 2026-05-25 | 1.7.0 | Spec audit fixes: [M-01] replaced "microservice" with "service / deployable unit" + added architecture note in 31-monitoring-observability §31.1; [M-02] replaced stale Phase 24 placeholder note in 32.1 with forward-reference to 33-digital-twin-iot.md; [m-01] corrected README intro doc count 34→35; [m-02] added PascalCase disambiguation note to 16-enterprise-event-flow §16.2; [m-03] added enum casing convention note (PostgreSQL lowercase vs Avro UPPERCASE) to 32.4; [m-04] added ToC to 26-pricing-model; updated last_updated on all 5 edited files | docs-spec-auditor |
| 2026-05-25 | 1.6.0 | Global standard alignment in 33-digital-twin-iot: [M-01] added §33.0 Standards Reference table (MQTT 5.0 OASIS, IFC4 ISO 16739-1:2018, EN 15804:2012+A2:2019 / ISO 21930:2017, ISO 14064-1:2018, CloudEvents v1.0); [M-02] added MQTT 5.0 protocol spec to §33.3 (QoS 1/2, topic structure); [M-03] added IFC4 STEP file format and IFC GlobalId spec to §33.3 and §33.4 TwinEntity.digital_ref; [M-04] replaced vague carbon factor library description with EN 15804/ISO 21930 A1-A3 module spec in §33.4 CarbonRecord; added carbon_factor_source field; [M-05] updated EP-DOMAIN-002 with IFC4 standard detail; updated EP-DOMAIN-003 with MQTT 5.0 QoS and topic spec in §33.7; [M-06] removed made-up infrastructure numbers (chunk interval, throughput target) from §33.8; [M-07] removed made-up success metric values from §33.10; replaced with planning-gate requirement | thitipongroo |
| 2026-05-25 | 1.5.0 | Product owner fixes: [M-01] resolved REVIEW NEEDED flag in 32.6 RFQ workflow — EVALUATED→AWARDED/CANCELLED role confirmed as `Procurement Officer` (06-rbac: Procurement Officer has RWD on RFQ; PM has R only); [M-02] fixed UserRole enum in auth.openapi.yaml — replaced phantom roles PROC_OFFICER/PROC_MANAGER/FINANCE_OFFICER with canonical 06-rbac names (PROCUREMENT_OFFICER, FINANCE); added missing roles EXECUTIVE, SITE_ENGINEER, SAFETY_OFFICER, CRM_SALES_MANAGER; [M-03] created 33-digital-twin-iot.md — Phase 24 full spec (architecture, data model, Kafka events, API layer, extension points, infrastructure, revenue model, success metrics); [M-04] created 15 canonical Avro schema files matching 32.4 event contracts (BACKWARD_TRANSITIVE, subject naming {topic_name}-value); [m-01] added 33 to README Section Map and Dashboard (total 35 docs, 33 Active); updated version 1.4.0→1.5.0 | thitipongroo |
| 2026-05-25 | 1.4.0 | Spec audit fixes: [M-01] standardised all 15 event type names in 32 to follow 15-event-driven-workflow §15.6 format ({domain}.{entity}.{action}.v1) — added version suffixes, expanded domain prefixes, corrected entity abbreviations; [M-02] corrected event #13 domain from `finance` to `procurement` (vendor_invoice.approved — AP, not AR); [M-03] replaced PROC_OFFICER/PROC_MANAGER/FINANCE_OFFICER in 32.6 state machines with canonical role names from 06-rbac; added REVIEW NEEDED note for RFQ award role; [m-01] fixed README intro doc count 32→34; [m-02] added YAML frontmatter to README, updated Last Updated 2026-05-24→2026-05-25; [m-03+04] added ToC to 03-system-design and 25-go-to-market; [m-05] expanded 15 approval workflow diagram to show Step N wait/approve/reject logic; [m-06] added project_type enum values to 11-database-schema; [m-07] added Phase 24 placeholder note to 32.1; MD040/MD032/MD012 linter fixes in 32 | docs-spec-auditor |
| 2026-05-25 | 1.3.0 | Documentation restructure: [R-01] deleted docs/01-roadmap/ (redundant — derived from context/); [R-02] created 32-implementation-specifications.md (promoted Phase Dependency Graph, Deployable Units, Extension Point System, Event Contracts, Financial Precision, Workflow State Machines, Design Tokens from context/00_master); [R-03] fixed authority hierarchy in context/00_master_construction_os.md (specs now rank 1); [R-04] removed roadmap links from README Related Documents; [R-05] added Derived-from annotations to Type B sections in context/00_master | thitipongroo |
| 2026-05-24 | 1.2.0 | Spec audit fixes: [C-01] corrected SLA claim in 27 (SMB 99.5% not 99.9%); [M-01] clarified dual 00-prefix naming in README; [M-02–04] added missing ToCs to 05, 23, 29; [M-05] added post-MVP scope disclaimer to Digital Twin API in 14; [m-01] removed duplicate See Also in 31; [m-02] updated 03 system design diagram (DB-first write path); [m-03] added What Is This + Quick Start to README; [m-04] added ToC to 18; [m-05] added 5 missing tool glossary terms; MD060 table style fixes across 05, 18, 29 | docs-spec-auditor |
| 2026-05-24 | 1.1.0 | Added 00-glossary, 30-testing-strategy, 31-monitoring-observability; Status column added to Section Map; YAML frontmatter standardized across all docs; MD060/MD031/MD004 linter issues resolved; TOCs added to all long documents; canonical API endpoint patterns added to 14; expanded 27 and 28 with metrics, risks, and phase criteria | thitipongroo |
| 2026-05-24 | 1.0.0 | Initial specification set (00–29) | thitipongroo |

---

## Related Documents

| Document | Location |
| --- | --- |
| Docs Index | [docs/README.md](../README.md) |
| Agent Entry Point | [context.md](../../context.md) |
| Agent Master Spec | [context/00_master_construction_os.md](../../context/00_master_construction_os.md) |
| Architecture Overview & ADRs | [docs/01-architecture/README.md](../01-architecture/README.md) |
