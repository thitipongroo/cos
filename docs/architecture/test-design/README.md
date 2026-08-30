---
title: 'Test Design'
version: '1.0.0'
status: Active
last_updated: '2026-08-25'
authors:
  - thitipongroo
related_docs:
  - ../../specifications/30-testing-strategy.md
  - ../../specifications/21-mvp-scope.md
  - ../../specifications/22-ai-architecture.md
  - ../../specifications/31-monitoring-observability.md
  - ../../specifications/32-implementation-specifications.md
---

# Test Design

The per-phase test case catalogue for Phase 1–25, the cross-cutting suites, the
traceability matrix and the escalation register.

> **Authority.** The testing _strategy_ is
> [§30 Testing Strategy](../../specifications/30-testing-strategy.md) and it is the source of
> truth. This set holds the test _design_ — the concrete cases that satisfy it. Where the two
> disagree, §30 wins and the case here is the bug.
>
> **Split from one file on 2026-08-25.** This was `35-test-design.md`, a single 290 KB
> document. Section numbers are kept in each page so the §35.10.N / §35.13 citations spread
> across the repository still resolve.

## Phases

| Phase | Area                           | Page                                                                                         |
| ----- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| 1     | Foundation Repository          | [phase-01-foundation-repository.md](phase-01-foundation-repository.md)                       |
| 2     | Authentication + Tenant System | [phase-02-authentication-and-tenant-system.md](phase-02-authentication-and-tenant-system.md) |
| 3     | Project Service                | [phase-03-project-service.md](phase-03-project-service.md)                                   |
| 4     | BOQ Service                    | [phase-04-boq-service.md](phase-04-boq-service.md)                                           |
| 5     | Procurement Service            | [phase-05-procurement-service.md](phase-05-procurement-service.md)                           |
| 6     | Site Operations                | [phase-06-site-operations.md](phase-06-site-operations.md)                                   |
| 7     | Finance Service                | [phase-07-finance-service.md](phase-07-finance-service.md)                                   |
| 8     | Event-driven Infrastructure    | [phase-08-event-driven-infrastructure.md](phase-08-event-driven-infrastructure.md)           |
| 9     | File + Document System         | [phase-09-file-and-document-system.md](phase-09-file-and-document-system.md)                 |
| 10    | Mobile Offline Engine          | [phase-10-mobile-offline-engine.md](phase-10-mobile-offline-engine.md)                       |
| 11    | AI Foundation                  | [phase-11-ai-foundation.md](phase-11-ai-foundation.md)                                       |
| 12    | AI Report Assistant            | [phase-12-ai-report-assistant.md](phase-12-ai-report-assistant.md)                           |
| 13    | Knowledge Graph                | [phase-13-knowledge-graph.md](phase-13-knowledge-graph.md)                                   |
| 14    | Analytics + Dashboard          | [phase-14-analytics-and-dashboard.md](phase-14-analytics-and-dashboard.md)                   |
| 15    | Observability                  | [phase-15-observability.md](phase-15-observability.md)                                       |
| 16    | Security                       | [phase-16-security.md](phase-16-security.md)                                                 |
| 17    | DevOps + Deployment            | [phase-17-devops-and-deployment.md](phase-17-devops-and-deployment.md)                       |
| 18    | Testing                        | [phase-18-testing.md](phase-18-testing.md)                                                   |
| 19    | Final Production Readiness     | [phase-19-final-production-readiness.md](phase-19-final-production-readiness.md)             |
| 20    | Notification Service           | [phase-20-notification-service.md](phase-20-notification-service.md)                         |
| 21    | Equipment Service              | [phase-21-equipment-service.md](phase-21-equipment-service.md)                               |
| 22    | Workforce Service              | [phase-22-workforce-service.md](phase-22-workforce-service.md)                               |
| 23    | MLOps Pipeline                 | [phase-23-mlops-pipeline.md](phase-23-mlops-pipeline.md)                                     |
| 24    | Digital Twin                   | [phase-24-digital-twin.md](phase-24-digital-twin.md)                                         |
| 25    | Enterprise Provisioning        | [phase-25-enterprise-provisioning.md](phase-25-enterprise-provisioning.md)                   |

## Everything else

| Section                      | Page                                                 |
| ---------------------------- | ---------------------------------------------------- |
| §35.9 Cross-cutting suites   | [cross-cutting-suites.md](cross-cutting-suites.md)   |
| §35.11 Traceability matrix   | [traceability-matrix.md](traceability-matrix.md)     |
| §35.12 Implementation status | [implementation-status.md](implementation-status.md) |
| §35.13 Escalation register   | [escalation-register.md](escalation-register.md)     |
| References                   | [references.md](references.md)                       |

## 35.1 Purpose and Scope

This document is the **test design specification** for Construction OS. It converts the testing
_strategy_ defined in [30-testing-strategy](../../specifications/30-testing-strategy.md) into a concrete, per-phase
**test case catalogue** covering Phase 1 through Phase 25 as defined in
`context/00_master_construction_os.md`.

### In scope

- One test design section per Phase (1–25), each containing a full test case catalogue
  (ID, title, level, technique, pre-condition, steps, expected result, spec reference, status)
- Cross-cutting suites that are not owned by a single phase (isolation, offline sync, contract,
  load, security, AI quality) — §35.9
- Traceability from spec section → phase → test case ID → CI gate — §35.11
- Implementation status of every designed test, evidenced against the repository — §35.12

### Out of scope

- **Testing strategy, policy, and tool selection** — authoritative in §30. This document does not
  introduce, change, or reinterpret any strategy decision.
- **Test implementation code** — test sources live in the repository; this document designs them.
- **Manual QA scripts for exploratory testing** — not defined in any spec file.

### Audience

Engineering (all squads), QA, Release Management, and the product owner performing Phase 19
production-readiness verification.

---

## 35.2 Authority and Relationship to §30

| Question                                                                               | Answer                                                                                                    |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Which document defines the testing strategy?                                           | [30-testing-strategy](../../specifications/30-testing-strategy.md) — authoritative                        |
| What does §35 add?                                                                     | Test _design_ only — the concrete cases that satisfy §30                                                  |
| On conflict between §35 and §30?                                                       | **§30 wins.** The conflict is reported to the product owner and §35 is corrected                          |
| On conflict between §35 and a Phase command in `context/00_master_construction_os.md`? | The specs win over context files (`context.md` authority hierarchy). The divergence is recorded in §35.13 |
| May §35 introduce a new quality target, threshold, or gate?                            | **No.** Every threshold in this document is quoted from a spec section and cited                          |

**Rule of construction:** where a spec does not define the expected result of a behaviour, this
document writes `UNSPECIFIED — escalate` in the Expected result cell and records the item in
§35.13. Expected results are **never** inferred, estimated, or back-filled from implementation code.

---

## 35.3 Test Basis and Traceability Model

The **test basis** (the sources a test case may be derived from) is restricted to:

| Priority | Source                                                                                | Use                                                                    |
| -------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1        | `docs/specifications/` §00–§34                                                        | Authoritative for all behaviour, thresholds, and acceptance criteria   |
| 2        | `context/00_master_construction_os.md` Phase 1–25 `Generate:` / `Constraints:` blocks | The per-phase obligation list that determines _which_ tests must exist |
| 3        | `context.md` QUALITY MANDATES (QM-1 … QM-18)                                          | Cross-cutting gates every phase inherits                               |

Nothing else is a valid test basis. In particular, **implementation source code is not a test
basis** — code is used only to establish _implementation status_ (§35.12), never to derive an
expected result.

### Traceability chain

```text
spec §section
   └─► Phase N  (00_master Generate item)
          └─► Test case ID  (TC-PNN-LEVEL-NNN)
                 └─► CI gate  (§30.12 table)
                        └─► Evidence  (test file path on disk, or PLANNED)
```

Every row of §35.11 carries this full chain. A test case with no spec reference is invalid and
must be deleted, not retained with an assumed rationale.

---

## 35.4 Test Case ID Convention and Template

**Decision:** `TC-P{NN}-{LEVEL}-{NNN}`. **Resolved:** 2026-08-22 (product owner).
No ID convention existed in any spec file before this decision.

| Segment   | Values          | Notes                                               |
| --------- | --------------- | --------------------------------------------------- |
| `TC`      | literal         | Test Case                                           |
| `P{NN}`   | `P01` … `P25`   | Zero-padded Phase number per `00_master` Phase 1–25 |
| `{LEVEL}` | see table below | The test level the case executes at                 |
| `{NNN}`   | `001` …         | Sequential **within** the `(phase, level)` pair     |

### LEVEL values

| LEVEL      | Meaning                                                                                                         | Primary spec source                               |
| ---------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `UNIT`     | Unit test — isolated logic, all I/O mocked                                                                      | §30.3                                             |
| `INT`      | Integration test — real dependencies via Testcontainers                                                         | §30.4                                             |
| `ISO`      | Multi-tenant isolation test                                                                                     | §30.6                                             |
| `CONTRACT` | Consumer-driven contract test (Pact)                                                                            | §30.8                                             |
| `E2E`      | End-to-end user journey (Playwright / Detox)                                                                    | §30.5, §30.7                                      |
| `LOAD`     | Performance / load test (k6, Lighthouse CI)                                                                     | §30.9                                             |
| `SEC`      | Security test (SAST, DAST, secrets, throttling)                                                                 | §30.10                                            |
| `AI`       | AI output-quality evaluation                                                                                    | §30.11                                            |
| `MAN`      | Manual or command-driven verification — no automated test file exists; the evidence is command output (Rule 36) | §30.12 gate execution; Phase 19 `[MANUAL]` checks |

### ID stability rules

- An ID is **immutable** once published in this document.
- A retired test case keeps its ID with status `RETIRED`; the number is **never** reused.
- Renumbering a phase does not renumber its test cases — §35.11 carries the mapping.

### Test case template

Every catalogue row uses exactly these columns:

| Column              | Content                                                                                                                                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ID**              | `TC-PNN-LEVEL-NNN`                                                                                                                                                                                                                                                |
| **Title**           | One line, imperative, states the behaviour under test                                                                                                                                                                                                             |
| **Level**           | LEVEL value above                                                                                                                                                                                                                                                 |
| **Technique**       | Test design technique (see §35.5)                                                                                                                                                                                                                                 |
| **Pre-condition**   | State that must hold before step 1; `—` if none                                                                                                                                                                                                                   |
| **Steps**           | Numbered, executable actions                                                                                                                                                                                                                                      |
| **Expected result** | Observable, falsifiable outcome — or `UNSPECIFIED — escalate`                                                                                                                                                                                                     |
| **Spec ref**        | The exact spec §section (and Phase `Generate:` item) the case derives from                                                                                                                                                                                        |
| **Status**          | `IMPLEMENTED` (test file observed on disk — path given) · `PLANNED` (designed, no test file found) · `GAP` (verification performed; the deliverable under test is missing or non-conforming — recorded in §35.12) · `UNSPECIFIED` (blocked on §35.13) · `RETIRED` |

`IMPLEMENTED` may only be set when the test file has been observed on disk; the path is recorded
in §35.12. This is the per-item application of Rule 36.

---

## 35.5 Test Levels, Techniques and Tooling

### Level → tooling → gate

| Level      | Scope (§30)                                                                                           | Tooling                                                                                        | CI gate (§30.12)                                                   | Blocks                                  |
| ---------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------- |
| `UNIT`     | Service logic, utils, DTO validation, event payload construction, Temporal activity functions (§30.3) | Jest 30.x + `@nestjs/testing`; pytest 9.x; Go `testing` + testify                              | Unit tests + coverage 100% lines / 100% branches                   | PR merge                                |
| `INT`      | Service↔DB, Kafka produce/consume, Keycloak token validation, Kong routing, Debezium CDC (§30.4)      | Jest + Supertest + Testcontainers                                                              | Integration tests                                                  | PR merge                                |
| `ISO`      | 5 isolation layers: PostgreSQL, Neo4j, Kafka, S3, API (§30.6)                                         | Jest + Testcontainers, `app_user` role                                                         | Multi-tenant isolation tests                                       | PR merge                                |
| `CONTRACT` | All public API endpoints per §14.3 (§30.8)                                                            | Pact.io (consumer-driven)                                                                      | API contract tests (Pact)                                          | PR merge                                |
| `E2E`      | 10 web + 3 mobile critical journeys (§30.5)                                                           | Playwright 1.x (web), Detox (React Native)                                                     | E2E tests                                                          | Production promotion                    |
| `LOAD`     | 5 backend load profiles (§30.9) + frontend Core Web Vitals (§30.9 Lighthouse CI)                      | k6; Lighthouse CI                                                                              | Load tests (weekly, alert only); Lighthouse CI (per `apps/web` PR) | Load: alert only · Lighthouse: PR merge |
| `SEC`      | SAST, DAST, pentest, secrets scanning, throttling (§30.10)                                            | SonarQube (⏸ deferred), OWASP ZAP, GitLeaks, Trivy, `pnpm audit` / `pip-audit` / `govulncheck` | Dependency audit; SAST (⏸ deferred); DAST (weekly)                 | Audit: PR merge                         |
| `AI`       | Layer A + Layer B model output quality (§30.11)                                                       | Golden-example sets, Evidently AI, MLflow, Prophet                                             | Not a PR gate — **monthly** evaluation cadence (§30.11)            | Alert AI Lead on >10% regression        |
| `MAN`      | Phase 19 `[MANUAL]` readiness checks                                                                  | `scripts/readiness/run-all-checks.sh` (interactive)                                            | Stage 1→2 transition gate                                          | Stage advance                           |

### Test design techniques used in the catalogues

| Technique                                          | Applied to                                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| State transition testing                           | Project status machine (Ph3), RFQ + PO state machines (Ph5), BOQ version lifecycle (Ph4), file status (Ph9)       |
| Decision table testing                             | PO approval threshold chain (Ph5), task completion gates 1–9 (Ph6), notification routing + quiet hours (Ph20)     |
| Equivalence partitioning + boundary value analysis | Financial rounding (Ph4, Ph7), file size / MIME limits (Ph9), rate limits (Ph16), offline data size limits (Ph10) |
| Negative / error-guessing                          | Invalid state transitions, cross-tenant access, malformed DTOs, expired tokens                                    |
| Use case testing                                   | E2E journeys (Ph18)                                                                                               |
| Idempotency / replay testing                       | Kafka consumer idempotency (Ph8), KG rebuild (Ph13), provisioning workflow (Ph25)                                 |
| Conflict-scenario testing                          | Offline sync strategies (Ph6, Ph10)                                                                               |
| Metric-threshold evaluation                        | Load (Ph14, Ph18), AI quality (Ph11, Ph12, Ph23)                                                                  |

---

## 35.6 Entry and Exit Criteria per Level

Derived from the §30.12 gate table and QM-1. No target in this section is new.

| Level      | Entry criteria                                                                                                          | Exit criteria                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `UNIT`     | Code compiles (`tsc --noEmit`); package has `jest.config.js` (Rule 32 — single source of truth)                         | 100% lines **and** 100% branches for the package (QM-1, §30.3); zero flaky tests (§30.1)                                               |
| `INT`      | Unit gate green; Testcontainers harness available (Docker); migrations apply on `timescale/timescaledb` image           | All critical integration tests in §30.4 pass; suite exits without `forceExit` (ADR-034 / Rule 39)                                      |
| `ISO`      | Two tenant fixtures provisioned (`tenant_fixture_a`, `tenant_fixture_b`); `app_user` non-superuser connection available | All 5 isolation layers return the §30.6 pass criteria. **Any failure is a Critical Security Defect** and blocks merge                  |
| `CONTRACT` | Consumer Pact files published                                                                                           | Provider verifies **all** consumer contracts; a new API version cannot ship while any v1 consumer contract fails (§30.8)               |
| `E2E`      | Merge to `staging`; staging deployed via ArgoCD; seed data reset; smoke tests (PostSync wave 1) green                   | All 10 Playwright + 3 Detox scenarios pass (§30.5)                                                                                     |
| `LOAD`     | Staging at production-mirroring scale (50% of production spec)                                                          | Each scenario meets its §30.9 pass criteria; p95 regression > 20% vs previous week alerts Engineering Lead                             |
| `SEC`      | Build artefact / image available                                                                                        | No High/Critical dependency findings; no secrets detected; all High-severity DAST findings resolved before production release (§30.10) |
| `AI`       | Golden/eval dataset available for the feature                                                                           | Layer A: §30.11 thresholds met. Layer B: model-specific thresholds met — see §35.13 for models with no defined threshold               |
| `MAN`      | Automated Phase 19 checks all PASSED                                                                                    | Product owner sign-off recorded in `cos-audit/audit-<timestamp>.log`                                                                   |

### Definition of Done (per §30.1)

Testing is part of the Definition of Done. No PR merges without the §30.12 gates passing. Flaky
tests are treated as build failures — they are fixed or quarantined with an owner, never retried.

---

## 35.7 Test Environments

| Environment    | Purpose                             | Provisioning                                                                                                                       | Levels executed                         |
| -------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Local          | Developer inner loop                | Docker Compose (PostgreSQL/TimescaleDB, Redis, Kafka, OpenSearch, Neo4j, ClickHouse, MinIO, Schema Registry, Vault dev, PgBouncer) | `UNIT`, `INT`                           |
| CI (ephemeral) | PR gates                            | GitHub Actions runner + Testcontainers per test run                                                                                | `UNIT`, `INT`, `ISO`, `CONTRACT`, `SEC` |
| Staging        | Pre-production verification         | AWS EKS, mirrors production spec at 50% size; seed data reset per release; deployed by ArgoCD auto-sync                            | `E2E`, `LOAD`, DAST                     |
| Production     | Continuous isolation assurance only | Kubernetes CronJob synthetic probe                                                                                                 | `ISO` (probe subset — §30.6)            |

### Branch flow (§30.5)

```text
develop  ──►  staging  ──►  main
(integration)  (staging deploy + E2E gate)  (production, manual ArgoCD promotion)
```

E2E does **not** run on every PR — it is too slow for a PR gate (§30.5).

### Integration harness conventions (§30.4 — enforced by `backend/test/helpers/integration-infra.ts`)

These are non-obvious and are the most common cause of false failures:

1. **DB image must be `timescale/timescaledb:*`**, not plain `postgres` — migrations call
   `create_hypertable`; plain postgres fails to migrate.
2. **Point the app at the container** — set `APP_DATABASE_URL` (app role, falls back to
   `DATABASE_URL`) **and** `DIRECT_DATABASE_URL` (migrations); otherwise the app reads a different
   DB than the one migrated.
3. **Migrate from a cwd without a `.env`** (absolute `--schema`) — the Prisma CLI gives `.env`
   precedence over the passed `DATABASE_URL`.
4. **Tenant context via CLS** — override `JwtAuthGuard` with a guard that publishes
   `tenantId`/`userId`/`userRole` into CLS. A bare `canActivate: () => true` boots the app but
   leaves context empty → `401`. Tenant ids must be valid UUIDs (including the version nibble).
5. **RLS is enforced only for the non-superuser `app_user` role** — use an `app_user` connection,
   not the container superuser, to exercise RLS policies.
6. **No `forceExit`** — every long-lived handle closes on `app.close()`. A hang after specs pass
   signals a new unclosed handle; diagnose with `--detectOpenHandles` (Rule 39 / ADR-034).

Kafka and OpenSearch network clients are stubbed globally via
`backend/test/helpers/integration-mocks.ts`.

### Runner configuration (verified on disk)

| Config              | Path                                                                                                                   | Purpose                                                                                                                                                                                                                                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend unit        | `backend/jest.config.js`                                                                                               | `coverageThreshold.global = { lines: 100, branches: 100 }`; `maxWorkers: 2`                                                                                                                                                                                                                                                                                 |
| Backend integration | `backend/jest.integration.config.js`                                                                                   | Testcontainers, `--runInBand`                                                                                                                                                                                                                                                                                                                               |
| Temporal workflows  | `backend/jest.workflows.config.js`                                                                                     | `maxWorkers: 1` — serial; excluded from `test:cov`                                                                                                                                                                                                                                                                                                          |
| Contract (Pact)     | `jest.contract.config.js` (repo root)                                                                                  | `testMatch: tests/contract/**/*.spec.ts`                                                                                                                                                                                                                                                                                                                    |
| Web E2E             | `tests/e2e/playwright.config.ts`                                                                                       | `testDir: ./specs`; `baseURL` from `BASE_URL`                                                                                                                                                                                                                                                                                                               |
| Mobile E2E          | `apps/mobile/e2e/jest.config.js`                                                                                       | Detox runners, `maxWorkers: 1`, `testTimeout: 120000`                                                                                                                                                                                                                                                                                                       |
| Mobile unit         | `apps/mobile/jest.config.ts`                                                                                           | Standalone workspace (excluded from root pnpm workspace)                                                                                                                                                                                                                                                                                                    |
| Shared packages     | `packages/@cos/{shared,database,financial,rbac,validation,logger,tracing,config,test-utils}/jest.config.js`            | Rule 35 — every package with executable logic                                                                                                                                                                                                                                                                                                               |
| Service             | `services/file-service/jest.config.js`                                                                                 | See §35.13 ESC-05 — not executed by CI                                                                                                                                                                                                                                                                                                                      |
| Mutation            | `backend/stryker.config.json`, `packages/@cos/financial/stryker.config.json`, `packages/@cos/rbac/stryker.config.json` | All three: `thresholds: { high: 90, low: 80, break: 70 }` (QM-1 requires ≥ 70). CI matrix in `.github/workflows/mutation-tests.yml` covers the three QM-1 categories: financial calculation (`@cos/financial`), permission checks (`@cos/rbac` + backend `shared/guards`), procurement approval flows (backend `procurement.service` + Temporal activities) |
| Frontend perf       | `apps/web/.lighthouserc.json`                                                                                          | LCP ≤ 2500 ms, CLS ≤ 0.1, TBT ≤ 200 ms, script transfer ≤ 256000 bytes                                                                                                                                                                                                                                                                                      |

---

## 35.8 Test Data and Factories

**Pattern (§30.13):** plain TypeScript factory functions (factory_bot pattern). Domain entities are
raw SQL tables accessed through Prisma `$queryRaw` / `$executeRaw`, so schema-driven generators
(prisma-fabbrica, factory-js Prisma plugin) do not apply.

### Rules

- Provide only **required fields** — those that would fail validation if absent.
- Fields with server-generated defaults (`id`, `created_at`, `tenant_id` from JWT) are **not**
  included.
- Every factory accepts a final `overrides: Partial<T> = {}` argument, spread last.
- A factory with no overrides must produce a payload that passes API validation.

### Naming

```text
build<EntityName>Dto   — request payload factories (HTTP integration tests)
build<EntityName>      — seed data factories (direct DB seeding)
```

### Available factories

Location: `packages/@cos/test-utils/src/factories.ts` (exported from the package index).
17 factories, matching the §30.13 registry exactly.

| Kind     | Factories                                                                                                                                                                                                                                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seed (5) | `buildTenant`, `buildUser`, `buildProject`, `buildDocument`, `buildInvoice`                                                                                                                                                                                                                                                 |
| DTO (12) | `buildCreateProjectDto`, `buildCreateVendorDto`, `buildCreatePurchaseRequestDto`, `buildCreateRfqDto`, `buildCreatePurchaseOrderDto`, `buildCreateBoqItemDto`, `buildSetBudgetDto`, `buildCreateSiteReportDto`, `buildCreateWorkerDto`, `buildCreateCheckInDto`, `buildNotificationPreferenceDto`, `buildRegisterDeviceDto` |

Supporting utilities in the same package: `containers.ts` (Testcontainers helpers), `db-reset.ts`
(truncate + reseed between integration tests).

### When NOT to use a factory (§30.13)

- Single-field payloads where the value **is** the test — `{ phoneNumber: 'not-a-phone' }`
- State transition commands — `{ to: 'ACTIVE' }`
- Intentionally malformed validation-failure payloads — keep inline so the intent is visible

### Adding a factory

1. Identify every multi-field CREATE payload in the new integration test.
2. Add one `build<EntityName>Dto` per entity to `factories.ts`.
3. Use it in the test — no inline multi-field objects.

---
