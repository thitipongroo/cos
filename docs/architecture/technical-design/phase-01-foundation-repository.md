---
title: 'Phase 1 — Foundation Repository'
version: '0.1.0'
status: Draft
last_updated: '2026-08-21'
authors:
  - thitipongroo
related_docs:
  - README.md
  - ../../specifications/03-system-design.md
  - ../../specifications/04-tech-stack.md
  - ../../specifications/32-implementation-specifications.md
  - ../../../context/00_master_construction_os.md
---

# Phase 1 — Foundation Repository

> Compiled from `context/00_master_construction_os.md` § PHASE 1 — FOUNDATION REPOSITORY COMMAND and
> the specification sections cited inline. `docs/specifications/` wins on any conflict; see
> [README § Authority](README.md).

---

## 1. Overview & goals

Stand up the monorepo, toolchain and CI foundation that every later phase builds on
(`00_master` § Phase Register, Phase 1 objective).

Phase 1 produces **no business behaviour**. Its output is the repository shape, the workspace and
build graph, the local infrastructure stack, the quality gates, and one placeholder README per
service and per package. The phase is done when `turbo run build` is green on every service and the
jest 100/100 coverage configuration, Docker Compose stack and CI pipeline are present
(`00_master` § Phase Register, Phase 1 exit).

Effort estimate and dependency position: `00_master` § Phase Register (**L**, no upstream phases).

---

## 2. Scope

Authoritative list: `00_master` § PHASE 1 COMMAND → `Generate:` and `Constraints:`. Restated here
only as headings — the item-by-item obligation list is that section, and § 12 below verifies it.

### In scope

- Directory structure with a placeholder README per service and per package (QM-11 content standard)
- Workspace definition, Turborepo pipeline, TypeScript project references, per-package jest config
- Docker Compose stack for local development, plus the optional `apps` profile (ADR-036)
- GitHub Actions CI (lint → build → test → docker build) and the Makefile entry points
- Git hooks (Husky + lint-staged) and the committed `pnpm-lock.yaml`

### Out of scope

Deferred to the phase named:

- Any domain entity, table or endpoint → Phase 3–7, 9, 20–22
- Authentication, tenant records, RLS policies → Phase 2
- Kafka producer/consumer/outbox implementations → Phase 8 (the `@cos/shared` package is scaffolded
  here; its Avro schemas and Kafka SDK are Phase 8 deliverables)
- Testcontainers helpers and `@cos/test-utils` → Phase 18 (`00_master` § Phase 1, jest.config note)

---

## 3. Architecture

The platform is a **modular monolith** — NestJS application layer, with independent Go workers and
Python AI services that cannot share the Node.js runtime (`03-system-design` §3.1 architecture note;
`00_master` § GLOBAL TECHNOLOGY DECISION MAP).

Phase 1 creates the directory for every deployable in the canonical runtime table
(`32-implementation-specifications` §32.2) but implements none of them. That table is the single
source for which runtime each service uses; `scripts/readiness/check-service-runtimes.sh` compares it
against the build files present under `services/` and fails CI on a mismatch.

Repository layout (`00_master` § PHASE 1 COMMAND → Directory Structure):

```text
apps/        web (Next.js + Serwist) · mobile (React Native + Expo)
backend/     NestJS modular monolith — ONE deployable; src/modules/* + src/shared/*
services/    separately deployed units (Fastify / FastAPI / Go / Node)
packages/    @cos/* shared packages — only code used by 2+ apps or services
infrastructure/  kubernetes · terraform · kafka · monitoring
ai/          prompts (baked into the ai-gateway image) · chains (deprecated location)
docs/ scripts/
```

Shared-package boundary rules (`00_master` § PHASE 1 COMMAND → Shared Package Boundary Rules):
event contracts, RBAC definitions, financial utilities, logging, tracing, shared types and config
validation belong in `packages/`; business logic, module DTOs and module repositories do not. Modules
must not import from each other's `src/` — cross-module communication is NestJS DI or Kafka
(§32.2 Internal vs Cross-deployable Communication).

C4 Context and Container views: [`architecture/README.md`](../README.md). Level 3 is the
Core / Domain / Intelligence decomposition in `03-system-design` §3.2, with concrete wiring in
[`architecture/service-interaction.md`](../service-interaction.md). No diagram is drawn
in this folder — `03-system-design` §3.4 requires diagram sources to live in `architecture/`.

---

## 4. Data model

**Phase 1 defines no entities.** It provisions the datastores that later phases write to. The first
tables — `platform.tenants`, `platform.users`, `platform.tenant_memberships`, `platform.audit_logs` —
are Phase 2 (`00_master` § PHASE 2 COMMAND → Entities).

Datastores stood up locally (`00_master` § PHASE 1 COMMAND → Docker Compose; versions authoritative
in `04-tech-stack` §4.3–4.4):

| Store            | Role                                | Note                                                                        |
| ---------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| PostgreSQL 18    | primary relational store            | image is `timescale/timescaledb:latest-pg18` — see TimescaleDB row          |
| TimescaleDB 2.x  | time-series telemetry               | PostgreSQL **extension**, co-located on the primary instance (ADR-032)      |
| PgBouncer        | connection pooler — **mandatory**   | transaction mode only; session and statement modes prohibited (QM-18, §7.9) |
| Redis 8          | cache and session store             |                                                                             |
| Apache Kafka 4.x | event bus                           | KRaft mode, no ZooKeeper                                                    |
| Schema Registry  | Avro schema management              | Confluent                                                                   |
| OpenSearch 3.x   | full-text and vector search         |                                                                             |
| Neo4j 2026.x     | knowledge graph                     |                                                                             |
| ClickHouse 26.x  | analytics OLAP                      |                                                                             |
| MinIO            | S3-compatible object storage        |                                                                             |
| HashiCorp Vault  | secret injection — dev mode locally |                                                                             |

The application connects to **PgBouncer**, never to PostgreSQL port `5432` directly
(QM-18; `07-multi-tenant-architecture` §7.9 connection routing rule).

---

## 5. API contract

**Phase 1 exposes no domain endpoints.** What it fixes is the contract that every later endpoint
inherits:

- Every HTTP endpoint carries a version prefix from its first commit — NestJS global prefix `api/v1`
  set in `backend/src/main.ts` (QM-2; `00_master` § Always)
- OpenAPI 3.1 per service under `docs/api/{service}.openapi.yaml` — one file per service, never one
  combined file (QM-2)
- Errors use the `COS-{DOMAIN}-{NUMBER}` envelope with `traceId` (QM-10)

---

## 6. Events

**No events are emitted in Phase 1.** The `@cos/shared` package is created here carrying typed Kafka
event **interfaces**; the Avro schemas, `KafkaProducer`, `KafkaConsumer` and `OutboxPublisher` are
Phase 8 deliverables (`00_master` § PHASE 1 COMMAND → packages list, and § PHASE 8 COMMAND).

Two constraints bind the package from day one, because it is imported by React Native, the browser
service worker and Node.js alike:

- Rule 34 — no runtime import of a Node.js-only package (PrismaClient, native addons, server
  frameworks) in `@cos/shared`
- Rule 33 — use `import type` when a symbol is only used in a type position, so bundlers erase it

---

## 7. Sequence / flows

Phase 1 has no user-facing flow. The two flows it does define:

**First-run developer setup** (`00_master` § PHASE 1 COMMAND → Makefile, Docker Compose)

```text
pnpm install  →  make setup  →  docker compose up (infra tier)
              →  make migrate  →  make seed  →  make dev (turbo on host)
```

The `apps` profile runs the application services in containers instead
(`docker compose --profile full --profile apps up` / `make docker-apps-up-full`, ADR-036); day-to-day
development still runs turbo on the host.

**CI pipeline** (`00_master` § PHASE 1 COMMAND → GitHub Actions; `04-tech-stack` §4.9;
`30-testing-strategy` §30.12)

```text
lint  →  type-check  →  build (turbo run build)  →  unit  →  integration
      →  isolation  →  contract  →  dependency-audit  →  docker build
```

`build` runs on every PR and is a distinct gate from `type-check`: `tsc --noEmit` is not a build and
does not catch `nest build` / `next build` failures (ADR-033).

---

## 8. Failure modes & rollback

Phase 1 has no runtime failure surface. Its failure modes are build-time, and each has a numbered
rule because each has already occurred in this repository:

| Failure                                              | Cause                                                               | Guard                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| CI fails `--frozen-lockfile`                         | dependency change committed without the regenerated lockfile        | Rule 28 + `scripts/ci/check-lockfile-staged.sh` in `.husky/pre-commit` |
| Import resolves locally, fails in CI or in the image | package imported without being in **that** package's `package.json` | Rule 26                                                                |
| Script exists but never runs in CI                   | `package.json` script added without the matching `turbo.json` task  | Rule 27                                                                |
| Mobile bundle fails at Metro                         | Node-only package pulled into `@cos/shared` at runtime              | Rules 33, 34                                                           |
| Conflicting jest configuration                       | both `jest.config.js` and a `"jest"` key in `package.json`          | Rule 32                                                                |
| Untested shared logic                                | `@cos/*` package with executable code and no jest setup             | Rule 35                                                                |

**Which lockfile** is not always the root one: `apps/mobile` is its own pnpm workspace, so a mobile
dependency change regenerates `apps/mobile/pnpm-lock.yaml` and a root `pnpm install` produces no diff
for it (Rule 28, narrowed 2026-08-08).

Rollback: Phase 1 ships no migration and no deployed workload, so rollback is `git revert`. The
migration rollback obligation (QM-9, scripts in `prisma/rollbacks/`) begins in Phase 2.

---

## 9. Security

Phase 1 establishes the secret-handling posture; enforcement mechanisms arrive in Phase 2 and 16.

- **No secrets in code or git history.** Runtime secrets are injected from AWS Secrets Manager
  (cloud) or HashiCorp Vault (on-premise / hybrid); Kubernetes Secret objects that must live in git
  are committed only as `SealedSecret` via `kubeseal` (QM-4; `05-security-compliance` §5.2; ADR-013)
- **Local development** uses a Vault dev-mode container, started with the rest of the stack
  (`00_master` § PHASE 1 COMMAND → Docker Compose)
- `.env.example` documents every required variable; `.env` files are never committed (QM-4)
- Istio is skipped for Docker Compose and enabled from the dev Kubernetes environment onwards
  (`00_master` § PHASE 1 COMMAND)

---

## 10. Observability

Phase 1 creates `@cos/logger` (Pino-based structured logging) and `@cos/tracing` (OpenTelemetry
setup) as packages; the collector, dashboards and alert rules are Phase 15.

Two rules bind from the first line of code (QM-8):

- `console.log` is prohibited — always the platform logger
- PII never appears in log fields, traces or error messages — IDs only

---

## 11. Testing & acceptance

Per-package `jest.config.js` with `{ lines: 100, branches: 100 }` thresholds (QM-1;
`30-testing-strategy` §30.3). `collectCoverageFrom` excludes `*.module.ts`, `*.dto.ts`,
`*.payload.ts`, `index.ts`, `main.ts` and pure event-interface files.

Packages that **must** carry a jest config (Rule 35 — any package with a function or method body):
`@cos/shared`, `@cos/database`, `@cos/financial`, `@cos/rbac`, `@cos/validation`, `@cos/logger`,
`@cos/tracing`, `@cos/config`, plus `backend/`. `@cos/types` is exempt — types and interfaces only.

Acceptance is the `Generate:` list in `00_master` § PHASE 1 COMMAND, verified item by item with
filesystem evidence (Rule 36). § 12 is that verification.

---

## 12. Implementation status

Verified on **2026-08-21** against this working tree (Rule 36 — commands shown, output summarised).

| Generate item                              | Status     | Evidence                                                                                                                                                                   |
| ------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Directory structure                        | ✅ present | `apps/ backend/ services/ packages/@cos/ infrastructure/ ai/ scripts/`                                                                                                     |
| README per package                         | ✅ present | `ls packages/@cos/*/README.md` → 12 files                                                                                                                                  |
| README per service                         | ✅ present | `ls services/*/README.md` → 10 files                                                                                                                                       |
| `pnpm-workspace.yaml` incl. `!apps/mobile` | ✅ present | file lists `apps/*`, `!apps/mobile`, `backend`, `packages/@cos/*`, `services/*`                                                                                            |
| `apps/mobile` standalone workspace         | ✅ present | `apps/mobile/pnpm-workspace.yaml` sets `nodeLinker: hoisted`                                                                                                               |
| `turbo.json` pipelines                     | ✅ present | tasks include `build`, `dev`, `test`, `test:unit`, `test:cov`, `test:integration`                                                                                          |
| `tsconfig.base.json`                       | ✅ present | repository root                                                                                                                                                            |
| Docker Compose stack                       | ✅ present | services include `postgres` (`timescale/timescaledb:latest-pg18`), `pgbouncer`, `redis`, `kafka`, `schema-registry`, `opensearch`, `neo4j`, `clickhouse`, `minio`, `vault` |
| `.env.example`                             | ✅ present | repository root                                                                                                                                                            |
| GitHub Actions CI                          | ✅ present | `.github/workflows/` → `ci.yml` plus 7 more workflows                                                                                                                      |
| `Makefile`                                 | ✅ present | repository root                                                                                                                                                            |
| Root `README.md`                           | ✅ present | repository root                                                                                                                                                            |
| Husky + `.husky/pre-commit`                | ✅ present | `.husky/pre-commit`                                                                                                                                                        |
| ESLint flat config                         | ✅ present | `eslint.config.mjs`                                                                                                                                                        |
| jest config per package                    | ✅ present | `backend/jest.config.js` + `packages/@cos/*/jest.config.js` → 12 total                                                                                                     |
| Node / pnpm toolchain versions             | ✅ present | `engines.node >=24.0.0`, `engines.pnpm >=11.0.0`, `packageManager pnpm@11.22.0`                                                                                            |
| `pnpm-lock.yaml` committed                 | ✅ present | repository root                                                                                                                                                            |

**Beyond the Phase 1 list.** The tree carries more than this phase specified, each attributable:

- `services/` has **10** entries, not the 6 named in the Phase 1 command. The four additions —
  `ai-transcription-pipeline`, `bim-import-worker`, `credential-service`, `iot-ingestion-worker` —
  are all rows in `32-implementation-specifications` §32.2 (added 2026-08-07, each with its
  establishing ADR in the Contents column).
- `packages/@cos/` has **12** entries, not the 9 named. `@cos/test-utils` is a Phase 18 deliverable
  (`00_master` § PHASE 18 COMMAND). `@cos/schemas` and `@cos/ui-logic` are **not named in any phase
  command I read** — see § 14 OQ-1a.

---

## 13. Dependencies & risks

**Dependencies:** none — Phase 1 is the root of the dependency graph
(`32-implementation-specifications` §32.1; `00_master` § PHASE DEPENDENCY GRAPH).

**Risks:** `R-07` — SDK / dependency churn and EOL. Scoring, owner, mitigation and early-warning
metric are in `00_master` § Risk Register and are not restated here.

---

## 14. Open questions / NOT SPECIFIED

| ID    | Question                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Status                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| OQ-1  | **Closed 2026-08-22.** Every §3.2 service and every module on disk is now mapped, with its establishing source, in [`architecture/README.md` § Level 3](README.md#level-3--component) — which also gained the C4 Component view §3.4 had never had. Two findings: **Forecasting Service is not built** (the name appears in the whole specification set only at §3.2; the deterministic cash-flow forecast lives in `finance` per ADR-024, and AI forecasting is post-MVP Layer B), and Workflow / Document / Quality Control / Asset Management are all accounted for without a module of their own. The eight modules §3.2 omits each trace to a later ADR or phase command. | Closed                                                                              |
| OQ-1a | `@cos/schemas` and `@cos/ui-logic` exist on disk but are named in no phase `Generate:` list read so far. Distinct from OQ-1, which covered `backend/src/modules/` only — these are shared packages.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Closed 2026-08-22 — resolution in the [register](README.md#open-questions-register) |
| OQ-5  | The root `pnpm-workspace.yaml` comment says `apps/mobile` installs "with `node-linker=hoisted` (`apps/mobile/.npmrc`)" via `pnpm install --ignore-workspace`. Both `apps/mobile/.npmrc` and `00_master` state the opposite — pnpm 10/11 reads `nodeLinker` from `pnpm-workspace.yaml`, **not** `.npmrc`.                                                                                                                                                                                                                                                                                                                                                                       | Closed 2026-08-22 — resolution in the [register](README.md#open-questions-register) |

None of these blocks the phase; all three are recorded rather than resolved, per
[README § Open questions](README.md#open-questions-register).
