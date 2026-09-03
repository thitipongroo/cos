---
name: phase-index
description: Use when a task names a Phase, or when you need to find which of the 25 Phase command files to read — maps each Phase to its file, its dependencies and its SaaS Maturity Stage, and says where every cross-cutting specification and numbered Rule now lives. Read only the files the task needs.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
---

# Phase Index

`context/00_master_construction_os.md` was 6,407 lines. On 2026-09-02 the 25 Phase
command blocks moved to `context/phases/`, one file each, and the four cross-cutting
specifications moved into the `.claude/rules/` files that load them by path. Nothing
was shortened — every line is still in the repository. The master is now 1,109 lines
and holds what a session needs every time.

**Use it like this:** find the phase, `Read` that one file, work from it. Read a
second only when this table says the phase depends on it and the task reaches in.

## The 25 Phase commands — `context/phases/`

| Phase | Command | Depends on | Stage | File |
|---|---|---|---|---|
| 1 | Foundation Repository | — | 1 | `phase-01-foundation-repository.md` |
| 2 | Authentication + Tenant System | 1 | 1 | `phase-02-authentication-tenant-system.md` |
| 3 | Project Service | 8 | 2 | `phase-03-project-service.md` |
| 4 | BOQ Service | 3 | 2 | `phase-04-boq-service.md` |
| 5 | Procurement Service | 3, 4 | 2 | `phase-05-procurement-service.md` |
| 6 | Site Operations | 3 | 2 | `phase-06-site-operations.md` |
| 7 | Finance Service | 4, 5 | 2 | `phase-07-finance-service.md` |
| 8 | Event-Driven Infrastructure | 2 | 3 | `phase-08-event-driven-infrastructure.md` |
| 9 | File + Document System | 2 | 3 | `phase-09-file-document-system.md` |
| 10 | Mobile Offline Engine | 3–7, 20–22 | 3 | `phase-10-mobile-offline-engine.md` |
| 11 | AI Foundation | 8, 9 | 3 | `phase-11-ai-foundation.md` |
| 12 | AI Report Assistant | 11 | 3 | `phase-12-ai-report-assistant.md` |
| 13 | Knowledge Graph | 3–7, 11 | 3 | `phase-13-knowledge-graph.md` |
| 14 | Analytics + Dashboard | 3–7, 8, 13 | 3 | `phase-14-analytics-dashboard.md` |
| 15 | Observability | 1–14, 20–25 | — | `phase-15-observability.md` |
| 16 | Security | 2, 15 | — | `phase-16-security.md` |
| 17 | DevOps + Deployment | 1, 15, 16 | 4 | `phase-17-devops-deployment.md` |
| 18 | Testing | 1–17, 20–25 | — | `phase-18-testing.md` |
| 19 | Final Production Readiness | 1–18 | — | `phase-19-final-production-readiness.md` |
| 20 | Notification Service | 2, 3 | — | `phase-20-notification-service.md` |
| 21 | Equipment Service | 2, 3 | — | `phase-21-equipment-service.md` |
| 22 | Workforce Service | 2, 3 | — | `phase-22-workforce-service.md` |
| 23 | MLOps Pipeline | 11, 14 | 5 | `phase-23-mlops-pipeline.md` |
| 24 | Digital Twin | 13, 21, 23 | 5 | `phase-24-digital-twin.md` |
| 25 | Enterprise Provisioning | 2, 3, 20 | 3 | `phase-25-enterprise-provisioning.md` |

**Blocking rule, verbatim from the graph:** Phase 8 must be completed before Phases
3–7 begin, because all services depend on the shared event SDK from Phase 8.

Phase 24 additionally names two non-phase prerequisites in its own file: BIM
Integration (IFC.js parser, spec §13.4) and IoT Integration (MQTT 5.0, spec §13.5).

The Stage column is the SaaS Maturity mapping in §PHASE DEPENDENCY GRAPH:
Stage 1 = Phase 1–2 · Stage 2 = Phase 3–7 · Stage 3 = Phase 8–14, 25 ·
Stage 4 = Phase 17 · Stage 5 = Phase 23–24. **A dash means the source does not map
that phase to a stage** — it is not stage 0 and not a gap to fill by guessing.

Every phase file ends with the same constraint: before marking it complete, read
each Generate item line by line and prove it on disk with command output (Rule 36).
Rule 38 applies before it starts.

## What stayed in `context/00_master_construction_os.md`

| Section | Read it when |
|---|---|
| AGENT ROLE | starting a session cold |
| PHASE DEPENDENCY GRAPH | sequencing, or mapping a request to a stage |
| ENGINEERING GOVERNANCE | Risk Register R-01…R-09, Phase Register, effort estimates |
| GLOBAL TECHNOLOGY DECISION MAP | choosing or questioning a technology |
| GLOBAL SYSTEM CONTEXT COMMAND | service boundaries, deployable units, runtime mapping |
| GLOBAL EXECUTION RULES 1–25 + Rules 26–40 | the long form of a numbered rule, with the failure that produced it |
| FINAL EXECUTION ORDER | sequencing across the whole build |

> The ordinals in FINAL EXECUTION ORDER are execution positions, **not** phase
> numbers — its item 3 is Phase 8. Use PHASE DEPENDENCY GRAPH, or this table, for
> dependencies.

## The cross-cutting specifications — now in `.claude/rules/`

Each loads automatically when a file it governs is edited, so a deliberate read is
usually unnecessary.

| Specification | File |
|---|---|
| CROSS-SERVICE EVENT CONTRACT SPEC | `.claude/rules/event-contract.md` |
| FINANCIAL PRECISION SPEC | `.claude/rules/financial-precision.md` |
| DESIGN TOKEN SPECIFICATION | `.claude/rules/design-tokens.md` |
| WORKFLOW ENGINE SPEC | `.claude/rules/workflow-engine.md` |

## The Quality Mandates and path-triggered Rules

QM-1…QM-18 moved out of `context.md` to `.claude/rules/qm-NN-*.md`, and Rules 26–30,
32–35, 37, 39 and 40 to `.claude/rules/rule-*.md`. All load by path. `context.md`
keeps the index row for each, and Rules 31, 36 and 38 stay in `context.md` because
they govern how work is done rather than which file is touched.

The Phase 19 verification protocol is `/phase-19`
(`.claude/commands/phase-19.md`).

## Keeping this map honest

`scripts/ci/check-claude-rules-mirror.sh` proves every `.claude/rules/` file still
points at a heading that exists. Nothing yet proves this table matches
`context/phases/` — when a phase file is added, renamed or removed, fix this table
in the same commit.

```bash
ls context/phases/
```
