# Construction OS — Context Directory Navigation Guide

> **⚠️ START HERE before using any context file.**
>
> This directory contains **lifecycle-stage execution context commands** for agents building
> the Construction OS platform. Each file covers one lifecycle stage and provides
> deterministic commands for that stage only.
>
> **Authority hierarchy:**
> `docs/00-specifications/` > `context/00_master_construction_os.md` > product owner chat > stage files 01–11
>
> **All technology decisions, architecture choices, EP resolutions, and platform specifications
> are defined in `00_master_construction_os.md`. Stage files (01–11) provide execution context
> ONLY — they do NOT override the master document.**

---

## Lifecycle Stage Map

```
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

| File                                                                             | Lifecycle Stage          | Description                                                                                                                                                                                                                                 | Status                         |
| -------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| [00_master_construction_os.md](00_master_construction_os.md)                     | MASTER                   | Authoritative platform spec: all technology decisions, architecture, RBAC, event contracts, financial precision, phase dependency graph                                                                                                     | Always current                 |
| [01_build_priority_execution.md](01_build_priority_execution.md)                 | BUILD — Priority         | MVP Priority 0–5 execution commands; what to build in what order; exit criteria per priority                                                                                                                                                | Active                         |
| [02_build_deep_systems.md](02_build_deep_systems.md)                             | BUILD — Deep Systems     | 9-phase deep engineering commands: Foundation → Core Domain → Workflow/Event → Data → AI → Mobile → Hardening → Ecosystem → Scale                                                                                                           | Active (parallel with 01)      |
| [03_operationalize_execution.md](03_operationalize_execution.md)                 | OPERATIONALIZE           | 10-phase operationalization: Pilot → Adoption → Reliability → Data Governance → AI Expansion → Enterprise Ops → Ecosystem Dependency → Platformization → Scale → Infrastructure Positioning                                                 | After BUILD complete           |
| [04_post_launch_enterprise_evolution.md](04_post_launch_enterprise_evolution.md) | POST-LAUNCH              | 12-phase enterprise evolution (Phase 0–11): Engineering Foundation → Operational → Workflow Expansion → Data → AI → Platformization → Enterprise Readiness → Ecosystem → Governance → Customer Ops → Portfolio Intelligence → Economic Moat | After OPERATIONALIZE           |
| [05_industry_scale_transition.md](05_industry_scale_transition.md)               | INDUSTRY SCALE           | Transition from enterprise → industry infrastructure; 9 execution areas; 5 AWAITING_DECISION items (INT-001–005)                                                                                                                            | After POST-LAUNCH              |
| [06_ecosystem_dominance.md](06_ecosystem_dominance.md)                           | ECOSYSTEM DOMINANCE      | Industry → ecosystem/market infrastructure; marketplace opens at 200 verified vendors; 5 AWAITING_DECISION items (ECO-001–005)                                                                                                              | After INDUSTRY SCALE           |
| [07_industry_coordination.md](07_industry_coordination.md)                       | INDUSTRY COORDINATION    | Industry → economic infrastructure; 10 execution areas; 5 AWAITING_DECISION items (COORD-001–005)                                                                                                                                           | After ECOSYSTEM DOMINANCE      |
| [08_global_intelligence.md](08_global_intelligence.md)                           | GLOBAL INTELLIGENCE      | Ecosystem → civilization-scale coordination; 8 execution phases; 5 AWAITING_DECISION items (GLOB-001–005)                                                                                                                                   | After INDUSTRY COORDINATION    |
| [09_civilization_scale.md](09_civilization_scale.md)                             | CIVILIZATION SCALE       | Industry → civilization-scale infrastructure; 9 execution areas; 5 AWAITING_DECISION items (CIV-001–005)                                                                                                                                    | After GLOBAL INTELLIGENCE      |
| [10_civilization_stewardship.md](10_civilization_stewardship.md)                 | CIVILIZATION STEWARDSHIP | Civilization-scale → planetary resilience; 9 execution areas; 5 AWAITING_DECISION items (STEW-001–005)                                                                                                                                      | After CIVILIZATION SCALE       |
| [11_background_civilization.md](11_background_civilization.md)                   | BACKGROUND CIVILIZATION  | Stewardship → background civilization infrastructure — **FINAL STAGE**; 8 execution areas; 5 AWAITING_DECISION items (BG-001–005)                                                                                                           | After CIVILIZATION STEWARDSHIP |

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

## AWAITING_DECISION Tracker

The following decisions are open across stage files. They must be resolved before implementing the corresponding stage.

| ID        | File | Question                                    | Impact                         |
| --------- | ---- | ------------------------------------------- | ------------------------------ |
| INT-001   | 05   | Ecosystem interoperability protocol         | Platform integration layer     |
| INT-002   | 05   | Industry data sharing model                 | Data governance scope          |
| INT-003   | 05   | Procurement intelligence algorithm          | Supplier intelligence design   |
| INT-004   | 05   | Industry standardization alignment          | Standards body relationships   |
| INT-005   | 05   | Financial infrastructure provider           | Payment rail integration       |
| ECO-001   | 06   | Event schema format                         | Marketplace event architecture |
| ECO-002   | 06   | Marketplace transaction model               | Revenue model                  |
| ECO-003   | 06   | Benchmark data ownership                    | Data licensing                 |
| ECO-004   | 06   | Ecosystem trust scoring algorithm           | Vendor reputation system       |
| ECO-005   | 06   | Vendor minimum threshold                    | Marketplace launch gate        |
| COORD-001 | 07   | Autonomous coordination governance          | Coordination AI oversight      |
| COORD-002 | 07   | Multi-industry expansion priority           | Expansion roadmap              |
| COORD-003 | 07   | Regulatory integration regions              | Compliance scope               |
| COORD-004 | 07   | Market intelligence data sources            | Intelligence pipeline          |
| COORD-005 | 07   | Payment orchestration model                 | Financial infrastructure       |
| GLOB-001  | 08   | Global deployment regions                   | Infrastructure geography       |
| GLOB-002  | 08   | Cross-region data aggregation model         | Data architecture              |
| GLOB-003  | 08   | Global data governance framework            | Regulatory compliance          |
| GLOB-004  | 08   | Cross-industry intelligence scope           | Intelligence breadth           |
| GLOB-005  | 08   | Geopolitical risk handling                  | Resilience design              |
| CIV-001   | 09   | Planet-scale simulation platform            | Simulation infrastructure      |
| CIV-002   | 09   | Constitutional AI framework                 | AI governance                  |
| CIV-003   | 09   | Multi-domain expansion                      | Scope definition               |
| CIV-004   | 09   | Infrastructure intelligence economy model   | Economic model                 |
| CIV-005   | 09   | Global standards governance body            | Standards authority            |
| STEW-001  | 10   | Human-AI governance structure               | Governance implementation      |
| STEW-002  | 10   | Knowledge preservation format               | Archive design                 |
| STEW-003  | 10   | Long-term optimization horizon              | Simulation parameters          |
| STEW-004  | 10   | Planetary resilience scope                  | Resilience system scope        |
| STEW-005  | 10   | Multi-civilization interoperability spec    | Off-world layer scope          |
| BG-001    | 11   | Decentralized governance protocol           | Governance implementation      |
| BG-002    | 11   | Post-software transition definition         | Transition layer design        |
| BG-003    | 11   | Meta-governance evolution mechanism         | Self-update mechanism          |
| BG-004    | 11   | Intergenerational knowledge transfer format | Knowledge continuity           |
| BG-005    | 11   | Human value alignment update mechanism      | Alignment architecture         |

---

## Key Technology Decisions (Quick Reference)

> These are **final decisions** from `00_master_construction_os.md`. Do NOT deviate.

| Area                | Decision                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend             | NestJS Modular Monolith (NOT microservices)                                                                                                  |
| Multi-tenant        | Schema-per-tenant (PostgreSQL), `SET LOCAL search_path`                                                                                      |
| Event bus           | Apache Kafka 3.x + Confluent Schema Registry (BACKWARD compat, Avro)                                                                         |
| Mobile storage      | WatermelonDB 0.28.x + ExpoSQLiteAdapter (main entities); expo-sqlite directly (sync_queue only)                                              |
| PWA offline         | IndexedDB via `idb` library                                                                                                                  |
| API versioning      | `/api/v1/` prefix — `setGlobalPrefix('api/v1')` in `backend/src/main.ts`                                                                     |
| Financial precision | `DECIMAL(19,4)` in DB; `decimal.js` in Node.js; Python `decimal` module                                                                      |
| Workflow engine     | Temporal (TypeScript SDK)                                                                                                                    |
| AI services         | FastAPI Python (LLM Gateway, Embedding Worker, OCR Pipeline)                                                                                 |
| LLM                 | OpenAI GPT-4o via `LLMProvider` interface                                                                                                    |
| Vector store        | pgvector + OpenSearch                                                                                                                        |
| RBAC roles          | `SUPER_ADMIN`, `TENANT_ADMIN`, `PROJECT_MANAGER`, `PROC_MANAGER`, `PROC_OFFICER`, `FINANCE_OFFICER`, `SITE_MANAGER`, `SITE_WORKER`, `VIEWER` |
| Platform by device  | React Native = smartphone (online+offline); PWA = tablet/laptop (offline); Web Next.js = tablet/laptop (online)                              |

---

_Last updated: 2026-05-26 — Cloudflare WAF decision added to Phase 16; API path convention confirmed `/api/v1/` (NestJS `setGlobalPrefix('api/v1')` — source: `backend/src/main.ts`; C-04 resolved)_
