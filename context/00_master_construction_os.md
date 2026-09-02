---
title: Construction OS — Master Specification
role: master
version: 1.17.1
last_updated: 2026-08-22
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

| Section | Where |
| --- | --- |
| [AGENT ROLE](#agent-role) | here |
| [PHASE DEPENDENCY GRAPH](#phase-dependency-graph) | here |
| [ENGINEERING GOVERNANCE](#engineering-governance) | here — Risk Register, Phase Register, effort |
| [GLOBAL TECHNOLOGY DECISION MAP](#global-technology-decision-map) | here |
| [GLOBAL SYSTEM CONTEXT COMMAND](#global-system-context-command) | here — deployable units, runtime mapping |
| [CROSS-CUTTING SPECIFICATIONS](#cross-cutting-specifications) | index — the four specs moved to `.claude/rules/` |
| [PHASE COMMANDS 1–25](#phase-commands-125) | index — the 25 blocks moved to `context/phases/` |
| GLOBAL EXECUTION RULES + Rules 26–40 | here, below the phase index |
| [FINAL EXECUTION ORDER](#final-execution-order) | here |

> This document was 6,407 lines until 2026-09-02. The 25 Phase commands and the four
> cross-cutting specifications moved to their own files that day — verbatim, nothing
> shortened — because they were 83% of the file and at most one phase applies to any
> one task. What is left is what a session actually needs every time.
>
> Map: `.claude/skills/phase-index/SKILL.md`. Rule 37 now greps `context/`,
> `context.md` and `.claude/rules/` together, so drift is still caught across all
> three.

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

## ENGINEERING GOVERNANCE

> Governs **how the roadmap files `context/01–11` are authored, risk-managed, and sequenced**. Deep
> non-functional standards are authoritative in `docs/specifications/` and are only referenced here —
> never restated divergently. Three parts: Phase Template · Risk Register · Roadmap Governance.

### Phase Template & Traceability Standard

**Phase-block taxonomy (all equivalent; each file uses one consistently):** `## EXECUTION PHASE …`
(`context/02`, `03`, `05`–`11`; each groups the related `## … COMMAND` blocks under it) ·
`## PRIORITY …` (`context/01`, MVP priorities) · `## PHASE …` (this file's Phase 1–25, and
`context/04`). Every phase-block carries a one-sentence Objective — inline `### Objective`
(`02`/`03`/`05`–`11`) or in the file's § OBJECTIVES register (`01`/`04`).

Every phase-block in `context/01–11` (any taxonomy above) MUST contain, in order:

```text
Objective            — one sentence: the outcome, not the activity
Scope (In / Out)     — explicit in-scope + explicit out-of-scope (defer targets)
Spec references      — authoritative docs/specifications/ §sections (bi-directional traceability)
Requirements         — capabilities to build
Generate             — concrete artifacts (MUST-HAVE vs NICE-TO-HAVE)
Acceptance criteria  — checkbox list, each verifiable by ls/grep/test/dashboard (Rule 36 evidence)
Metrics / SLO gate   — measurable target numbers the phase must hit (inherit from the specs, below)
Dependencies         — upstream phases + external decisions (AWAITING_DECISION ids)
Risks                — top 1–3 risks for this phase (link § Risk Register ids)
Effort               — T-shirt size + rough engineer-weeks
Exit criteria        — phase is DONE only when every acceptance box has filesystem/metric evidence
```

REQUIRED (block the phase if missing): Objective, Spec references, Acceptance criteria, Metrics/SLO
gate, Dependencies, Risks, Exit criteria. RECOMMENDED: Scope In/Out, Effort.

**Traceability rule:** every phase cites the authoritative `docs/specifications/` §section for its
domain; on conflict **spec wins** (per `context.md`) and the conflict is reported. Non-functional
targets (availability, latency, RTO/RPO, security, cost) are **inherited** from the specs — SLO
`31 §31.6`, DR `08 §8.2`, security `05 §5.9`, supply-chain `05 §5.10`, AI security `22 §22.8`,
AI engineering (RAG-eval / token cap / cache) `22 §22.10`, accessibility `20 §20.8`, frontend Web
Vitals `31 §31.6` + Lighthouse `30 §30.9`, FinOps/sustainability `08 §8.10`/`§8.11`, DORA `31 §31.12`,
capacity `18 §18.4` — phases reference them, never restate the numbers.

**Acceptance-criteria quality bar** — each box MUST be falsifiable by evidence:

- ✅ "Offline sync success > 98% on the pilot cohort (from the `sync_status` dashboard)"
- ✅ "`turbo run build` green on every service in CI; 0 manual deploy paths"
- ❌ "improve reliability" · ❌ "build observability" · ❌ "achieve enterprise-grade …"

Vague verbs (build / improve / achieve / establish) without a number or an artifact path are a
template violation. Benchmark: arc42 (§1/§9/§10/§11), Google SRE (SLO/error budget), AWS
Well-Architected (Operational Excellence).

### Risk Register

Reviewed at every stage gate and monthly. Each phase references the risk ids relevant to it.
Scoring: Likelihood {Low, Med, High} × Impact {Low, Med, High, Critical}. Owner = accountable role.

| ID       | Risk                                                                                                                                                                                                                                                                                                                      | L × I          | Owner         | Mitigation                                                                                                                                                                                                                                                                                                                                    | Early-warning metric                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **R-01** | **3rd-party mobile-lib fragility** — WatermelonDB 0.28 + @morrowdigital plugin + RN 0.85 required a 7-layer native integration fix (JDK, prebuild, kotlin, CMake pnpm-path, JSIModulePackage, babel). Community plugins lag the SDK.                                                                                      | High × High    | Mobile Lead   | **Mitigated at source (2026-07-05):** WatermelonDB replaced by Drizzle + expo-sqlite (first-party) — spec `17 §17.10` / ADR-048; CMake patch, config plugins, simdjson pin and decorators/loose babel removed; G1/G2 measured within absolute envelope. Residual: `patches/react-native` (#54732) until upstream fix; pin+verify deps (R-07). | Mobile CI red on `expo prebuild` / native build; upstream plugin unmaintained > 2 SDKs |
| **R-02** | **Cross-tenant data leak** — RLS misconfiguration exposes one tenant's data to another. Catastrophic + PDPA-fineable.                                                                                                                                                                                                     | Low × Critical | Security Lead | RLS mandatory on every domain table (`07 §7.7`); `app.current_tenant_id` set before every query; isolation tests in CI; STRIDE on every new surface (`05 §5.9`).                                                                                                                                                                              | Any query without tenant filter in review; isolation-test failure                      |
| **R-03** | **PDPA non-compliance** — Thai PDPA actively enforced (8 fines / THB 21.5M since Aug 2025); missing DPO / 72h breach flow / erasure.                                                                                                                                                                                      | Med × High     | DPO / Legal   | PDPA hard requirements (`05 §5.3`): 72h breach workflow, DPO, subject-rights portal, RoPA, data residency `ap-southeast-7`; annual PDPA audit.                                                                                                                                                                                                | Breach-response drill > 72h; RoPA stale; residency exception logged                    |
| **R-04** | **Offline sync conflict / data loss** — the sync engine (SyncManager, ConflictHandler, delta pull/push, PhotoUploadQueue) is the highest-value + most bug-prone logic.                                                                                                                                                    | Med × High     | Mobile Lead   | 3 conflict-resolution strategies (Phase 10); sync success > 98% SLO; unit + Detox e2e for conflict cases; idempotent delta cursor (`17`).                                                                                                                                                                                                     | Sync success < 98%; rising unresolved-conflict count                                   |
| **R-05** | **Adoption failure** — field workers don't submit reports; platform becomes shelfware.                                                                                                                                                                                                                                    | Med × High     | Product Owner | Measurable adoption gates (`context/01`: report < 2 min, > 70% submission, > 5 sessions/wk); change-management (`context/03`).                                                                                                                                                                                                                | Daily submission rate < 70% at 30/60/90 days                                           |
| **R-06** | **Premature scaling / over-engineering** — building marketplace/ML/"industry infrastructure" before product-market fit.                                                                                                                                                                                                   | Med × Med      | Eng Lead      | Monolith-first + "extract with evidence" (`context/01`); roadmap governance splits committed (01–04) from vision (05–11) (below); no hyperscale optimization before 10k DAU (`18 §18.4`).                                                                                                                                                     | Service split without ownership+scaling evidence; effort spent on 05–11 pre-PMF        |
| **R-07** | **SDK / dependency churn & EOL** — Expo/RN upgrade treadmill; transitive CVEs.                                                                                                                                                                                                                                            | High × Med     | Eng Lead      | Pin to stable SDK; scheduled upgrade cadence; SBOM (CycloneDX) + `pnpm audit` gate in CI; supply-chain per OWASP 2025 A03 (`05 §5.10`).                                                                                                                                                                                                       | New high/critical CVE in SBOM; SDK N-2 unsupported                                     |
| **R-08** | **Ecosystem interop execution** — the interop standard is **decided** (INT-004: **IFC 4.3 (ISO 16739-1:2023) + buildingSMART Digital Framework**, `33 §Industry Standardization Alignment`, resolved 2026-06-10); residual risk is emitting standards-compliant output + tracking IFC 5 / ISO 19650 finalization (~2027). | Low × Med      | Architecture  | Conform ecosystem output to IFC 4.3 + CORENET-X (Singapore); monitor IFC 5 alpha / ISO 19650 DIS.                                                                                                                                                                                                                                             | IFC export fails buildingSMART conformance; standard finalization missed               |
| **R-09** | **Event-delivery / data-consistency loss** — Kafka backpressure or consumer lag drops operational events.                                                                                                                                                                                                                 | Med × High     | Platform Lead | Event delivery > 99.9% SLO; consumer-lag SLO + alerts (`31 §31.6`); DLQ + replay; outbox pattern.                                                                                                                                                                                                                                             | Consumer lag > 5,000 / 2 min; DLQ growth                                               |

Review cadence: per stage gate (re-score all; `High × Critical` blocks the gate); monthly (early-warning
metrics alongside the SLO/DORA review); on any new dependency / external surface (add or re-score before shipping).

### Roadmap Governance & Horizon Classification

The roadmap files escalate from an executable MVP to "civilization-scale" intent. A world-class roadmap
must not blur **what is committed** with **what is aspirational**. Horizon classification (authoritative):

| Horizon                 | Files                                                 | Status                                    | Planning rigor                                                 |
| ----------------------- | ----------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| **NOW** (0–6 mo)        | `context/01` (Priority 0–5) + `context/04 Phase 0`    | **Committed**                             | Full phase template + metrics + effort                         |
| **NEXT** (6–18 mo)      | `context/02` · `context/03` · `context/04 Phase 1–6`  | **Committed**                             | Full phase template + inherited gates                          |
| **LATER** (18 mo+)      | `context/04 Phase 7–11` · `context/05` · `context/06` | **Planned — not committed**               | Objective + dependencies + AWAITING_DECISION; metrics on entry |
| **VISION** (multi-year) | `context/07`–`context/11`                             | **Directional vision — NOT a commitment** | Intent + open decisions only; no effort/date commitments       |

**Rule:** nothing in LATER/VISION may pull engineering effort from NOW/NEXT without an explicit
product-owner decision. Terms like "civilization-scale / planetary / background civilization" describe
long-term intent, not a planned deliverable. Review discipline: NOW/NEXT at every stage gate against the
template + gates + risk register; LATER quarterly (promoted to NEXT only with metrics + effort); VISION
annually (may be rewritten or dropped; excluded from capacity planning).

> **Where each standard now lives** (deep content is in the specs; this section is the execution index):
> phase-authoring → § Phase Template · risk → § Risk Register · reliability/SLO → `31 §31.6` · chaos+DORA
> → `31 §31.11`/`§31.12` · DR → `08 §8.2` · FinOps/sustainability → `08 §8.10`/`§8.11` · security/STRIDE
> → `05 §5.9`/`§5.10` · AI security → `22 §22.8`/`§22.9` · AI engineering (RAG-eval, prompt registry,
> per-tenant token cap COST-001, semantic cache) → `22 §22.10` · accessibility → `20 §20.8` · frontend
> Web Vitals (LCP/INP/CLS) → `31 §31.6` + Lighthouse CI `30 §30.9` · C4 → `03 §3.4` · capacity →
> `18 §18.4` · data governance → `09 §9.8`.

### Phase Register (Objective · Dependencies · Risks · Exit · Effort)

Retrofits Phase 1–25 to the § Phase Template. **Acceptance** for every phase = its `Generate:` list
(each artifact falsifiable by `ls`/`grep`) + the applicable **QUALITY MANDATES** gates; the **Metric**
gate is the phase's QM/SLO reference (coverage 100/100 per QM-1; SLO per `31 §31.6`). Dependencies are
from § PHASE DEPENDENCY GRAPH (authoritative: `32 §32.1`); Risks link § Risk Register.

**Effort — engineering estimate from scope (to be ratified by the product owner; not a commitment).**
Basis: deliverable scope (Generate-item count), integration surface, and known build difficulty (e.g.
Ph10 native-mobile complexity observed directly). Scale (per `context/04`): S ≈ 1–2 wk · M ≈ 2–4 wk /
2–3 eng · L ≈ 4–8 wk / 3–5 eng · XL ≈ 8–20 wk / 4–6 eng.

| Phase                         | Est    | Basis for estimate                                                                                                                |
| ----------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 1 Foundation Repository       | **L**  | monorepo + CI + 9 packages + Docker Compose + 100/100 coverage config — broad but standard scaffolding                            |
| 2 Auth + Tenant System        | **XL** | Keycloak OIDC + RLS + RBAC/ABAC + 2 auth paths + tenant isolation — largest, security-critical foundation                         |
| 3 Project Service             | **M**  | core domain CRUD + events + RLS                                                                                                   |
| 4 BOQ Service                 | **M**  | BOQ engine + financial-precision calculations                                                                                     |
| 5 Procurement Service         | **L**  | PR → RFQ → PO state machine + events + vendor flows (large scope)                                                                 |
| 6 Site Operations             | **L**  | site reporting + checklists + photo intake (large scope)                                                                          |
| 7 Finance Service             | **L**  | billing / AR / payments + financial precision                                                                                     |
| 8 Event-driven Infrastructure | **L**  | Kafka + outbox + DLQ + schema registry; foundational (blocks Ph3–7)                                                               |
| 9 File + Document System      | **M**  | tenant-scoped storage + signed URLs + antivirus + OCR intake                                                                      |
| 10 Mobile Offline Engine      | **XL** | offline-first + Drizzle/expo-sqlite sync (§17.10) + 3 conflict strategies + Detox + native builds — hardest (R-01/R-04, observed) |
| 11 AI Foundation              | **L**  | RAG + LLM Gateway + pgvector + hybrid search + reranking — novel                                                                  |
| 12 AI Report Assistant        | **M**  | builds on Ph11 gateway; report generation + guardrail                                                                             |
| 13 Knowledge Graph            | **M**  | KG ingestion + normalization                                                                                                      |
| 14 Analytics + Dashboard      | **M**  | ClickHouse dashboards + queries                                                                                                   |
| 15 Observability              | **L**  | full OTel + Prometheus + Grafana + Loki + Jaeger + SLO across all services                                                        |
| 16 Security                   | **L**  | STRIDE + SBOM + WAF + pentest + hardening                                                                                         |
| 17 DevOps + Deployment        | **L**  | CI/CD + multi-region + GitOps (ArgoCD) + Helm                                                                                     |
| 18 Testing                    | **L**  | full suite + mutation ≥70% + load + e2e across all services                                                                       |
| 19 Final Production Readiness | **M**  | 39-check gate — verification/gating, little net-new build                                                                         |
| 20 Notification Service       | **M**  | service + SSE + channels + escalation                                                                                             |
| 21 Equipment Service          | **M**  | domain CRUD + RLS                                                                                                                 |
| 22 Workforce Service          | **M**  | domain CRUD + RLS                                                                                                                 |
| 23 MLOps Pipeline             | **L**  | MLflow + Feast + Evidently — several new infra components                                                                         |
| 24 Digital Twin               | **L**  | IoT (EMQX) ingestion + twin — novel domain                                                                                        |
| 25 Enterprise Provisioning    | **L**  | dedicated-DB per tenant + SSO/SAML + Temporal provisioning workflow (large scope)                                                 |

Distribution: **XL** ×2 (Ph2, Ph10) · **L** ×13 · **M** ×10. No phase estimated **S** — every phase
carries real integration surface.

**Phase 1 — Foundation Repository** · deps: — · risk `R-07`

- Objective: stand up the monorepo, toolchain, and CI foundation.
- Exit: `turbo run build` green on every service; jest 100/100 coverage config + Docker Compose + CI pipeline present.

**Phase 2 — Auth + Tenant System** · deps `Ph1` · risk `R-02, R-03`

- Objective: multi-tenant authentication + tenant isolation foundation.
- Exit: RLS on tenant tables; isolation test proves no cross-tenant read; JWT/Keycloak auth verified.

**Phase 3 — Project Service** · deps `Ph2, Ph8` · risk `R-02`

- Objective: project domain service.
- Exit: project APIs pass the isolation-test suite; RLS enforced.

**Phase 4 — BOQ Service** · deps `Ph3, Ph8` · risk `R-02`

- Objective: Bill-of-Quantities engine.
- Exit: BOQ calculations + financial-precision tests green; RLS enforced.

**Phase 5 — Procurement Service** · deps `Ph3, Ph4, Ph8` · risk `R-02, R-09`

- Objective: procurement (PR → RFQ → PO) domain.
- Exit: procurement state machine emits verified typed events; RLS enforced.

**Phase 6 — Site Operations** · deps `Ph3, Ph8` · risk `R-02`

- Objective: site operations + daily reporting domain.
- Exit: site-report APIs pass the isolation-test suite.

**Phase 7 — Finance Service** · deps `Ph4, Ph5, Ph8` · risk `R-02`

- Objective: finance domain (billing, AR, payments).
- Exit: finance calculations + precision tests green; RLS enforced.

**Phase 8 — Event-driven Infrastructure** · deps `Ph2` (blocks Ph3–7) · risk `R-09`

- Objective: Kafka event backbone + outbox + DLQ (shared event SDK).
- Exit: `allowAutoTopicCreation:false`; DLQ + replay present; event delivery > 99.9% verified.

**Phase 9 — File + Document System** · deps `Ph2` · risk `R-02`

- Objective: file/document storage + OCR intake.
- Exit: tenant-scoped object keys + signed URLs; ClamAV scan + quarantine on threat.

**Phase 10 — Mobile Offline Engine** · deps `Ph3–7, Ph9, Ph20–22` · risk `R-01, R-04`

- Objective: offline-first mobile app + sync engine.
- Exit: Detox e2e green; offline sync success > 98%; 3 conflict-resolution strategies.

**Phase 11 — AI Foundation** · deps `Ph8, Ph9` · risk `R-03, R-09`

- Objective: RAG + LLM Gateway foundation.
- Exit: RAG pipeline + HallucinationGuard live; OWASP LLM row per AI surface (`22 §22.8`);
  per-tenant token/cost cap (COST-001) + semantic cache at the gateway (`22 §22.10`).

**Phase 12 — AI Report Assistant** · deps `Ph11` · risk `R-03`

- Objective: AI-assisted report generation.
- Exit: AI report p95 < 5 s (`31 §31.6`); RAG quality eval passes on the eval set (`22 §22.10`);
  output advisory + audited.

**Phase 13 — Knowledge Graph** · deps `Ph3–7, Ph11` · risk `R-09`

- Objective: construction knowledge graph.
- Exit: KG ingestion idempotent; entities normalized.

**Phase 14 — Analytics + Dashboard** · deps `Ph3–7, Ph8, Ph13` · risk `R-09`

- Objective: analytics + dashboards.
- Exit: dashboard/analytics p95 < 1 s (ClickHouse, `31 §31.6`).

**Phase 15 — Observability** · deps `Ph1–14, Ph20–25` · risk `R-09`

- Objective: observability stack (metrics, logs, traces, SLO).
- Exit: SLO dashboards + alerts + tracing live (`31`); synthetic probes committed.

**Phase 16 — Security** · deps `Ph2, Ph15` · risk `R-02, R-03`

- Objective: security hardening + compliance.
- Exit: STRIDE per external surface (`05 §5.9`); SBOM per release (`05 §5.10`); pentest passed.

**Phase 17 — DevOps + Deployment** · deps `Ph1, Ph15, Ph16` · risk `R-06`

- Objective: CI/CD + multi-region deployment.
- Exit: no manual deploy paths; DORA targets green (`31 §31.12`); DR game-day passed (`31 §31.11`).

**Phase 18 — Testing** · deps `Ph1–17, Ph20–25` · risk `R-06`

- Objective: full test suite + quality gates.
- Exit: coverage 100/100 (QM-1); mutation score ≥ 70%; load test passes at target concurrency;
  Lighthouse CI frontend gate (Core Web Vitals + bundle budget + accessibility category = 1.0) green (`30 §30.9`).

**Phase 19 — Final Production Readiness** · deps `Ph1–18` · risk `R-05, R-06`

- Objective: production-readiness gate.
- Exit: all Phase 19 readiness checks (39 items) green.

**Phase 20 — Notification Service** · deps `Ph2, Ph3` · risk `R-09`

- Objective: notification/SSE service.
- Exit: notification delivery + safety-alert path verified; excluded from maintenance windows.

**Phase 21 — Equipment Service** · deps `Ph2, Ph3` · risk `R-02`

- Objective: equipment domain.
- Exit: equipment APIs pass the isolation-test suite.

**Phase 22 — Workforce Service** · deps `Ph2, Ph3` · risk `R-02`

- Objective: workforce domain.
- Exit: workforce APIs pass the isolation-test suite.

**Phase 23 — MLOps Pipeline** · deps `Ph11, Ph14` · risk `R-03`

- Objective: MLOps (MLflow registry, Feast, Evidently drift).
- Exit: model registry + drift monitoring + model cards live (`22 §22.9`).

**Phase 24 — Digital Twin** · deps `Ph14, Ph23` · risk `R-03, R-09`

- Objective: digital twin + IoT ingestion (EMQX).
- Deps note: Ph24 is not in the explicit dependency graph; sequenced from Stage 5 (`32 §32.1` / `33`).
- Exit: IoT ingestion + twin per `33-digital-twin-iot`; per-device auth + schema validation.

**Phase 25 — Enterprise Provisioning** · deps `Ph2, Ph3, Ph20` · risk `R-02, R-08`

- Objective: enterprise tenant provisioning.
- Exit: dedicated-DB provisioning + SSO/SAML (Keycloak); INT-004 interop conformance for ecosystem.

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

DEPLOYABLE UNITS — MIRROR ONLY. The CANONICAL runtime table is
docs/specifications/32-implementation-specifications.md §32.2. Never edit a Runtime value here
first: change §32.2, then propagate. scripts/readiness/check-service-runtimes.sh verifies both
against the build files in services/<name>/ and fails CI on a mismatch.
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
│ AI Gateway                     │ FastAPI (Python) │ LLM routing, RAG           │
│ AI Embedding Worker            │ FastAPI (Python) │ Embedding generation       │
│ AI OCR Pipeline                │ FastAPI (Python) │ OCR processing             │
│ (services/ai-*)                │                  │                            │
├────────────────────────────────┼──────────────────┼────────────────────────────┤
│ AI Transcription Pipeline      │ FastAPI (Python) │ Voice-note transcription   │
│ (services/ai-transcription-…)  │                  │ (ADR-052)                  │
├────────────────────────────────┼──────────────────┼────────────────────────────┤
│ Analytics Worker               │ Go               │ ClickHouse aggregation     │
│ KG Ingestion Worker            │ Go               │ Neo4j ingestion            │
│ IoT Ingestion Worker           │ Go               │ EMQX (MQTT) → Kafka        │
│ BIM Import Worker              │ Python           │ IFC parse / quantities     │
│ (services/*-worker/)           │                  │                            │
├────────────────────────────────┼──────────────────┼────────────────────────────┤
│ Credential Service             │ Node             │ W3C DID/VC issuance +      │
│ (services/credential-service/) │                  │ verification (ADR-019/058) │
├────────────────────────────────┼──────────────────┼────────────────────────────┤
│ Temporal Worker                │ backend image,   │ Executes backend workflows:│
│ (backend/src/workers/main.ts)  │ worker command   │ procurement, enterprise-   │
│                                │                  │ provisioning, data-export  │
│ File Service Workers           │ file-service     │ file-cleanup (retention    │
│ (…/file-service/src/workers/)  │ image, worker cmd│ hard-delete), zip-extract  │
├────────────────────────────────┼──────────────────┼────────────────────────────┤
│ Web App (apps/web/)            │ Next.js+Serwist  │ Tablet/laptop online+offline│
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

- PostgreSQL 18          — primary relational store
- TimescaleDB 2.x        — time-series telemetry (equipment, IoT, workforce); PostgreSQL extension, co-located on primary instance, split on volume trigger (ADR-032)
- Redis 8                — cache and session store
- Apache Kafka 4.x       — event streaming (Confluent Platform 8.x images)
- OpenSearch 3.x         — full-text and vector search
- Neo4j 2026.x           — knowledge graph (CalVer release line)
- ClickHouse 26.x        — analytics OLAP
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
  Tenant routing:    Kong routes to upstream; tenant resolved in KeycloakJwtStrategy.validate; JwtAuthGuard publishes context into CLS (req.user does not survive Fastify's request clone), TenantContextInterceptor projects to req.* as a secondary path (not a pre-auth middleware); TenantPrismaService (singleton) reads CLS + sets app.current_tenant_id as app_user (ADR-031)
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

## CROSS-CUTTING SPECIFICATIONS

Four specifications used to sit here in full. On 2026-09-02 each moved into the
`.claude/rules/` file that loads it by path, so it arrives when a file it governs
is edited instead of on every session. Nothing was shortened.

| Specification | Loads when you touch | File |
|---|---|---|
| CROSS-SERVICE EVENT CONTRACT SPEC | an `.avsc`, a producer/consumer, `@cos/kafka` | `.claude/rules/event-contract.md` |
| FINANCIAL PRECISION SPEC | `@cos/financial`, finance/BOQ/procurement, a Prisma schema | `.claude/rules/financial-precision.md` |
| DESIGN TOKEN SPECIFICATION | `apps/web`, `apps/mobile`, `@cos/ui-logic`, mockups | `.claude/rules/design-tokens.md` |
| WORKFLOW ENGINE SPEC | a workflow, activities, procurement | `.claude/rules/workflow-engine.md` |

---

## PHASE COMMANDS 1–25

The 25 Phase command blocks moved to `context/phases/` on 2026-09-02, one file
each, verbatim. They were 4,454 of this file's 6,407 lines, and at most one of
them applies to any single task — carrying all 25 into every session was the
reason this document was never read whole.

`.claude/skills/phase-index/SKILL.md` is the map, and `context.md` STEP 1
requires reading it. Dependencies below are from §PHASE DEPENDENCY GRAPH above.

| Phase | Command | Depends on | Stage | File |
|---|---|---|---|---|
| 1 | Foundation Repository | — | 1 | `context/phases/phase-01-foundation-repository.md` |
| 2 | Authentication + Tenant System | 1 | 1 | `context/phases/phase-02-authentication-tenant-system.md` |
| 3 | Project Service | 8 | 2 | `context/phases/phase-03-project-service.md` |
| 4 | Boq Service | 3 | 2 | `context/phases/phase-04-boq-service.md` |
| 5 | Procurement Service | 3, 4 | 2 | `context/phases/phase-05-procurement-service.md` |
| 6 | Site Operations | 3 | 2 | `context/phases/phase-06-site-operations.md` |
| 7 | Finance Service | 4, 5 | 2 | `context/phases/phase-07-finance-service.md` |
| 8 | Event-Driven Infrastructure | 2 | 3 | `context/phases/phase-08-event-driven-infrastructure.md` |
| 9 | File + Document System | 2 | 3 | `context/phases/phase-09-file-document-system.md` |
| 10 | Mobile Offline Engine | 3–7, 20–22 | 3 | `context/phases/phase-10-mobile-offline-engine.md` |
| 11 | Ai Foundation | 8, 9 | 3 | `context/phases/phase-11-ai-foundation.md` |
| 12 | Ai Report Assistant | 11 | 3 | `context/phases/phase-12-ai-report-assistant.md` |
| 13 | Knowledge Graph | 3–7, 11 | 3 | `context/phases/phase-13-knowledge-graph.md` |
| 14 | Analytics + Dashboard | 3–7, 8, 13 | 3 | `context/phases/phase-14-analytics-dashboard.md` |
| 15 | Observability | 1–14, 20–25 | — | `context/phases/phase-15-observability.md` |
| 16 | Security | 2, 15 | — | `context/phases/phase-16-security.md` |
| 17 | Devops + Deployment | 1, 15, 16 | 4 | `context/phases/phase-17-devops-deployment.md` |
| 18 | Testing | 1–17, 20–25 | — | `context/phases/phase-18-testing.md` |
| 19 | Final Production Readiness | 1–18 | — | `context/phases/phase-19-final-production-readiness.md` |
| 20 | Notification Service | 2, 3 | — | `context/phases/phase-20-notification-service.md` |
| 21 | Equipment Service | 2, 3 | — | `context/phases/phase-21-equipment-service.md` |
| 22 | Workforce Service | 2, 3 | — | `context/phases/phase-22-workforce-service.md` |
| 23 | Mlops Pipeline | 11, 14 | 5 | `context/phases/phase-23-mlops-pipeline.md` |
| 24 | Digital Twin | 13, 21, 23 | 5 | `context/phases/phase-24-digital-twin.md` |
| 25 | Enterprise Provisioning | 2, 3, 20 | 3 | `context/phases/phase-25-enterprise-provisioning.md` |

**Blocking rule:** Phase 8 must be complete before Phases 3–7 begin — every service
depends on the shared event SDK it produces.

Every phase file ends with the same constraint: before marking it complete, read each
Generate item line by line and prove it on disk with command output — Rule 36.

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
    After changing anything that MOVES DEPENDENCY RESOLUTION, run `pnpm install` locally to
    regenerate pnpm-lock.yaml and commit it in the SAME commit. That means:
      - package.json: dependencies, devDependencies, peerDependencies, optionalDependencies,
        resolutions, or the `pnpm` block
      - pnpm-workspace.yaml: the `overrides:` block
    pnpm-lock.yaml must exist and be up-to-date before CI `--frozen-lockfile` will pass.
    If pnpm-lock.yaml does not exist: run `pnpm install` immediately before any other work.

    NOT every package.json edit. Scripts, description, engines and `packageManager` do not affect
    resolution, and `pnpm install` produces no lockfile diff for them — there is nothing to commit.
    The rule used to say "ANY package.json change", which made commit 2840dd7 (2026-08-07) a
    violation for bumping `packageManager` 11.18.0 -> 11.20.0 and nothing else: the lockfile records
    lockfileVersion and resolutions, not the pnpm binary version, so no `pnpm install` could have
    produced the file that rule demanded. Narrowed 2026-08-08 to the fields that carry the risk.

    WHICH lockfile: the nearest one ABOVE the package.json, not always the root. `apps/mobile` is its
    own pnpm workspace (pnpm-workspace.yaml excludes it — Metro needs a hoisted node_modules), so its
    dependencies resolve into `apps/mobile/pnpm-lock.yaml` and a root `pnpm install` produces no diff
    for them: run `cd apps/mobile && pnpm install` and commit THAT file. Every other package resolves
    into the root lockfile.

    Enforced by `scripts/ci/check-lockfile-staged.sh`, wired into `.husky/pre-commit`. The older
    `.claude/hooks/rule-28-check-lockfile.sh` stays, but it is a PostToolUse hook and therefore only
    sees the agent's own edits — 2840dd7 did not come through the agent, which is why nothing
    objected. The git hook covers every author and every tool. Escape hatch for a change that
    genuinely yields no lockfile diff: `SKIP_LOCKFILE_CHECK=1 git commit`, with the reason in the
    commit message.

    The git hook originally accepted ONLY a staged root `pnpm-lock.yaml` (`grep -qx`), which made a
    mobile dependency change impossible to commit at all: the correct lockfile was staged and still
    rejected, and the only way through was the escape hatch — which would have been a lie, since the
    change does produce a lockfile diff, just not in the root file. Fixed 2026-08-08 (first mobile
    dependency change after the hook landed the same day) to pair each package.json with its own
    lockfile and name that file in the error.

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

  Rule 34 — the CLIENT-SAFE packages must stay framework-agnostic (prevents mobile bundle failures):
    AMENDED 2026-08-27. The rule previously opened "@cos/shared is imported by ALL platforms:
    mobile (React Native/Metro), PWA (Service Worker), and Node.js services." That premise was not
    true of the repository it governs, and had not been for some time:

      apps/mobile depends on  @cos/financial, @cos/schemas, @cos/types, @cos/ui-logic
      apps/web    depends on  @cos/schemas, @cos/types, @cos/ui-logic
      @cos/shared is depended on by  backend, services/file-service   — both Node.js, nothing else

    The split the rule asks for was therefore already achieved, but by a different means than the
    rule describes: the client-safe code went into OTHER packages instead of @cos/shared being kept
    clean. Meanwhile @cos/shared took on kafkajs, ioredis and prom-client, each of which reaches for
    Node built-ins (net/tls/dns/fs) — so it could not be imported from React Native regardless of
    what any single class in it did. Guarding the wrong package let that pass unnoticed while a real
    obligation went unwatched.

    So the obligation follows the packages that actually ship to a client:

    CLIENT-SAFE packages — @cos/types, @cos/schemas, @cos/ui-logic, @cos/financial (the set
    apps/mobile and apps/web import). For these:
    ALSO ENFORCED STRUCTURALLY since 2026-08-22 (ADR-055): the Kafka SDK is no longer in
    @cos/shared. That package now holds event payload TYPES ONLY (every import is `import type`;
    sole dependency @cos/types), and all Node-only Kafka code plus the Avro schemas live in
    @cos/kafka, which is never aliased into apps/mobile. Clause (c) below ("move OutboxPoller to
    backend/src") is SUPERSEDED by that split: moving only the outbox would have left kafkajs,
    ioredis and prom-client as runtime deps of @cos/shared, so it still would not have been safe.
    (a) NO runtime import of Node.js-only packages (PrismaClient, native addons, file system).
        Use `import type` when types are needed (Rule 33).
    (b) NO runtime import of server-framework packages (express, fastify, NestJS decorators).
    (c) Classes/functions that require a Node.js runtime (e.g., an OutboxPoller which polls a DB)
        must live in backend/src/ — NOT in a client-safe package.
    (d) Before adding any dependency to one of them, verify it works in React Native/Metro.
    Verify: every package listed in their dependencies must be mobile-safe (pure JS, no native
    addons, no Node.js built-in-dependent runtime behavior).

    NODE-ONLY packages — @cos/shared, @cos/database, @cos/logger, @cos/tracing, @cos/config,
    @cos/rbac, @cos/validation, @cos/test-utils. These may use Node built-ins freely. They must NOT
    appear in the dependencies of a client-safe package or of apps/mobile or apps/web; that edge is
    the actual failure this rule exists to prevent, and it is the one to check.

    Clause (c) still binds @cos/shared for a second reason that has nothing to do with mobile: a
    polling loop belongs with the process that owns its lifecycle. An OutboxPoller was defined and
    exported there until 2026-08-27, duplicating backend/src/shared/events/outbox-poller.service.ts,
    which is the one registered in EventsModule and the only one that ever ran.

    Enforced by tests/conformance/events/06-rule-34.spec.ts.

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

  Rule 37 — After modifying any file in docs/specifications/, immediately grep context.md,
    the whole of context/ AND .claude/rules/ for the changed section number, technology name,
    or keyword:
      grep -rn "<changed-keyword>" context.md context/ .claude/rules/
    If grep finds a match:
    (a) Read the matched section in the context file
    (b) Check for consistency with the spec change just made
    (c) Update the context file in the same commit if inconsistent
    If grep finds no match: no context update needed — proceed.
    .claude/rules/ was added to the targets 2026-09-02, when the Quality Mandates and this
    document's cross-cutting specs (event contract, financial precision, design tokens, workflow
    engine) gained path-triggered mirrors so they load when a matching file is edited. Those
    mirrors are what the agent actually sees during work; a spec change that updates context.md
    and leaves a mirror behind makes the stale copy authoritative in practice.
    scripts/ci/check-claude-rules-mirror.sh proves each mirror's named heading still exists — it
    cannot judge whether the numbers beneath it still agree. That remains this rule's job.
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

  Rule 39 — Close every long-lived handle on shutdown (prevents Bug-class: leaked
    Redis/Prisma/ClickHouse/OTel handles → Jest integration runner hangs after specs
    pass, and ungraceful production shutdown on SIGTERM). Authoritative decision: ADR-034.
    Any provider that constructs a long-lived client (new Redis / new PrismaClient /
    ClickHouse / any socket or HTTP client) MUST close it via a Nest lifecycle hook:
    (a) Provider-owned client → implement OnModuleDestroy → redis.quit() /
        prisma.$disconnect() / client.close().
    (b) Client created inside a MODULE FACTORY (no provider owns it) → close it from the
        module class's OnModuleDestroy (Nest runs lifecycle hooks on module classes); or
        hand ownership to a library that closes it (pass the Redis URL — not a pre-built
        new Redis(...) — to ThrottlerStorageRedisService so disconnectRequired=true).
    (c) Resources started OUTSIDE Nest DI (OTel SDK + Prometheus exporter in main.ts) →
        a provider implementing OnApplicationShutdown calls shutdownTracing().
    (d) main.ts MUST call app.enableShutdownHooks() before app.listen() so SIGTERM/SIGINT
        fire the hooks in production; tests fire them via app.close().
    (e) Integration jest config MUST NOT use forceExit (it masks leaks) — a hang after
        specs pass signals a NEW unclosed handle; diagnose with --detectOpenHandles.
    (f) Every new onModuleDestroy/onApplicationShutdown needs a unit test (invoke it,
        assert quit/$disconnect/close/shutdownTracing called) to keep QM-1 100% coverage.
    Reference implementations: finance/exchange-rate.service.ts,
    identity/otp/otp.service.ts, shared/tracing-shutdown.service.ts.
    (root cause: ~12 providers created clients with no cleanup → BOQ integration ran
    32 min before being killed; pods severed connections abruptly on SIGTERM)

  Rule 40 — Every surface that waits for data renders its wait through <LoadingState />
    (prevents Bug-class: a specified component drifting out of use while screens hand-roll
    their own indicators). Authoritative component: spec §32.7 "Loading State"; ADR-055.
    Applies whenever a screen, region, list, card or button gains an async state — a fetch,
    a submit, a sync flush, an AI job:
    (a) Render the loading state with <LoadingState />, choosing the variant by the SHAPE of
        what it stands in for, not by convenience:
          widget — a card, tile or dashboard panel
          list   — a stacked list or feed (mobile)
          table  — data-table rows (web; §32.7 prohibits tables on mobile)
          ai     — an AI job, not a plain fetch
          micro  — inline, or inside a button
    (b) NEVER hand-roll one. No <ActivityIndicator>. No View/div doing its own skeleton or
        spinner. No line of text standing in for a loading state. No placeholder glyph ("…").
        The last two have no signature a script can match — they are ordinary markup — so they
        are caught in review or not at all. That is why this rule is written down.
    (c) Mobile: a region that reveals content once it settles is wrapped in <LoadingBoundary>,
        not swapped by a ternary. A determinate loader is driven to 100 and held one fill
        before the crossfade, so the run the user is watching actually completes.
    (d) Copy is the caller's: `label` takes an already-translated string from an i18n key
        (QM-3). The component holds no key and no literal.
    (e) Progress is the caller's: pass `progress` only when a real percentage exists. Omitted
        means indeterminate, which renders NO percentage — never fabricate one.
        A PERCENTAGE NEEDS TWO OR MORE LOAD STEPS. A surface that loads with one request can only
        report 0% then 100% — the number never moves and reads as a stuck loader, the same reason a
        `micro` ring in a submit button stays wordless. Use loadProgress(done, total) from
        lib/loadingState.ts; it returns null below two steps. COUNT THE STEPS THAT SETTLE WHILE THE
        LOADER IS ON SCREEN, not the APIs the file imports — the vendor directory looks multi-step
        and is not: its list fetch clears the loader and the scores arrive afterwards.
    (g) Skeletons animate PER ELEMENT, never as one band across the card. The mockup puts
        `.skeleton-pulse` on each bar and plate separately, each with its own sweep; one band over
        the whole card reads as a pane sliding across it and lights unrelated elements.
    (h) The bar and the percentage are ONE animated value, and it is JS-driven. Do not move the bar
        to React Native's native driver for smoothness: that driver exists to keep animating WHILE
        THE JS THREAD IS BLOCKED, and only JS can write text, so on the app launch the bar filled
        while the percentage sat at 0 (observed and reverted 2026-08-17). Smoothness comes from
        animating a translateX transform rather than a width, and from isolating the counting text
        so a 1% tick re-renders one node instead of every skeleton on the card.
    (f) Any ink override (`tone`, `color`) must clear WCAG SC 1.4.11 (3:1) against the surface
        it actually sits on, and 4.5:1 if it also colours text (§20.8). MEASURE it — on
        2026-08-17 every cyan in the product measured below 3:1 on a --mobile-primary button,
        while reading as obviously fine.
    Enforced for the two machine-checkable classes by scripts/ci/check-loading-state.sh,
    wired into the CI lint job. A PASS there does NOT mean (b)'s text and placeholder cases
    are clean.
    (root cause: 24 hand-rolled indicators accumulated after <LoadingState /> was specified —
    22 <ActivityIndicator> in apps/mobile and 2 raw skeleton blocks in apps/web — and web's
    own <LoadingState /> reached zero production consumers, with ~35 list pages rendering a
    plain "Loading…" line through one shared DataTable)

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
