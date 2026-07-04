# Construction OS — Context Directory Navigation Guide

> **⚠️ START HERE before using any context file.**
>
> This directory contains **lifecycle-stage execution context commands** for agents building
> the Construction OS platform. Each file covers one lifecycle stage and provides
> deterministic commands for that stage only.
>
> **Authority hierarchy:**
> `docs/specifications/` > `context/00_master_construction_os.md` > product owner chat > stage files 01–11
>
> **All technology decisions, architecture choices, EP resolutions, and platform specifications
> are defined in `00_master_construction_os.md`. Stage files (01–11) provide execution context
> ONLY — they do NOT override the master document.**

---

## Lifecycle Stage Map

```text
[MASTER]
  00_master_construction_os.md      ← Read first, always
         │
         ▼
[STAGE 1 — BUILD] (both files run in parallel)
  01_build_priority_execution.md    ← Priority Execution: what to build and in what order
  02_build_deep_systems.md          ← Deep Systems Engineering: how to build it
         │
         ▼
[STAGE 2 — OPERATIONALIZE]
  03_operationalize_execution.md    ← Production adoption, pilot deployment, reliability
         │
         ▼
[STAGE 3 — POST-LAUNCH]
  04_post_launch_enterprise_evolution.md  ← Enterprise feature expansion, data platform
         │
         ▼
[STAGE 4 — INDUSTRY SCALE]
  05_industry_scale_transition.md   ← Transition from enterprise → industry infrastructure
         │
         ▼
[STAGE 5 — ECOSYSTEM DOMINANCE]
  06_ecosystem_dominance.md         ← Industry infrastructure → ecosystem/market infrastructure
         │
         ▼
[STAGE 6 — INDUSTRY COORDINATION]
  07_industry_coordination.md       ← Industry infrastructure → economic infrastructure
         │
         ▼
[STAGE 7 — GLOBAL INTELLIGENCE]
  08_global_intelligence.md         ← Ecosystem infrastructure → civilization-scale coordination
         │
         ▼
[STAGE 8 — CIVILIZATION SCALE]
  09_civilization_scale.md          ← Industry → civilization-scale infrastructure
         │
         ▼
[STAGE 9 — CIVILIZATION STEWARDSHIP]
  10_civilization_stewardship.md    ← Civilization-scale → planetary resilience
         │
         ▼
[STAGE 10 — BACKGROUND CIVILIZATION]  ← FINAL STAGE
  11_background_civilization.md     ← Stewardship → background civilization infrastructure
```

---

## File Reference

| File                                                                             | Lifecycle Stage          | Description                                        | Status                         |
| -------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------- | ------------------------------ |
| [00_master_construction_os.md](00_master_construction_os.md)                     | MASTER                   | All decisions, architecture, RBAC, event contracts | Always current                 |
| [01_build_priority_execution.md](01_build_priority_execution.md)                 | BUILD — Priority         | Priority 0–5: what to build and in what order      | Active                         |
| [02_build_deep_systems.md](02_build_deep_systems.md)                             | BUILD — Deep Systems     | 9-phase deep engineering commands                  | Active (parallel with 01)      |
| [03_operationalize_execution.md](03_operationalize_execution.md)                 | OPERATIONALIZE           | 10-phase production adoption and reliability       | After BUILD complete           |
| [04_post_launch_enterprise_evolution.md](04_post_launch_enterprise_evolution.md) | POST-LAUNCH              | 12-phase enterprise evolution, phases 0–11         | After OPERATIONALIZE           |
| [05_industry_scale_transition.md](05_industry_scale_transition.md)               | INDUSTRY SCALE           | Enterprise → industry infrastructure; 9 areas      | After POST-LAUNCH              |
| [06_ecosystem_dominance.md](06_ecosystem_dominance.md)                           | ECOSYSTEM DOMINANCE      | Industry → ecosystem infrastructure; 5 decisions   | After INDUSTRY SCALE           |
| [07_industry_coordination.md](07_industry_coordination.md)                       | INDUSTRY COORDINATION    | Industry → economic infrastructure; 10 areas       | After ECOSYSTEM DOMINANCE      |
| [08_global_intelligence.md](08_global_intelligence.md)                           | GLOBAL INTELLIGENCE      | Ecosystem → civilization coordination; 8 phases    | After INDUSTRY COORDINATION    |
| [09_civilization_scale.md](09_civilization_scale.md)                             | CIVILIZATION SCALE       | Industry → civilization infrastructure; 9 areas    | After GLOBAL INTELLIGENCE      |
| [10_civilization_stewardship.md](10_civilization_stewardship.md)                 | CIVILIZATION STEWARDSHIP | Civilization → planetary resilience; 9 areas       | After CIVILIZATION SCALE       |
| [11_background_civilization.md](11_background_civilization.md)                   | BACKGROUND CIVILIZATION  | Stewardship → background civilization — FINAL      | After CIVILIZATION STEWARDSHIP |

---

## How to Use This Directory

### For an AI Agent

1. **Always read `00_master_construction_os.md` first** — it defines all authoritative decisions.
2. **Identify the current lifecycle stage** of the project.
3. **Load the corresponding stage file** (01–11) for execution commands.
4. **If the stage file has AWAITING_DECISION items**, generate stubs with `AWAITING_DECISION` tags and ask the product owner before implementing.
5. **Never contradict `00_master_construction_os.md`** — if a stage file conflicts with the master, the master wins.

### For a Human Developer

1. Check which stage is currently active (ask team lead or check project tracker).
2. Read the master document section relevant to your task.
3. Read the stage file for the current stage.
4. Resolve any open AWAITING_DECISION items with the product owner before building.

---

## Decision Tracker (reconciled)

**Reconciled 2026-07-04 against `docs/specifications/`.** All **35** stage-file decisions were
**RESOLVED on 2026-06-10** and are authoritative in the specs. Each stage file's § REQUIRED DECISIONS
carries the resolution + spec pointer. Do not treat a RESOLVED item as an `AWAITING_DECISION` blocker.

| ID        | File | Question                                    | Status                                         |
| --------- | ---- | ------------------------------------------- | ---------------------------------------------- |
| INT-001   | 05   | Ecosystem interoperability protocol         | RESOLVED 2026-06-10 (14-api-architecture)      |
| INT-002   | 05   | Industry data sharing model                 | RESOLVED 2026-06-10 (09-data-architecture)     |
| INT-003   | 05   | Procurement intelligence algorithm          | RESOLVED 2026-06-10 (22-ai-architecture)       |
| INT-004   | 05   | Industry standardization alignment          | RESOLVED 2026-06-10 (33-digital-twin-iot)      |
| INT-005   | 05   | Financial infrastructure provider           | RESOLVED 2026-06-10 (13-product-architecture)  |
| ECO-001   | 06   | Event schema format                         | RESOLVED 2026-06-10 (15-event-driven-workflow) |
| ECO-002   | 06   | Marketplace transaction model               | RESOLVED 2026-06-10 (28-ecosystem-expansion)   |
| ECO-003   | 06   | Benchmark data ownership                    | RESOLVED 2026-06-10 (09-data-architecture)     |
| ECO-004   | 06   | Ecosystem trust scoring algorithm           | RESOLVED 2026-06-10 (22-ai-architecture)       |
| ECO-005   | 06   | Vendor minimum threshold                    | RESOLVED 2026-06-10 (28-ecosystem-expansion)   |
| COORD-001 | 07   | Autonomous coordination governance          | RESOLVED 2026-06-10 (22-ai-architecture)       |
| COORD-002 | 07   | Multi-industry expansion priority           | RESOLVED 2026-06-10 (28-ecosystem-expansion)   |
| COORD-003 | 07   | Regulatory integration regions              | RESOLVED 2026-06-10 (05-security-compliance)   |
| COORD-004 | 07   | Market intelligence data sources            | RESOLVED 2026-06-10 (09-data-architecture)     |
| COORD-005 | 07   | Payment orchestration model                 | RESOLVED 2026-06-10 (28-ecosystem-expansion)   |
| GLOB-001  | 08   | Global deployment regions                   | RESOLVED 2026-06-10 (08-enterprise-deployment) |
| GLOB-002  | 08   | Cross-region data aggregation model         | RESOLVED 2026-06-10 (09-data-architecture)     |
| GLOB-003  | 08   | Global data governance framework            | RESOLVED 2026-06-10 (05-security-compliance)   |
| GLOB-004  | 08   | Cross-industry intelligence scope           | RESOLVED 2026-06-10 (22-ai-architecture)       |
| GLOB-005  | 08   | Geopolitical risk handling                  | RESOLVED 2026-06-10 (08-enterprise-deployment) |
| CIV-001   | 09   | Planet-scale simulation platform            | RESOLVED 2026-06-10 (33-digital-twin-iot)      |
| CIV-002   | 09   | Constitutional AI framework                 | RESOLVED 2026-06-10 (22-ai-architecture)       |
| CIV-003   | 09   | Multi-domain expansion                      | RESOLVED 2026-06-10 (28-ecosystem-expansion)   |
| CIV-004   | 09   | Infrastructure intelligence economy model   | RESOLVED 2026-06-10 (22-ai-architecture)       |
| CIV-005   | 09   | Global standards governance body            | RESOLVED 2026-06-10 (02-system-wide)           |
| STEW-001  | 10   | Human-AI governance structure               | RESOLVED 2026-06-10 (22-ai-architecture §22.7) |
| STEW-002  | 10   | Knowledge preservation format               | RESOLVED 2026-06-10 (09-data-architecture)     |
| STEW-003  | 10   | Long-term optimization horizon              | RESOLVED 2026-06-10 (22-ai-architecture)       |
| STEW-004  | 10   | Planetary resilience scope                  | RESOLVED 2026-06-10 (08-enterprise-deployment) |
| STEW-005  | 10   | Multi-civilization interoperability spec    | RESOLVED 2026-06-10 (33-digital-twin-iot)      |
| BG-001    | 11   | Decentralized governance protocol           | RESOLVED 2026-06-10 (05-security-compliance)   |
| BG-002    | 11   | Post-software transition definition         | RESOLVED 2026-06-10 (13-product-architecture)  |
| BG-003    | 11   | Meta-governance evolution mechanism         | RESOLVED 2026-06-10 (22-ai-architecture)       |
| BG-004    | 11   | Intergenerational knowledge transfer format | RESOLVED 2026-06-10 (09-data-architecture)     |
| BG-005    | 11   | Human value alignment update mechanism      | RESOLVED 2026-06-10 (22-ai-architecture)       |

---

## Key Technology Decisions (Quick Reference)

> These are **final decisions** from `00_master_construction_os.md`. Do NOT deviate.

| Area                | Decision                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| Backend             | NestJS Modular Monolith (NOT microservices)                                                     |
| Multi-tenant        | Shared DB + tenant_id + PostgreSQL RLS, `SET LOCAL app.current_tenant_id`                       |
| Event bus           | Apache Kafka 4.x + Confluent Schema Registry (BACKWARD compat, Avro)                            |
| Mobile storage      | Drizzle ORM on expo-sqlite (main entities — spec 17 §17.10 / ADR-048); sync_queue on its own expo-sqlite handle |
| Web offline (PWA)   | Serwist (@serwist/turbopack) + IndexedDB via `idb` — unified in apps/web/                       |
| API versioning      | `/api/v1/` prefix — `setGlobalPrefix('api/v1')` in `backend/src/main.ts`                        |
| Financial precision | `DECIMAL(19,4)` in DB; `decimal.js` in Node.js; Python `decimal` module                         |
| Workflow engine     | Temporal (TypeScript SDK)                                                                       |
| AI services         | FastAPI Python (LLM Gateway, Embedding Worker, OCR Pipeline)                                    |
| LLM                 | OpenAI GPT-4o via `LLMProvider` interface                                                       |
| Vector store        | pgvector + OpenSearch                                                                           |
| RBAC roles          | 9 spec roles (§6.2) + §6.8 sub-roles: PROC_MANAGER, SITE_WORKER, VIEWER                         |
| Platform by device  | React Native = smartphone (online+offline); Web/PWA = tablet/laptop (online+offline)            |

---
