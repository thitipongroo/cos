---
title: 'Test Design'
version: '1.0.0'
status: Active
last_updated: '2026-08-22'
authors:
  - thitipongroo
related_docs:
  - 30-testing-strategy.md
  - 21-mvp-scope.md
  - 22-ai-architecture.md
  - 31-monitoring-observability.md
  - 32-implementation-specifications.md
---

# 35. Test Design

## Table of Contents

- [35.1 Purpose and Scope](#351-purpose-and-scope)
- [35.2 Authority and Relationship to §30](#352-authority-and-relationship-to-30)
- [35.3 Test Basis and Traceability Model](#353-test-basis-and-traceability-model)
- [35.4 Test Case ID Convention and Template](#354-test-case-id-convention-and-template)
- [35.5 Test Levels, Techniques and Tooling](#355-test-levels-techniques-and-tooling)
- [35.6 Entry and Exit Criteria per Level](#356-entry-and-exit-criteria-per-level)
- [35.7 Test Environments](#357-test-environments)
- [35.8 Test Data and Factories](#358-test-data-and-factories)
- [35.9 Cross-Cutting Test Suites](#359-cross-cutting-test-suites)
- [35.10 Phase Test Design (Phase 1–25)](#3510-phase-test-design-phase-125)
- [35.11 Traceability Matrix](#3511-traceability-matrix)
- [35.12 Implementation Status Summary](#3512-implementation-status-summary)
- [35.13 UNSPECIFIED and Escalation Register](#3513-unspecified-and-escalation-register)
- [References](#references)

---

## 35.1 Purpose and Scope

This document is the **test design specification** for Construction OS. It converts the testing
*strategy* defined in [30-testing-strategy](30-testing-strategy.md) into a concrete, per-phase
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

| Question | Answer |
| --- | --- |
| Which document defines the testing strategy? | [30-testing-strategy](30-testing-strategy.md) — authoritative |
| What does §35 add? | Test *design* only — the concrete cases that satisfy §30 |
| On conflict between §35 and §30? | **§30 wins.** The conflict is reported to the product owner and §35 is corrected |
| On conflict between §35 and a Phase command in `context/00_master_construction_os.md`? | The specs win over context files (`context.md` authority hierarchy). The divergence is recorded in §35.13 |
| May §35 introduce a new quality target, threshold, or gate? | **No.** Every threshold in this document is quoted from a spec section and cited |

**Rule of construction:** where a spec does not define the expected result of a behaviour, this
document writes `UNSPECIFIED — escalate` in the Expected result cell and records the item in
§35.13. Expected results are **never** inferred, estimated, or back-filled from implementation code.

---

## 35.3 Test Basis and Traceability Model

The **test basis** (the sources a test case may be derived from) is restricted to:

| Priority | Source | Use |
| --- | --- | --- |
| 1 | `docs/specifications/` §00–§34 | Authoritative for all behaviour, thresholds, and acceptance criteria |
| 2 | `context/00_master_construction_os.md` Phase 1–25 `Generate:` / `Constraints:` blocks | The per-phase obligation list that determines *which* tests must exist |
| 3 | `context.md` QUALITY MANDATES (QM-1 … QM-18) | Cross-cutting gates every phase inherits |

Nothing else is a valid test basis. In particular, **implementation source code is not a test
basis** — code is used only to establish *implementation status* (§35.12), never to derive an
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

| Segment | Values | Notes |
| --- | --- | --- |
| `TC` | literal | Test Case |
| `P{NN}` | `P01` … `P25` | Zero-padded Phase number per `00_master` Phase 1–25 |
| `{LEVEL}` | see table below | The test level the case executes at |
| `{NNN}` | `001` … | Sequential **within** the `(phase, level)` pair |

### LEVEL values

| LEVEL | Meaning | Primary spec source |
| --- | --- | --- |
| `UNIT` | Unit test — isolated logic, all I/O mocked | §30.3 |
| `INT` | Integration test — real dependencies via Testcontainers | §30.4 |
| `ISO` | Multi-tenant isolation test | §30.6 |
| `CONTRACT` | Consumer-driven contract test (Pact) | §30.8 |
| `E2E` | End-to-end user journey (Playwright / Detox) | §30.5, §30.7 |
| `LOAD` | Performance / load test (k6, Lighthouse CI) | §30.9 |
| `SEC` | Security test (SAST, DAST, secrets, throttling) | §30.10 |
| `AI` | AI output-quality evaluation | §30.11 |
| `MAN` | Manual or command-driven verification — no automated test file exists; the evidence is command output (Rule 36) | §30.12 gate execution; Phase 19 `[MANUAL]` checks |

### ID stability rules

- An ID is **immutable** once published in this document.
- A retired test case keeps its ID with status `RETIRED`; the number is **never** reused.
- Renumbering a phase does not renumber its test cases — §35.11 carries the mapping.

### Test case template

Every catalogue row uses exactly these columns:

| Column | Content |
| --- | --- |
| **ID** | `TC-PNN-LEVEL-NNN` |
| **Title** | One line, imperative, states the behaviour under test |
| **Level** | LEVEL value above |
| **Technique** | Test design technique (see §35.5) |
| **Pre-condition** | State that must hold before step 1; `—` if none |
| **Steps** | Numbered, executable actions |
| **Expected result** | Observable, falsifiable outcome — or `UNSPECIFIED — escalate` |
| **Spec ref** | The exact spec §section (and Phase `Generate:` item) the case derives from |
| **Status** | `IMPLEMENTED` (test file observed on disk — path given) · `PLANNED` (designed, no test file found) · `GAP` (verification performed; the deliverable under test is missing or non-conforming — recorded in §35.12) · `UNSPECIFIED` (blocked on §35.13) · `RETIRED` |

`IMPLEMENTED` may only be set when the test file has been observed on disk; the path is recorded
in §35.12. This is the per-item application of Rule 36.

---

## 35.5 Test Levels, Techniques and Tooling

### Level → tooling → gate

| Level | Scope (§30) | Tooling | CI gate (§30.12) | Blocks |
| --- | --- | --- | --- | --- |
| `UNIT` | Service logic, utils, DTO validation, event payload construction, Temporal activity functions (§30.3) | Jest 30.x + `@nestjs/testing`; pytest 9.x; Go `testing` + testify | Unit tests + coverage 100% lines / 100% branches | PR merge |
| `INT` | Service↔DB, Kafka produce/consume, Keycloak token validation, Kong routing, Debezium CDC (§30.4) | Jest + Supertest + Testcontainers | Integration tests | PR merge |
| `ISO` | 5 isolation layers: PostgreSQL, Neo4j, Kafka, S3, API (§30.6) | Jest + Testcontainers, `app_user` role | Multi-tenant isolation tests | PR merge |
| `CONTRACT` | All public API endpoints per §14.3 (§30.8) | Pact.io (consumer-driven) | API contract tests (Pact) | PR merge |
| `E2E` | 10 web + 3 mobile critical journeys (§30.5) | Playwright 1.x (web), Detox (React Native) | E2E tests | Production promotion |
| `LOAD` | 5 backend load profiles (§30.9) + frontend Core Web Vitals (§30.9 Lighthouse CI) | k6; Lighthouse CI | Load tests (weekly, alert only); Lighthouse CI (per `apps/web` PR) | Load: alert only · Lighthouse: PR merge |
| `SEC` | SAST, DAST, pentest, secrets scanning, throttling (§30.10) | SonarQube (⏸ deferred), OWASP ZAP, GitLeaks, Trivy, `pnpm audit` / `pip-audit` / `govulncheck` | Dependency audit; SAST (⏸ deferred); DAST (weekly) | Audit: PR merge |
| `AI` | Layer A + Layer B model output quality (§30.11) | Golden-example sets, Evidently AI, MLflow, Prophet | Not a PR gate — **monthly** evaluation cadence (§30.11) | Alert AI Lead on >10% regression |
| `MAN` | Phase 19 `[MANUAL]` readiness checks | `scripts/readiness/run-all-checks.sh` (interactive) | Stage 1→2 transition gate | Stage advance |

### Test design techniques used in the catalogues

| Technique | Applied to |
| --- | --- |
| State transition testing | Project status machine (Ph3), RFQ + PO state machines (Ph5), BOQ version lifecycle (Ph4), file status (Ph9) |
| Decision table testing | PO approval threshold chain (Ph5), task completion gates 1–9 (Ph6), notification routing + quiet hours (Ph20) |
| Equivalence partitioning + boundary value analysis | Financial rounding (Ph4, Ph7), file size / MIME limits (Ph9), rate limits (Ph16), offline data size limits (Ph10) |
| Negative / error-guessing | Invalid state transitions, cross-tenant access, malformed DTOs, expired tokens |
| Use case testing | E2E journeys (Ph18) |
| Idempotency / replay testing | Kafka consumer idempotency (Ph8), KG rebuild (Ph13), provisioning workflow (Ph25) |
| Conflict-scenario testing | Offline sync strategies (Ph6, Ph10) |
| Metric-threshold evaluation | Load (Ph14, Ph18), AI quality (Ph11, Ph12, Ph23) |

---

## 35.6 Entry and Exit Criteria per Level

Derived from the §30.12 gate table and QM-1. No target in this section is new.

| Level | Entry criteria | Exit criteria |
| --- | --- | --- |
| `UNIT` | Code compiles (`tsc --noEmit`); package has `jest.config.js` (Rule 32 — single source of truth) | 100% lines **and** 100% branches for the package (QM-1, §30.3); zero flaky tests (§30.1) |
| `INT` | Unit gate green; Testcontainers harness available (Docker); migrations apply on `timescale/timescaledb` image | All critical integration tests in §30.4 pass; suite exits without `forceExit` (ADR-034 / Rule 39) |
| `ISO` | Two tenant fixtures provisioned (`tenant_fixture_a`, `tenant_fixture_b`); `app_user` non-superuser connection available | All 5 isolation layers return the §30.6 pass criteria. **Any failure is a Critical Security Defect** and blocks merge |
| `CONTRACT` | Consumer Pact files published | Provider verifies **all** consumer contracts; a new API version cannot ship while any v1 consumer contract fails (§30.8) |
| `E2E` | Merge to `staging`; staging deployed via ArgoCD; seed data reset; smoke tests (PostSync wave 1) green | All 10 Playwright + 3 Detox scenarios pass (§30.5) |
| `LOAD` | Staging at production-mirroring scale (50% of production spec) | Each scenario meets its §30.9 pass criteria; p95 regression > 20% vs previous week alerts Engineering Lead |
| `SEC` | Build artefact / image available | No High/Critical dependency findings; no secrets detected; all High-severity DAST findings resolved before production release (§30.10) |
| `AI` | Golden/eval dataset available for the feature | Layer A: §30.11 thresholds met. Layer B: model-specific thresholds met — see §35.13 for models with no defined threshold |
| `MAN` | Automated Phase 19 checks all PASSED | Product owner sign-off recorded in `cos-audit/audit-<timestamp>.log` |

### Definition of Done (per §30.1)

Testing is part of the Definition of Done. No PR merges without the §30.12 gates passing. Flaky
tests are treated as build failures — they are fixed or quarantined with an owner, never retried.

---

## 35.7 Test Environments

| Environment | Purpose | Provisioning | Levels executed |
| --- | --- | --- | --- |
| Local | Developer inner loop | Docker Compose (PostgreSQL/TimescaleDB, Redis, Kafka, OpenSearch, Neo4j, ClickHouse, MinIO, Schema Registry, Vault dev, PgBouncer) | `UNIT`, `INT` |
| CI (ephemeral) | PR gates | GitHub Actions runner + Testcontainers per test run | `UNIT`, `INT`, `ISO`, `CONTRACT`, `SEC` |
| Staging | Pre-production verification | AWS EKS, mirrors production spec at 50% size; seed data reset per release; deployed by ArgoCD auto-sync | `E2E`, `LOAD`, DAST |
| Production | Continuous isolation assurance only | Kubernetes CronJob synthetic probe | `ISO` (probe subset — §30.6) |

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

| Config | Path | Purpose |
| --- | --- | --- |
| Backend unit | `backend/jest.config.js` | `coverageThreshold.global = { lines: 100, branches: 100 }`; `maxWorkers: 2` |
| Backend integration | `backend/jest.integration.config.js` | Testcontainers, `--runInBand` |
| Temporal workflows | `backend/jest.workflows.config.js` | `maxWorkers: 1` — serial; excluded from `test:cov` |
| Contract (Pact) | `jest.contract.config.js` (repo root) | `testMatch: tests/contract/**/*.spec.ts` |
| Web E2E | `tests/e2e/playwright.config.ts` | `testDir: ./specs`; `baseURL` from `BASE_URL` |
| Mobile E2E | `apps/mobile/e2e/jest.config.js` | Detox runners, `maxWorkers: 1`, `testTimeout: 120000` |
| Mobile unit | `apps/mobile/jest.config.ts` | Standalone workspace (excluded from root pnpm workspace) |
| Shared packages | `packages/@cos/{shared,database,financial,rbac,validation,logger,tracing,config,test-utils}/jest.config.js` | Rule 35 — every package with executable logic |
| Service | `services/file-service/jest.config.js` | See §35.13 ESC-05 — not executed by CI |
| Mutation | `backend/stryker.config.json`, `packages/@cos/financial/stryker.config.json`, `packages/@cos/rbac/stryker.config.json` | All three: `thresholds: { high: 90, low: 80, break: 70 }` (QM-1 requires ≥ 70). CI matrix in `.github/workflows/mutation-tests.yml` covers the three QM-1 categories: financial calculation (`@cos/financial`), permission checks (`@cos/rbac` + backend `shared/guards`), procurement approval flows (backend `procurement.service` + Temporal activities) |
| Frontend perf | `apps/web/.lighthouserc.json` | LCP ≤ 2500 ms, CLS ≤ 0.1, TBT ≤ 200 ms, script transfer ≤ 256000 bytes |

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

| Kind | Factories |
| --- | --- |
| Seed (5) | `buildTenant`, `buildUser`, `buildProject`, `buildDocument`, `buildInvoice` |
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

## 35.9 Cross-Cutting Test Suites

These suites span phases. To keep IDs consistent with §35.4, **each case is numbered under the
phase that owns its `Generate:` obligation**; this section defines the suite, its pass criteria,
and where its cases live.

### 35.9.1 Multi-tenant isolation (§30.6)

Cross-tenant data access is a **Critical Security Defect**. The suite runs as a dedicated PR gate
and cannot be waived.

| Isolation layer | Test | Pass criteria |
| --- | --- | --- |
| PostgreSQL (shared DB) | Query Tenant B data using Tenant A JWT | Zero rows returned |
| Neo4j | Graph traversal from Tenant A node into Tenant B subgraph | Zero results |
| Kafka | Consumer receives message from another tenant's topic | Message rejected; DLQ not populated with the cross-tenant message |
| S3 | Pre-signed URL for Tenant A used against a Tenant B file | 403 Forbidden |
| API | Tenant A `tenant_id` in JWT used against a Tenant B API resource | 403 Forbidden |

- Fixtures: `tenant_fixture_a`, `tenant_fixture_b`
- Case ownership: Phase 2 (tenant model), Phase 16 (enforcement) — see §35.10
- Production synthetic probe: Kubernetes CronJob `*/5 * * * *`, same 5 checks against the live
  production API; emits `tenant_isolation_check_result{check_name}` (`1` pass / `0` fail);
  `0` fires `TenantIsolationBreach` and pages the security lead immediately (§31.7).
  Location: `infrastructure/monitoring/isolation-probe/` — verified: `cronjob.yaml`,
  `configmap.yaml`, `rbac.yaml`, `isolation-probe.js`. Probe cases are owned by Phase 15.

### 35.9.2 Offline sync (§30.7)

| Scenario | Expected behaviour |
| --- | --- |
| Device offline, user submits task update | Record queued in local FIFO queue |
| Connectivity restored | Queue flushes in priority order: safety → attendance → inspections → tasks |
| Sync fails 5 times for a safety incident | Moved to tenant admin review queue; push alert sent to PM |
| Conflict: two users update same task offline | Max-wins — higher value wins (progress is monotonic) |
| Conflict: safety incident (human review) | Both versions preserved; presented to admin for manual resolution |
| Device local DB exceeds 500 MB | LRU eviction triggered; drawing cache cleared first |

Tooling: Jest with mocked db seams (`upsertByKey` / `deleteByKey`, Drizzle/expo-sqlite) for unit
level; Detox for device-level integration.

**Detox conventions that constrain every mobile E2E case:**

- Detox has **no** connectivity API. `device.setStatusBar(...)` is cosmetic (no `network` key), and
  the `@react-native-community/netinfo` Jest mock does not apply to Detox (Detox runs the real
  binary). Offline is simulated by an app-level hook gated by `EXPO_PUBLIC_E2E=1`, driven from
  Detox via the deep link `cos://e2e/network?online=0|1` so connectivity toggles mid-test without
  relaunch.
- There is **no** synchronous boolean `element(...).isVisible()`. Use
  `await waitFor(element).toBeVisible().withTimeout(ms)`; wrap in try/catch for conditional
  branches.

Case ownership: Phase 6 (server-side conflict strategies), Phase 10 (client sync engine).

### 35.9.3 API contract (§30.8)

- Consumers: Next.js web app and React Native mobile app. Provider: the NestJS backend.
- Each consumer declares expected request/response shapes in Pact files; the provider verifies all
  consumer contracts in CI.
- **Versioning gate:** `/api/v2/` cannot be released while any v1 consumer contract fails. A
  breaking change (field removed or renamed) triggers a new major version per §14.4.
- Suite location (verified): `tests/contract/` — `finance-procurement.pact.spec.ts`,
  `analytics-all-services.pact.spec.ts`, `mobile-backend.pact.spec.ts`.
- Case ownership: Phase 18.

### 35.9.4 Performance and load (§30.9)

Backend load profiles per §30.9:

| Scenario | Load profile | Pass criteria |
| --- | --- | --- |
| Daily site report bulk submit | 100 concurrent Site Engineers submitting simultaneously at 07:00 | p95 < 500 ms |
| Executive dashboard load | 50 concurrent Executive users loading dashboard | p95 < 1 s; ClickHouse query < 200 ms |
| Procurement PO approval | 20 concurrent Finance + PM approvals | p95 < 300 ms |
| Kafka consumer throughput | 10,000 events/second sustained | Consumer lag < 5 s |
| Mobile sync burst | 500 devices syncing simultaneously on connectivity restore | Zero data loss; sync < 30 s per device |

> **Divergence recorded — see §35.13 ESC-06.** `00_master` Phase 18 defines a *different* set of
> four k6 scenarios (dashboard SLA, concurrent file uploads, API gateway throughput, AI report
> generation) from the five above. Two k6 script sets exist on disk: `tests/load/`
> (`dashboard-sla.js`, `file-upload.js`, `api-baseline.js`, `ai-report.js` — the Phase 18 set) and
> `scripts/loadtest/` (`analytics-sla.js`, `file-upload.js`, `mixed-api.js`, `api-baseline.js` —
> the QM-6 / Phase 19 readiness set). This document does **not** merge the two lists; the
> reconciliation is a product-owner decision.

Schedule: weekly on staging, not per-PR. A p95 increase > 20% vs the previous week alerts the
Engineering Lead. Load tests are advisory and do not block merge.

Frontend (Lighthouse CI, §30.9): runs on every `apps/web` PR under a throttled **mobile** profile.
Gate blocks merge on LCP > 2.5 s, CLS > 0.1, TBT > 200 ms (lab proxy for the INP ≤ 200 ms RUM SLO),
or script transfer size > 250 KB per audited route. Budgets verified in
`apps/web/.lighthouserc.json`; workflow `.github/workflows/lighthouse.yml`.

Case ownership: Phase 14 (dashboard SLA), Phase 18 (k6 suite + Lighthouse gate), Phase 19
(one-time production-readiness load gate).

### 35.9.5 Security (§30.10)

| Category | Tool | Cadence | Blocking |
| --- | --- | --- | --- |
| SAST | **CodeQL** (`github/codeql-action`) — JS/TS, Python, Go | Every PR | Yes — blocks on High or above (ADR-054, replaced SonarQube 2026-08-22). Trivy + `pnpm audit` + `pip-audit` + `govulncheck` + GitLeaks retained alongside |
| SAST (lint) | ESLint security plugin (SQL injection, XSS patterns) | Every PR | Yes |
| Dependency | `pnpm audit`, `pip-audit`, `govulncheck` | Every PR | Yes — High/Critical |
| Container | Trivy | Image build | Yes — CRITICAL |
| DAST | OWASP ZAP | Weekly on staging | Alert only; all High findings must be resolved before production release |
| Secrets | GitLeaks (pre-commit + CI) | Every commit | Yes |
| Penetration test | Third party, annual, against staging | Annual | Required before Stage 1→2 and Stage 2→3 |

**ThrottlerGuard unit suite (§30.10)** — mandatory, mocks `ThrottlerStorageRedisService` (no real
Redis in unit tests):

| Case | Assertion |
| --- | --- |
| Request within limit | Returns 200; does not throw |
| 101st request within 60 s | Throws `ThrottlerException`; HTTP 429 |
| Auth endpoint, 11th within 60 s | Throws `ThrottlerException`; `@Throttle` override applied |
| File upload endpoint, 21st within 60 s | Throws `ThrottlerException`; `@Throttle` override applied |
| `Retry-After` on 429 | Header equals seconds until reset window |
| Counter resets after TTL | Next request after TTL returns 200 |
| Redis storage used | `ThrottlerStorageRedisService` is injected and called |

Case ownership: Phase 16.

### 35.9.6 AI quality (§30.11)

**Layer A (MVP) — Assistive AI:**

| Feature | Test method | Pass criteria |
| --- | --- | --- |
| Daily report generation | Compare against 50 golden examples (Thai + English) | ROUGE-L ≥ 0.7; no hallucinated BOQ items |
| OCR accuracy | 100 construction drawing samples | Character error rate < 5% |
| Voice transcription | 50 Thai construction site recordings | Word error rate < 10% |
| RAG retrieval | 50 known questions, verify top-3 retrieved chunks | Recall@3 ≥ 0.8 |

**Layer B (Post-MVP) — Analytical AI.** Methodology per §30.11: 70/30 train/held-out split from
production project history; walk-forward time-series validation (never use future data to predict
the past); Monte Carlo simulation with 1,000 iterations for delay-forecast uncertainty; drift
detection via Evidently AI alerting when PSI > 0.2; **monthly** evaluation cadence; retraining
triggered when accuracy drops > 10% month-over-month or a drift alert fires. Tooling: Prophet,
Evidently AI, MLflow.

| Model (Phase 23) | Primary metric | Secondary metric | Pass threshold | Source |
| --- | --- | --- | --- | --- |
| `DelayForecastModel` | RMSE (days) | MAE (days) | RMSE ≤ 5 days | §30.11 |
| `RiskClassifier` | F1-score | AUC-ROC | F1 ≥ 0.80 | §30.11 |
| `SafetyVisionModel` | Precision | Recall | Precision ≥ 0.85 | §30.11 (resolved 2026-08-22, ESC-02) |
| `GraphMLModel` | F1-score | AUC-ROC | F1 ≥ 0.80 | §30.11 (resolved 2026-08-22, ESC-02) |

> `CostAnomalyModel` carries a threshold in §30.11 (Precision ≥ 0.85) but is **not** one of the
> four Phase 23 models defined in `00_master` Phase 23 or §22.6. Recorded as an orphan in §35.13
> ESC-03; no test case is designed against it.

Regression rule (§30.11): any metric dropping > 10% versus the previous month alerts the AI Lead.

Case ownership: Phase 11 (RAG retrieval), Phase 12 (report generation, hallucination guard),
Phase 23 (Layer B models).

---

## 35.10 Phase Test Design (Phase 1–25)

Each phase section derives its cases **only** from that phase's `Generate:` / `Constraints:` block in
`context/00_master_construction_os.md` plus the spec sections that block cites. Where a `Generate:`
item names a test explicitly ("Unit tests: …", "Integration tests: …"), that item is the obligation
and the cases below decompose it.

### 35.10.1 Phase 1 — Foundation Repository

**Objective:** stand up the monorepo, toolchain, and CI foundation.

**Spec references:** `00_master` §Phase 1 (Generate, Constraints); §32.2 (deployable units);
QM-1 (coverage), QM-11 (README standard), QM-18 (PgBouncer); Rules 26, 27, 28, 31, 32, 35;
ADR-033 (CI build gate), ADR-036 (Compose `apps` profile).

**Scope in:** repository structure, workspace/build tooling, local infrastructure, CI pipeline,
git hooks, per-package Jest configuration.
**Scope out:** any domain behaviour (owned by Phase 2+); Istio (not used locally by design).

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P01-MAN-001` | Every service, app, package and backend module has a conforming README | MAN | Clean checkout | 1. List `services/*/README.md`, `apps/*/README.md`, `packages/@cos/*/README.md`, `backend/src/modules/*/README.md`; 2. For each, confirm it contains purpose, public API, dependencies, configuration, usage example | Every directory has a README containing all five required headings | Ph1 Generate item 1; QM-11 | `IMPLEMENTED` — all 21 backend modules now carry a conforming README (11 added 2026-08-22) |
| `TC-P01-MAN-002` | `pnpm-workspace.yaml` lists every workspace package | MAN | — | 1. Read `pnpm-workspace.yaml`; 2. Compare against directories under `packages/@cos/`, `services/`, `apps/`, `backend/` | Every workspace package is listed; documented exclusions (e.g. `!apps/mobile`) carry an inline rationale | Ph1 Generate item 2 | `IMPLEMENTED` — `pnpm-workspace.yaml` |
| `TC-P01-MAN-003` | `turbo.json` defines build, test, lint and dev pipelines | MAN | — | 1. Read `turbo.json`; 2. Assert tasks `build`, `test`, `lint`, `dev` exist | All four pipelines are present | Ph1 Generate item 3; Rule 27 | `IMPLEMENTED` — `turbo.json` |
| `TC-P01-MAN-004` | Every `package.json` script has a matching `turbo.json` task | MAN | — | 1. Enumerate scripts across all `package.json` files; 2. Assert each build/test/lint/dev-family script maps to a `turbo.json` task | No orphan script; otherwise an inline comment explains the exemption | Rule 27 | `PLANNED` — no automated check found |
| `TC-P01-MAN-005` | `tsconfig.base.json` is strict and declares `@cos/*` path aliases | MAN | — | 1. Read `tsconfig.base.json`; 2. Assert `strict: true` and `paths` entries for every `@cos/*` package | Strict mode on; all aliases resolve to source | Ph1 Generate items 4–5 | `IMPLEMENTED` — `tsconfig.base.json` |
| `TC-P01-MAN-006` | `apps/mobile` extends `expo/tsconfig.base`, not the root base | MAN | — | 1. Read `apps/mobile/tsconfig.json`; 2. Assert it extends `expo/tsconfig.base`; 3. Assert `paths` contain only mobile-safe aliases (types, financial, validation, rbac, shared) | Root base (`module: CommonJS`) is not extended; no `logger`/`tracing`/`config`/`database` alias present | Ph1 Generate "Mobile tsconfig exception"; Rules 33–34 | `PLANNED` — assertion not automated |
| `TC-P01-MAN-007` | Local Docker Compose starts the full required infrastructure set | MAN | Docker available | 1. Read `docker-compose.yml`; 2. Assert services: PostgreSQL/TimescaleDB, PgBouncer, Redis, Kafka, Schema Registry, OpenSearch, Neo4j, ClickHouse, MinIO, Vault (dev mode); 3. `docker compose up` | All listed services start and become healthy | Ph1 Generate item 6 | `IMPLEMENTED` — `docker-compose.yml` (postgres, pgbouncer, redis, kafka, schema-registry, opensearch, neo4j, clickhouse, minio, vault) |
| `TC-P01-INT-001` | Application connects through PgBouncer, never to PostgreSQL `5432` | INT | Compose stack up | 1. Resolve the effective `DATABASE_URL` used by the app; 2. Assert host/port is the PgBouncer service, not the database host on `5432` | Connection string resolves to PgBouncer | QM-18; Ph1 Generate item 6 | `IMPLEMENTED` — `tests/architecture/connectivity.spec.ts` asserts every runtime `DATABASE_URL`/`APP_DATABASE_URL` in `.env.example` and `docker-compose.yml` resolves through PgBouncer, and that `DIRECT_DATABASE_URL` deliberately does not (migrations cannot run through a transaction-mode pooler) — QM-18, §35.13 ESC-28 |
| `TC-P01-MAN-008` | Compose `apps` profile runs the application tier in containers | MAN | Docker available | 1. `docker compose --profile full --profile apps up` (or `make docker-apps-up-full`); 2. Assert backend, file-service, AI services and Go workers start | All application services run in containers; the infra-only default is unchanged | Ph1 Generate item 7; ADR-036 | `IMPLEMENTED` — `Makefile` target `docker-apps-up-full` |
| `TC-P01-MAN-009` | `.env.example` documents every required variable | MAN | — | 1. Read `.env.example`; 2. Cross-check against variables read by `@cos/config` and each service | No required variable is undocumented | Ph1 Generate item 10 | `IMPLEMENTED` — `.env.example` |
| `TC-P01-MAN-010` | CI pipeline runs lint → type-check → build → test → docker build | MAN | — | 1. Read `.github/workflows/ci.yml`; 2. Assert jobs for lint (incl. yamllint, sqlfluff, markdownlint), type-check, build, unit tests, docker build | All stages present and wired in dependency order | Ph1 Generate item 11; §30.12; ADR-033 | `IMPLEMENTED` — `.github/workflows/ci.yml` (`lint`, `type-check`, `build`, `unit-tests`, `build-docker`) |
| `TC-P01-MAN-011` | `Makefile` exposes setup, dev, test, build, migrate, seed | MAN | — | 1. Read `Makefile`; 2. Assert the six targets exist | All six targets present | Ph1 Generate item 12 | `IMPLEMENTED` — `Makefile` (`setup`, `dev`, `test`, `build`, `migrate`, `seed`) |
| `TC-P01-MAN-012` | Husky pre-commit hook runs lint-staged | MAN | — | 1. Assert `.husky/pre-commit` exists and invokes `lint-staged`; 2. Assert `lint-staged` config applies `eslint --fix` + `prettier --write` to `.ts/.tsx/.js/.jsx` and `prettier --write` to `.json/.yaml/.yml` | Hook file exists and is wired (declaring Husky in `package.json` alone is non-conforming) | Ph1 Generate item 14; Rule 31(b) | `IMPLEMENTED` — `.husky/pre-commit`; `lint-staged` block in root `package.json` |
| `TC-P01-UNIT-001` | Every package with executable logic enforces 100%/100% coverage | UNIT | — | 1. For each package in the Rule 35 list, read `jest.config.js`; 2. Assert `coverageThreshold.global = { lines: 100, branches: 100 }`; 3. Assert `test:cov` script exists | Threshold present in every listed package; `@cos/types` exempt (types only) | QM-1; Ph1 Generate item 16; Rule 35 | `IMPLEMENTED` — verified in `backend/jest.config.js`; configs present for all 9 `@cos` packages + `services/file-service` |
| `TC-P01-UNIT-002` | Jest coverage excludes non-executable files | UNIT | — | 1. Read each `jest.config.js`; 2. Assert `collectCoverageFrom` excludes `*.module.ts`, `*.dto.ts`, `*.payload.ts`, `index.ts`, `main.ts` and event interface files | Only executable sources are measured | Ph1 Generate item 16 | `IMPLEMENTED` — `backend/jest.config.js` |
| `TC-P01-UNIT-003` | `@cos/*` aliases map to source, not `dist` | UNIT | — | 1. Read `moduleNameMapper` in each `jest.config.js`; 2. Assert every `@cos/*` entry targets the package `src` | No mapping resolves to a build output | Ph1 Generate item 16 | `IMPLEMENTED` — `backend/jest.config.js` |
| `TC-P01-MAN-013` | No package defines Jest config in two places | MAN | — | 1. For every package, assert **at most one** of `jest.config.js` or a `"jest"` key in `package.json` | Never both | Rule 32 | `PLANNED` — assertion not automated |
| `TC-P01-MAN-014` | `pnpm-lock.yaml` is committed and CI installs with `--frozen-lockfile` | MAN | — | 1. Assert `pnpm-lock.yaml` is tracked in git; 2. Assert every CI install step passes `--frozen-lockfile` | Lockfile present; all installs frozen | Ph1 Generate item 17; Rule 28 | `IMPLEMENTED` — `pnpm-lock.yaml`; `--frozen-lockfile` in `.github/workflows/ci.yml` |
| `TC-P01-MAN-015` | `turbo run build` is green for every service on every PR | MAN | CI run available | 1. Trigger CI; 2. Assert the `build` job succeeds for all packages/services | Build gate green — `tsc --noEmit` alone does not satisfy this | ADR-033; Ph1 Exit | `IMPLEMENTED` — `build` job in `.github/workflows/ci.yml` |

**Phase 1 exit gate:** `turbo run build` green on every service in CI; Jest 100/100 coverage config
present; Docker Compose and CI pipeline present (`00_master` Phase Register — Phase 1 Exit).

---

### 35.10.2 Phase 2 — Authentication + Tenant System

**Objective:** multi-tenant authentication and the tenant-isolation foundation.

**Spec references:** `00_master` §Phase 2 (Generate, Constraints); §05 §5.4 (auth paths), §5.4.2
(protocol mappers); §06 §6.2 (roles), §6.9 (guard placement); §07 §7.6 (realm model), §7.7 (RLS);
§14.3 (user management APIs); §32.8 (Keycloak Admin API); ADR-008, ADR-030, ADR-031, ADR-035, ADR-040.

**Scope in:** OTP (Path A), Keycloak OIDC (Path B), token issuance/refresh/logout, MFA (TOTP),
RBAC/ABAC guards, tenant CRUD + realm assignment, user management, RLS foundation, audit log schema.
**Scope out:** SSO/SAML per-tenant realm configuration (Phase 25); vendor-portal principals (Phase 5).

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P02-UNIT-001` | OTP is 6 numeric digits with a 5-minute TTL | UNIT | OTP service with mocked Redis | 1. Request an OTP for a phone number; 2. Inspect the generated value and stored TTL | Value matches `^\d{6}$`; TTL = 300 s | Ph2 SMS OTP Service | `IMPLEMENTED` — `backend/src/modules/identity/__tests__/otp.service.spec.ts` |
| `TC-P02-UNIT-002` | OTP verification fails after 3 attempts in one session | UNIT | OTP issued | 1. Submit an incorrect code three times; 2. Submit the correct code | 4th attempt is rejected; the session is invalidated | Ph2 SMS OTP Service | `IMPLEMENTED` — `otp.service.spec.ts` |
| `TC-P02-UNIT-003` | OTP requests are capped at 10 per phone per day | UNIT | Rate window mocked | 1. Request 10 OTPs for one phone; 2. Request an 11th | 11th request is rejected | Ph2 SMS OTP Service | `IMPLEMENTED` — `otp.service.spec.ts` |
| `TC-P02-UNIT-004` | Token issuance uses Keycloak Direct Grant after OTP verification | UNIT | Keycloak admin client mocked | 1. Verify a valid OTP; 2. Inspect the token-issuance call | `grant_type=password` Direct Grant is called with an ephemeral credential that is discarded after single use; no custom JWT is minted | Ph2 Path A; ADR-040 | `IMPLEMENTED` — `otp.service.spec.ts`, `keycloak-admin.service.spec.ts` |
| `TC-P02-UNIT-005` | JWT strategy rejects a token without `tenant_id` | UNIT | Strategy under test | 1. Validate a payload lacking `tenant_id` | Request is rejected (401/403); no tenant context is published | §30.3 key invariants; §5.4.2 | `IMPLEMENTED` — `keycloak-jwt.strategy.spec.ts` |
| `TC-P02-UNIT-006` | JWT strategy reads the realm from `KEYCLOAK_REALM` | UNIT | Env configured | 1. Set `KEYCLOAK_REALM=construction-os`; 2. Validate a token | The configured realm is used; the realm is never hardcoded | Ph2 Keycloak Realm Model | `IMPLEMENTED` — `keycloak-jwt.strategy.spec.ts` |
| `TC-P02-UNIT-007` | `JwtAuthGuard` publishes tenant/user context into CLS | UNIT | Guard under test | 1. Invoke `canActivate` with a valid payload; 2. Read CLS | `tenantId`, `userId`, `userRole` are present in CLS (`req.user` does not survive the Fastify request clone) | ADR-031 | `IMPLEMENTED` — `backend/src/modules/identity/guards/__tests__/jwt-auth.guard.spec.ts` |
| `TC-P02-UNIT-008` | Request-scoped services fall back to CLS for `userId`/`tenantId` | UNIT | Service constructed with an empty `REQUEST` | 1. Invoke the lazy `tenantId` getter on an empty-request instance; 2. Invoke it inside a CLS context | Empty instance returns `''`; inside CLS the value resolves. Constructing the service alone does not exercise the fallback | QM-1 note; ADR-031 | `IMPLEMENTED` — `tenant-prisma.service.spec.ts` |
| `TC-P02-UNIT-009` | `TenantPrismaService` validates tenant context lazily in `run()` | UNIT | Singleton service | 1. Construct the service outside a CLS context; 2. Call `run()` without tenant context | Construction succeeds; `run()` throws — validation is lazy, not in the constructor | ADR-031 Update 2026-06-26 | `IMPLEMENTED` — `tenant-prisma.service.spec.ts` |
| `TC-P02-UNIT-010` | `RolesGuard` enforces the 9 spec roles plus implementation sub-roles | UNIT | Guard + `@cos/rbac` metadata | 1. Invoke with each role against a `@Roles`-decorated handler | Only listed roles pass; unknown roles are rejected | §6.2; Ph2 RBAC | `IMPLEMENTED` — `packages/@cos/rbac` suite + `backend/src/shared/guards` |
| `TC-P02-UNIT-011` | `PolicyGuard` enforces the three ABAC attributes | UNIT | Guard under test | 1. Request a resource without project membership; 2. Request with a mismatched tenant; 3. PATCH a resource the caller neither created nor manages | Each case is denied (403) with the required attribute reported | Ph2 Authorization (ABAC) | `IMPLEMENTED` — `backend/src/shared/guards` |
| `TC-P02-UNIT-012` | MFA is required for `TENANT_ADMIN` and `FINANCE` | UNIT | MFA service | 1. Complete Path B login as each role without TOTP | Login is not completed until TOTP verification succeeds | Ph2 Path B MFA | `IMPLEMENTED` — `mfa.service.spec.ts` |
| `TC-P02-UNIT-013` | TOTP secret is encrypted at rest | UNIT | MFA enrolment | 1. Enrol TOTP; 2. Read the persisted `mfa_totp_secret` | Value is AES-256-GCM ciphertext, never plaintext | Ph2 `users` entity; ADR-035 | `IMPLEMENTED` — `mfa.service.spec.ts` |
| `TC-P02-UNIT-014` | Tenant creation assigns the correct Keycloak realm per plan | UNIT | Tenant service | 1. Create a `STARTER` tenant; 2. Create a `PROFESSIONAL` tenant; 3. Create an `ENTERPRISE` tenant | STARTER/PROFESSIONAL → shared realm `construction-os`; ENTERPRISE → `cos-{tenantCode}` | Ph2 Realm model; §7.6 | `IMPLEMENTED` — `tenant.service.spec.ts` |
| `TC-P02-UNIT-015` | Path A user creation provisions Keycloak first, then COS records | UNIT | Keycloak admin mocked | 1. `POST /api/v1/users` with a phone number | `provisionPhoneUser` is called; `platform.users` is written with the returned `keycloak_user_id`; `tenant_memberships` row created; `identity.user.created.v1` emitted | Ph2 Path A; §32.8 | `IMPLEMENTED` — `user.service.spec.ts`, `keycloak-admin.service.spec.ts` |
| `TC-P02-UNIT-016` | Role change emits `identity.user.role_changed.v1` | UNIT | Existing user | 1. `PATCH /api/v1/users/:userId/role` | Event emitted with `old_role` and `new_role` | Ph2 Kafka events | `IMPLEMENTED` — `user.service.spec.ts` |
| `TC-P02-UNIT-017` | User management endpoints are `TENANT_ADMIN`-only | UNIT | Controller under test | 1. Call each user endpoint as every other role | All non-`TENANT_ADMIN` callers receive 403 | Ph2 User management API | `IMPLEMENTED` — `user.controller.spec.ts` |
| `TC-P02-INT-001` | Full OTP authentication flow against real containers | INT | PostgreSQL + Redis Testcontainers | 1. `requestOtp`; 2. `verifyOtp`; 3. issue tokens via Keycloak Direct Grant; 4. `refresh`; 5. `logout` | Each step succeeds; the refresh token rotates; the logged-out token is rejected | Ph2 Generate "Integration tests" (Phase 2, not deferred) | `IMPLEMENTED` — `backend/test/auth.integration.spec.ts` |
| `TC-P02-INT-002` | Refresh token rotation invalidates the previous token | INT | Authenticated session | 1. Refresh; 2. Replay the old refresh token | Replay is rejected | Ph2 Generate "Refresh token rotation flow" | `IMPLEMENTED` — `auth.integration.spec.ts` |
| `TC-P02-ISO-001` | Cross-tenant read returns zero rows under RLS | ISO | Two tenant fixtures; `app_user` connection | 1. Set `app.current_tenant_id` to Tenant A; 2. Query rows owned by Tenant B | Zero rows | §30.6 PostgreSQL row; §7.7 | `IMPLEMENTED` — `backend/test/tenant-isolation.integration.spec.ts` |
| `TC-P02-ISO-002` | `app_user` cannot bypass RLS | ISO | `app_user` role | 1. Confirm `app_user` lacks `BYPASSRLS`; 2. Query without setting the GUC | No rows are returned; the role has no bypass attribute | §9.7.3; ADR-031 | `IMPLEMENTED` — `tenant-isolation.integration.spec.ts` |
| `TC-P02-ISO-003` | Every domain table has exactly one permissive `rls_tenant_isolation` policy | ISO | Migrated database | 1. Query `pg_policies` for every domain table | Exactly one policy per table, `PERMISSIVE`, `FOR ALL`, `TO app_user`, with the `NULLIF(current_setting(...))` predicate; `ENABLE` and `FORCE` both set | Ph2 Tenant Isolation Model; ADR-031 | `IMPLEMENTED` — `tenant-isolation.integration.spec.ts` |
| `TC-P02-MAN-001` | Keycloak realm import template declares the required protocol mappers | MAN | — | 1. Read the realm import template; 2. Assert mappers for `tenant_id`, `user_id`, `role` | All three mappers present | Ph2 Generate item 1; §5.4.2, §7.6 step 3 | `PLANNED` — assertion not automated |
| `TC-P02-MAN-002` | Two OpenAPI files exist, one per service | MAN | — | 1. Assert `docs/api/auth.openapi.yaml` and `docs/api/tenant.openapi.yaml` exist and are valid OpenAPI 3.1 | Both files present and valid; not one combined file | Ph2 Generate; QM-2 | `IMPLEMENTED` — verified in §35.12 |

**Phase 2 exit gate:** RLS enabled on tenant tables; an isolation test proves no cross-tenant read;
JWT/Keycloak authentication verified (`00_master` Phase Register — Phase 2 Exit).

---

### 35.10.3 Phase 3 — Project Service

**Objective:** the project domain service.

**Spec references:** `00_master` §Phase 3 (state machine, entities, APIs, Generate, Constraints);
§10 §10.2 / §11 §11.2 (spatial hierarchy, assets/units); §20.5 (TH-specific tagging).

**Scope in:** project CRUD, status state machine, members, documents, spatial hierarchy
(buildings/floors/rooms/structures/units), assets, project events, OpenSearch indexing.
**Scope out:** tasks (Phase 6); BOQ (Phase 4); CRM/BIM adapters (stubs only).

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P03-UNIT-001` | `DRAFT → ACTIVE` requires `PROJECT_MANAGER` or `TENANT_ADMIN` | UNIT | Project in `DRAFT` | 1. Transition as each role | Only the two listed roles succeed; all others 403 | Ph3 transition rules | `IMPLEMENTED` — `backend/src/modules/project/__tests__/project.state-machine.spec.ts` |
| `TC-P03-UNIT-002` | `ACTIVE → ON_HOLD` records reason and timestamp | UNIT | Project `ACTIVE` | 1. Transition with `reason`; 2. Read the record | `on_hold_reason` (≤ 500 chars) and `on_hold_at` are persisted | Ph3 transition rules | `IMPLEMENTED` — `project.state-machine.spec.ts` |
| `TC-P03-UNIT-003` | `ON_HOLD → ACTIVE` resumes the project | UNIT | Project `ON_HOLD` | 1. Transition as `PROJECT_MANAGER` | Status returns to `ACTIVE` | Ph3 state machine | `IMPLEMENTED` — `project.state-machine.spec.ts` |
| `TC-P03-UNIT-004` | `ACTIVE → COMPLETED` is `TENANT_ADMIN`-only and requires `end_date ≤ today` | UNIT | Project `ACTIVE` | 1. Transition as `PROJECT_MANAGER`; 2. Transition as `TENANT_ADMIN` with a future `end_date`; 3. Transition as `TENANT_ADMIN` with a past `end_date` | 1 → 403; 2 → rejected; 3 → succeeds | Ph3 transition rules | `IMPLEMENTED` — `project.state-machine.spec.ts` |
| `TC-P03-UNIT-005` | `ANY → CANCELLED` is `TENANT_ADMIN`-only and terminal | UNIT | Project in `DRAFT`, `ACTIVE`, `ON_HOLD` | 1. Cancel from each state with a reason; 2. Attempt any transition out of `CANCELLED` | Cancellation succeeds from all three states and records `cancellation_reason` + `cancelled_at`; every subsequent transition is rejected | Ph3 transition rules | `IMPLEMENTED` — `project.state-machine.spec.ts` |
| `TC-P03-UNIT-006` | Undefined transitions are rejected | UNIT | Project in each state | 1. Attempt `COMPLETED → ACTIVE`; 2. Attempt `DRAFT → COMPLETED` | Both rejected — no state or transition beyond the specified machine exists | Ph3 "Do NOT invent additional states"; Rule 8 | `IMPLEMENTED` — `project.state-machine.spec.ts` |
| `TC-P03-UNIT-007` | `project_code` is unique per tenant | UNIT | Existing project | 1. Create a second project with the same `project_code` in the same tenant; 2. Create the same code in another tenant | 1 → 409 conflict; 2 → succeeds | Ph3 `projects` UNIQUE `(tenant_id, project_code)` | `IMPLEMENTED` — `project.repository.spec.ts` |
| `TC-P03-UNIT-008` | Status transitions emit `project.status_changed` | UNIT | Project `DRAFT` | 1. Transition to `ACTIVE`; 2. Inspect the emitted event | Envelope + `{ project_id, from_status, to_status, reason }` | Ph3 Kafka producers | `IMPLEMENTED` — `project.service.spec.ts` |
| `TC-P03-UNIT-009` | Project creation emits `project.created` with the full payload | UNIT | — | 1. Create a project; 2. Inspect the event | Payload matches the Event Contract (`project_id`, `project_code`, `project_name`, `project_type`, `budget{amount,currency_code}`, `start_date`, `end_date`, `created_by`) | Cross-Service Event Contract #1 | `IMPLEMENTED` — `project.service.spec.ts` |
| `TC-P03-UNIT-010` | Spatial CRUD enforces role separation | UNIT | Project exists | 1. Read buildings/floors/rooms/structures/units as any tenant user; 2. Write as a non-PM/non-admin role | Reads succeed for any tenant user; writes require `PROJECT_MANAGER` or `TENANT_ADMIN` | Ph3 Spatial hierarchy RBAC | `IMPLEMENTED` — `buildings/`, `floors/`, `rooms/`, `structures/`, `units/` `__tests__` |
| `TC-P03-UNIT-011` | Spatial and asset endpoints emit no Kafka events | UNIT | — | 1. Create a building, floor, room, structure, unit and asset; 2. Inspect the producer | No event is emitted — this is backing/reference data | Ph3 "no Kafka events — backing/reference data" | `IMPLEMENTED` — spatial `__tests__` suites |
| `TC-P03-UNIT-012` | A unit derives `project_id` from its parent building | UNIT | Building exists | 1. Create a unit under the building without supplying `project_id` | `project_id` is populated from the parent building | Ph3 `units` entity | `IMPLEMENTED` — `units/__tests__/units.service.spec.ts` |
| `TC-P03-INT-001` | Full project CRUD and transition flow | INT | Testcontainers stack | 1. Create → list → get → patch → transition → add member → list members → list documents | Every step returns the documented status code and persists correctly | Ph3 Generate "Integration tests" | `IMPLEMENTED` — `backend/test/project.integration.spec.ts` |
| `TC-P03-INT-002` | Spatial hierarchy nested create/list and flat get/update/delete | INT | Project exists | 1. Create building → floor → room → structure → unit; 2. Fetch, update and delete each by its own id | Nested routes create under the parent; flat routes operate by own id | Ph3 Spatial APIs | `IMPLEMENTED` — `backend/test/project-spatial.integration.spec.ts` |
| `TC-P03-INT-003` | Project list is paginated with a cursor | INT | > 1 page of projects | 1. List with a page size; 2. Follow the cursor | Cursor-based pagination returns each record exactly once | Ph3 Generate "Pagination utility" | `IMPLEMENTED` — `project.integration.spec.ts` |
| `TC-P03-INT-004` | Full-text search over `project_name` and `project_code` | INT | OpenSearch available | 1. Index projects; 2. Search by a partial name and by code | Matching projects are returned | Ph3 Generate "Full-text search via OpenSearch" | `IMPLEMENTED` — `backend/test/search.integration.spec.ts` runs a real OpenSearch container, calls `jest.unmock`, and indexes through `ProjectService`’s own path so the query has to match the document the service actually wrote. Covers partial name, code, case-insensitivity, cross-tenant exclusion, the empty-hit early return and the DB fallback when search is down (§35.13 ESC-31). Finding ESC-32 was a direct consequence |
| `TC-P03-ISO-001` | Project APIs reject cross-tenant access | ISO | Two tenant fixtures | 1. Request Tenant B's project with Tenant A's JWT | 403 Forbidden | §30.6 API row | `IMPLEMENTED` — `tenant-isolation.integration.spec.ts` |
| `TC-P03-MAN-001` | `docs/i18n/localization-gaps.md` exists and TH-specific logic is tagged | MAN | — | 1. Assert the file exists; 2. `grep -r "i18n: TH-SPECIFIC" backend/src` and confirm each hit is documented in the file | File present; every tagged rule is listed | Ph3 Constraints; §20.5; QM-3 | `PLANNED` — cross-check not automated |

**Phase 3 exit gate:** project APIs pass the isolation-test suite; RLS enforced
(`00_master` Phase Register — Phase 3 Exit).

---

### 35.10.4 Phase 4 — BOQ Service

**Objective:** the Bill-of-Quantities engine.

**Spec references:** `00_master` §Phase 4 (entities, calculation rules, versioning rules, APIs,
Generate); §FINANCIAL PRECISION SPEC (§32.5); QM-1 (mutation testing for financial logic).

**Scope in:** BOQ versions/categories/items, decimal calculations, versioning and immutability,
export, BOQ events, carbon capture columns.
**Scope out:** carbon analytics (Phase 24 `CarbonCalculationEngine`); BIM import (stub).

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P04-UNIT-001` | `estimated_total = ROUND(quantity × unit_cost, 4)` using HALF_UP | UNIT | Item inputs | 1. Compute with values whose 5th decimal is exactly 5; 2. Compare against the expected HALF_UP result | Result rounds half away from zero to 4 dp | Ph4 Calculation Rules; §32.5 | `IMPLEMENTED` — `backend/src/modules/boq/__tests__/boq.service.spec.ts`; `packages/@cos/financial` |
| `TC-P04-UNIT-002` | Float arithmetic is never used for money | UNIT | — | 1. Compute `0.1 + 0.2` through the calculation service | Result is exactly `0.3` (decimal.js), not `0.30000000000000004` | Ph4 Generate "Unit tests: calculation accuracy"; Rule 23 | `IMPLEMENTED` — `packages/@cos/financial` suite |
| `TC-P04-UNIT-003` | Intermediate values are not rounded | UNIT | Multi-step calculation | 1. Compute a category subtotal from items with long decimal tails | Rounding is applied only to the final result | §32.5 Prohibited | `IMPLEMENTED` — `boq.service.spec.ts` |
| `TC-P04-UNIT-004` | Category subtotal sums its items | UNIT | Category with N items | 1. Create items; 2. Read `subtotal_amount` | Subtotal equals the sum of item `estimated_total` | Ph4 Calculation Rules | `IMPLEMENTED` — `boq.service.spec.ts` |
| `TC-P04-UNIT-005` | Version total sums root category subtotals | UNIT | Version with nested categories | 1. Read `total_estimated_amount` | Equals the sum of root-category subtotals only (no double counting of child categories) | Ph4 Calculation Rules | `IMPLEMENTED` — `boq.service.spec.ts` |
| `TC-P04-UNIT-006` | Any item mutation triggers synchronous recalculation | UNIT | Existing version | 1. Create, update, then delete an item; 2. Read totals after each | Totals are recalculated synchronously after each operation | Ph4 Calculation Rules | `IMPLEMENTED` — `boq.service.spec.ts` |
| `TC-P04-UNIT-007` | A new project's first BOQ version is number 1 | UNIT | New project | 1. Create the first version | `version_number = 1`, `status = DRAFT` | Ph4 Versioning Rules | `IMPLEMENTED` — `boq.service.spec.ts` |
| `TC-P04-UNIT-008` | Creating a version copies items from the latest `APPROVED` version | UNIT | An `APPROVED` version with items | 1. Create a new version | All items are copied into the new `DRAFT` version | Ph4 Versioning Rules | `IMPLEMENTED` — `boq.service.spec.ts` |
| `TC-P04-UNIT-009` | Only one `DRAFT` version may exist per project | UNIT | A `DRAFT` version exists | 1. Create a second version | Rejected | Ph4 Versioning Rules | `IMPLEMENTED` — `boq.service.spec.ts` |
| `TC-P04-UNIT-010` | Approving a version supersedes the previous `APPROVED` one | UNIT | One `APPROVED` + one `DRAFT` | 1. Approve the `DRAFT` | Previous version becomes `SUPERSEDED`; the new one becomes `APPROVED` | Ph4 Versioning Rules | `IMPLEMENTED` — `boq.service.spec.ts` |
| `TC-P04-UNIT-011` | `APPROVED` and `SUPERSEDED` versions are immutable | UNIT | An `APPROVED` version | 1. `PATCH` an item in it; 2. `DELETE` an item from it | Both rejected — item mutation is `DRAFT`-only | Ph4 Versioning Rules; Ph4 APIs | `IMPLEMENTED` — `boq.service.spec.ts` |
| `TC-P04-UNIT-012` | Monetary columns keep 4-decimal precision and an ISO-4217 currency | UNIT | Item DTO | 1. Submit an amount with more than 4 decimals; 2. Submit an invalid currency code | Amount is validated/rounded to 4 dp; invalid currency is rejected by `IsCurrencyCode` | §32.5 Storage; `@cos/validation` | `IMPLEMENTED` — `packages/@cos/validation` suite |
| `TC-P04-UNIT-013` | Carbon columns accept `NULL` and compute when a factor is present | UNIT | Item without a carbon factor | 1. Create the item; 2. Set `carbon_factor_kg_co2e` and recompute | `NULL` is valid; when set, `carbon_total_kg_co2e = ROUND(quantity × factor, 4)` | Ph4 `boq_items` note | `IMPLEMENTED` — `boq.service.spec.ts` |
| `TC-P04-UNIT-014` | BOQ export produces valid JSON and CSV | UNIT | Version with items | 1. Export as JSON; 2. Export as CSV | Both contain every item with unrounded stored precision | Ph4 APIs (`/export`) | `IMPLEMENTED` — `boq-csv.util.spec.ts` |
| `TC-P04-UNIT-015` | BOQ events carry decimal strings, never floats | UNIT | — | 1. Emit `boq.updated`; 2. Inspect the payload | `new_total_estimated_amount` is a decimal **string**; `new_total_estimated_currency` is ISO 4217 | Event Contract #17 | `IMPLEMENTED` — `boq.service.spec.ts` |
| `TC-P04-UNIT-016` | Version approval emits `boq.version.approved` | UNIT | `DRAFT` version | 1. Approve it | Envelope + `{ project_id, version_id, total_estimated }` | Ph4 Kafka producers | `IMPLEMENTED` — `boq.service.spec.ts` |
| `TC-P04-INT-001` | Full BOQ lifecycle | INT | Testcontainers stack | 1. Create version → add categories → add items → approve → create next version → export | Each step persists; totals are correct at every stage | Ph4 Generate "Integration tests" | `IMPLEMENTED` — `backend/test/boq.integration.spec.ts` |
| `TC-P04-ISO-001` | BOQ data is tenant-isolated | ISO | Two tenant fixtures | 1. Read Tenant B's BOQ version with Tenant A's JWT | 403 / zero rows | §30.6 | `IMPLEMENTED` — `tenant-isolation.integration.spec.ts` |
| `TC-P04-SEC-001` | Mutation score for financial calculation logic ≥ 70% | SEC | Stryker configured | 1. Run `pnpm --filter @cos/financial test:mutation`; 2. Read the score | Mutation score ≥ 70% (`break` threshold) | QM-1 mutation testing | `IMPLEMENTED` — `packages/@cos/financial/stryker.config.json` (`mutate: src/**/*.ts`, `break: 70`); CI matrix target in `.github/workflows/mutation-tests.yml` |

**Phase 4 exit gate:** BOQ calculations and financial-precision tests green; RLS enforced
(`00_master` Phase Register — Phase 4 Exit).

---

### 35.10.5 Phase 5 — Procurement Service

**Objective:** the procurement domain (PR → RFQ → PO).

**Spec references:** `00_master` §Phase 5 (entities, workflow implementation, APIs, Generate);
§WORKFLOW ENGINE SPEC (§32.6 — RFQ and PO state machines); §15.5 (approval chain and escalation);
§14 (Procurement + Vendor APIs); §13.3 (tax, WHT); ADR-022 (route unification), ADR-030 (Vendor Portal);
QM-1 (mutation testing for approval flows).

**Scope in:** vendors, purchase requests, RFQs, quotations, purchase orders, line items, deliveries,
vendor invoices, both Temporal workflows, vendor scoring, WHT, Vendor Portal (Tier 1 + Tier 2).
**Scope out:** payment execution and budget aggregation (Phase 7); accounting rules (never invented).

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P05-UNIT-001` | RFQ follows exactly `DRAFT → PUBLISHED → CLOSED → EVALUATED → AWARDED\|CANCELLED` | UNIT | RFQ in each state | 1. Walk every specified transition; 2. Attempt transitions outside the machine | Specified transitions succeed; all others rejected — no invented state | §32.6 RFQ workflow; Rule 8 | `IMPLEMENTED` — `backend/src/modules/procurement/__tests__/rfq.workflow.spec.ts` |
| `TC-P05-UNIT-002` | `DRAFT → PUBLISHED` requires `PROCUREMENT_OFFICER` | UNIT | RFQ `DRAFT` | 1. Publish as each role | Only `PROCUREMENT_OFFICER` succeeds | §32.6 RFQ transitions | `IMPLEMENTED` — `rfq.activities.spec.ts` |
| `TC-P05-UNIT-003` | `PUBLISHED → CLOSED` fires on deadline expiry via a Temporal timer | UNIT | RFQ `PUBLISHED` with a deadline | 1. Advance the workflow test clock past the deadline | RFQ transitions to `CLOSED` without manual action | §32.6 RFQ transitions | `IMPLEMENTED` — `rfq.workflow.spec.ts` (serial runner) |
| `TC-P05-UNIT-004` | `EVALUATED → AWARDED\|CANCELLED` requires `PROCUREMENT_OFFICER` or `PROC_MANAGER` | UNIT | RFQ `EVALUATED` | 1. Award as each role; 2. Cancel as each role | Only the two listed roles succeed | §32.6 RFQ transitions | `IMPLEMENTED` — `rfq.activities.spec.ts` |
| `TC-P05-UNIT-005` | Cancellation runs compensation logic | UNIT | RFQ/PO mid-flight | 1. Cancel; 2. Inspect emitted compensation events | Compensation events are emitted to Finance | Ph5 Workflow Implementation; §32.6 RULES | `IMPLEMENTED` — `rfq.workflow.spec.ts`, `po.workflow.spec.ts` |
| `TC-P05-UNIT-006` | PO approval chain ≤ 50,000 THB requires PM alone | UNIT | PO `PENDING_APPROVAL`, total 50,000 | 1. Approve as `PROJECT_MANAGER` | PO becomes `APPROVED` with no further approver required | §15.5 threshold tiers | `IMPLEMENTED` — `po.activities.spec.ts` |
| `TC-P05-UNIT-007` | PO 50,001–500,000 THB requires PM **and** FINANCE | UNIT | PO total 500,000 | 1. Approve as PM only; 2. Then approve as FINANCE | After step 1 the PO remains `PENDING_APPROVAL`; after step 2 it becomes `APPROVED` | §15.5 threshold tiers | `IMPLEMENTED` — `po.activities.spec.ts` |
| `TC-P05-UNIT-008` | PO > 500,000 THB requires PM + FINANCE + EXECUTIVE | UNIT | PO total 500,001 | 1. Approve as PM, then FINANCE, then EXECUTIVE | Only after the third approval does the PO become `APPROVED` | §15.5 threshold tiers | `IMPLEMENTED` — `po.activities.spec.ts` |
| `TC-P05-UNIT-009` | Threshold boundaries are exact | UNIT | POs of 50,000 / 50,001 / 500,000 / 500,001 | 1. Determine the approver chain for each | 50,000 → PM; 50,001 → PM+FIN; 500,000 → PM+FIN; 500,001 → PM+FIN+EXEC | §15.5; §30.3 key invariant | `IMPLEMENTED` — `po.activities.spec.ts` |
| `TC-P05-UNIT-010` | Approval thresholds are tenant-configurable, not hardcoded | UNIT | Tenant with custom thresholds | 1. Configure a non-default threshold; 2. Determine the chain | The tenant's configured values are applied; platform values are defaults only | §15.5 Note; Rule 5 | `IMPLEMENTED` — `po.activities.spec.ts` |
| `TC-P05-UNIT-011` | An approver who does not respond in 48 h escalates to their manager | UNIT | PO awaiting approval | 1. Advance the workflow clock 48 h without a decision | Escalation fires to the manager; final escalation targets `TENANT_ADMIN` | §15.5; §32.6 | `IMPLEMENTED` — `po.workflow.spec.ts` |
| `TC-P05-UNIT-012` | Escalation emits `procurement.po.approval_requested.v1` | UNIT | PO entering an approval tier | 1. Enter the tier; 2. Escalate on timeout; 3. Inspect events | Both entry and escalation emit the event with `tier ∈ {PM, FINANCE, EXECUTIVE, TENANT_ADMIN}` and decimal-string `total_amount` | Event Contract #18 | `IMPLEMENTED` — `po.activities.spec.ts` |
| `TC-P05-UNIT-013` | PO follows exactly the specified state machine | UNIT | PO in each state | 1. Walk `DRAFT → PENDING_APPROVAL → APPROVED → SENT → ACKNOWLEDGED → PARTIALLY_DELIVERED → FULLY_DELIVERED → INVOICED → PAID\|DISPUTED`; 2. Attempt undefined transitions | Specified transitions succeed; all others rejected | §32.6 PO workflow | `IMPLEMENTED` — `po.workflow.spec.ts` |
| `TC-P05-UNIT-014` | `PENDING_APPROVAL → DRAFT` on reject/revise | UNIT | PO `PENDING_APPROVAL` | 1. Reject as any approval-chain role | PO returns to `DRAFT` | §32.6 PO transitions | `IMPLEMENTED` — `po.activities.spec.ts` |
| `TC-P05-UNIT-015` | `APPROVED → SENT` happens automatically | UNIT | PO just approved | 1. Observe the workflow without operator action | The system performs the transition | §32.6 PO transitions | `IMPLEMENTED` — `po.workflow.spec.ts` |
| `TC-P05-UNIT-016` | `INVOICED → PAID\|DISPUTED` requires `FINANCE` | UNIT | PO `INVOICED` | 1. Attempt each transition as every role | Only `FINANCE` succeeds | §32.6 PO transitions | `IMPLEMENTED` — `po.activities.spec.ts` |
| `TC-P05-UNIT-017` | Every state transition emits a typed Kafka event | UNIT | RFQ and PO workflows | 1. Perform every transition; 2. Collect emitted events | Each transition produces `procurement.rfq.status_changed` / `procurement.po.status_changed` via `@cos/shared` | §32.6 RULES; Rule 10; master §9 | `IMPLEMENTED` — `procurement.service.spec.ts`, `po.activities.spec.ts` |
| `TC-P05-UNIT-018` | `line_total = ROUND(quantity × unit_price, 4)` | UNIT | PO line item | 1. Compute a line with a long decimal tail | HALF_UP to 4 dp using decimal.js | Ph5 `po_line_items`; §32.5 | `IMPLEMENTED` — `procurement.service.spec.ts` |
| `TC-P05-UNIT-019` | Quotation comparison sorts by total and marks the selection | UNIT | RFQ `CLOSED` with N quotations | 1. Run the comparison service | Quotations are ordered by `total_amount`; the awarded one has `is_selected = true` | Ph5 Generate "Quotation comparison service" | `IMPLEMENTED` — `procurement.service.spec.ts` |
| `TC-P05-UNIT-020` | Vendor scoring uses the three specified criteria and tenant weights | UNIT | Vendor with history | 1. Score with default weights; 2. Score with tenant-configured weights | Criteria are on-time delivery, quality, price competitiveness; defaults are 1/3 each; grade ∈ {A,B,C,D,F} | Ph5 VendorScoring decision | `IMPLEMENTED` — `vendor-scoring.spec.ts` |
| `TC-P05-UNIT-021` | Thailand WHT defaults are 3% services / 5% rent and come from `wht_rules` | UNIT | WHT service | 1. Calculate for a services vendor; 2. Calculate for rent; 3. Calculate for another jurisdiction | 3% / 5% for Thailand; other jurisdictions read `wht_rules` — no hardcoded rate | Ph5 WithholdingTaxRules; §13.3; Rule 7 | `IMPLEMENTED` — `wht.service.spec.ts` |
| `TC-P05-UNIT-022` | Tax calculation is delegated to the AvaTax integration, never invented | UNIT | Tax stub | 1. Trigger tax calculation on invoice creation and PO generation | The `calculate(...)` interface is invoked; no local tax table is used; the stub follows the §32.9 Type A pattern (log WARN + throw) | Ph5 "Do not invent: tax logic"; §32.9 | `IMPLEMENTED` — `backend/src/modules/finance/__tests__/avatax.stub.spec.ts` |
| `TC-P05-UNIT-023` | Vendor Portal Tier-1 magic link is HMAC-signed and single-purpose | UNIT | Magic-link service | 1. Issue an invitation link; 2. Tamper with the token; 3. Replay after expiry | Valid token opens the invited RFQ only; tampered and expired tokens are rejected | ADR-030; §5.4.3 | `IMPLEMENTED` — `vendor-portal/__tests__/magic-link.service.spec.ts` |
| `TC-P05-UNIT-024` | Vendor Portal principals are scoped by trading relationship, not tenant RLS | UNIT | Vendor session | 1. Request POs/invoices as a Tier-2 vendor session | Only rows reachable through `platform.vendor_trading_relationships` are returned; `VENDOR_PORTAL` is not a `CosRole` | ADR-030; §6.8b | `IMPLEMENTED` — `vendor-auth.middleware.spec.ts`, `vendor-portal.service.spec.ts` |
| `TC-P05-INT-001` | Full procurement lifecycle against a Temporal test server | INT | Testcontainers + Temporal test env | 1. Create PR → RFQ → publish → quotations → award → PO → approve → delivery → vendor invoice → approve | Every stage persists and emits its event; the workflow completes | Ph5 Generate "Integration tests" | `IMPLEMENTED` — `backend/test/procurement.integration.spec.ts` |
| `TC-P05-INT-002` | All procurement routes are under `/api/v1/procurement/*` | INT | App running | 1. Call every documented route including vendors | No route is served from a separate `/api/v1/vendors` namespace | ADR-022 | `IMPLEMENTED` — `procurement.integration.spec.ts` |
| `TC-P05-SEC-001` | Mutation score for procurement approval logic ≥ 70% | SEC | Stryker configured | 1. Run `pnpm --filter @cos/backend test:mutation` | Score ≥ 70% over `procurement.service.ts`, `po.activities.ts`, `rfq.activities.ts` | QM-1 | `IMPLEMENTED` — `backend/stryker.config.json`; CI `mutation-tests.yml` |
| `TC-P05-MAN-001` | Temporal workflow specs run serially in their own config | MAN | — | 1. Assert `*.workflow.spec.ts` are excluded from `jest.config.js` and matched by `jest.workflows.config.js` (`maxWorkers: 1`); 2. Assert CI runs `test:workflows` as a separate step | Serial execution; excluded from `collectCoverageFrom` (coverage-neutral) | QM-1 note; §30.12; Ph18 Temporal pattern | `IMPLEMENTED` — `backend/jest.workflows.config.js`; `unit-tests` job step "Temporal workflow tests (serial)" |

**Phase 5 exit gate:** the procurement state machine emits verified typed events; RLS enforced
(`00_master` Phase Register — Phase 5 Exit).

---

### 35.10.6 Phase 6 — Site Operations

**Objective:** the site-operations and daily-reporting domain.

**Spec references:** `00_master` §Phase 6 (conflict strategies, task completion gates, entities, APIs,
Generate); §17.4 (offline write scope); §17.6 (sync priority); QM-9 (conflict resolution);
ADR-025 (inspections), ADR-027 (safety).

**Scope in:** site reports, issues, inspections, safety checklists/incidents/permits, manpower logs,
material consumption, tasks + completion gates, conflict records and the server-side sync contract.
**Scope out:** the mobile client sync engine (Phase 10); photo storage (Phase 9).

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P06-UNIT-001` | `site_reports` resolve by LAST_WRITE_WINS on `client_submitted_at` | UNIT | Server and client versions | 1. Sync a client version with a newer `client_submitted_at`; 2. Repeat with an older one | Newer timestamp wins in both directions | Ph6 conflict strategy; QM-9 | `IMPLEMENTED` — `backend/src/modules/site-ops/__tests__/conflict-handler.spec.ts` |
| `TC-P06-UNIT-002` | A modified server report is flagged `CONFLICT_FLAGGED` | UNIT | Server `modified_at` ≠ client `last_known_modified_at` | 1. Sync the client version | `conflict_status = CONFLICT_FLAGGED`; a `ConflictRecord` is persisted for `SITE_ENGINEER` review | Ph6 conflict strategy | `IMPLEMENTED` — `conflict-handler.spec.ts` |
| `TC-P06-UNIT-003` | `issues` merge field-by-field | UNIT | Concurrent edits | 1. Change `description` and `resolution_note` on the client; 2. Change `status` on the server; 3. Add photos on both sides; 4. Sync | `description`/`resolution_note` → last writer wins; `status` → server wins; `photos` → union | Ph6 FIELD_LEVEL_MERGE; QM-9 | `IMPLEMENTED` — `conflict-handler.spec.ts` |
| `TC-P06-UNIT-004` | A server-side `status` change during an offline edit creates a `ConflictRecord` | UNIT | Offline issue edit + server status change | 1. Sync | `ConflictRecord` created for `SITE_ENGINEER` review | Ph6 FIELD_LEVEL_MERGE | `IMPLEMENTED` — `conflict-handler.spec.ts` |
| `TC-P06-UNIT-005` | `safety_checklists` are SERVER_WINS, unconditionally | UNIT | Client and server versions | 1. Sync a newer client version | Client version rejected; server version returned with `CONFLICT_REJECTED` — no exception path exists | Ph6 SERVER_WINS; QM-9 | `IMPLEMENTED` — `conflict-handler.spec.ts` |
| `TC-P06-UNIT-006` | Task `progress_percent` resolves by MAX_WINS, silently | UNIT | Client 40, server 60 (and the reverse) | 1. Sync each direction | `max(client, server)` is applied; no `ConflictRecord` is created (no human review) | Ph6 tasks strategy | `IMPLEMENTED` — `conflict-handler.spec.ts` |
| `TC-P06-UNIT-007` | Financial entities never auto-resolve | UNIT | Offline write on a BOQ line item / payment approval / budget entry / invoice record with a concurrent server change | 1. Sync each entity type | `conflict_status = CONFLICT_FLAGGED`; the payload is **not** applied; a notification is raised to `FINANCE` or `PROJECT_MANAGER`; nothing is merged, overwritten or discarded | Ph6 NO_AUTO_RESOLUTION; QM-9 | `IMPLEMENTED` — `conflict-handler.spec.ts` |
| `TC-P06-UNIT-008` | The sync wire contract matches the specified shape | UNIT | Sync endpoint | 1. `POST /api/v1/sync/resolve` with `{ entity_type, entity_id, client_version, payload, client_submitted_at }` | Response is `{ resolved_payload, conflict_status, server_version }` with `conflict_status ∈ { ACCEPTED, CONFLICT_FLAGGED, CONFLICT_REJECTED }` | Ph6 Sync Protocol; QM-9 | `IMPLEMENTED` — `backend/src/modules/sync/__tests__/sync.service.spec.ts` |
| `TC-P06-UNIT-009` | Every `CONFLICT_FLAGGED` record emits `site.conflict.flagged` | UNIT | A flagged conflict | 1. Persist the `ConflictRecord`; 2. Inspect events | Event emitted with `{ conflict_id, entity_type, entity_id, conflict_type }` and routed to `SITE_ENGINEER`, `PROJECT_MANAGER`, `TENANT_ADMIN` | Ph6 Kafka producers | `IMPLEMENTED` — `site-ops.service.spec.ts` |
| `TC-P06-UNIT-010` | Task completion gate 1 — a failed or re-inspection-required inspection blocks completion | UNIT | Task with a linked inspection `FAIL` / `REQUIRES_REINSPECTION` | 1. `PATCH /api/v1/tasks/:id { status: 'completed' }` | HTTP 422, code `COS-TASK-001`, blocking gate named in the response | Ph6 Task Completion Gates #1 | `IMPLEMENTED` — `backend/src/modules/tasks/__tests__/tasks.service.spec.ts` |
| `TC-P06-UNIT-011` | Gate 2 — an open DEFECT/REWORK/PUNCH issue blocks completion | UNIT | Linked open issue of those types | 1. Complete the task | 422 `COS-TASK-001` | Ph6 gate #2 | `IMPLEMENTED` — `tasks.service.spec.ts` |
| `TC-P06-UNIT-012` | Gate 3 — incomplete BOQ-derived predecessors block completion | UNIT | Predecessor task not `COMPLETED` | 1. Complete the task | 422 `COS-TASK-001` | Ph6 gate #3 | `IMPLEMENTED` — `tasks.service.spec.ts` |
| `TC-P06-UNIT-013` | Gate 4 — an expired or revoked permit blocks completion | UNIT | Linked permit `EXPIRED` / `REVOKED` | 1. Complete the task | 422 `COS-TASK-001` | Ph6 gate #4 | `IMPLEMENTED` — `tasks.service.spec.ts` |
| `TC-P06-UNIT-014` | Gate 5 — an open HIGH/CRITICAL safety incident blocks completion | UNIT | Linked open incident of that severity | 1. Complete the task | 422 `COS-TASK-001` | Ph6 gate #5 | `IMPLEMENTED` — `tasks.service.spec.ts` |
| `TC-P06-UNIT-015` | Gate 6 — a `BLOCKED` task cannot complete | UNIT | Task set `BLOCKED` by `construction.delay.detected.v1` | 1. Complete the task | 422 `COS-TASK-001` | Ph6 gate #6 | `IMPLEMENTED` — `tasks.service.spec.ts` |
| `TC-P06-UNIT-016` | Gate 7 — no non-pending delivery blocks completion | UNIT | Linked BOQ item whose PO has only `PENDING` deliveries | 1. Complete the task | 422 `COS-TASK-001` | Ph6 gate #7 | `IMPLEMENTED` — `tasks.service.spec.ts` |
| `TC-P06-UNIT-017` | Gates 8–9 warn rather than block, and ≥ 100% requires acknowledgement | UNIT | BOQ actual cost at 85–99%, then ≥ 100% | 1. Complete at 85–99%; 2. Complete at ≥ 100% without acknowledgement; 3. Retry with `{ acknowledge_budget_overrun: true }` | 1 → HTTP 200 with an ORANGE warning; 2 → blocked pending acknowledgement; 3 → 200 with a RED warning | Ph6 gates #8–#9 | `IMPLEMENTED` — `tasks.service.spec.ts` |
| `TC-P06-UNIT-018` | Material consumption emits `site.material.consumed` | UNIT | Report exists | 1. `POST /api/v1/site/reports/:reportId/materials` | Event carries `{ consumption_id, project_id, task_id, material_id, quantity (4 dp), unit, consumed_by, consumed_at }` | Ph6 APIs addition; Event Contract #10 | `IMPLEMENTED` — `site-ops.service.spec.ts` |
| `TC-P06-UNIT-019` | A failed inspection emits `inspection.failed` with the failed items | UNIT | Inspection recorded as `FAILED` | 1. Submit the result; 2. Inspect the event | Payload contains `failed_items[]`, `inspected_by`, `inspected_at` | Event Contract #6 | `IMPLEMENTED` — `site-ops.service.spec.ts` |
| `TC-P06-UNIT-020` | Safety permit approval follows `PENDING → ACTIVE` / `REVOKED` | UNIT | Permit `PENDING` | 1. Approve; 2. Reject a second permit | Approve → `ACTIVE`; reject → `REVOKED`; the §15.5 chain (initiator → `SAFETY_OFFICER` → PM) is enforced | Ph6 Safety APIs; ADR-027; §15.5 | `IMPLEMENTED` — `backend/src/modules/safety/__tests__/safety.service.spec.ts` |
| `TC-P06-UNIT-021` | Report `summary` is capped at 2,000 characters | UNIT | DTO validation | 1. Submit 2,001 characters | 400 with a field-level error | Ph6 `site_reports.summary` | `IMPLEMENTED` — `site-ops.controller.spec.ts` |
| `TC-P06-UNIT-022` | One report per project per date per submitter | UNIT | Existing report | 1. Submit a second report for the same `(project_id, report_date, submitted_by)` | 409 conflict | Ph6 `site_reports` UNIQUE | `IMPLEMENTED` — `site-ops.repository.spec.ts` |
| `TC-P06-UNIT-023` | Offline writes are rejected for out-of-scope entities | UNIT | Sync push | 1. Push an offline write for a PO, vendor invoice, budget line, vendor master or permission change | Rejected — these are online-required (read-cache only) | §17.4; QM-9 offline write scope | `IMPLEMENTED` — `sync.service.spec.ts` |
| `TC-P06-UNIT-024` | `GET /sync/delta` returns tombstoned ids in `deleted[]` | UNIT | `platform.sync_tombstones` rows exist | 1. Request the delta since a cursor | Tombstoned entity ids appear in `deleted[]`; the response carries `server_timestamp` | Ph10 tombstone table; Ph6 sync contract | `IMPLEMENTED` — `sync.service.spec.ts`, `tombstone-prune.service.spec.ts` |
| `TC-P06-INT-001` | Sync flow including conflict scenarios | INT | Testcontainers stack | 1. Push offline changes producing each conflict class; 2. Read back the resolved state | Each strategy resolves as designed; `ConflictRecord` rows are created only where specified | Ph6 Generate "Integration tests" | `IMPLEMENTED` — `backend/test/site-ops.integration.spec.ts` |
| `TC-P06-INT-002` | Site reports and issues are indexed for full-text search | INT | OpenSearch available | 1. Create a report and an issue; 2. Search by free text | Both are retrievable | Ph6 Generate "OpenSearch indexing" | `IMPLEMENTED` — same spec: site reports and issues are indexed through `SiteOpsService` and retrieved by a word in `summary`, in `weather`, in an issue `title` and in an issue `description` (§35.13 ESC-31) |
| `TC-P06-INT-003` | `?minimal=true` returns a reduced mobile payload | INT | Existing reports | 1. List with and without the flag | The minimal response omits the documented non-essential fields | Ph6 Generate "Response DTOs optimized for mobile" | `IMPLEMENTED` — `site-ops.integration.spec.ts` |

**Phase 6 exit gate:** site-report APIs pass the isolation-test suite
(`00_master` Phase Register — Phase 6 Exit).

---

### 35.10.7 Phase 7 — Finance Service

**Objective:** the finance domain (budget tracking, cost transactions, AR billing, payments).

**Spec references:** `00_master` §Phase 7 (scope clarification, entities, consumers, APIs, Generate,
Constraints); §FINANCIAL PRECISION SPEC (§32.5); §11/§15 (AR billing, approval limits);
ADR-023 (routes), ADR-024 (cash-flow forecast).

**Scope in:** project budgets and lines, cost transactions from Kafka, payments, retention records,
variance reporting, customers/contracts/AR billing/receipts, 13-week cash-flow forecast, exchange rates.
**Scope out:** double-entry bookkeeping, chart of accounts, GL posting, external ERP — explicitly
UNSPECIFIED in Phase 7 and never to be stubbed.

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P07-UNIT-001` | `procurement.po.created` creates a COMMITTED cost transaction | UNIT | Consumer under test | 1. Deliver the event; 2. Read `cost_transactions` | A row with `source_type = PURCHASE_ORDER` is created and `committed_amount` increases | Ph7 Kafka Consumers | `IMPLEMENTED` — `backend/src/modules/finance/__tests__/finance.consumer.spec.ts` |
| `TC-P07-UNIT-002` | `procurement.invoice.received` creates an ACTUAL cost transaction | UNIT | Consumer under test | 1. Deliver the event | A row with `source_type = INVOICE` is created | Ph7 Kafka Consumers | `IMPLEMENTED` — `finance.consumer.spec.ts` |
| `TC-P07-UNIT-003` | A cancelled PO reduces `committed_amount` | UNIT | PO previously committed | 1. Deliver `procurement.po.status_changed` with `to_status = CANCELLED` | `committed_amount` is reduced accordingly | Ph7 Kafka Consumers | `IMPLEMENTED` — `finance.consumer.spec.ts` |
| `TC-P07-UNIT-004` | Consumers are idempotent for a repeated `event_id` | UNIT | Same event delivered twice | 1. Deliver the event twice | Exactly one cost transaction exists | Ph8 idempotency; §30.3 | `IMPLEMENTED` — `finance.consumer.spec.ts` |
| `TC-P07-UNIT-005` | Budget aggregation recomputes on each transaction | UNIT | Budget with lines | 1. Record several transactions; 2. Read the budget summary | `allocated`, `committed` and `actual` reflect all transactions | Ph7 Generate "Budget aggregation service" | `IMPLEMENTED` — `finance.service.spec.ts` |
| `TC-P07-UNIT-006` | Variance is `(actual + committed)` versus `allocated` per budget line | UNIT | Budget line with both figures | 1. Read the variance report | Formula matches exactly; decimal.js arithmetic | Ph7 Generate "Variance calculation" | `IMPLEMENTED` — `finance.service.spec.ts` |
| `TC-P07-UNIT-007` | Variance alert fires at the default 10% threshold and honours per-project overrides | UNIT | Project at 10% over budget; another with a custom threshold | 1. Run the variance check for each | `finance.variance.alert` fires at the effective threshold — default 10%, overridden by `project_budgets.variance_alert_threshold` | Ph7 Kafka producers decision | `IMPLEMENTED` — `finance.service.spec.ts` |
| `TC-P07-UNIT-008` | Currency conversion rounds to 4 dp and caches for 24 h | UNIT | Exchange-rate service with mocked Redis | 1. Convert an amount; 2. Convert again within the TTL | `original_amount × rate` rounded to 4 dp; the second call is served from cache (TTL 24 h) | §32.5 Multi-currency | `IMPLEMENTED` — `exchange-rate.service.spec.ts` |
| `TC-P07-UNIT-009` | The last cached rate is used when the rate API is unavailable | UNIT | Cached rate present; API failing | 1. Convert | The stale cached rate is used; no exception surfaces to the caller | §32.5; Ph7 Constraints | `IMPLEMENTED` — `exchange-rate.service.spec.ts` |
| `TC-P07-UNIT-010` | The exchange-rate client closes its Redis handle on shutdown | UNIT | Service instance | 1. Invoke `onModuleDestroy` | `redis.quit()` is called | Rule 39; ADR-034 | `IMPLEMENTED` — `exchange-rate.service.spec.ts` |
| `TC-P07-UNIT-011` | AR billing approval follows PM ≤ limit, EXECUTIVE above | UNIT | Billing `DRAFT` below and above the limit | 1. Approve each as PM | Below the limit → `ISSUED`; above → requires `EXECUTIVE` | Ph7 APIs; §15.5 | `IMPLEMENTED` — `finance.service.spec.ts` |
| `TC-P07-UNIT-012` | An AR receipt settles its billing to `PAID` | UNIT | Billing `ISSUED` | 1. `POST /api/v1/finance/ar-receipts` for the full amount | Billing becomes `PAID` | Ph7 APIs | `IMPLEMENTED` — `finance.service.spec.ts` |
| `TC-P07-UNIT-013` | The cash-flow forecast is a deterministic 13-week direct-method projection | UNIT | Project with scheduled inflows/outflows | 1. Request the forecast twice with identical inputs | Identical output both times; 13 weekly buckets; no AI/model call | Ph7 scope; ADR-024 | `IMPLEMENTED` — `finance.service.spec.ts` |
| `TC-P07-UNIT-014` | Retention percentage has no system default | UNIT | Retention record | 1. Create without a percentage; 2. Create with a `TENANT_ADMIN`-entered percentage | Field stays `NULL` when not entered — nothing is auto-calculated; when entered, `retention_amount = contract_amount × pct / 100` | Ph7 `retention_records` decision | `IMPLEMENTED` — `finance.repository.spec.ts` |
| `TC-P07-UNIT-015` | ERP adapters are Type A stubs | UNIT | SAP/Oracle/Dynamics adapters | 1. Invoke each adapter method | Logs WARN and throws a typed exception (fail-fast); no silent default | Ph7 ERPIntegration; §32.9 Type A | `IMPLEMENTED` — `erp-integration.stub.spec.ts` |
| `TC-P07-UNIT-016` | Construction financing is a Type A stub | UNIT | Financing adapter | 1. Invoke `submitFactoringApplication` | Logs WARN and throws a typed exception | Ph7 ConstructionFinancing; §32.9 | `IMPLEMENTED` — `construction-financing.stub.spec.ts` |
| `TC-P07-UNIT-017` | Finance holds no double-entry, chart-of-accounts or GL logic | UNIT | Module source under review | 1. Search the finance module for ledger/journal/GL posting constructs | None exist — these are explicitly out of scope and must not be stubbed | Ph7 Scope Clarification; Rule 20 | `IMPLEMENTED` — `tests/architecture/invariants.spec.ts` scans `backend/src/modules/finance/**` and every migration for double-entry / chart-of-accounts / general-ledger vocabulary and ledger tables (§35.13 ESC-27) |
| `TC-P07-INT-001` | Full budget lifecycle with procurement event consumption | INT | Testcontainers + Kafka | 1. Set a budget; 2. Add lines; 3. Publish PO and invoice events; 4. Read the budget summary and variance report | Committed and actual amounts reflect the consumed events; variance is correct | Ph7 Generate "Integration tests" | `IMPLEMENTED` — `backend/test/finance.integration.spec.ts` |
| `TC-P07-INT-002` | Finance never queries procurement tables directly | INT | App running | 1. Trace the queries issued while consuming procurement events | Only finance-schema tables are touched; cross-module data arrives via Kafka | Ph7 Constraints; master §4; Rule 3 | `IMPLEMENTED` — `tests/architecture/connectivity.spec.ts` scans `backend/src/modules/finance/` for SQL against a `procurement.*` table, and asserts the inverse too: the procurement events finance depends on are still consumed (§35.13 ESC-28) |
| `TC-P07-ISO-001` | Finance data is tenant-isolated | ISO | Two tenant fixtures | 1. Read Tenant B's budget with Tenant A's JWT | 403 / zero rows | §30.6 | `IMPLEMENTED` — `tenant-isolation.integration.spec.ts` |

**Phase 7 exit gate:** finance calculations and precision tests green; RLS enforced
(`00_master` Phase Register — Phase 7 Exit).

---

### 35.10.8 Phase 8 — Event-driven Infrastructure

**Objective:** the Kafka event backbone — outbox, DLQ and the shared event SDK.

**Spec references:** `00_master` §Phase 8 (schema registry, versioning, Kafka config, shared SDK,
outbox, DLQ, monitoring, Generate); §32.4 (event contracts, subject strategy); §7.3 (topic
provisioning and per-tenant topics); §15.6 (event naming); QM-9 (BACKWARD_TRANSITIVE); Rules 33–34.

**Scope in:** event envelope, Avro schemas, producer/consumer abstractions, idempotency, outbox
publisher and poller, DLQ and retry, topic provisioning, trace propagation, Kafka metrics.
**Scope out:** Debezium CDC Path 2 (Phase 17); per-domain event payloads (owned by their phases).

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P08-UNIT-001` | Every event carries the full base envelope | UNIT | Producer under test | 1. Publish any event; 2. Inspect the message | `event_id` (UUID v4), `event_type`, `event_version`, `tenant_id`, `actor_id`, `occurred_at` (ISO 8601 UTC), `correlation_id`, `payload` are all present | Event Contract envelope | `IMPLEMENTED` — `packages/@cos/shared/src/kafka/__tests__/producer.spec.ts` |
| `TC-P08-UNIT-002` | `event_type` follows `{domain}.{entity}.{action}.v{N}` | UNIT | Producer | 1. Publish events across domains; 2. Validate each `event_type` | All match the canonical format | §32.4; §15.6; §30.3 key invariant | `IMPLEMENTED` — `producer.spec.ts`, `topic-catalog.spec.ts` |
| `TC-P08-UNIT-003` | Topic names are per-tenant and prefixed | UNIT | Topic catalog | 1. Resolve the topic for an event in a tenant | `{tenant_id}.{domain}.{entity}.{action}.v{N}`; DLQ resolves to `{tenant_id}.{domain}.dlq`; platform events use the shared `platform.events` topic | §7.3; §15.6/§15.7 | `IMPLEMENTED` — `topic-catalog.spec.ts` |
| `TC-P08-UNIT-004` | Producers never auto-create topics | UNIT | Producer config | 1. Inspect the KafkaJS producer options | `allowAutoTopicCreation: false` | §7.3 Topic provisioning; Ph8 Exit | `IMPLEMENTED` — `producer.spec.ts` |
| `TC-P08-UNIT-005` | The per-tenant topic set is provisioned idempotently | UNIT | Provisioner | 1. Provision a tenant twice | The second run creates nothing and does not error | §7.3 | `IMPLEMENTED` — `topic-provisioner.spec.ts` |
| `TC-P08-UNIT-006` | Schema subjects use RecordNameStrategy | UNIT | Schema Registry client | 1. Register a schema; 2. Inspect the subject | Subject is the canonical event type (one schema per event, shared across tenants) — never `{topic_name}-value` | §32.4; Ph8 Schema Registry | `IMPLEMENTED` — `schema-registry.client.spec.ts` |
| `TC-P08-UNIT-007` | Publishing validates the payload against the registered schema | UNIT | Producer with schema validation | 1. Publish a payload violating the schema | Publish is rejected before reaching the broker | Ph8 Generate "KafkaProducer with schema validation" | `IMPLEMENTED` — `producer.spec.ts`, `schema-registry.client.spec.ts` |
| `TC-P08-UNIT-008` | Consumers process a repeated `event_id` exactly once | UNIT | Redis idempotency store mocked | 1. Deliver the same `event_id` twice | The handler runs once; the second delivery is skipped (Redis key TTL 24 h) | Ph8 Outbox/idempotency; §30.3 | `IMPLEMENTED` — `consumer.idempotency.spec.ts` |
| `TC-P08-UNIT-009` | Consumers validate the `tenant_id` header before processing | UNIT | Shared consumer group | 1. Deliver a message whose header tenant differs from the topic tenant | The message is rejected before the handler runs | §7.3 shared consumer subscription | `IMPLEMENTED` — `consumer.idempotency.spec.ts` |
| `TC-P08-UNIT-010` | The outbox writes in the same transaction as the business entity | UNIT | Outbox publisher | 1. Write an entity and its outbox row in one transaction; 2. Force a rollback | On rollback neither the entity nor the outbox row persists — and no event is emitted | Ph8 Outbox Pattern; §30.4 critical test | `IMPLEMENTED` — unit-covered in `packages/@cos/kafka/src/__tests__/outbox.spec.ts` and at **every** converted call site (each repository spec asserts the outbox INSERT went through the same tx handle as the business write; each service spec asserts the envelope handed to that write). The **rollback → no event** half is covered against a real PostgreSQL by `backend/test/outbox.integration.spec.ts`, which aborts a transaction after both writes and asserts neither row survives — plus the inverse (a failing outbox INSERT rolls the business row back) and the relay half (OutboxPoller publishes the committed row and marks it published) — §35.13 ESC-13 |
| `TC-P08-UNIT-011` | `OutboxPoller` publishes unpublished rows and marks them published | UNIT | Unpublished outbox rows; fake timers | 1. `jest.useFakeTimers()`; 2. `await jest.runAllTimersAsync()` | Rows are published then flagged `published = true` with `published_at` set | Ph8 Outbox; Rule 30 | `IMPLEMENTED` — `outbox.spec.ts` |
| `TC-P08-UNIT-012` | Retry uses 3 attempts with 1 s / 5 s / 30 s backoff, then DLQ | UNIT | Failing handler; fake timers | 1. Deliver a message that always fails; 2. Drain timers with `runAllTimersAsync()` | Exactly 3 retries at the specified delays, then publication to `{original-topic}.dlq` plus an observability alert | Ph8 DLQ; Rule 30 | `IMPLEMENTED` — `dlq.spec.ts` |
| `TC-P08-UNIT-013` | Kafka metrics counters are emitted | UNIT | Metrics module | 1. Produce, consume and fail a message | `kafka_messages_produced_total`, `kafka_messages_consumed_total`, `kafka_consumer_lag`, `kafka_dlq_depth` are updated | Ph8 Monitoring; Ph15 metrics | `IMPLEMENTED` — `metrics.spec.ts` |
| `TC-P08-UNIT-014` | Trace context propagates through Kafka headers | UNIT | Producer + consumer | 1. Publish inside an active span; 2. Consume | `trace_id` / `span_id` travel in the headers and the consumer creates a child span | QM-8; Ph8 Generate "OpenTelemetry trace propagation" | `IMPLEMENTED` — `producer.spec.ts` |
| `TC-P08-UNIT-015` | Schema evolution rejects forbidden changes | UNIT | Registered schema v1 | 1. Register a schema that renames a field; 2. Removes a field; 3. Changes a type; 4. Reorders enum values; 5. Adds an optional field with a default; 6. Appends an enum value | Cases 1–4 rejected; 5–6 accepted, under `BACKWARD_TRANSITIVE` | Ph8 Schema evolution rules; QM-9 | `IMPLEMENTED` — `schema-registry.client.spec.ts` |
| `TC-P08-INT-001` | A published event is received unchanged by the consumer | INT | `@testcontainers/kafka` single broker | 1. Publish an event; 2. Consume it | The consumed payload equals the published payload | Ph8 Generate integration test case (a) | `IMPLEMENTED` — `packages/@cos/shared/test/kafka/kafka.integration.spec.ts` |
| `TC-P08-INT-002` | The same `event_id` is processed exactly once end to end | INT | Kafka container | 1. Publish the same `event_id` twice; 2. Count handler invocations | Handler runs once (idempotency gate) | Ph8 Generate integration test case (b) | `IMPLEMENTED` — `kafka.integration.spec.ts` |
| `TC-P08-MAN-001` | Schema Registry enforces `BACKWARD_TRANSITIVE` | MAN | Registry reachable | 1. `curl http://schema-registry:8081/config` | `compatibility = BACKWARD_TRANSITIVE` | QM-9; Ph19 architecture check | `IMPLEMENTED` — `scripts/readiness/check-schema-registry.sh` |
| `TC-P08-MAN-002` | Every critical v1 schema is registered before first producer use | MAN | Registry reachable | 1. Run the schema-registry readiness script | All §32.4 event-table schemas are present; local `.avsc` files are valid JSON | QM-9; Ph8 Constraints | `IMPLEMENTED` — `scripts/readiness/check-schema-registry.sh` |
| `TC-P08-UNIT-016` | `@cos/shared` has no runtime import of a Node.js-only package | UNIT | Package source | 1. Enumerate runtime (non-`import type`) imports in `packages/@cos/shared/src`; 2. Cross-check `dependencies` for Node-only packages | No Node-only runtime import — `@cos/shared` is bundled by Metro for React Native | Rule 34(a)(b)(d); Rule 33 | `IMPLEMENTED` — ADR-055 split: `@cos/shared` is type-only (0 runtime imports, sole dependency `@cos/types`); the Node-only SDK moved to `@cos/kafka` |

**Phase 8 exit gate:** `allowAutoTopicCreation: false`; DLQ and replay present; event delivery
> 99.9% verified (`00_master` Phase Register — Phase 8 Exit).

---

### 35.10.9 Phase 9 — File + Document System

**Objective:** file and document storage with OCR intake.

**Spec references:** `00_master` §Phase 9 (file constraints, storage, entities, APIs, OpenSearch
indexing, Generate); QM-4 (MIME validation, ClamAV); QM-10 (error taxonomy).

**Scope in:** multipart upload, size and MIME validation, MinIO storage and tenant bucket isolation,
signed URLs, antivirus scan and quarantine, soft/hard delete, OpenSearch indexing, file events.
**Scope out:** OCR extraction itself (Phase 11); photo capture UX (Phase 10).

> **Antivirus scope resolved (product owner, 2026-08-22).** Phase 9's `Generate:` line
> "Antivirus hook (ClamAV integration — deferred…)" contradicts the fully specified ClamAV behaviour
> in the same Phase 9 block and the shipped implementation. AV is **in scope**; the stale
> `00_master` line is corrected in the same commit as this document (§35.13 ESC-07).

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P09-UNIT-001` | Per-type size limits are enforced at the boundary | UNIT | Validation module | 1. Upload an image of 20 MB and 20 MB + 1 byte; 2. Repeat for PDF at 100 MB, CAD at 200 MB, video at 1,024 MB | The exact limit passes; one byte over is rejected with `COS-FILE-003` (422) | Ph9 File Constraints; QM-10 | `IMPLEMENTED` — `services/file-service/src/__tests__/validation.spec.ts` |
| `TC-P09-UNIT-002` | Only allowed MIME types are accepted | UNIT | Validation module | 1. Upload each allowed MIME type; 2. Upload a disallowed one | Allowed types pass; others rejected with `COS-FILE-002` (422) | Ph9 Allowed MIME types | `IMPLEMENTED` — `validation.spec.ts`, `errors.spec.ts` |
| `TC-P09-UNIT-003` | Executable uploads are blocked | UNIT | Validation module | 1. Upload `.exe`, `.sh`, `.bat`, `.js` | Each rejected with `COS-FILE-004` (422) — blocked at upload | Ph9 "NOT allowed"; QM-4 | `IMPLEMENTED` — `validation.spec.ts` |
| `TC-P09-UNIT-004` | MIME type is validated server-side, not from the client header alone | UNIT | Upload with a spoofed `Content-Type` | 1. Upload an executable declaring `image/jpeg` | Rejected — server-side detection governs | QM-4 file uploads | `IMPLEMENTED` — `validation.spec.ts` |
| `TC-P09-UNIT-005` | Object keys follow `{year}/{month}/{file_id}/{original_filename}` | UNIT | MinIO service | 1. Upload a file; 2. Inspect `stored_key` | Key matches the pattern; bucket is `cos-{tenant_id}` | Ph9 Storage | `IMPLEMENTED` — `minio.service.spec.ts` |
| `TC-P09-UNIT-006` | Signed download URLs expire after 1 hour | UNIT | Stored file | 1. Generate a signed URL; 2. Inspect its expiry | TTL = 1 h (configurable per file type) | Ph9 Storage | `IMPLEMENTED` — `minio.service.spec.ts` |
| `TC-P09-UNIT-007` | Upload streams through the service — no direct client-to-MinIO upload | UNIT | Upload route | 1. Inspect the upload path | The service receives the multipart stream and writes to MinIO; no client-side presigned PUT is issued | Ph9 Storage | `IMPLEMENTED` — `routes-helpers.spec.ts` |
| `TC-P09-UNIT-008` | New files start in `PENDING_SCAN` | UNIT | Upload | 1. Upload a file; 2. Read `file_status` immediately | `PENDING_SCAN` | Ph9 File status | `IMPLEMENTED` — `db.service.spec.ts` |
| `TC-P09-UNIT-009` | A clean scan transitions the file to `CLEAN` | UNIT | AV scanner mocked clean | 1. Run the scan | `file_status = CLEAN`; `ScanResult.clean = true` | Ph9 Antivirus; ESC-07 | `IMPLEMENTED` — `antivirus.service.spec.ts` |
| `TC-P09-UNIT-010` | A detected threat quarantines the file and emits the event | UNIT | AV scanner mocked infected | 1. Run the scan | `file_status = QUARANTINED`; the object is moved to `cos-quarantine/{tenant_id}/`; `file.document.quarantined.v1` is emitted with `threat_type`; SYSTEM_ADMIN is notified | Ph9 Antivirus; ESC-07 | `IMPLEMENTED` — `antivirus.service.spec.ts`, `kafka.service.spec.ts` |
| `TC-P09-UNIT-011` | Quarantine recovery is SYSTEM_ADMIN-only | UNIT | Quarantined file | 1. Attempt recovery as each role | Only SYSTEM_ADMIN succeeds, via the platform admin API | Ph9 Antivirus | `IMPLEMENTED` — `antivirus.service.spec.ts` |
| `TC-P09-UNIT-012` | Delete is soft; hard delete occurs 30 days later | UNIT | Stored file; fake timers | 1. `DELETE /api/v1/files/:fileId`; 2. Read the record; 3. Advance the cleanup workflow past 30 days | Step 2: `deleted_at` set, object still present; step 3: object and record removed | Ph9 File retention | `IMPLEMENTED` — `cleanup.activities.spec.ts` |
| `TC-P09-UNIT-013` | A soft-deleted file returns 404 on GET by id | UNIT | Soft-deleted file | 1. `GET /api/v1/files/:fileId` | 404 with `COS-FILE-006` | §30.3 soft-delete invariant; §30.4 critical test | `IMPLEMENTED` — `db.service.spec.ts`, `errors.spec.ts` |
| `TC-P09-UNIT-014` | Missing tenant/user headers are rejected | UNIT | Route handler | 1. Call an endpoint without `X-Tenant-ID` / `X-User-ID` | 401 with `COS-FILE-001` | `docs/api/error-codes.md`; QM-10 | `IMPLEMENTED` — `errors.spec.ts` |
| `TC-P09-UNIT-015` | ZIP extraction is sandboxed and guarded | UNIT | Uploaded archive | 1. Extract an archive containing a path-traversal entry, an over-ratio entry and an excessive entry count | Each guard rejects its case; surviving entries are re-validated for MIME, size and AV before individual file records are created | Ph9 Archives decision | `IMPLEMENTED` — `zip-extraction.service.spec.ts`, `zip-extraction.activities.spec.ts` |
| `TC-P09-UNIT-016` | Upload indexes the file in OpenSearch | UNIT | OpenSearch client mocked | 1. Complete an upload | A document is indexed into `files-{tenant_id}` with filename, MIME, entity type/id, uploader, timestamp and metadata pairs | Ph9 OpenSearch Indexing | `IMPLEMENTED` — `opensearch.service.spec.ts` |
| `TC-P09-UNIT-017` | Upload emits `file.document.uploaded.v1` | UNIT | Upload | 1. Complete an upload; 2. Inspect the event | Payload `{ file_id, tenant_id, entity_type, entity_id, mime_type }` | Ph9 Kafka producers | `IMPLEMENTED` — `kafka.service.spec.ts` |
| `TC-P09-INT-001` | Upload → MinIO → metadata → signed URL end to end | INT | MinIO + PostgreSQL containers | 1. Upload; 2. Confirm the object in MinIO; 3. Read metadata; 4. Fetch and use a signed URL | Every stage succeeds and the download returns the original bytes | Ph9 Generate "Integration tests" | `IMPLEMENTED` — `services/file-service/src/__tests__/integration/routes.integration.spec.ts` |
| `TC-P09-ISO-001` | A Tenant A signed URL cannot read a Tenant B object | ISO | Two tenant buckets | 1. Generate a signed URL as Tenant A; 2. Use it against a Tenant B object key | 403 Forbidden | §30.6 S3 row | `IMPLEMENTED` — `services/file-service/test/minio-tenant-isolation.integration.spec.ts` drives a real MinIO container: tenant A reads its own object through its presigned URL, but the same URL repointed at tenant B's bucket (or at another key in its own) is refused, and an unsigned GET on tenant B's bucket serves nothing. A mocked S3 client cannot show this — it returns whatever it is told (§35.13 ESC-30) |
| `TC-P09-LOAD-001` | Concurrent uploads meet the p95 budget | LOAD | Staging | 1. Run 20 VUs uploading 5 MB files for 5 minutes | p95 < 10 s; error rate < 0.5% | Ph18 k6 Scenario 2 | `IMPLEMENTED` — `tests/load/file-upload.js`, `scripts/loadtest/file-upload.js` |
| `TC-P09-SEC-001` | File upload endpoints are limited to 20 req/min per user | SEC | Throttler configured | 1. Issue a 21st upload request within 60 s | 429 with `Retry-After` | QM-7; §05 §5.5 | `IMPLEMENTED` — covered by the Phase 16 ThrottlerGuard suite |

**Phase 9 exit gate:** tenant-scoped object keys and signed URLs; ClamAV scan with quarantine on
threat (`00_master` Phase Register — Phase 9 Exit).

---

### 35.10.10 Phase 10 — Mobile Offline Engine

**Objective:** the offline-first mobile application and its sync engine.

**Spec references:** `00_master` §Phase 10 (platform decision, role navigation, Generate for React
Native and Web, local schema, sync architecture); §17.4 (offline write scope), §17.6 (sync priority),
§17.7 (size limits), §17.9 (delta sync), §17.10 / ADR-048 (Drizzle on expo-sqlite);
§30.7 (offline sync testing); §20.6–20.7 (web pages); ADR-050 (mobile Path B).

**Scope in:** local Drizzle/expo-sqlite schema, `SyncManager`, `ConflictHandler`, delta sync,
background sync, photo upload queue, hooks and stores, role-based screens, web PWA offline layer.
**Scope out:** server-side conflict resolution (Phase 6); notification delivery (Phase 20).

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P10-UNIT-001` | `processQueue` sends only `PENDING` items | UNIT | Queue with mixed statuses | 1. Run `processQueue()` | Only `PENDING` rows are transmitted | Ph10 SyncManager | `IMPLEMENTED` — `apps/mobile/src/sync/__tests__/SyncManager.spec.ts` |
| `TC-P10-UNIT-002` | A successful send marks the item `SYNCED` | UNIT | Pending item | 1. Send successfully; 2. Read the row | `status = SYNCED` | Ph10 SyncManager | `IMPLEMENTED` — `SyncManager.spec.ts` |
| `TC-P10-UNIT-003` | Failures increment `retry_count`; 5 failures trigger `handleExhaustion` | UNIT | Failing transport; fake timers | 1. Fail the send 5 times using `await jest.runAllTimersAsync()` | `retry_count` reaches 5 then `handleExhaustion(item)` is invoked | Ph10 SyncManager; Rule 30 | `IMPLEMENTED` — `SyncManager.spec.ts` |
| `TC-P10-UNIT-004` | Exhaustion behaviour is entity-specific | UNIT | Exhausted items of each type | 1. Exhaust a safety incident, attendance record, inspection result, material consumption, task progress update, site report draft and equipment usage log | Safety/attendance/inspection/material → published to `platform.sync.exhausted`, admin review queue, push alert per §17.2, preserved on device. Task progress/site report draft/equipment usage → sync attempt discarded, user notified in-app, preserved on device | Ph10 `handleExhaustion`; §17.2 | `IMPLEMENTED` — `SyncManager.spec.ts` |
| `TC-P10-UNIT-005` | Records are never deleted from the device until synced or admin-resolved | UNIT | Exhausted item | 1. Inspect local storage after exhaustion | The record remains on the device | Ph10 Tenant admin review queue | `IMPLEMENTED` — `SyncManager.spec.ts` |
| `TC-P10-UNIT-006` | Client applies `ACCEPTED` / `CONFLICT_FLAGGED` / `CONFLICT_REJECTED` correctly | UNIT | Server responses of each type | 1. Handle each response | `ACCEPTED` → local `SYNCED`; `CONFLICT_FLAGGED` → local `sync_status = CONFLICT` with a UI badge; `CONFLICT_REJECTED` → local payload replaced by the server version and the user notified | Ph10 Conflict Handling (client-side) | `IMPLEMENTED` — `ConflictHandler.spec.ts` |
| `TC-P10-UNIT-007` | Reconnect flushes in the exact §17.6 priority order | UNIT | Queue containing all 8 categories | 1. Trigger a reconnect flush; 2. Record the transmission order | 1 safety incidents → 2 attendance → 3 inspections → 4 task progress → 5 site reports → 6 material → 7 equipment usage → 8 photo/media (last) | §17.6; QM-9 | `IMPLEMENTED` — `syncPriority.spec.ts` |
| `TC-P10-UNIT-008` | Local database is capped at 500 MB with LRU eviction | UNIT | DB near the cap | 1. Exceed 500 MB | LRU eviction runs and clears the drawing cache first | §17.7; §30.7 scenario | `IMPLEMENTED` — `localDbLimit.spec.ts`, `drawingCacheLru.spec.ts` |
| `TC-P10-UNIT-009` | Drawing cache is capped at 200 MB | UNIT | Cache near the cap | 1. Add drawings beyond 200 MB | Least-recently-used drawings are evicted | §17.7 | `IMPLEMENTED` — `drawingCacheLru.spec.ts` |
| `TC-P10-UNIT-010` | Photo queue warns at 80 and caps at 100 | UNIT | Queue filling | 1. Enqueue the 80th photo; 2. Enqueue the 101st | 80 → user warning; 101 → rejected | §17.7 | `IMPLEMENTED` — `photoQueueLimit.spec.ts` |
| `TC-P10-UNIT-011` | Sync batches are capped at 500 records per cycle | UNIT | Queue > 500 items | 1. Run one sync cycle | At most 500 records are sent | §17.7 | `IMPLEMENTED` — `SyncManager.spec.ts` |
| `TC-P10-UNIT-012` | Delta sync pulls all six entity types and advances the cursor | UNIT | Server delta available | 1. Run `runDeltaSync()` | `GET /sync/delta` is called for task, site_report, issue, attendance, safety and material; rows are upserted into the local Drizzle tables; `syncStore.lastSyncAt` advances | §17.9; Ph10 Generate (DeltaSyncClient superseded by `runDeltaSync`) | `IMPLEMENTED` — `runDeltaSync.spec.ts`, `DeltaSyncClient.spec.ts` |
| `TC-P10-UNIT-013` | Deleted ids from the delta are removed locally | UNIT | Delta containing `deleted[]` | 1. Apply the delta | The listed local rows are removed | Ph10 Delta Sync | `IMPLEMENTED` — `runDeltaSync.spec.ts` |
| `TC-P10-UNIT-014` | Background sync processes at most 20 items and respects battery saver | UNIT | Background task; battery mocked | 1. Run with a full queue; 2. Run with battery < 15% | Run 1 processes ≤ 20 items; run 2 is skipped | Ph10 Background Sync | `IMPLEMENTED` — `BackgroundSyncTask.spec.ts` |
| `TC-P10-UNIT-015` | Photos upload one at a time with 3 retries then `UPLOAD_FAILED` | UNIT | Photo queue; failing transport | 1. Run the queue with a permanently failing upload | Uploads are serialised in order; after 3 attempts the photo is marked `UPLOAD_FAILED` | Ph10 Media Cache | `IMPLEMENTED` — `PhotoUploadQueue.spec.ts` |
| `TC-P10-UNIT-016` | Offline writes outside the §17.4 list are refused client-side | UNIT | Store under test | 1. Attempt an offline write for a PO, vendor invoice, budget line, vendor master or permission change | The write is refused; the entity is read-cache only | §17.4; QM-9 | `IMPLEMENTED` — `syncStore.spec.ts` |
| `TC-P10-UNIT-017` | Hooks expose sync state to the UI | UNIT | Store populated | 1. Render `useSyncStatus()`, `usePendingCount()`, `useConflicts()` | Each returns the current status, pending count and conflict list | Ph10 Generate "React hooks" | `IMPLEMENTED` — `apps/mobile/src/hooks/__tests__/` (3 specs) |
| `TC-P10-UNIT-018` | React Native never uses IndexedDB, and the web app never uses expo-sqlite | UNIT | Both codebases | 1. Search `apps/mobile` for IndexedDB usage; 2. Search `apps/web` for `expo-sqlite` | Neither appears | Ph10 platform rules; file 02 Offline Sync constraints | `IMPLEMENTED` — `tests/architecture/invariants.spec.ts` asserts `apps/mobile` references no IndexedDB and `apps/web` references no expo-sqlite / WatermelonDB (§35.13 ESC-27) |
| `TC-P10-E2E-001` | Offline check-in queues and syncs on reconnect | E2E | Detox build with `EXPO_PUBLIC_E2E=1` | 1. Deep-link `cos://e2e/network?online=0`; 2. Check in; 3. Assert the queued state; 4. Deep-link `online=1`; 5. `await waitFor(...).toBeVisible()` on the synced indicator | Record is queued offline and synced after reconnect | §30.5 Mobile #1; §30.7 conventions | `IMPLEMENTED` — `apps/mobile/e2e/offline-checkin.spec.ts` |
| `TC-P10-E2E-002` | Offline inspection with a photo syncs on reconnect | E2E | Detox build | 1. Go offline; 2. Complete a checklist and attach a photo; 3. Reconnect | Inspection and photo both sync | §30.5 Mobile #2 | `IMPLEMENTED` — `apps/mobile/e2e/offline-inspection.spec.ts` |
| `TC-P10-E2E-003` | Sync conflict on `progress_percent` resolves Max-wins | E2E | Two devices offline on the same task | 1. Set 40 on device A and 60 on device B while offline; 2. Reconnect both | The higher value survives on both devices; progress never decreases | §30.5 Mobile #3; Ph6 tasks strategy | `IMPLEMENTED` — `apps/mobile/e2e/sync-conflict.spec.ts` |
| `TC-P10-MAN-001` | Every role has its specified bottom navigation and screens | MAN | App build | 1. Log in as each of the roles listed in Phase 10; 2. Compare the tab bar and screens against the spec | Each role's navigation matches exactly; RBAC is driven by the JWT role claim | Ph10 Role-based navigation | `PLANNED` — no automated assertion |
| `TC-P10-MAN-002` | Both auth paths render on mobile | MAN | App build | 1. Open the login screen | Path A (phone + OTP) and Path B (email/password via Keycloak OIDC) are both available, with role-based post-login routing | Ph10 Generate Auth; ADR-050; §20.6.1 | `PLANNED` — no automated assertion |
| `TC-P10-MAN-003` | Every screen exposes the testIDs the Detox specs consume | MAN | App build | 1. Cross-check each `e2e/*.spec.ts` selector against the screens | No Detox selector is missing from the UI | Ph10 Generate | `IMPLEMENTED` (indirectly) — the Detox suite passes only when the testIDs exist |

**Phase 10 exit gate:** Detox E2E green; offline sync success > 98%; three conflict-resolution
strategies implemented (`00_master` Phase Register — Phase 10 Exit).

---

### 35.10.11 Phase 11 — AI Foundation

**Objective:** the RAG and LLM Gateway foundation.

**Spec references:** `00_master` §Phase 11 (provider decisions, AI services, token tracking, prompt
management, Generate, stubs); §22.3 (operating modes), §22.6 (provider resolutions), §22.7
(routing, RAG, gateway), §22.8 (OWASP LLM), §22.10 (RAG eval, token cap, semantic cache);
§30.11 Layer A (RAG retrieval metric).

**Scope in:** LLM/Embedding provider interfaces and stubs, model routing table, RAG hybrid retrieval
and RRF fusion, chunking, OCR pipeline, token usage logging, prompt template loading, response cache.
**Scope out:** report generation and the hallucination guard (Phase 12); model training (Phase 23).

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P11-UNIT-001` | No caller invokes the OpenAI SDK directly | UNIT | AI service sources | 1. Search for direct SDK imports outside the provider implementation | Every LLM call goes through `LLMProvider` | Rule "Never call OpenAI SDK directly"; Ph11 | `IMPLEMENTED` — `tests/architecture/invariants.spec.ts` scans every workspace except `services/ai-gateway` for an `openai` / `@anthropic-ai/*` / `@google/generative-ai` / `cohere-ai` import (§35.13 ESC-27) |
| `TC-P11-UNIT-002` | `StubLLMProvider` raises `NotImplementedError` | UNIT | Stub provider | 1. Call `complete(...)` | `NotImplementedError` is raised — no fabricated response | Ph11 Generate "LLMProvider stub" | `IMPLEMENTED` — `services/ai-gateway/tests/test_stub_providers.py` |
| `TC-P11-UNIT-003` | `EmbeddingProvider` reports 1,536 dimensions | UNIT | Embedding provider | 1. Read `dimensions` | Returns 1536 (text-embedding-3-small) | Ph11 Embedding Model | `IMPLEMENTED` — `services/ai-embedding-worker/tests/test_stub_providers.py` |
| `TC-P11-UNIT-004` | Model routing is table-driven, never hardcoded | UNIT | Routing config loaded from YAML/env | 1. Route `report-generation`, `risk-analysis`, `document-extraction`; 2. Route `summarization`, `classification`, `autocomplete` | Group 1 → POWERFUL tier; group 2 → FAST tier; no model name appears literally in source | Ph11 Model routing; §22.7 RT-001 | `PLANNED` — routing-table assertion not located |
| `TC-P11-UNIT-005` | Documents chunk at 500 characters with 100 overlap | UNIT | Chunking utility | 1. Chunk a long document | Recursive character splitter, `chunk_size=500`, `overlap=100` | Ph11 Chunking strategy | `IMPLEMENTED` — `services/ai-embedding-worker/tests/test_chunking.py` |
| `TC-P11-UNIT-006` | A site report is treated as a single chunk | UNIT | Chunking utility | 1. Chunk a typical site report | One chunk is produced | Ph11 Chunking strategy | `IMPLEMENTED` — `test_chunking.py` |
| `TC-P11-UNIT-007` | Hybrid retrieval fuses keyword and vector results by RRF | UNIT | OpenSearch + pgvector backends mocked | 1. Query with results from both backends | Both backends are queried and the result set is fused by Reciprocal Rank Fusion | Ph11 RAG Pipeline; §22.7 RAG-001 | `IMPLEMENTED` — `services/ai-gateway/tests/test_rag_retrieval.py`, `test_rag_backends.py` |
| `TC-P11-UNIT-008` | Context assembly caps at top-k 5 and 4,000 tokens | UNIT | Retrieval returning more than 5 chunks | 1. Assemble context | At most 5 chunks and 4,000 tokens are assembled | Ph11 Context assembly | `IMPLEMENTED` — `test_rag_retrieval_service.py` |
| `TC-P11-UNIT-009` | Every LLM call is logged to `ai_usage_logs` | UNIT | Token logger middleware | 1. Perform a completion | A row records tenant, caller, template, model, prompt/completion/total tokens and latency | Ph11 Token Tracking Schema | `IMPLEMENTED` — `test_transcribe_metering.py` (metering path) |
| `TC-P11-UNIT-010` | Prompts load from template files, never from source literals | UNIT | Prompt loader | 1. Render a template; 2. Search source for inline prompt strings | Templates load from `ai/prompts/*.j2` with Pydantic-typed variables; no hardcoded prompt in code | Ph11 Prompt Template Management | `IMPLEMENTED` — `ai/prompts/` (4 templates verified) |
| `TC-P11-UNIT-011` | Responses are cached in Redis with a per-template TTL | UNIT | Redis mocked | 1. Repeat an identical request within the TTL | The second call is served from cache | Ph11 Generate "Redis response cache" | `IMPLEMENTED` — `services/ai-gateway/cache` |
| `TC-P11-UNIT-012` | OCR extracts text from scanned PDFs and images | UNIT | pytesseract + pdf2image | 1. Process a scanned PDF; 2. Process a JPEG/PNG | `{ file_id, extracted_text, confidence_score }` is returned for both | Ph11 OCR Pipeline | `IMPLEMENTED` — `services/ai-ocr-pipeline/tests/test_ocr_pipeline.py` |
| `TC-P11-UNIT-013` | AI endpoints sit behind feature flags | UNIT | Flag service | 1. Disable the AI flag; 2. Call the endpoint | The endpoint is disabled within the flag evaluation window; the registry default applies when `UNLEASH_URL` is unset | QM-15 mandatory flag scenarios; ADR-049 | `IMPLEMENTED` — `services/ai-gateway/tests/test_flags.py` |
| `TC-P11-AI-001` | RAG retrieval achieves Recall@3 ≥ 0.8 | AI | 50-question evaluation set | 1. Run each query; 2. Verify the top-3 retrieved chunks | Recall@3 ≥ 0.8 | §30.11 Layer A | `PLANNED` — evaluation set not located |
| `TC-P11-AI-002` | OCR character error rate < 5% | AI | 100 construction drawing samples | 1. Run OCR; 2. Compare against ground truth | CER < 5% | §30.11 Layer A | `PLANNED` — sample corpus not located |
| `TC-P11-AI-003` | Voice transcription word error rate < 10% | AI | 50 Thai site recordings | 1. Transcribe; 2. Compare against transcripts | WER < 10% | §30.11 Layer A | `IMPLEMENTED` (harness) — `services/ai-transcription-pipeline/tests/test_wer.py`; corpus not located |
| `TC-P11-INT-001` | Full RAG query pipeline runs on the stub provider | INT | Stub providers wired | 1. Issue `POST /api/v1/rag/query` | The pipeline completes without any real provider API call | Ph11 Generate "Integration tests" | `IMPLEMENTED` — `services/ai-gateway/tests/test_integration_rag.py`, `test_rag_backends_integration.py` |
| `TC-P11-MAN-001` | Per-tenant token/cost cap and semantic cache are enforced at the gateway | MAN | Gateway configured | 1. Exceed a tenant's token budget; 2. Repeat a semantically equivalent query | The budget cap blocks further spend (COST-001); the semantic cache serves the repeat within the similarity threshold | §22.10; Ph11 Exit | `PLANNED` — enforcement assertion not located |
| `TC-P11-MAN-002` | An OWASP LLM Top-10 row exists for every AI surface | MAN | — | 1. Cross-check each AI endpoint against the §22.8 register | Every surface has a row | §22.8; Ph11 Exit | `PLANNED` — cross-check not automated |

**Phase 11 exit gate:** RAG pipeline and HallucinationGuard live; an OWASP LLM row per AI surface;
per-tenant token/cost cap and semantic cache at the gateway (`00_master` Phase Register — Phase 11 Exit).

---

### 35.10.12 Phase 12 — AI Report Assistant

**Objective:** AI-assisted report generation, gated by the hallucination guard.

**Spec references:** `00_master` §Phase 12 (hallucination guard, capabilities, APIs, orchestration,
entity, Generate, Constraints); §22.3 (operating modes, LangGraph deferral); §31.6 (AI report p95);
§30.11 Layer A (report generation metric).

**Scope in:** the five hallucination-guard checks, four report capabilities, the six-step
orchestration pipeline, report persistence, token budget enforcement.
**Scope out:** autonomous execution (Mode C — specified but not implemented); reranking (stub).

> **Divergence recorded — §35.13 ESC-09.** Phase 12's `Generate:` item "LangGraph orchestration
> chain for each report type" contradicts the same phase's Orchestration section ("plain Python
> sequential pipeline… LangGraph deferred to LAYER-C-001") and the `context.md` Never rule
> "Implement LangGraph in Phase 11–12". Test cases below are designed against the **sequential
> pipeline**, which is the position held by both the spec (§22.3) and the Never rule.

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P12-UNIT-001` | Guard check 1 — summary length must be 50–500 words | UNIT | Guard under test | 1. Submit a 49-word summary; 2. A 50-word summary; 3. A 500-word summary; 4. A 501-word summary | 49 and 501 rejected; 50 and 500 accepted | Ph12 Hallucination Guard #1 | `IMPLEMENTED` — `services/ai-gateway/tests/test_hallucination_guard.py` |
| `TC-P12-UNIT-002` | Guard check 2 — every factual claim must cite a source | UNIT | Structured output | 1. Submit an output with an uncited claim | Rejected — source attribution is required in the structured output | Ph12 Hallucination Guard #2 | `IMPLEMENTED` — `test_hallucination_guard.py` |
| `TC-P12-UNIT-003` | Guard check 3 — confidence is parsed from the structured output | UNIT | Structured output with `confidence` | 1. Parse the response | Confidence is read from the single structured response; no second LLM call is made to estimate it | Ph12 Confidence score implementation | `IMPLEMENTED` — `test_hallucination_guard.py` |
| `TC-P12-UNIT-004` | Guard check 4 — confidence < 0.7 returns the fallback shape | UNIT | Output with `confidence = 0.69` | 1. Run the guard | Returns `{ status: "LOW_CONFIDENCE", summary: null, message: "Insufficient data for reliable summary", raw_data_available: true }` | Ph12 Hallucination Guard #4 | `IMPLEMENTED` — `test_hallucination_guard.py` |
| `TC-P12-UNIT-005` | Confidence boundary at exactly 0.7 passes | UNIT | Output with `confidence = 0.70` | 1. Run the guard | Accepted — the threshold is `< 0.7` | Ph12 Hallucination Guard #4 | `IMPLEMENTED` — `test_hallucination_guard.py` |
| `TC-P12-UNIT-006` | Guard check 5 — data absent from context is flagged, not returned | UNIT | Output containing an out-of-context fact | 1. Run the guard | Flagged `POTENTIAL_HALLUCINATION` and logged; the flag is **not** surfaced to the user | Ph12 Hallucination Guard #5 | `IMPLEMENTED` — `test_hallucination_guard.py` |
| `TC-P12-UNIT-007` | The guard cannot be bypassed on any AI report endpoint | UNIT | All four report routes | 1. Call each endpoint; 2. Assert the guard runs before the response is returned | The guard executes on every path — it is mandatory | Ph12 Constraints; Rule "Skip hallucination guard" prohibition | `IMPLEMENTED` — `test_integration_reports.py` |
| `TC-P12-UNIT-008` | Every report response carries a confidence score | UNIT | Each report type | 1. Generate each of the four report types | `confidence` is present in every response | Ph12 Constraints | `IMPLEMENTED` — `test_integration_reports.py` |
| `TC-P12-UNIT-009` | Daily site report summary uses its specified inputs and output shape | UNIT | 7 days of reports, open issues, manpower logs | 1. Generate the site summary | Output `{ summary, key_issues, manpower_trend, confidence, data_gaps }`; template `report-daily-summary-v1.j2` | Ph12 Capability 1 | `IMPLEMENTED` — `ai/prompts/report-daily-summary-v1.j2`; `test_integration_reports.py` |
| `TC-P12-UNIT-010` | Procurement status summary output shape | UNIT | Open RFQs, pending POs, overdue invoices | 1. Generate | `{ summary, overdue_count, risk_items, confidence, data_gaps }`; template `report-procurement-status-v1.j2` | Ph12 Capability 2 | `IMPLEMENTED` — `ai/prompts/report-procurement-status-v1.j2` |
| `TC-P12-UNIT-011` | Executive summary output shape | UNIT | Project health, procurement and site summaries | 1. Generate | `{ executive_summary, risk_flags, recommendations, confidence }`; template `report-executive-v1.j2` | Ph12 Capability 3 | `IMPLEMENTED` — `ai/prompts/report-executive-v1.j2` |
| `TC-P12-UNIT-012` | Delay-risk thresholds map projected days to the correct level | UNIT | Delay risk calculator | 1. Evaluate 1, 2, 3, 6, 7, 13, 14 projected delay days | 1–2 → LOW; 3–6 → MEDIUM; 7–13 → HIGH; 14+ → CRITICAL | Ph12 Capability 4 thresholds | `IMPLEMENTED` — `ai/prompts/report-delay-risk-v1.j2`; `test_integration_reports.py` |
| `TC-P12-UNIT-013` | Delay risk falls back to `end_date` when `estimated_completion_date` is null | UNIT | Project without a PM estimate | 1. Generate the delay-risk report | The planned `end_date` is used as the basis | Ph12 Capability 4 input | `IMPLEMENTED` — `test_integration_reports.py` |
| `TC-P12-UNIT-014` | Delay-risk output carries the advisory disclaimer | UNIT | Delay-risk report | 1. Generate | The response includes "AI-generated estimate — verify with project schedule" | Ph12 Capability 4 output | `IMPLEMENTED` — `test_integration_reports.py` |
| `TC-P12-UNIT-015` | Token budget is capped at 4,000 input / 1,000 output | UNIT | Oversized context | 1. Assemble a context exceeding 4,000 tokens | The context is truncated or the request refused; output is capped at 1,000 tokens | Ph12 Generate "Token budget enforcement" | `IMPLEMENTED` — `services/ai-gateway/tests/test_token_budget_and_loader.py` pins MAX_INPUT_TOKENS=4000 / MAX_OUTPUT_TOKENS=1000 and covers `trim_context` on both sides of its sentence-boundary threshold (§35.13 ESC-24) |
| `TC-P12-UNIT-016` | Generated reports are persisted with model and token metadata | UNIT | Successful generation | 1. Generate; 2. Read `ai_generated_reports` | Row carries `report_type`, `content` (JSONB), `confidence`, `model_used`, `tokens_used`, `generated_by` | Ph12 entity; Generate "Report persistence service" | `IMPLEMENTED` — `test_integration_reports.py` |
| `TC-P12-UNIT-017` | Raw LLM errors never reach the client | UNIT | Provider raising an error | 1. Force a provider failure | A graceful typed error is returned; no provider stack trace or internal path is exposed | Ph12 Constraints; QM-10 | `IMPLEMENTED` — `test_integration_reports.py` |
| `TC-P12-UNIT-018` | AI output triggers no autonomous action in other services | UNIT | Report generation | 1. Generate every report type; 2. Inspect emitted commands | All output is advisory; no state transition, financial action or deletion is triggered | Ph12 Constraints; §22.3 Mode C prohibition | `IMPLEMENTED` — `tests/architecture/invariants.spec.ts` asserts the report pipeline makes no outbound HTTP/Kafka call and that no backend consumer subscribes to an `ai.*` topic (§35.13 ESC-27) |
| `TC-P12-INT-001` | Full generation pipeline on the stub provider | INT | `StubLLMProvider` wired | 1. Run RAG retrieval → context assembly → generation → guard → persistence → response | The six steps complete with no real API call | Ph12 Generate "Integration tests" | `IMPLEMENTED` — `test_integration_reports.py` |
| `TC-P12-AI-001` | Report generation scores ROUGE-L ≥ 0.7 against golden examples | AI | 50 golden examples (Thai + English) | 1. Generate for each; 2. Score against the reference | ROUGE-L ≥ 0.7 and no hallucinated BOQ items | §30.11 Layer A | `PLANNED` — golden set not located |
| `TC-P12-LOAD-001` | AI report generation meets its latency budget | LOAD | Staging | 1. Run 10 VUs against `POST /api/v1/ai/reports/site-summary` for 5 minutes | p95 < 15 s and error rate < 1% (Ph18 k6 Scenario 4). Note: the production SLO is p95 < 5 s (§31.6 / QM-6) — the load-test criterion is deliberately looser | Ph18 k6 Scenario 4; §31.6 | `IMPLEMENTED` — `tests/load/ai-report.js` |

**Phase 12 exit gate:** AI report p95 < 5 s (§31.6); RAG quality evaluation passes on the eval set
(§22.10); output is advisory and audited (`00_master` Phase Register — Phase 12 Exit).

---

### 35.10.13 Phase 13 — Knowledge Graph

**Objective:** the construction knowledge graph.

**Spec references:** `00_master` §Phase 13 (sync strategy, node labels, relationships, queries, APIs,
Generate); §12 (knowledge graph); §7.3 / §15.6 (topic regex); §32.4 (event payloads).

**Scope in:** the Go ingestion worker, event→Cypher mapping, node/relationship schema, uniqueness
constraints, graph query APIs, full rebuild.
**Scope out:** graph ML inference (Phase 23); digital twin relationships (Phase 24).

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P13-UNIT-001` | Each event maps to the correct Cypher MERGE | UNIT | Mapper under test | 1. Map `project.created`, `boq.*`, `procurement.*`, `site.*`, `finance.*`, `construction.delay.detected.v1` | Every event produces the specified `MERGE` for its node label and relationships | Ph13 Generate "Relationship mapper"; Generate "Unit tests" | `IMPLEMENTED` — `services/kg-ingestion-worker/tests/unit/mapper_test.go` |
| `TC-P13-UNIT-002` | Ingestion is idempotent — replay creates no duplicates | UNIT | Mapper + Neo4j driver mocked | 1. Apply the same event twice | `MERGE` semantics yield a single node/relationship | Ph13 Exit "KG ingestion idempotent" | `IMPLEMENTED` — `mapper_test.go` |
| `TC-P13-UNIT-003` | `(:Delay)` uses `event_id` as its MERGE key | UNIT | Two deliveries of one delay event | 1. Ingest twice | One `(:Delay)` node keyed by `delay_id` = envelope `event_id` | Ph13 `(:Delay)` node | `IMPLEMENTED` — `mapper_test.go` |
| `TC-P13-UNIT-004` | A project-level delay creates only the project relationship | UNIT | Delay event with `task_id = null` | 1. Ingest | `(:Delay)-[:IMPACTS]->(:Project)` exists; no `-[:IMPACTS]->(:Task)` is created | Ph13 Relationships | `IMPLEMENTED` — `mapper_test.go` |
| `TC-P13-UNIT-005` | `(:Task)` and `(:Material)` both map from `boq_item_id` | UNIT | BOQ events | 1. Ingest a BOQ item | `Task.task_id` and `Material.material_id` both derive from `boq_item_id` | Ph13 node labels | `IMPLEMENTED` — `mapper_test.go` |
| `TC-P13-UNIT-006` | `(:Contract)` maps from an APPROVED purchase order | UNIT | PO approved event | 1. Ingest | `Contract.contract_id = po_id`; no separate contract source is invented | Ph13 `(:Contract)` | `IMPLEMENTED` — `mapper_test.go` |
| `TC-P13-UNIT-007` | Delivery events create `DELIVERED_BY` | UNIT | `procurement.delivery.received` | 1. Ingest | `(:Material)-[:DELIVERED_BY]->(:Vendor)` is created | Ph13 Relationships | `IMPLEMENTED` — `mapper_test.go` |
| `TC-P13-UNIT-008` | Spatial hierarchy relationships are created | UNIT | Building/floor/room/structure events | 1. Ingest each | `HAS_FLOOR`, `HAS_ROOM`, `CONTAINS_STRUCTURE` and `LOCATED_IN` are created with the specified cardinality | Ph13 Relationships | `IMPLEMENTED` — `mapper_test.go` |
| `TC-P13-UNIT-009` | The consumer subscribes by the specified topic regex | UNIT | Consumer config | 1. Read the subscription pattern | `^[^.]+\.(construction\|procurement\|site\|finance)\..*` under group `kg-consumer-group` | Ph13 Consumer groups; §7.3 | `IMPLEMENTED` — `services/kg-ingestion-worker` |
| `TC-P13-UNIT-010` | Conflicting updates resolve last-event-wins | UNIT | Two updates to one node | 1. Ingest both in order | The later event's values persist — the graph is derived, not authoritative | Ph13 Conflict handling | `IMPLEMENTED` — `mapper_test.go` |
| `TC-P13-INT-001` | Full ingest pipeline against a Neo4j container | INT | Neo4j Testcontainer | 1. Publish events; 2. Run the worker; 3. Query the graph | Nodes and relationships are created as designed | Ph13 Generate "Integration tests" | `IMPLEMENTED` — `services/kg-ingestion-worker/tests/integration/ingest_test.go` |
| `TC-P13-INT-002` | Uniqueness constraints exist on `{label}.{id}` + `tenant_id` | INT | Migrated Neo4j | 1. List constraints; 2. Attempt a duplicate insert | Constraints exist for every label; duplicates are rejected | Ph13 Generate "Neo4j schema constraints" | `IMPLEMENTED` — `services/kg-ingestion-worker/internal/graph/constraints.go` creates composite `IF NOT EXISTS` uniqueness constraints on `(id, tenant_id)` for all 8 node labels, and `tests/integration/ingest_test.go::TestIngest_Constraints_IdempotentOnDuplicateMerge` proves the effect against a real Neo4j: a second MERGE of the same `project_id` updates the node instead of creating a duplicate. The behavioural half exercises the Project label; the other 7 are covered by the shared constraint helper (§35.13 ESC-29) |
| `TC-P13-INT-003` | Restart replays from the last committed offset | INT | Worker mid-stream | 1. Stop the worker; 2. Publish more events; 3. Restart | No event is lost or double-applied | Ph13 Replay | `PLANNED` — not located |
| `TC-P13-INT-004` | Full rebuild replays all events from the beginning | INT | Admin endpoint | 1. Trigger the rebuild | The graph is reconstructed from the event stream and converges to the same state | Ph13 Generate "Full rebuild admin endpoint" | `PLANNED` — not located |
| `TC-P13-UNIT-011` | All five required graph queries return correct traversals | UNIT | Seeded graph | 1. Run: vendors supplying a project; invoices per vendor per project; inspections per project; material supply chain; vendor relationship map | Each returns the documented traversal result | Ph13 Graph Queries 1–5 | `IMPLEMENTED` — `backend/src/modules/graph/__tests__/graph.service.spec.ts` |
| `TC-P13-UNIT-012` | The three additional traversals are supported | UNIT | Seeded graph | 1. Run: delivery chain per vendor per project; delays impacting a project; procurement risk propagation | Each returns the documented result | Ph13 Additional graph queries 6–8 | `IMPLEMENTED` — `graph.service.spec.ts` |
| `TC-P13-ISO-001` | Graph traversal cannot cross tenants | ISO | Two tenant subgraphs | 1. Traverse from a Tenant A node toward Tenant B | Zero results | §30.6 Neo4j row | `IMPLEMENTED` — `services/kg-ingestion-worker/tests/integration/ingest_test.go::TestIngest_TenantIsolation_NodesNotSharedAcrossTenants` ingests the SAME `project_id` for two tenants against a real Neo4j and asserts a `tenant_id: t-2` traversal returns only t-2 data (§35.13 ESC-29) |
| `TC-P13-MAN-001` | `docs/api/graph.openapi.yaml` exists and is valid | MAN | — | 1. Validate the file | Present and valid OpenAPI 3.1 | Ph13 Generate; §14.3 | `IMPLEMENTED` — verified in §35.12 |

**Phase 13 exit gate:** KG ingestion idempotent; entities normalized
(`00_master` Phase Register — Phase 13 Exit).

---

### 35.10.14 Phase 14 — Analytics + Dashboard

**Objective:** analytics and dashboards on ClickHouse.

**Spec references:** `00_master` §Phase 14 (performance SLA, ClickHouse strategy, tables, caching,
dashboards, APIs, Generate); §31.6 (dashboard SLO); §30.9 (dashboard load profile).

**Scope in:** ClickHouse fact/aggregate tables, Kafka engine ingestion, materialized views, Redis
caching and invalidation, dashboard APIs, Next.js dashboard components.
**Scope out:** ML predictions (Phase 23); data-lake replication (Phase 17).

> **Divergence recorded — §35.13 ESC-10.** Three different dashboard latency targets exist:
> §31.6 / QM-6 and §30.9 state **p95 < 1 s** (with ClickHouse query < 200 ms); `00_master` Phase 14
> states **Executive p95 < 3 s / PM p95 < 2 s**; §30.5 E2E scenario 10 and Phase 18 k6 scenario 1
> state **p95 < 3 s**. Cases below assert each target against its own source and do not merge them.

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P14-UNIT-001` | Dashboard responses are cached in Redis for 5 minutes | UNIT | Redis mocked | 1. Request a dashboard twice within the TTL | The second request is served from cache; key format `analytics:{tenant_id}:{dashboard_type}:{project_id}:{date_range}` | Ph14 Caching Strategy | `IMPLEMENTED` — `backend/src/modules/analytics/__tests__/analytics.service.spec.ts` |
| `TC-P14-UNIT-002` | Cache invalidation is event-driven | UNIT | Cached dashboard | 1. Deliver a relevant Kafka event | The matching cache key is cleared | Ph14 Cache invalidation | `IMPLEMENTED` — `analytics.service.spec.ts` |
| `TC-P14-UNIT-003` | Aggregation queries read materialized views, not raw facts | UNIT | Query builder | 1. Build each dashboard query | Queries target the pre-aggregated tables — aggregation is not performed at query time | Ph14 ClickHouse Strategy | `IMPLEMENTED` — `analytics.service.spec.ts` |
| `TC-P14-UNIT-004` | Executive dashboard returns its four specified metrics | UNIT | Seeded aggregates | 1. Request the executive dashboard | Budget utilisation % per project, projects at risk (variance > 10%, configurable), overdue invoice count, active projects by status | Ph14 Executive Dashboard | `IMPLEMENTED` — `analytics.controllers.spec.ts` |
| `TC-P14-UNIT-005` | PM dashboard returns its four specified metrics | UNIT | Seeded aggregates | 1. Request the PM dashboard | 30-day manpower trend, open issues by severity, inspection pass rate, RFQ pending + PO delivery overdue counts | Ph14 PM Dashboard | `IMPLEMENTED` — `analytics.controllers.spec.ts` |
| `TC-P14-UNIT-006` | Date range and project filters are validated | UNIT | Request DTO | 1. Submit malformed `dateRange` and `projectIds` values | 400 with field-level detail (class-validator, not hand-written checks) | QM-4 input validation | `IMPLEMENTED` — `analytics.request.spec.ts` |
| `TC-P14-UNIT-007` | Analytics module closes its Redis and ClickHouse handles on shutdown | UNIT | Module instance | 1. Invoke the module class `onModuleDestroy` | Redis `quit()` and the ClickHouse client `close()` are both called | Rule 39(b); ADR-034 | `IMPLEMENTED` — `analytics.service.spec.ts` |
| `TC-P14-MAN-001` | Fact tables use the specified engines and partitioning | MAN | ClickHouse DDL | 1. Read the DDL for `project_cost_daily`, `procurement_activity_daily`, `site_activity_daily` | `AggregatingMergeTree` for aggregates, `ReplacingMergeTree` for facts; partitioned by `toYYYYMM(event_date)`; raw events TTL 2 years | Ph14 ClickHouse Strategy | `PLANNED` — DDL assertion not automated |
| `TC-P14-INT-001` | Kafka → ClickHouse → API flow | INT | ClickHouse + Kafka containers | 1. Publish domain events; 2. Let the Kafka engine tables ingest; 3. Call the dashboard API | The dashboard reflects the published events | Ph14 Generate "Integration tests" | `PLANNED` — not located |
| `TC-P14-INT-002` | Data freshness stays within 15 minutes | INT | Running pipeline | 1. Publish an event; 2. Poll the dashboard | The value appears within 15 minutes (real-time critical alerts within 30 s) | Ph14 Performance SLA | `PLANNED` — not located |
| `TC-P14-LOAD-001` | Executive dashboard meets the §30.9 profile | LOAD | Staging | 1. Run 50 concurrent Executive users loading the dashboard | p95 < 1 s and ClickHouse query < 200 ms | §30.9 | `IMPLEMENTED` — `scripts/loadtest/analytics-sla.js`, threshold corrected to p95 < 1,000 ms on 2026-08-22 (ESC-10 resolved: §31.6 wins) |
| `TC-P14-LOAD-002` | Dashboard SLA holds under 100 concurrent loads | LOAD | Staging | 1. Run 100 VUs for 5 minutes against `/api/v1/analytics/executive` | p95 < 3 s; error rate < 0.1% | Ph18 k6 Scenario 1; Ph14 Generate "Load tests" | `IMPLEMENTED` — `tests/load/dashboard-sla.js`, `scripts/loadtest/analytics-sla.js` |
| `TC-P14-ISO-001` | Analytics results are tenant-scoped | ISO | Two tenant fixtures | 1. Request analytics for Tenant B with Tenant A's JWT | 403 / no Tenant B rows | §30.6 API row | `IMPLEMENTED` — `backend/test/analytics.integration.spec.ts` |
| `TC-P14-MAN-002` | `docs/api/analytics.openapi.yaml` exists and is valid | MAN | — | 1. Validate the file | Present and valid OpenAPI 3.1 | Ph14 Generate; §14.3 | `IMPLEMENTED` — verified in §35.12 |

**Phase 14 exit gate:** dashboard/analytics p95 < 1 s on ClickHouse (§31.6)
(`00_master` Phase Register — Phase 14 Exit) — see ESC-10 for the conflicting 3 s target.

---

### 35.10.15 Phase 15 — Observability

**Objective:** the observability stack — metrics, logs, traces and SLO.

**Spec references:** `00_master` §Phase 15 (tools, mandatory metrics, alert rules, tracing,
dashboards, Generate); §31.2–31.12; QM-8 (observability standards); QM-14 (SLI/SLO).

**Scope in:** OTel instrumentation, Prometheus metrics, alert rules, Grafana dashboards, Loki log
pipeline, Jaeger tracing, sampling policy, synthetic probes, log retention.
**Scope out:** incident process (QM-17, Phase 19 runbooks); SLO dashboard registry content.

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P15-UNIT-001` | Every HTTP request emits `http_request_duration_seconds` with the required labels | UNIT | Metrics interceptor | 1. Issue a request; 2. Read the histogram | Labels `service`, `method`, `path`, `status` are present | Ph15 metrics; §31.3 | `IMPLEMENTED` — `packages/@cos/tracing/src/__tests__/metrics.spec.ts` |
| `TC-P15-UNIT-002` | `http_requests_total` carries `tenant_tier` | UNIT | Metrics interceptor | 1. Issue requests from tenants of different tiers | The counter is labelled with `service`, `endpoint`, `method`, `status_code`, `tenant_tier` | §31.3 | `IMPLEMENTED` — `metrics.spec.ts` |
| `TC-P15-UNIT-003` | `traceparent` propagates across HTTP boundaries | UNIT | Tracing package | 1. Issue an outbound call inside a span | The W3C `traceparent` header is set and a child span is created | QM-8; Ph15 Distributed Tracing | `IMPLEMENTED` — `packages/@cos/tracing/src/__tests__/otel.spec.ts` |
| `TC-P15-UNIT-004` | Kafka messages carry `trace_id` and `span_id` headers | UNIT | Tracing package | 1. Produce and consume a message | Both headers travel with the message; the consumer creates a child span | QM-8; Ph15 | `IMPLEMENTED` — `packages/@cos/tracing/src/__tests__/kafka-propagation.spec.ts` |
| `TC-P15-UNIT-005` | Logs are structured JSON with the mandated fields | UNIT | `@cos/logger` | 1. Emit a log line | Contains `timestamp`, `level`, `trace_id`, `span_id`, `tenant_id`, `user_id`, `service`, `module`, `event`, `durationMs`, `metadata` | QM-8 Structured Logging | `IMPLEMENTED` — `packages/@cos/logger` suite |
| `TC-P15-UNIT-006` | PII never appears in logs, traces or errors | UNIT | Logger with a PII-bearing payload | 1. Log an object containing PII | PII is redacted or reduced to identifiers | QM-5; QM-8 | `PLANNED` — redaction assertion not located |
| `TC-P15-UNIT-007` | `console.log` is not used anywhere in application code | UNIT | Source tree | 1. Search for `console.log` outside tests and tooling | No occurrence — `@cos/logger` is used | QM-8; Rule "Never use console.log" | `IMPLEMENTED` — `tests/architecture/invariants.spec.ts` scans backend, services, packages and `apps/web` source for `console.log` (§35.13 ESC-27) |
| `TC-P15-UNIT-008` | The OTel SDK shuts down through a Nest lifecycle hook | UNIT | `TracingShutdownService` | 1. Invoke `onApplicationShutdown` | `shutdownTracing()` is called | Rule 39(c); ADR-034 | `IMPLEMENTED` — `backend/src/shared/tracing-shutdown.service.ts` spec |
| `TC-P15-MAN-001` | `main.ts` enables shutdown hooks before listening | MAN | — | 1. Read `backend/src/main.ts` | `app.enableShutdownHooks()` is called before `app.listen()` | Rule 39(d) | `PLANNED` — assertion not automated |
| `TC-P15-MAN-002` | Every mandatory Phase 15 metric is emitted | MAN | Running stack | 1. Scrape `/metrics`; 2. Compare against the Phase 15 metric list (26 metrics) | Every listed metric is present | Ph15 "Metrics to instrument"; §31.3 | `PLANNED` — completeness check not automated |
| `TC-P15-MAN-003` | Every mandatory alert rule is defined | MAN | — | 1. Read `infrastructure/monitoring/prometheus/rules`; 2. Compare against the Phase 15 alert list | All rules present, including `KafkaDLQNonEmpty`, `APIHighErrorRate`, `APIHighLatency`, `DBHighQueryTime`, `AnalyticsSLABreach`, `AIHighTokenUsage`, `ServiceDown`, `DBConnectionExhausted`, `KafkaConsumerLagCritical`, `SafetyNotificationFailed`, `TenantIsolationBreach`, `DiskUsageHigh`, `MemoryPressure` | Ph15 Alerting rules; §31.7 | `IMPLEMENTED` (location) — `infrastructure/monitoring/prometheus/rules`; per-rule completeness `PLANNED` |
| `TC-P15-MAN-004` | Trace sampling is tail-based with the specified rates | MAN | — | 1. Read `infrastructure/monitoring/otel-collector/otel-collector-config.yml` | 1% baseline; 100% of error responses; 100% of AI/LLM calls; 100% of financial transactions | QM-8 Sampling; §31.5 | `PLANNED` — config assertion not automated |
| `TC-P15-MAN-005` | Synthetic probes run every 60 s from ≥ 2 regions | MAN | — | 1. Read `infrastructure/synthetics/health-probes.yaml` | Probe definitions exist for all public endpoints at a 60 s interval from at least two regions | QM-8 Synthetic monitoring; §31.10 | `IMPLEMENTED` (file) — `infrastructure/synthetics/health-probes.yaml`; region/interval assertion `PLANNED` |
| `TC-P15-MAN-006` | The isolation probe CronJob is deployed and wired to the alert | MAN | — | 1. Read `infrastructure/monitoring/isolation-probe/cronjob.yaml`; 2. Confirm the metric feeds `TenantIsolationBreach` | Schedule `*/5 * * * *`; `tenant_isolation_check_result` emitted; alert pages the security lead | §30.6 probe; §31.7 | `IMPLEMENTED` — `cronjob.yaml`, `configmap.yaml`, `rbac.yaml`, `isolation-probe.js` |
| `TC-P15-MAN-007` | All four audience dashboards exist in Grafana | MAN | — | 1. List `infrastructure/monitoring/grafana/dashboards` | Platform Overview, Tenant Operations, Business Metrics and SLO Burn Rate dashboards are present alongside the implementation dashboards | Ph15 Grafana Dashboards; §31.8 | `IMPLEMENTED` (location) — `infrastructure/monitoring/grafana/dashboards`; per-dashboard check `PLANNED` |
| `TC-P15-MAN-008` | SLO burn-rate metrics and alerts exist | MAN | — | 1. Confirm `slo.error_budget_remaining` and `slo.burn_rate_1h` are emitted per QM-14 SLO; 2. Confirm alerts at 2× sustained 1 h and 10× for 5 min | Metrics and both alert rules exist | QM-8 SLO burn rate; QM-14 | `PLANNED` — not located |
| `TC-P15-MAN-009` | Log retention policy is documented and applied | MAN | — | 1. Read `docs/compliance/log-retention-policy.md` | 30-day hot in Loki, 1-year cold, 7-year compliance archive; audit logs indefinite / 7-year WORM | QM-8 Log retention; §31.4 | `IMPLEMENTED` — verified in §35.12 |

**Phase 15 exit gate:** SLO dashboards, alerts and tracing live; synthetic probes committed
(`00_master` Phase Register — Phase 15 Exit).

---

### 35.10.16 Phase 16 — Security

**Objective:** security hardening and compliance controls.

**Spec references:** `00_master` §Phase 16 (compliance targets, security requirements, WAF, secure
headers, input security, Generate); §5.2 (encryption, secrets), §5.5 (WAF, rate limits), §5.8 (CORS),
§5.9 (STRIDE), §5.10 (supply chain), §9.7.3 (RLS); QM-4, QM-5, QM-7.

**Scope in:** RLS policies, immutable audit logging, secure headers, WAF integration, rate limiting,
secrets handling, TLS, encryption at rest, cross-tenant isolation enforcement, scanning in CI.
**Scope out:** the pentest engagement itself (external, before Stage 1→2).

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P16-UNIT-001` | Every response carries the five mandated security headers | UNIT | Secure-headers middleware | 1. Issue any request; 2. Read the response headers | `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Content-Security-Policy` | QM-4 Security headers; Ph16 | `IMPLEMENTED` — `backend/src/shared/middleware/__tests__/secure-headers.middleware.spec.ts` |
| `TC-P16-UNIT-002` | Production CSP contains no `unsafe-inline` or `unsafe-eval` | UNIT | CSP policy | 1. Read the production policy | Neither directive appears | QM-4; `docs/security/csp-policy.md` | `IMPLEMENTED` — `secure-headers.middleware.spec.ts` |
| `TC-P16-UNIT-003` | `CF-Connecting-IP` is trusted as the real client IP | UNIT | Cloudflare middleware | 1. Send a request with both `CF-Connecting-IP` and `X-Forwarded-For` | `CF-Connecting-IP` is used — not `X-Forwarded-For` | Ph16 WAF application integration | `IMPLEMENTED` — `cloudflare-waf.middleware.spec.ts` |
| `TC-P16-UNIT-004` | `CF-Ray` is validated and logged | UNIT | Cloudflare middleware | 1. Send a request without `CF-Ray`; 2. Send one with it | Missing header is treated as not having traversed the WAF; when present it is logged for end-to-end tracing | Ph16 WAF application integration | `IMPLEMENTED` — `cloudflare-waf.middleware.spec.ts` |
| `TC-P16-UNIT-005` | `RolesGuard` denies undeclared roles | UNIT | Guard | 1. Call a `@Roles`-protected handler with each role | Only declared roles pass; others receive 403 including the required permission | Ph16 RBAC; QM-10 (403 body) | `IMPLEMENTED` — `backend/src/shared/guards/__tests__/roles.guard.spec.ts` |
| `TC-P16-UNIT-006` | `PolicyGuard` denies on failed ABAC attributes | UNIT | Guard | 1. Fail each of project membership, tenant match and resource ownership | Each failure returns 403 | Ph2 ABAC; Ph16 | `IMPLEMENTED` — `policy.guard.spec.ts` |
| `TC-P16-UNIT-007` | ThrottlerGuard — request within limit succeeds | UNIT | `ThrottlerStorageRedisService` mocked | 1. Issue a request under the limit | 200; no throw | §30.10 rate-limiting table | `IMPLEMENTED` — `backend/src/shared/guards/__tests__/throttler.guard.spec.ts` |
| `TC-P16-UNIT-008` | ThrottlerGuard — 101st general request in 60 s throws | UNIT | Storage mocked | 1. Issue 101 requests within the window | `ThrottlerException`; HTTP 429 | §30.10; QM-7 | `IMPLEMENTED` — `throttler.guard.spec.ts` |
| `TC-P16-UNIT-009` | ThrottlerGuard — 11th auth request in 60 s throws | UNIT | Storage mocked | 1. Issue 11 auth requests | `ThrottlerException`; the `@Throttle` override is applied | §30.10; QM-7 | `IMPLEMENTED` — `throttler.guard.spec.ts` |
| `TC-P16-UNIT-010` | ThrottlerGuard — 21st file-upload request in 60 s throws | UNIT | Storage mocked | 1. Issue 21 upload requests | `ThrottlerException`; override applied | §30.10; §05 §5.5 | `IMPLEMENTED` — `throttler.guard.spec.ts` |
| `TC-P16-UNIT-011` | 429 responses include `Retry-After` | UNIT | Throttled request | 1. Trigger a 429; 2. Read the header | `Retry-After` equals the seconds until the window resets | §30.10; QM-7; QM-10 | `IMPLEMENTED` — `throttler.guard.spec.ts` |
| `TC-P16-UNIT-012` | The counter resets after the TTL | UNIT | Expired window | 1. Wait past the TTL; 2. Issue a request | 200 | §30.10 | `IMPLEMENTED` — `throttler.guard.spec.ts` |
| `TC-P16-UNIT-013` | Throttling uses Redis storage, not in-memory | UNIT | Guard wiring | 1. Inspect the injected storage | `ThrottlerStorageRedisService` is injected and invoked | §30.10; QM-7 | `IMPLEMENTED` — `throttler.guard.spec.ts` |
| `TC-P16-UNIT-014` | Rate-limit headers are present on every response | UNIT | Any request | 1. Read the response headers | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` | QM-7 | `PLANNED` — header assertion not located |
| `TC-P16-UNIT-015` | Every state-changing endpoint writes an immutable audit entry | UNIT | Audit interceptor | 1. Perform a create, update, delete and state transition | Each writes an append-only entry with actor, action, `entity_type`, `entity_id`, `tenant_id` and timestamp | QM-4 immutable audit logging | `PLANNED` — coverage assertion not located |
| `TC-P16-UNIT-016` | SYSTEM_ADMIN actions are additionally written to `platform.audit_logs` | UNIT | Platform-admin action | 1. Perform a SYSTEM_ADMIN action | An entry is written to `platform.audit_logs` with the operator identity | QM-4; §20.4 | `PLANNED` — not located |
| `TC-P16-INT-001` | `audit_logs` rejects UPDATE and DELETE from the application role | INT | Migrated DB, `app_user` | 1. Attempt `UPDATE`; 2. Attempt `DELETE` | Both denied by policy | Ph16 Immutable logging | `IMPLEMENTED` — `backend/test/rls-immutability.integration.spec.ts` connects as the real `app_user` role against a migrated TimescaleDB and asserts UPDATE and DELETE on `platform.audit_logs` each affect **zero rows** while the row stays unaltered. Note the mechanism: with no UPDATE/DELETE policy the row is invisible for modification, so PostgreSQL reports 0 rows rather than raising — code expecting an error would read the no-op as success (§35.13 ESC-28) |
| `TC-P16-ISO-001` | Cross-tenant API access is refused | ISO | Two tenant fixtures | 1. Use Tenant A's JWT against a Tenant B resource | 403 Forbidden | §30.6 API row | `IMPLEMENTED` — `backend/test/tenant-isolation.integration.spec.ts` |
| `TC-P16-ISO-002` | Cross-tenant Kafka messages are rejected | ISO | Shared consumer | 1. Deliver a message whose `tenant_id` header does not match the topic tenant | Message rejected; the DLQ is not populated with the cross-tenant message | §30.6 Kafka row | `IMPLEMENTED` — `packages/@cos/kafka/src/__tests__/consumer.idempotency.spec.ts` covers both halves of the §7.3 guard in `KafkaConsumer`: a message whose `tenant_id` header mismatches the envelope goes to the DLQ, as does one with no header at all — neither reaches the handler (§35.13 ESC-29) |
| `TC-P16-SEC-001` | Dependency audit blocks High/Critical findings | SEC | CI | 1. Run `pnpm audit`, `pip-audit`, `govulncheck` | The job fails on any High/Critical finding | §30.10; QM-4 | `IMPLEMENTED` — `dependency-audit` job in `.github/workflows/ci.yml` |
| `TC-P16-SEC-002` | Container images pass Trivy with no CRITICAL findings | SEC | Built image | 1. Run `trivy image --exit-code 1 --severity CRITICAL` | Exit code 0 | Ph19 security check; §30.10 | `IMPLEMENTED` — `security-scan` job in `.github/workflows/ci.yml` |
| `TC-P16-SEC-003` | Secrets scanning blocks committed secrets | SEC | Commit containing a secret pattern | 1. Attempt the commit; 2. Run CI | The pre-commit hook and the CI job both fail | §30.10 Secrets Scanning; QM-4 | `IMPLEMENTED` — `secret-scan` job in `.github/workflows/ci.yml` |
| `TC-P16-SEC-004` | DAST finds no unresolved High-severity issues | SEC | Staging deployed | 1. Run the weekly OWASP ZAP baseline scan | No unresolved High findings before a production release | §30.10 DAST | `IMPLEMENTED` — `.github/workflows/dast.yml` |
| `TC-P16-SEC-005` | SAST quality gate is green | SEC | SonarQube server | 1. Run `sonar-scanner` | Quality gate GREEN — 0 new bugs, 0 new vulnerabilities, 100% line and branch coverage, 0% duplication | QM-4; §30.10 | `IMPLEMENTED` — CodeQL (ADR-054); `.github/workflows/codeql.yml` |
| `TC-P16-MAN-001` | TLS 1.3 is the minimum on every ingress | MAN | Staging ingress | 1. `nmap --script ssl-enum-ciphers -p 443 <host>` | TLS 1.3 only; 1.0/1.1/1.2 disabled | QM-4 TLS policy; Ph19 | `IMPLEMENTED` — `scripts/readiness/check-security-headers.sh` |
| `TC-P16-MAN-002` | CORS never returns `*` in production | MAN | Production config | 1. Inspect the CORS configuration and `docs/security/cors-policy.md` | Explicit origin allow-list; `max-age ≤ 86400` | QM-4; §5.8 | `IMPLEMENTED` (policy file) — verified in §35.12 |
| `TC-P16-MAN-003` | Cloudflare origin protection restricts the ALB to Cloudflare IPs | MAN | — | 1. Read `infrastructure/terraform/cloudflare/` and `infrastructure/kubernetes/security/` | The ALB security group allows 443 from Cloudflare ranges only | Ph16 Origin protection (MANDATORY) | `IMPLEMENTED` — `infrastructure/terraform/cloudflare/{main,waf,variables,outputs}.tf` |
| `TC-P16-MAN-004` | Storage encryption uses SSE-KMS with a customer-managed key | MAN | — | 1. Read `infrastructure/terraform/aws/kms.tf` | One CMK per storage type per environment, alias `cos/{env}/rds\|s3\|elasticache`, annual rotation; ElastiCache uses the AWS-managed key | QM-4 encryption at rest; §5.2.1 | `IMPLEMENTED` — `infrastructure/terraform/aws/kms.tf` |
| `TC-P16-MAN-005` | No plaintext Kubernetes Secret is committed | MAN | — | 1. Search `infrastructure/kubernetes` for `kind: Secret` outside SealedSecrets | Only `SealedSecret` objects are committed | QM-4; Ph17 | `IMPLEMENTED` (location) — `infrastructure/kubernetes/sealed-secrets/`, `external-secrets/` |

**Phase 16 exit gate:** STRIDE per external surface (§5.9); SBOM per release (§5.10); pentest passed
(`00_master` Phase Register — Phase 16 Exit).

---

### 35.10.17 Phase 17 — DevOps + Deployment

**Objective:** the CI/CD and multi-region deployment pipeline.

**Spec references:** `00_master` §Phase 17 (cloud decision, cluster spec, environments, secrets,
deployment strategy, CI/CD, data scaling, Generate); QM-16 (deployment safety), QM-18 (PgBouncer);
§31.11 (game day), §31.12 (DORA); ADR-039.

**Scope in:** Terraform modules, Helm charts, GitHub Actions CI, ArgoCD CD, HPA/PDB, PgBouncer
manifests, sealed secrets, autoscaling, rollback.
**Scope out:** application behaviour; the pentest.

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P17-MAN-001` | CI contains no `kubectl apply` or `helm upgrade` | MAN | — | 1. `grep -r "kubectl apply\|helm upgrade" .github/workflows/` | Zero matches — CD belongs to ArgoCD | Ph17 CI/CD; Ph19 check | `IMPLEMENTED` — `scripts/readiness/check-cicd.sh` |
| `TC-P17-MAN-002` | Every service has a Dockerfile except `apps/mobile` | MAN | — | 1. List Dockerfiles per deployable | All present; `apps/mobile` has none (Expo EAS Build) | Ph17 Generate; §08 Dockerfile table | `IMPLEMENTED` — `build-docker` matrix in `.github/workflows/ci.yml` |
| `TC-P17-MAN-003` | Helm charts exist per deployable with three value files | MAN | — | 1. List `infrastructure/helm/*/Chart.yaml`; 2. Confirm `values-dev`, `values-staging`, `values-prod` | A chart per deployable with all three environment value files | Ph17 Generate | `IMPLEMENTED` — 8 charts under `infrastructure/helm/` |
| `TC-P17-MAN-004` | PgBouncer runs in transaction mode with the baseline configuration | MAN | — | 1. Read `infrastructure/kubernetes/pgbouncer/` | `pool_mode=transaction`; `default_pool_size=25`; `max_client_conn=1000`; `server_idle_timeout=600`; a `PodDisruptionBudget` with `minAvailable: 1`; session and statement modes absent | QM-18; Ph17 Generate | `IMPLEMENTED` — `infrastructure/kubernetes/pgbouncer/` |
| `TC-P17-MAN-005` | Every service has an HPA and a PDB | MAN | — | 1. List HPA and PDB manifests per service | Both exist for each service; `PDB minAvailable: 1` | Ph17 Generate | `PLANNED` — per-service completeness not verified |
| `TC-P17-MAN-006` | Rolling update is zero-downtime | MAN | Deployment manifests | 1. Read the strategy | `maxSurge: 1`, `maxUnavailable: 0` | Ph17 Deployment Strategy; QM-16 | `PLANNED` — not verified |
| `TC-P17-MAN-007` | Deployment auto-rolls back when the error rate exceeds 1% | MAN | Deploy workflow | 1. Read the health gate in `.github/workflows/deploy.yml` | Rollback triggers if the error rate exceeds 1% within 10 minutes of deployment | QM-16 automated rollback | `PLANNED` — health gate not located |
| `TC-P17-MAN-008` | Staging auto-syncs; production requires a manual gate | MAN | ArgoCD | 1. `argocd app get cos-staging -o json \| jq '.spec.syncPolicy.automated'`; 2. Inspect the production app | Staging automated; production requires a manual sync gate | Ph17 ArgoCD; Ph19 checks | `IMPLEMENTED` — `scripts/readiness/check-cicd.sh` |
| `TC-P17-MAN-009` | Terraform provisions AWS as the default target | MAN | — | 1. Read `infrastructure/terraform/aws/` | EKS, RDS, ElastiCache, MSK and S3 modules exist and are marked `# CLOUD: AWS` | Ph17 Cloud Provider Decision | `IMPLEMENTED` — `infrastructure/terraform/aws/` (`main.tf`, `kms.tf`, `modules/`) |
| `TC-P17-MAN-010` | No region-specific string or ARN is hardcoded in business logic | MAN | Source tree | 1. Search application code for region literals and ARNs | All are supplied through environment variables | QM-13 Stage 1–3 constraint | `PLANNED` — no automated assertion |
| `TC-P17-INT-001` | The application connects through PgBouncer in every environment | INT | Deployed stack | 1. Resolve `DATABASE_URL` in each environment | Always the PgBouncer service; never the database host on 5432 | QM-18 | `IMPLEMENTED` — same assertion as `TC-P01-INT-001`, in `tests/architecture/connectivity.spec.ts`; it covers every committed environment file rather than one deployment (§35.13 ESC-28) |

**Phase 17 exit gate:** no manual deploy paths; DORA targets green (§31.12); DR game day passed
(§31.11) (`00_master` Phase Register — Phase 17 Exit).

---

### 35.10.18 Phase 18 — Testing

**Objective:** the full test suite and quality gates. This phase's `Generate:` list *is* the test
infrastructure the rest of this document depends on.

**Spec references:** `00_master` §Phase 18 (tools, pyramid, coverage, k6 scenarios, Pact pairs,
Testcontainers, Generate, timer and Temporal patterns); §30.2–30.13; QM-1; ADR-048 (E2E on `staging`).

**Scope in:** runner configuration, shared test utilities, factories, DB reset, k6 scripts, Playwright
and Detox suites, Pact tests, CI wiring, Lighthouse gate.
**Scope out:** the domain tests themselves (owned by their phases).

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P18-MAN-001` | Coverage thresholds are 100% lines and 100% branches per service | MAN | — | 1. Read every `jest.config.js`; 2. Run the CI coverage job | Threshold configured and enforced; the job fails below it | QM-1; §30.3 | `IMPLEMENTED` — `unit-tests` job "Unit Tests (coverage 100% lines / 100% branches)" |
| `TC-P18-MAN-002` | `@cos/test-utils` provides containers, factories and DB reset, with a README | MAN | — | 1. List `packages/@cos/test-utils/src`; 2. Confirm the README carries the five QM-11 headings | `containers.ts`, `factories.ts`, `db-reset.ts`, `index.ts` and a conforming README | §30.13; Ph18 Generate; QM-11 | `IMPLEMENTED` — `packages/@cos/test-utils/` (README present) |
| `TC-P18-UNIT-001` | Every factory produces a payload that passes validation with no overrides | UNIT | Factories | 1. Call each of the 17 factories with only required arguments; 2. Validate the result against its DTO | Every factory yields a valid payload; overrides spread last | §30.13 rules | `IMPLEMENTED` — `packages/@cos/test-utils/src/__tests__/` |
| `TC-P18-UNIT-002` | Factories omit server-generated fields | UNIT | Factories | 1. Inspect each factory's output | No `id`, `created_at` or JWT-derived `tenant_id` is present in DTO factories | §30.13 rules | `IMPLEMENTED` — `packages/@cos/test-utils/src/__tests__/` |
| `TC-P18-UNIT-003` | The DB reset utility truncates and reseeds between tests | UNIT | Test database | 1. Seed data; 2. Run the reset; 3. Query | Tables are empty and reseeded to the baseline | Ph18 Generate "Database reset utility" | `IMPLEMENTED` — `packages/@cos/test-utils/src/db-reset.ts` |
| `TC-P18-UNIT-004` | Async retry helpers use `runAllTimersAsync`, not `runAllTimers` | UNIT | Any spec covering `withRetry`, `OutboxPoller` or a backoff loop | 1. Inspect the spec | `jest.useFakeTimers()` in `beforeEach`, `jest.useRealTimers()` in `afterEach`, `await jest.runAllTimersAsync()` per step | Rule 30; Ph18 pattern | `IMPLEMENTED` — `packages/@cos/database` retry suite |
| `TC-P18-E2E-001` | Login — SMS OTP and email/password | E2E | Staging seeded | 1. Log in via OTP; 2. Log in via email/password; 3. Open a protected route | JWT issued on both paths; the protected route loads | §30.5 Web #7 | `IMPLEMENTED` — `tests/e2e/specs/auth.spec.ts` |
| `TC-P18-E2E-002` | Project create — DRAFT → ACTIVE | E2E | PM session | 1. Create a project; 2. Transition it | Status moves `DRAFT → ACTIVE` | §30.5 Web #8 | `IMPLEMENTED` — `tests/e2e/specs/project.spec.ts` |
| `TC-P18-E2E-003` | Report submit — Kafka event and PM notification | E2E | Site Engineer session | 1. Submit a daily report | The report persists, the Kafka event is emitted and the PM is notified | §30.5 Web #9 | `IMPLEMENTED` — `tests/e2e/specs/report.spec.ts` |
| `TC-P18-E2E-004` | Dashboard view within the analytics SLA | E2E | Executive session | 1. Load the analytics dashboard | ClickHouse-backed dashboard completes within p95 < 3 s (ESC-10) | §30.5 Web #10 | `IMPLEMENTED` — `tests/e2e/specs/dashboard.spec.ts` |
| `TC-P18-E2E-005` | Procurement flow end to end | E2E | Procurement + Finance sessions | 1. Create PR → RFQ → quotation → approve PO → record delivery → approve vendor invoice | Every stage completes and the PO reaches the expected state | §30.5 Web #1 | `IMPLEMENTED` — `tests/e2e/specs/procurement.spec.ts` |
| `TC-P18-E2E-006` | Daily site report with manpower and blockers | E2E | Site Engineer session | 1. Submit a report including manpower count and blockers | Both are captured and visible to the PM | §30.5 Web #2 | `IMPLEMENTED` — `tests/e2e/specs/daily-report.spec.ts` |
| `TC-P18-E2E-007` | Budget exceeded alert reaches the Executive | E2E | Project near budget | 1. Record a cost transaction pushing the project over budget | The Executive receives a push notification | §30.5 Web #3 | `IMPLEMENTED` — `tests/e2e/specs/budget-exceeded.spec.ts` |
| `TC-P18-E2E-008` | Safety incident acknowledged within the 30-minute SLA | E2E | Safety Officer session | 1. Report an incident; 2. PM receives the push; 3. Acknowledge | Acknowledgement occurs within the 30-minute SLA and escalation does not fire | §30.5 Web #4; §19.3 | `IMPLEMENTED` — `tests/e2e/specs/safety-incident.spec.ts` |
| `TC-P18-E2E-009` | QC inspection failure records severity and photo | E2E | Inspector session | 1. Fill the checklist with a failing result; 2. Upload a photo | The result records as fail, `issue_severity` is populated and the photo is attached | §30.5 Web #5 | `IMPLEMENTED` — `tests/e2e/specs/qc-inspection.spec.ts` |
| `TC-P18-E2E-010` | Approval escalation after 48 hours | E2E | PO awaiting approval | 1. Let the approver not respond for 48 h (clock advanced) | The next approver is notified | §30.5 Web #6; §15.5 | `IMPLEMENTED` — `tests/e2e/specs/approval-escalation.spec.ts` |
| `TC-P18-CONTRACT-001` | Finance ← Procurement invoice-received contract holds | CONTRACT | Pact broker/files | 1. Verify the provider against the consumer contract | Verification passes | Ph18 Pact pairs; §30.8 | `IMPLEMENTED` — `tests/contract/finance-procurement.pact.spec.ts` |
| `TC-P18-CONTRACT-002` | Analytics ← all services event-schema contract holds | CONTRACT | Pact files | 1. Verify | Verification passes | Ph18 Pact pairs | `IMPLEMENTED` — `tests/contract/analytics-all-services.pact.spec.ts` |
| `TC-P18-CONTRACT-003` | Mobile ← backend API response-shape contract holds | CONTRACT | Pact files | 1. Verify | Verification passes | Ph18 Pact pairs | `IMPLEMENTED` — `tests/contract/mobile-backend.pact.spec.ts` |
| `TC-P18-LOAD-001` | k6 Scenario 1 — dashboard SLA | LOAD | Staging | 1. 100 VUs for 5 min against `/api/v1/analytics/executive` | p95 < 3 s; error rate < 0.1% | Ph18 k6 Scenario 1 | `IMPLEMENTED` — `tests/load/dashboard-sla.js` |
| `TC-P18-LOAD-002` | k6 Scenario 2 — concurrent file uploads | LOAD | Staging | 1. 20 VUs uploading 5 MB for 5 min | p95 < 10 s; error rate < 0.5% | Ph18 k6 Scenario 2 | `IMPLEMENTED` — `tests/load/file-upload.js` |
| `TC-P18-LOAD-003` | k6 Scenario 3 — API gateway throughput | LOAD | Staging | 1. 200 VUs mixed reads for 10 min | p95 < 1 s; error rate < 0.1% | Ph18 k6 Scenario 3 | `IMPLEMENTED` — `tests/load/api-baseline.js`, `scripts/loadtest/mixed-api.js` |
| `TC-P18-LOAD-004` | k6 Scenario 4 — AI report generation | LOAD | Staging | 1. 10 VUs for 5 min | p95 < 15 s; error rate < 1% | Ph18 k6 Scenario 4 | `IMPLEMENTED` — `tests/load/ai-report.js` |
| `TC-P18-LOAD-005` | Lighthouse CI gate blocks Web Vitals regressions | LOAD | `apps/web` PR | 1. Run Lighthouse CI under the throttled mobile profile | LCP ≤ 2,500 ms, CLS ≤ 0.1, TBT ≤ 200 ms, script transfer ≤ 256,000 bytes; breach blocks merge | §30.9 Frontend Performance | `IMPLEMENTED` — `apps/web/.lighthouserc.json`, `.github/workflows/lighthouse.yml` |
| `TC-P18-MAN-003` | E2E suites run on merge to `staging`, not per PR | MAN | — | 1. Read the E2E workflow trigger | Triggered by merge to `staging`; not a PR gate | §30.5; ADR-048 | `IMPLEMENTED` — `e2e-tests` job in `.github/workflows/ci.yml` |
| `TC-P18-MAN-004` | Load and DAST run weekly and are non-blocking | MAN | — | 1. Read the workflow schedules | Both scheduled weekly; alert-only | §30.9; §30.12 | `IMPLEMENTED` — `.github/workflows/load-tests.yml`, `.github/workflows/dast.yml` |
| `TC-P18-MAN-005` | `docs/api/deprecation-schedule.md` exists before any endpoint sunset | MAN | — | 1. Assert the file exists | Present, with a minimum 90-day notice recorded per entry | Ph18 Generate; §14.4; QM-2 | `IMPLEMENTED` — verified in §35.12 |
| `TC-P18-MAN-006` | Every language's unit tests execute in CI | MAN | — | 1. Enumerate CI test steps by language | TypeScript, Python and Go unit tests all run | QM-1; §30.2 | `IMPLEMENTED` — 2026-08-22: `unit-tests` runs `services/file-service` `test:cov`; new `go-tests` and `ai-service-tests` jobs cover Go and Python (correctness gate; coverage thresholds to follow) |

**Phase 18 exit gate:** coverage 100/100 (QM-1); mutation score ≥ 70%; load test passes at target
concurrency; Lighthouse CI gate green (§30.9) (`00_master` Phase Register — Phase 18 Exit).

---

### 35.10.19 Phase 19 — Final Production Readiness

**Objective:** the production-readiness gate — 39 automated plus 22 manual checks.

**Spec references:** `00_master` §Phase 19 (Section A checklist, Section B adoption gates, Generate);
`context.md` §PHASE 19 VERIFICATION PROTOCOL; QM-1 … QM-18.

**Scope in:** the readiness scripts, the quality-mandate gate, the audit log, the adoption-gate
dashboard.
**Scope out:** the eight post-launch adoption gates themselves (measured in production over ≥ 30 days).

Every Phase 19 checklist item is a test case. They are grouped below by the checklist's own
categories; `[AUTO]` items map to `MAN` cases driven by a script, `[MANUAL]` items to `MAN` cases
driven by the interactive runner.

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P19-MAN-001` | CI is green on `main` before verification starts | MAN | `gh` authenticated | 1. `gh run list --branch main --limit 5 --json status,conclusion,name` | The latest run is not FAILED — otherwise verification does not proceed | `context.md` Phase 19 Step 0 | `PLANNED` — pre-check is procedural |
| `TC-P19-MAN-002` | The 30 scripted automated checks all pass | MAN | Staging reachable | 1. `./scripts/readiness/verify-production-readiness.sh --env staging` | 0 FAILED items; skipped items are reported with reason | `context.md` Phase 19 Step 1 | `IMPLEMENTED` — `scripts/readiness/verify-production-readiness.sh` (+ `check-health`, `check-security`, `check-observability`, `check-data`, `check-cicd`) |
| `TC-P19-MAN-003` | Coverage gate — 100% lines and branches | MAN | — | 1. `npx jest --coverage --coverageThreshold='{"global":{"lines":100,"branches":100}}'` | Passes | Phase 19 addition #1; QM-1 | `IMPLEMENTED` — CI `unit-tests` job |
| `TC-P19-MAN-004` | Node dependency audit passes | MAN | — | 1. `npm audit --audit-level=high` | No High/Critical unresolved | Phase 19 addition #2 | `IMPLEMENTED` — `dependency-audit` job |
| `TC-P19-MAN-005` | Python dependency audit passes | MAN | — | 1. `pip-audit --requirement ai/requirements.txt` | No High/Critical unresolved | Phase 19 addition #3 | `IMPLEMENTED` — `dependency-audit` job |
| `TC-P19-MAN-006` | SAST quality gate is GREEN | MAN | SonarQube reachable | 1. Run `sonar-scanner` with the project key | Gate GREEN | Phase 19 addition #4 | `IMPLEMENTED` — CodeQL quality gate (ADR-054) replaces the SonarQube scan for this check |
| `TC-P19-MAN-007` | OpenAPI specs are fresh | MAN | — | 1. `./scripts/readiness/check-openapi-freshness.sh` | Specs exist, are valid, carry a version and match the live service when `INGRESS_HOST` is set | Phase 19 addition #5; QM-2 | `IMPLEMENTED` — `scripts/readiness/check-openapi-freshness.sh` |
| `TC-P19-MAN-008` | i18n keys are complete | MAN | — | 1. `./scripts/readiness/check-i18n-completeness.sh` | No untranslated key between `th.json` and `en.json` | Phase 19 addition #6; QM-3 | `IMPLEMENTED` — `scripts/readiness/check-i18n-completeness.sh` |
| `TC-P19-MAN-009` | One-time load gate passes | MAN | Staging | 1. `k6 run --vus 100 --duration 300s ./scripts/loadtest/api-baseline.js` | Passes the script thresholds | Phase 19 addition #7; QM-6 | `IMPLEMENTED` — `scripts/loadtest/api-baseline.js` rewritten 2026-08-22 to the QM-6 profile: 100 VUs × 5 min, mixed read/write over real endpoints, `{op:read} p(95)<300`, `{op:write} p(95)<500`, error rate < 0.1% (ESC-12 resolved) |
| `TC-P19-MAN-010` | Security headers audit passes on staging | MAN | Staging | 1. `./scripts/readiness/check-security-headers.sh --env staging` | HSTS, `X-Content-Type-Options`, `X-Frame-Options`, CSP, `Referrer-Policy`, `Permissions-Policy` and TLS 1.3 all verified | Phase 19 addition #8; QM-4 | `IMPLEMENTED` — `scripts/readiness/check-security-headers.sh` |
| `TC-P19-MAN-011` | Kafka schema registry validation passes | MAN | Registry reachable | 1. `./scripts/readiness/check-schema-registry.sh` | Connectivity OK; `BACKWARD_TRANSITIVE` set; all critical v1 schemas registered; local `.avsc` files valid | Phase 19 addition #9; QM-9 | `IMPLEMENTED` — `scripts/readiness/check-schema-registry.sh` |
| `TC-P19-MAN-012` | The 14 scripted manual checks are walked with the product owner | MAN | Reviewer named | 1. `REVIEWER="<name>" ./scripts/readiness/run-all-checks.sh`; 2. Answer y/n/s per check | Every check answered; the audit log is written to `cos-audit/audit-<timestamp>.log` | `context.md` Phase 19 Step 2 | `IMPLEMENTED` — `scripts/readiness/run-all-checks.sh` |
| `TC-P19-MAN-013` | PDPA data flow is documented | MAN | — | 1. Read `docs/compliance/data-flow-map.md` | Present and reviewed | Phase 19 manual addition 1; QM-5 | `IMPLEMENTED` — verified in §35.12 |
| `TC-P19-MAN-014` | Rate limiting verified under load | MAN | Staging | 1. Drive sustained traffic above 100 req/min for one tenant | No tenant sustains more than 100 req/min | Phase 19 manual addition 2; QM-7 | `PLANNED` — k6 rate-limit scenario not located |
| `TC-P19-MAN-015` | DR runbook executed in staging within RTO | MAN | Staging | 1. Execute the DR runbook end to end; 2. Record the elapsed time | RTO achieved < 30 minutes; the result is recorded in the drill log | Phase 19 manual addition 3; QM-12 | `PLANNED` — drill result not verified |
| `TC-P19-MAN-016` | Backward compatibility with mobile version N-1 | MAN | Previous mobile build | 1. Run the N-1 mobile app against the new backend | All flows work | Phase 19 manual addition 4; QM-9 | `PLANNED` — not verified |
| `TC-P19-MAN-017` | Every mandatory feature flag toggles OFF within 60 s | MAN | Unleash reachable | 1. Toggle each mandatory flag off; 2. Measure propagation | All flags present and effective within 60 s without a deployment | Phase 19 manual addition 5; QM-15 | `PLANNED` — not verified |
| `TC-P19-MAN-018` | SLO dashboards are live with QM-14 thresholds | MAN | Grafana | 1. Open each SLO dashboard; 2. Compare thresholds with QM-14 | Availability tiers 99.5 / 99.9 / 99.95%, latency, error-rate and lag SLOs all match | Phase 19 manual addition 6; QM-14 | `PLANNED` — `docs/slo/dashboard-registry.md` content not verified |
| `TC-P19-MAN-019` | On-call rotation and paging drill completed | MAN | PagerDuty configured | 1. Run a paging drill | The escalation policy pages successfully | Phase 19 manual addition 7; QM-17 | `PLANNED` — drill not verified |
| `TC-P19-MAN-020` | Secrets rotation executed and verified in staging | MAN | — | 1. Read `docs/security/secrets-rotation-policy.md`; 2. Execute a rotation in staging | Schedule documented; first rotation succeeds | Phase 19 manual addition 8; QM-4 | `PLANNED` — rotation not verified |
| `TC-P19-MAN-021` | Backup, PITR and replication settings meet the checklist | MAN | AWS access | 1. Run the data checks | Daily backups with 30-day retention, PITR enabled, Kafka RF = 3 with min ISR = 2, Redis AOF on, ClickHouse and Neo4j daily backups | Phase 19 Data section | `IMPLEMENTED` — `scripts/readiness/check-data.sh` |
| `TC-P19-MAN-022` | Tenant-isolation validation passes against staging | MAN | Staging | 1. Run the isolation integration tests, the RLS policy tests and the Keycloak realm isolation test | All pass | Phase 19 Tenant Isolation Validation | `IMPLEMENTED` — `isolation-tests` job; `backend/test/tenant-isolation.integration.spec.ts` |
| `TC-P19-MAN-023` | The QUALITY MANDATES gate reports PASS for QM-1 … QM-18 | MAN | All prior checks done | 1. Complete Section B of the Phase 19 report | Every mandate reports PASS with its measured value | `context.md` Phase 19 Step 3 Section B | `PLANNED` — reported per run |
| `TC-P19-MAN-024` | All required runbooks and readiness documents exist | MAN | — | 1. Verify `docs/runbooks/production-readiness.md`, `deployment.md`, `rollback.md`, `incident-response.md`; 2. Verify `cos-audit/` and `docs/slo/monthly-reviews/` are committed | All present | Phase 19 Generate | `IMPLEMENTED` — verified in §35.12 |
| `TC-P19-MAN-025` | The eight production adoption gates are tracked in Grafana | MAN | Grafana | 1. Open the adoption-gate dashboard | All eight Section B gates are tracked | Phase 19 Generate; Section B | `PLANNED` — dashboard not verified |

**Phase 19 exit gate:** all 39 automated and 22 manual readiness checks green; product-owner sign-off
recorded in `cos-audit/audit-<timestamp>.log` (`00_master` Phase Register — Phase 19 Exit).

---

### 35.10.20 Phase 20 — Notification Service

**Objective:** centralised multi-channel notification delivery.

**Spec references:** `00_master` §Phase 20 (channels, triggers, entities, delivery rules, APIs,
Generate); §19.2 (channels), §19.3 (escalation, digest), §19.6 (quiet hours), §19.7 (email
migration); §7.3 (shared consumer group); QM-8 (escalation timeouts).

**Scope in:** Kafka consumer routing, template rendering, SSE, Expo push, email, LINE, preferences,
quiet hours, digests, escalation timers.
**Scope out:** the §15.5 48-hour *approval* escalation (Phase 5).

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P20-UNIT-001` | Each trigger event routes to its specified recipients | UNIT | Consumer under test | 1. Deliver `site.inspection.failed.v1`, `site.issue.created.v1` (CRITICAL), `procurement.po.status_changed.v1`, `finance.variance.alert.v1`, `site.report.created.v1`, `procurement.invoice.received.v1` | Recipients match the Phase 20 trigger table exactly (e.g. `site.report.created.v1` → `PROJECT_MANAGER`) | Ph20 Notification triggers | `IMPLEMENTED` — `backend/src/modules/notification/__tests__/notification.consumer.spec.ts` |
| `TC-P20-UNIT-002` | The consumer subscribes as `notification.shared` and validates the tenant header | UNIT | Consumer config | 1. Inspect the group id and subscription; 2. Deliver a mismatched-tenant message | Group is `notification.shared`; per-tenant topics are matched by RegExp; mismatched tenant messages are rejected before handling | Ph20 Generate; §7.3 | `IMPLEMENTED` — `notification.consumer.spec.ts` |
| `TC-P20-UNIT-003` | Templates render with tenant and system fallbacks | UNIT | Template service | 1. Render with a tenant-specific template; 2. Render where only the system template exists (`tenant_id` null) | Tenant template wins; otherwise the system template is used | Ph20 `notification_templates` | `IMPLEMENTED` — `notification.service.spec.ts` |
| `TC-P20-UNIT-004` | In-app delivery uses SSE, never WebSocket | UNIT | SSE service | 1. Inspect the in-app delivery transport | A NestJS `@Sse` endpoint per authenticated user session; no Socket.IO or WebSocket path exists | Ph20 Channels; §19.2 | `IMPLEMENTED` — `notification.sse.service.spec.ts` |
| `TC-P20-UNIT-005` | Push goes through Expo, not direct FCM | UNIT | Push adapter | 1. Send a push notification | `expo-server-sdk` is used so both APNs (iOS) and FCM (Android) are reached; `firebase-admin` is not called directly | Ph20 Channels; §19.2 | `IMPLEMENTED` — `notification.adapters.spec.ts` |
| `TC-P20-UNIT-006` | Email uses the SendGrid adapter for MVP | UNIT | Email adapter | 1. Send an email notification | The SendGrid adapter is invoked; the SES migration is a pre-Stage-2 change | Ph20 Channels; §19.7 | `IMPLEMENTED` — `notification.adapters.spec.ts` |
| `TC-P20-UNIT-007` | LINE delivery uses the tenant's channel access token | UNIT | Tenant with a LINE token configured | 1. Send a LINE push | The LINE Messaging API is called with the tenant's token from tenant settings | Ph20 Channels | `IMPLEMENTED` — `notification.adapters.spec.ts` |
| `TC-P20-UNIT-008` | No SMS adapter is invoked | UNIT | Channel registry | 1. Attempt delivery on the `SMS` enum value | The enum exists for schema compatibility but no MVP adapter is wired | Ph20 Channels (SMS DELETED); §19.2 | `IMPLEMENTED` — `notification.adapters.spec.ts` |
| `TC-P20-UNIT-009` | Preferences suppress disabled channels | UNIT | User preference disabled | 1. Trigger an event for that user | No notification is dispatched on the disabled channel | Ph20 `notification_preferences` | `IMPLEMENTED` — `notification.service.spec.ts` |
| `TC-P20-UNIT-010` | Quiet hours suppress non-critical delivery between 22:00 and 07:00 | UNIT | User in quiet hours (local timezone) | 1. Trigger a non-critical notification | Delivery is suppressed until the window ends | §19.6; Ph20 Delivery rules | `IMPLEMENTED` — `notification.service.spec.ts` |
| `TC-P20-UNIT-011` | Critical safety notifications override quiet hours and preferences | UNIT | User in quiet hours with the channel disabled | 1. Trigger a critical safety notification | Delivered regardless — it cannot be disabled or quieted | §19.6; QM-8 | `IMPLEMENTED` — `notification.service.spec.ts` |
| `TC-P20-UNIT-012` | Digests batch at 18:00 daily and 08:00 Monday | UNIT | Non-urgent notifications queued; fake timers | 1. Advance to each digest time | A daily digest is sent at 18:00 and a weekly digest on Monday 08:00, in the tenant timezone | §19.3; Ph20 Delivery rules | `IMPLEMENTED` — `notification.service.spec.ts` |
| `TC-P20-UNIT-013` | Escalation timeouts fire at 30 min, 2 h and 24 h | UNIT | Unacknowledged notifications; fake timers | 1. Leave a safety incident unacknowledged 30 min; 2. A budget alert 2 h; 3. An AI risk prediction 24 h | Escalates to PM, Executive and PM respectively | §19.3; QM-8 | `IMPLEMENTED` — `notification.service.spec.ts` |
| `TC-P20-UNIT-014` | `notification_preferences` is unique per user/event/channel | UNIT | Existing preference | 1. Insert a duplicate `(user_id, event_type, channel)` | Rejected | Ph20 entity UNIQUE | `IMPLEMENTED` — `notification.repository.spec.ts` |
| `TC-P20-UNIT-015` | The notification Prisma client closes on shutdown | UNIT | Service instance | 1. Invoke `onModuleDestroy` | `$disconnect()` is called | Rule 39; ADR-034 | `IMPLEMENTED` — `notification-prisma.service.spec.ts` |
| `TC-P20-INT-001` | Event → notification delivery end to end | INT | Testcontainers + Kafka | 1. Publish a trigger event; 2. Observe the stored notification and the channel dispatch | The notification is persisted and dispatched on the enabled channels | Ph20 Generate "Integration tests" | `IMPLEMENTED` — `backend/test/notification.integration.spec.ts` |
| `TC-P20-MAN-001` | Notification delivery p95 stays under 500 ms (in-app SSE) | MAN | Staging | 1. Measure SSE delivery latency | p95 < 500 ms | QM-14 SLO table | `PLANNED` — measurement not located |

**Phase 20 exit gate:** notification delivery and the safety-alert path verified; the service is
excluded from maintenance windows (`00_master` Phase Register — Phase 20 Exit).

---

### 35.10.21 Phase 21 — Equipment Service

**Objective:** the equipment domain.

**Spec references:** `00_master` §Phase 21 (entities, TimescaleDB tables, APIs, Generate, IoT stub);
§13.5 (IoT), §33.8 (EMQX); ADR-032 (TimescaleDB co-location); §32.9 (Type B stub).

**Scope in:** equipment CRUD and status, assignments, maintenance, utilisation hypertable, equipment
events, the IoT integration stub.
**Scope out:** live IoT ingestion and the digital twin (Phase 24).

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P21-UNIT-001` | Equipment status transitions are valid only between specified states | UNIT | Equipment record | 1. Transition across `AVAILABLE`, `IN_USE`, `MAINTENANCE`, `RETIRED` | Only specified transitions succeed; no state is invented | Ph21 entities; Rule 8 | `IMPLEMENTED` — `backend/src/modules/equipment/__tests__/equipment.service.spec.ts` |
| `TC-P21-UNIT-002` | `equipment_code` is unique per tenant | UNIT | Existing equipment | 1. Create a duplicate code in the same tenant; 2. In another tenant | 1 → conflict; 2 → succeeds | Ph21 UNIQUE `(tenant_id, equipment_code)` | `IMPLEMENTED` — `equipment.repository.spec.ts` |
| `TC-P21-UNIT-003` | Assignment sets the equipment to `IN_USE` and emits the event | UNIT | Available equipment | 1. `POST /api/v1/equipment/:id/assignments` | Status becomes `IN_USE`; `equipment.unit.assigned.v1 { equipment_id, project_id, assigned_by }` is emitted | Ph21 APIs and Kafka producers | `IMPLEMENTED` — `equipment.service.spec.ts` |
| `TC-P21-UNIT-004` | Return records `returned_at` and emits the event | UNIT | Assigned equipment | 1. `PATCH .../assignments/:aid/return` | `returned_at` is set; `equipment.unit.returned.v1` is emitted | Ph21 | `IMPLEMENTED` — `equipment.service.spec.ts` |
| `TC-P21-UNIT-005` | Maintenance scheduling emits its event | UNIT | Equipment record | 1. `POST /api/v1/equipment/:id/maintenance` | `equipment.unit.maintenance_scheduled.v1 { equipment_id, scheduled_at }` is emitted | Ph21 Kafka producers | `IMPLEMENTED` — `equipment.service.spec.ts` |
| `TC-P21-UNIT-006` | Purchase and maintenance costs use 4-decimal money | UNIT | Cost fields | 1. Persist a cost with more than 4 decimals | Stored as `DECIMAL(19,4)` with an ISO-4217 currency; no float arithmetic | §32.5; Rule 23 | `IMPLEMENTED` — `equipment.repository.spec.ts` |
| `TC-P21-UNIT-007` | The IoT stub returns safe defaults (Type B) | UNIT | IoT stub | 1. Call `streamTelemetry(...)` | Logs WARN and returns safe defaults so the service remains operational — Type B is IoT-only | §32.9 Type B; Ph21 stub | `PLANNED` — stub behaviour assertion not located |
| `TC-P21-INT-001` | Utilisation records land in the TimescaleDB hypertable | INT | Testcontainers on the `timescale/timescaledb` image | 1. `POST /api/v1/equipment/:id/utilization`; 2. Query `equipment_telemetry.equipment_utilization` | The row is stored in the hypertable partitioned by `recorded_at` | Ph21 TimescaleDB Tables; §30.4 harness | `IMPLEMENTED` — `backend/test/rls-immutability.integration.spec.ts` asserts `equipment_telemetry.equipment_utilization` is registered in `timescaledb_information.hypertables`, that an inserted record reads back, and that it lands in a chunk (§35.13 ESC-28) |
| `TC-P21-ISO-001` | Equipment APIs are tenant-isolated | ISO | Two tenant fixtures | 1. Read Tenant B's equipment with Tenant A's JWT | 403 / zero rows | §30.6 | `IMPLEMENTED` — `backend/test/rls-immutability.integration.spec.ts` drives the RLS policies as `app_user`: tenant A cannot read or update tenant B equipment even by id, and a request with no tenant context reads zero rows rather than everything (§35.13 ESC-28) |

**Phase 21 exit gate:** equipment APIs pass the isolation-test suite
(`00_master` Phase Register — Phase 21 Exit).

---

### 35.10.22 Phase 22 — Workforce Service

**Objective:** the workforce domain — workers, attendance, timesheets.

**Spec references:** `00_master` §Phase 22 (entities, TimescaleDB tables, APIs, Generate); §13.5
(biometric interface); §32.4 (checkin event); §32.9 (stub pattern).

**Scope in:** worker CRUD, project allocation, attendance hypertable, timesheets, workforce events,
biometric/QR check-in.
**Scope out:** payroll integration (not specified anywhere — must not be invented).

> **Biometric scope resolved (product owner, 2026-08-22).** `00_master` Phase 22 marks biometric
> check-in "deferred — do not implement until spec defines it", while §13.5 defines the
> `verifyCheckIn` interface. The product owner directed that full interface-level cases be designed.
> §13.5 specifies only the signature and return type, so acceptance behaviour beyond
> `Promise<boolean>` is `UNSPECIFIED` (§35.13 ESC-04).

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P22-UNIT-001` | `employee_code` is unique per tenant | UNIT | Existing worker | 1. Create a duplicate code in the same tenant; 2. In another tenant | 1 → conflict; 2 → succeeds | Ph22 UNIQUE `(tenant_id, employee_code)` | `IMPLEMENTED` — `backend/src/modules/workforce/__tests__/workforce.repository.spec.ts` |
| `TC-P22-UNIT-002` | Employment type is restricted to the three specified values | UNIT | Worker DTO | 1. Submit `PERMANENT`, `CONTRACT`, `SUBCONTRACT` and an invalid value | The three are accepted; the invalid value is rejected by class-validator | Ph22 entities; QM-4 | `IMPLEMENTED` — `workforce.controller.spec.ts` |
| `TC-P22-UNIT-003` | Check-in emits `workforce.checkin.created.v1` | UNIT | Allocated worker | 1. `POST /api/v1/workers/:id/attendance` | Event emitted with `{ worker_id, project_id, checked_in_at }`; the Event Contract adds `method ∈ {QR_CODE, GPS, BIOMETRIC, MANUAL}` and a nullable `location` | Ph22 Kafka producers; Event Contract #9 | `IMPLEMENTED` — `workforce.service.spec.ts` |
| `TC-P22-UNIT-004` | Check-out computes `hours_worked` and emits its event | UNIT | Checked-in worker | 1. Record a check-out | `hours_worked` is computed from the interval; `workforce.checkout.created.v1` is emitted | Ph22 Generate "attendance calculation" | `IMPLEMENTED` — `workforce.service.spec.ts` |
| `TC-P22-UNIT-005` | Timesheet aggregation separates regular and overtime hours | UNIT | Attendance across a period | 1. Generate the timesheet | `regular_hours` and `overtime_hours` are aggregated separately with 2-decimal precision | Ph22 `timesheets`; Generate "timesheet aggregation" | `IMPLEMENTED` — `workforce.service.spec.ts` |
| `TC-P22-UNIT-006` | Timesheet approval requires `SITE_ENGINEER` | UNIT | Submitted timesheet | 1. `PATCH /api/v1/timesheets/:id/approve` as each role | Only `SITE_ENGINEER` succeeds | Ph22 APIs | `IMPLEMENTED` — `workforce.controller.spec.ts` |
| `TC-P22-UNIT-007` | Timesheet approval emits its event | UNIT | Approved timesheet | 1. Approve | `workforce.timesheet.approved.v1 { worker_id, project_id, period_date, total_hours }` is emitted | Ph22 Kafka producers | `IMPLEMENTED` — `workforce.service.spec.ts` |
| `TC-P22-UNIT-008` | The workforce summary feeds analytics | UNIT | Attendance data | 1. `GET /api/v1/projects/:projectId/workforce/summary` | Returns the manpower summary used by the analytics dashboards | Ph22 APIs | `IMPLEMENTED` — `workforce.controller.spec.ts` |
| `TC-P22-UNIT-009` | `verifyCheckIn` accepts `FINGERPRINT`, and falls back to `MANUAL` on timeout | UNIT | Biometric adapter injected via DI | 1. Call `verifyCheckIn(workerId, projectId, 'FINGERPRINT')`; 2. Repeat with an adapter that never resolves | Resolves to a boolean; after 5 s the call falls back to a `MANUAL` check-in, the attendance row records `method = MANUAL` with the fallback flagged, and the attempt is audited | §13.5 Biometric fallback table | `PLANNED` — ESC-04 defined the acceptance behaviour on 2026-08-22 and §13.5 now carries it, so the case is no longer blocked. No test asset exists because `verifyCheckIn` is not implemented: `grep` for `verifyCheckIn`/`BiometricMethod` across `backend/src` and `services` returns nothing |
| `TC-P22-UNIT-010` | `verifyCheckIn` accepts `FACE_ID`, and falls back to `MANUAL` on timeout | UNIT | Adapter injected | 1. Call with `'FACE_ID'`; 2. Repeat with a non-resolving adapter | As `TC-P22-UNIT-009` | §13.5 Biometric fallback table | `PLANNED` — as `TC-P22-UNIT-009` (ESC-04 resolved; not implemented) |
| `TC-P22-UNIT-011` | `verifyCheckIn` accepts `IRIS`, and falls back to `MANUAL` on timeout | UNIT | Adapter injected | 1. Call with `'IRIS'`; 2. Repeat with a non-resolving adapter | As `TC-P22-UNIT-009` | §13.5 Biometric fallback table | `PLANNED` — as `TC-P22-UNIT-009` (ESC-04 resolved; not implemented) |
| `TC-P22-UNIT-012` | An unconfigured biometric adapter fails fast | UNIT | No vendor adapter bound | 1. Call `verifyCheckIn(...)` | Logs WARN and throws a typed exception — biometric is not listed as Type B, so the Type A pattern applies | §32.9 Type A; Ph2 BiometricCheckIn decision | `PLANNED` — stub not located in `backend/src/modules/workforce` |
| `TC-P22-UNIT-013` | The QR check-in path is distinct from biometric | UNIT | Check-in service | 1. Check in with `method = QR_CODE` | Succeeds without invoking the biometric adapter | Ph22 Biometric/QR interface; Event Contract #9 | `PLANNED` — not located |
| `TC-P22-INT-001` | Full check-in/check-out cycle | INT | Testcontainers on the TimescaleDB image | 1. Check in; 2. Check out; 3. Read attendance history | Both rows land in the `attendance_logs` hypertable and the history endpoint returns them | Ph22 Generate "Integration tests" | `IMPLEMENTED` — `backend/test/workforce.integration.spec.ts` |
| `TC-P22-ISO-001` | Workforce APIs are tenant-isolated | ISO | Two tenant fixtures | 1. Read Tenant B's workers with Tenant A's JWT | 403 / zero rows | §30.6 | `IMPLEMENTED` — `backend/test/tenant-isolation.integration.spec.ts` |

**Phase 22 exit gate:** workforce APIs pass the isolation-test suite
(`00_master` Phase Register — Phase 22 Exit).

---

### 35.10.23 Phase 23 — MLOps Pipeline

**Objective:** the MLOps pipeline — MLflow registry, Feast feature store, Evidently drift.

**Spec references:** `00_master` §Phase 23 (stack, data sources, data flow, model types, feature
store, DAGs, Generate, stubs); §22.6 (algorithms, data thresholds), §22.9 (model governance);
§30.11 Layer B (evaluation framework); ADR-038.

**Scope in:** the five Airflow DAGs, MLflow and Feast configuration, data export, model interfaces,
Layer B evaluation.
**Scope out:** activating models before their data thresholds are met; autonomous execution.

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P23-UNIT-001` | All five DAGs load without import errors | UNIT | Airflow test deps installed | 1. Load the DAG bag | `dag-export-training-data`, `dag-train-delay-model`, `dag-train-risk-classifier`, `dag-update-feature-store` and `dag-model-evaluation` all parse | Ph23 Airflow DAGs; Generate | `IMPLEMENTED` — `mlops/tests/test_dag_integration.py`; DAG files in `mlops/airflow/dags/` |
| `TC-P23-UNIT-002` | DAG task functions behave correctly against mocked sources | UNIT | Mocked data sources | 1. Invoke each task function | Each returns the expected artefact without touching a live source | Ph23 Generate "Unit tests" | `IMPLEMENTED` — `mlops/tests/test_dag_tasks.py` |
| `TC-P23-UNIT-003` | Data export writes Parquet to the tenant data-lake bucket | UNIT | Export utility | 1. Export a table | Parquet is written to `cos-datalake-{tenant_id}` using pandas + pyarrow | Ph23 Generate | `IMPLEMENTED` — `mlops/data_export/` |
| `TC-P23-UNIT-004` | `ModelRegistry` registers a model version in MLflow | UNIT | MLflow client mocked | 1. Call `registerModel(name, version, artifactPath)` | A `ModelRef` is returned from the MLflow-backed registry | Ph23 stub `ModelRegistry` | `IMPLEMENTED` — `mlops/interfaces/model_registry.py` |
| `TC-P23-UNIT-005` | `FeatureStore` returns online features from Feast | UNIT | Feast client mocked | 1. Call `getOnlineFeatures(entityRows)` | Feature vectors are returned from the Redis online store | Ph23 stub `FeatureStore` | `IMPLEMENTED` — `mlops/interfaces/feature_store.py` |
| `TC-P23-UNIT-006` | `ExperimentMonitoring.logRun` records to MLflow with no external SaaS | UNIT | MLflow mocked | 1. Call `logRun(experimentName, metrics, params)` | A `RunRef` is returned; no external API key is required (in-cluster MLflow + Evidently) | Ph23 stub; ADR-038 | `IMPLEMENTED` — `mlops/interfaces/experiment_monitoring.py` |
| `TC-P23-UNIT-007` | `AutonomousWorkflowExecutor` remains inactive and refuses high-risk actions | UNIT | Executor stub | 1. Call `execute(...)` for a financial transaction, an approval workflow and a data deletion | Each is refused — the executor is a stub only and must never trigger these actions; governance review is required before activation | Ph23 stub constraint; §22.3 | `IMPLEMENTED` — `mlops/interfaces/autonomous_workflow_executor.py` |
| `TC-P23-UNIT-008` | The three Feast feature views expose their specified features | UNIT | Feast config | 1. Read `feature_store.yaml` and the feature-view definitions | `project_features` (budget_variance, days_to_deadline, open_issue_count), `procurement_features` (avg_delivery_delay, rfq_to_po_days, overdue_invoice_count), `site_features` (manpower_7d_avg, inspection_fail_rate, report_submission_rate); Redis online, ClickHouse offline | Ph23 Feature Store | `IMPLEMENTED` — `mlops/feast/` |
| `TC-P23-UNIT-009` | Every Phase 23 model is a scikit-learn/XGBoost implementation | UNIT | Model modules | 1. Inspect each model module | `DelayForecastModel` (XGBoost regressor), `SafetyVisionModel` (XGBoost classifier on HOG + ViT), `GraphMLModel` (XGBoost on graph features), `RiskClassifier` (XGBoost multi-class) — no other framework is introduced | §22.6; Rule "Use scikit-learn + XGBoost" | `IMPLEMENTED` — `mlops/models/` (4 modules) |
| `TC-P23-UNIT-010` | Models do not train below their minimum data thresholds | UNIT | Undersized datasets | 1. Attempt training with < 90 days for delay, < 10,000 photos for safety vision, < 6 months graph data, < 50 projects for risk | Training is refused for each | §22.6 minimum data thresholds | `PLANNED` — threshold guard not located |
| `TC-P23-AI-001` | `DelayForecastModel` meets RMSE ≤ 5 days | AI | 70/30 walk-forward split | 1. Train on 70%; 2. Evaluate on the held-out 30% with walk-forward validation; 3. Run 1,000 Monte Carlo iterations for uncertainty | RMSE ≤ 5 days (secondary metric MAE reported) | §30.11 Layer B | `PLANNED` — production history not available |
| `TC-P23-AI-002` | `RiskClassifier` meets F1 ≥ 0.80 | AI | 70/30 split | 1. Train; 2. Evaluate | F1 ≥ 0.80 (secondary AUC-ROC reported) | §30.11 Layer B | `PLANNED` — production history not available |
| `TC-P23-AI-003` | `SafetyVisionModel` meets its evaluation threshold | AI | 10,000+ labelled photos | 1. Train; 2. Evaluate | Precision ≥ 0.85 (primary); Recall reported as the secondary metric | §30.11 Layer B model table | `PLANNED` — ESC-02 set the metric and threshold on 2026-08-22 and §30.11 now carries them. No test asset exists: `mlops/models/safety_vision_model.py` is a stub that raises, and `mlops/tests/test_dag_tasks.py` asserts only that it raises — nothing evaluates the threshold |
| `TC-P23-AI-004` | `GraphMLModel` meets its evaluation threshold | AI | 6+ months of graph data | 1. Train; 2. Evaluate | F1-score ≥ 0.80 (primary); AUC-ROC reported as the secondary metric | §30.11 Layer B model table | `PLANNED` — as `TC-P23-AI-003`: ESC-02 resolved the threshold; `mlops/models/graph_ml_model.py` is a stub that raises and no test evaluates it |
| `TC-P23-AI-005` | Drift detection alerts when PSI > 0.2 | AI | Evidently monitoring live | 1. Shift the feature distribution beyond PSI 0.2 | A drift alert fires and retraining is triggered | §30.11 Layer B drift detection | `PLANNED` — not located |
| `TC-P23-AI-006` | Evaluation runs monthly, not per PR, and alerts on > 10% regression | AI | Monthly schedule | 1. Run the monthly evaluation; 2. Compare with the previous month | Cadence is monthly; a > 10% drop in any metric alerts the AI Lead and triggers retraining | §30.11 Evaluation Schedule | `PLANNED` — schedule not located |
| `TC-P23-INT-001` | End-to-end DAG run with test data | INT | Airflow test environment | 1. Trigger `dag-export-training-data` through `dag-model-evaluation` | The chain completes and logs to MLflow | Ph23 Generate "Integration tests" | `IMPLEMENTED` — `mlops/tests/test_dag_integration.py` |
| `TC-P23-MAN-001` | Model cards exist for every deployed model | MAN | — | 1. Check the model-card register | Every deployed model (LLM provider model, `SafetyVisionModel`, `RiskClassifier`) has a card | §22.9; Ph23 Exit | `PLANNED` — register not located |

**Phase 23 exit gate:** model registry, drift monitoring and model cards live (§22.9)
(`00_master` Phase Register — Phase 23 Exit).

---

### 35.10.24 Phase 24 — Digital Twin

**Objective:** the digital twin layer — state synchronisation, divergence detection and inference.

**Spec references:** `00_master` §Phase 24 (prerequisites, data model, capabilities, infrastructure,
Generate, Constraints); §33 (digital twin and IoT), §33.3 (service assignment), §33.4 (carbon);
ADR-032.

**Scope in:** twin entity/state hypertable, IoT-driven state synchronisation, divergence detection,
twin query API, twin events, carbon analytics aggregation.
**Scope out:** using the twin as a write path for operational data (explicitly prohibited).

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P24-UNIT-001` | Divergence is computed from planned versus actual state | UNIT | Planned (BIM/schedule) and actual (IoT/inspection) states | 1. Compute divergence for a matching pair; 2. For a diverging pair | Gap is 0 for the match and non-zero for the divergence | Ph24 Capability 2; Generate "Unit tests" | `IMPLEMENTED` — `services/ai-gateway/digital_twin/tests/test_divergence.py` |
| `TC-P24-UNIT-002` | `divergence_gap` stays within `[0.000, 1.000]` as a decimal string | UNIT | Divergence engine | 1. Compute across the input range | The emitted `divergence_gap` is a decimal string bounded by 0.000 and 1.000 | §33 `twin.divergence.detected.v1` payload | `IMPLEMENTED` — `test_divergence.py` |
| `TC-P24-UNIT-003` | Divergence alerts fire above the configured per-entity threshold | UNIT | Thresholds configured | 1. Compute a divergence above and below the configured threshold | Above → `twin.divergence.detected.v1` emitted; below → no event | Ph24 Capability 2 | `IMPLEMENTED` (mechanism) — `test_divergence.py`. Threshold **values** per entity type are not defined in `00_master` Phase 24 or §33; they are configuration, and the test asserts the configured value rather than a literal |
| `TC-P24-UNIT-004` | State merge respects source precedence | UNIT | States from `IOT`, `MANUAL` and `AI_INFERRED` | 1. Merge concurrent states | The merge follows the specified precedence and records the winning `source` | Ph24 `TwinState`; Generate "state merge logic" | `IMPLEMENTED` — `services/ai-gateway/digital_twin/sync_service.py` tests |
| `TC-P24-UNIT-005` | Every inferred state carries a confidence score | UNIT | AI-inferred state | 1. Produce an inferred state | `confidence` is present and mandatory | Ph24 Constraints | `IMPLEMENTED` — `test_divergence.py`, `models.py` |
| `TC-P24-UNIT-006` | The twin rejects direct operational writes | UNIT | Twin API | 1. Attempt to write operational data directly to the twin | Rejected — the twin is read-optimised and all writes arrive from source systems via Kafka | Ph24 Constraints | `PLANNED` — assertion not located |
| `TC-P24-UNIT-007` | IoT telemetry updates twin state | UNIT | Kafka handler | 1. Consume an `equipment.telemetry.*` event | The corresponding `TwinState` is updated | Ph24 Generate "Kafka consumer" | `IMPLEMENTED` — `services/ai-gateway/digital_twin/kafka_handler.py` tests |
| `TC-P24-UNIT-008` | Carbon records aggregate to ClickHouse by GHG scope | UNIT | Go carbon consumer | 1. Consume `carbon.record.created.v1` | `carbon_kgco2e` is aggregated to ClickHouse with Scope 1/2/3 classification | Ph24 Generate; §33.3 | `IMPLEMENTED` — `services/analytics-worker/internal/carbon/consumer_test.go` |
| `TC-P24-INT-001` | IoT event → twin state → divergence alert | INT | Twin stack | 1. Publish telemetry that diverges from plan; 2. Observe the state update and the alert | The state updates and `twin.divergence.detected.v1` is emitted to the Notification Service | Ph24 Generate "Integration tests" | `IMPLEMENTED` — `services/ai-gateway/digital_twin/tests/test_twin_integration.py` |
| `TC-P24-MAN-001` | Twin state is stored in TimescaleDB as a hypertable | MAN | Migrated DB | 1. Inspect the twin schema | `TwinEntity`/`TwinState` are stored in a hypertable co-located on the primary PostgreSQL instance | Ph24 Infrastructure; ADR-032 | `PLANNED` — schema assertion not located |
| `TC-P24-MAN-002` | Phase 24 does not block Phases 15–19 | MAN | — | 1. Confirm the twin deploys as a post-production layer | No Phase 15–19 gate depends on Phase 24 | Ph24 Constraints | `IMPLEMENTED` — no Phase 15–19 case in this document references Phase 24 |

**Phase 24 exit gate:** IoT ingestion and twin per `33-digital-twin-iot`; per-device authentication
and schema validation (`00_master` Phase Register — Phase 24 Exit).

---

### 35.10.25 Phase 25 — Enterprise Provisioning

**Objective:** automated dedicated-database provisioning for enterprise tenants.

**Spec references:** `00_master` §Phase 25 (triggers, workflow, compensation, events, Generate,
Constraints); §34 (enterprise tenant provisioning), §34.6 (webhook HMAC); §7.1 (dedicated DB).

**Scope in:** both trigger paths, the five workflow activities, the human gate, compensation,
provisioning events, the RDS Terraform module, webhook signature verification.
**Scope out:** CRM-specific adapters (generic payload only in Phase 25).

| ID | Title | Level | Pre-condition | Steps | Expected result | Spec ref | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `TC-P25-UNIT-001` | Both trigger paths start the same workflow | UNIT | Workflow client mocked | 1. `PATCH /api/v1/admin/tenants/:tenantId/mark-contracted`; 2. `POST /api/v1/platform/webhooks/enterprise-contract-signed` | Both start `EnterpriseProvisioningWorkflow` on the `enterprise-provisioning` task queue | Ph25 Triggers | `IMPLEMENTED` — `backend/src/modules/platform-webhook/__tests__/platform-webhook.controller.spec.ts` |
| `TC-P25-UNIT-002` | The webhook verifies an HMAC-SHA256 signature in constant time | UNIT | `PLATFORM_WEBHOOK_SECRET` set | 1. Send a correctly signed request; 2. Send a tampered signature | Valid → accepted; tampered → 401. Comparison uses `timingSafeEqual` against `"sha256=" + HMAC-SHA256(secret, rawBody)` | Ph25 Generate SECURITY; §34.6 | `IMPLEMENTED` — `platform-webhook.service.spec.ts` |
| `TC-P25-UNIT-003` | A missing secret or raw body returns 500; a missing signature returns 401 | UNIT | Webhook endpoint | 1. Unset the secret; 2. Omit the raw body; 3. Omit the signature header | 1 and 2 → 500; 3 → 401 | Ph25 Generate SECURITY steps | `IMPLEMENTED` — `platform-webhook.service.spec.ts` |
| `TC-P25-UNIT-004` | The raw body is captured before parsing | UNIT | Fastify content-type parser | 1. Inspect the request pipeline | The raw body is captured as a `Buffer` via `addContentTypeParser` so the HMAC is computed over the exact bytes | Ph25 Generate SECURITY step 1 | `IMPLEMENTED` — `platform-webhook.service.spec.ts` |
| `TC-P25-UNIT-005` | The workflow runs its five activities in order | UNIT | Temporal test environment | 1. Execute the workflow | `createRdsActivity` → `runMigrationsActivity` → `assignDedicatedDbActivity` → [human gate] → `migrateDataActivity` → `verifyRoutingActivity` | Ph25 Workflow | `IMPLEMENTED` — `backend/src/modules/tenant/__tests__/enterprise-provisioning.workflow.spec.ts` |
| `TC-P25-UNIT-006` | The workflow is idempotent per tenant | UNIT | Workflow already run for a tenant | 1. Trigger again for the same `tenant_id` | No duplicate RDS instance is created | Ph25 Constraints | `IMPLEMENTED` — `enterprise-provisioning.workflow.spec.ts` |
| `TC-P25-UNIT-007` | The human gate waits indefinitely | UNIT | Workflow at the gate; clock advanced far beyond any normal timeout | 1. Advance the test clock without sending a signal | The workflow remains waiting — the gate must not time out | Ph25 Constraints | `IMPLEMENTED` — `enterprise-provisioning.workflow.spec.ts` |
| `TC-P25-UNIT-008` | `approve` proceeds to data migration; `abort` does not | UNIT | Workflow at the gate | 1. Signal `approve`; 2. In a second run signal `abort` | Approve → `migrateDataActivity` runs (only if the tenant has existing data); abort → it does not | Ph25 Workflow Activity 4 | `IMPLEMENTED` — `enterprise-provisioning.workflow.spec.ts` |
| `TC-P25-UNIT-009` | Compensation reverses `createRds` and `assignDedicatedDb` | UNIT | Failure after each activity | 1. Fail after `createRdsActivity`; 2. Fail after `assignDedicatedDbActivity` | 1 → `DeleteDBInstance`; 2 → `dedicated_db_url` reset to `NULL` | Ph25 Compensation | `IMPLEMENTED` — `enterprise-provisioning.workflow.spec.ts` |
| `TC-P25-UNIT-010` | `migrateData` has no automatic rollback | UNIT | Failure during data migration | 1. Fail `migrateDataActivity` | No automatic rollback runs; SYSTEM_ADMIN coordination is required and surfaced | Ph25 Compensation | `IMPLEMENTED` — `enterprise-provisioning.workflow.spec.ts` |
| `TC-P25-UNIT-011` | Both provisioning events are emitted | UNIT | Workflow run | 1. Complete the workflow | `platform.enterprise.contract_signed.v1 { tenant_id, contract_reference? }` and `platform.enterprise.db_provisioned.v1 { tenant_id, rds_endpoint }` are emitted | Ph25 Events emitted | `IMPLEMENTED` — `enterprise-provisioning.workflow.spec.ts` |
| `TC-P25-UNIT-012` | `platform.*` tables stay on the shared database | UNIT | Provisioned enterprise tenant | 1. Inspect routing for `platform.*` queries | They continue to resolve to the shared database and are never moved to the dedicated instance | Ph25 Constraints; §7.1 | `IMPLEMENTED` — `backend/src/modules/tenant/__tests__/tenant-prisma.service.spec.ts`, `utils/__tests__/get-db-url.spec.ts` |
| `TC-P25-UNIT-013` | A non-NULL `dedicated_db_url` routes domain queries to the tenant database | UNIT | Tenant with a dedicated URL | 1. Issue a domain query | The query targets the tenant's own PostgreSQL instance | §7.1; QM-18 | `IMPLEMENTED` — `get-db-url.spec.ts` |
| `TC-P25-UNIT-014` | The CRM webhook payload stays generic | UNIT | Webhook | 1. Post a payload containing CRM-specific fields | Only `{ tenant_id, contract_reference? }` is consumed; no CRM-specific adapter exists in Phase 25 | Ph25 Constraints | `IMPLEMENTED` — `platform-webhook.controller.spec.ts` |
| `TC-P25-MAN-001` | The RDS tenant Terraform module exists | MAN | — | 1. List `infrastructure/terraform/modules/rds-tenant/` | `main.tf`, `variables.tf` and `outputs.tf` are present | Ph25 Generate | `PLANNED` — module contents not verified |
| `TC-P25-MAN-002` | TypeScript interfaces and Avro schemas exist for both events | MAN | — | 1. Locate `platform.enterprise.contract_signed.v1` and `platform.enterprise.db_provisioned.v1` `.ts` and `.avsc` files | Both pairs exist | Ph25 Generate; Rule 9 | `PLANNED` — files not verified |
| `TC-P25-INT-001` | Provisioning creates a working dedicated database | INT | Test environment | 1. Run the workflow end to end; 2. Run `verifyRoutingActivity` | A test query succeeds against the dedicated database | Ph25 Activity 5 | `PLANNED` — not located |

**Phase 25 exit gate:** dedicated-DB provisioning and SSO/SAML via Keycloak; INT-004 interop
conformance for the ecosystem (`00_master` Phase Register — Phase 25 Exit).

---

## 35.11 Traceability Matrix

489 test cases across 25 phases. Each row closes the §35.3 chain:
spec § → phase → test case IDs → CI gate.

| Phase | Cases | Primary spec references | Levels used | Gating CI job (§30.12) |
| --- | --- | --- | --- | --- |
| 1 Foundation Repository | 19 | Ph1 Generate; §32.2; QM-1, QM-11, QM-18; Rules 26–28, 31–32, 35; ADR-033, ADR-036 | UNIT, INT, MAN | lint · type-check · build · unit-tests |
| 2 Auth + Tenant System | 24 | Ph2 Generate; §5.4, §5.4.2, §6.2, §6.9, §7.6, §7.7, §14.3, §32.8; ADR-008/030/031/035/040 | UNIT, INT, ISO, MAN | unit-tests · integration-tests · isolation-tests |
| 3 Project Service | 18 | Ph3 Generate; §10.2, §11.2, §20.5 | UNIT, INT, ISO, MAN | unit-tests · integration-tests · isolation-tests |
| 4 BOQ Service | 19 | Ph4 Generate; §32.5; QM-1 | UNIT, INT, ISO, SEC | unit-tests · integration-tests · mutation-tests |
| 5 Procurement Service | 28 | Ph5 Generate; §32.6, §15.5, §14, §13.3; ADR-022, ADR-030 | UNIT, INT, SEC, MAN | unit-tests (+ serial workflows) · integration-tests · mutation-tests |
| 6 Site Operations | 27 | Ph6 Generate; §17.4, §17.6; QM-9; ADR-025, ADR-027 | UNIT, INT | unit-tests · integration-tests |
| 7 Finance Service | 20 | Ph7 Generate; §32.5, §11, §15; ADR-023, ADR-024 | UNIT, INT, ISO | unit-tests · integration-tests · isolation-tests |
| 8 Event Infrastructure | 20 | Ph8 Generate; §32.4, §7.3, §15.6; QM-9; Rules 33–34 | UNIT, INT, MAN | unit-tests · integration-tests |
| 9 File + Document | 21 | Ph9 Generate; QM-4, QM-10 | UNIT, INT, ISO, LOAD, SEC | unit-tests · integration-tests · load-tests |
| 10 Mobile Offline Engine | 24 | Ph10 Generate; §17.2, §17.4, §17.6, §17.7, §17.9, §17.10; §30.7; ADR-048, ADR-050 | UNIT, E2E, MAN | mobile-tests · e2e-tests (Detox) |
| 11 AI Foundation | 19 | Ph11 Generate; §22.3, §22.6, §22.7, §22.8, §22.10; §30.11 Layer A | UNIT, INT, AI, MAN | (see ESC-05 — AI-service pytest is not wired into CI) |
| 12 AI Report Assistant | 21 | Ph12 Generate; §22.3; §31.6; §30.11 Layer A | UNIT, INT, AI, LOAD | (see ESC-05) · load-tests |
| 13 Knowledge Graph | 18 | Ph13 Generate; §12, §7.3, §15.6, §32.4 | UNIT, INT, ISO, MAN | (see ESC-05 — Go tests are not wired into CI) |
| 14 Analytics + Dashboard | 14 | Ph14 Generate; §31.6; §30.9 | UNIT, INT, ISO, LOAD, MAN | unit-tests · integration-tests · load-tests |
| 15 Observability | 17 | Ph15 Generate; §31.2–31.12; QM-8, QM-14 | UNIT, MAN | unit-tests |
| 16 Security | 29 | Ph16 Generate; §5.2, §5.5, §5.8, §5.9, §5.10, §9.7.3; QM-4, QM-5, QM-7; §30.10 | UNIT, INT, ISO, SEC, MAN | unit-tests · isolation-tests · dependency-audit · secret-scan · security-scan · dast |
| 17 DevOps + Deployment | 11 | Ph17 Generate; QM-16, QM-18; §31.11, §31.12; ADR-039 | INT, MAN | build-docker · push-ecr · update-gitops |
| 18 Testing | 28 | Ph18 Generate; §30.2–30.13; QM-1; ADR-048 | UNIT, CONTRACT, E2E, LOAD, MAN | unit-tests · contract-tests · e2e-tests · lighthouse · load-tests |
| 19 Production Readiness | 25 | Ph19 Section A + B; `context.md` Phase 19 protocol; QM-1…QM-18 | MAN | Stage 1→2 gate (not a PR gate) |
| 20 Notification Service | 17 | Ph20 Generate; §19.2, §19.3, §19.6, §19.7, §7.3; QM-8 | UNIT, INT, MAN | unit-tests · integration-tests |
| 21 Equipment Service | 9 | Ph21 Generate; §13.5, §33.8, §32.9; ADR-032 | UNIT, INT, ISO | unit-tests |
| 22 Workforce Service | 15 | Ph22 Generate; §13.5, §32.4, §32.9 | UNIT, INT, ISO | unit-tests · integration-tests · isolation-tests |
| 23 MLOps Pipeline | 18 | Ph23 Generate; §22.6, §22.9; §30.11 Layer B; ADR-038 | UNIT, INT, AI, MAN | mlops-tests |
| 24 Digital Twin | 11 | Ph24 Generate; §33, §33.3, §33.4; ADR-032 | UNIT, INT, MAN | (see ESC-05) |
| 25 Enterprise Provisioning | 17 | Ph25 Generate; §34, §34.6, §7.1 | UNIT, INT, MAN | unit-tests (+ serial workflows) |

### Distribution by level

| Level | Cases | Share |
| --- | --- | --- |
| `UNIT` | 309 | 63.2% |
| `MAN` | 90 | 18.4% |
| `INT` | 34 | 7.0% |
| `ISO` | 13 | 2.7% |
| `E2E` | 13 | 2.7% |
| `AI` | 10 | 2.0% |
| `LOAD` | 9 | 1.8% |
| `SEC` | 8 | 1.6% |
| `CONTRACT` | 3 | 0.6% |
| **Total** | **489** | **100%** |

The unit-heavy distribution matches the §30.2 pyramid target (unit 70% / integration 20% / E2E 5% /
load 5%); `MAN` cases are predominantly Phase 19 readiness checks and infrastructure-configuration
verifications, which the pyramid does not model.

---

## 35.12 Implementation Status Summary

Status was established by direct filesystem inspection on 2026-08-22 (Rule 36). No status was
inferred from documentation.

| Status | Cases | Meaning |
| --- | --- | --- |
| `IMPLEMENTED` | 429 | A test file, script or configuration was observed on disk and is cited in the case row |
| `PLANNED` | 60 | The case is designed and derived from the spec, but no corresponding test asset was located |
| `RETIRED` | 0 | No case has been retired. The status stays defined by §35.4 for when one is (§35.13 ESC-35) |
| `UNSPECIFIED` | 0 | Every blocked case was resolved in §35.13 |
| `GAP` | 0 | All three gaps found on 2026-08-22 were closed the same day (see below) |
| **Total** | **489** | |

Counts recomputed 2026-08-22 after the ESC-01…ESC-17 round: 3 `GAP` cases were closed
(`TC-P01-MAN-001`, `TC-P08-UNIT-016`, `TC-P18-MAN-006`) and 2 `UNSPECIFIED` cases were resolved
(`TC-P16-SEC-005`, `TC-P19-MAN-006` — SonarQube replaced by CodeQL, ADR-054).

**Recounted 2026-08-23 by parsing the case rows rather than carrying the previous total forward.**
Two corrections fell out. The first was itself wrong and is withdrawn: `TC-P21-UNIT-001` was recorded
as `RETIRED`, but it is `IMPLEMENTED` and always was — see §35.13 ESC-35. The second stands: the last
five `UNSPECIFIED` cases — `TC-P22-UNIT-009/010/011`
and `TC-P23-AI-003/004` — had been left blocked even though ESC-02 and ESC-04 resolved them on
2026-08-22 and the answers were written into §30.11 and §13.5. Resolving an escalation was not
propagating back to the case row; those five are now `PLANNED`, which is what they are: fully
specified, with no test asset on disk because neither feature is implemented.

### Test assets observed

| Area | Evidence |
| --- | --- |
| Backend unit suites | `backend/src/modules/*/__tests__/` across 21 modules; `backend/src/shared/{guards,middleware}/__tests__/` |
| Backend integration | `backend/test/` — 15 specs. Counted on disk 2026-08-24; the previous figure of 11 predates `outbox`, `rls-immutability`, `search` and `analytics-clickhouse`. Each of the last three starts its own container (PostgreSQL as `app_user`, OpenSearch, ClickHouse) rather than extending `startIntegrationInfra`, so the other suites keep their current start-up cost |
| Temporal workflows | `backend/jest.workflows.config.js` (`maxWorkers: 1`); `po.workflow.spec.ts`, `rfq.workflow.spec.ts`, `enterprise-provisioning.workflow.spec.ts` |
| Shared packages | `packages/@cos/{shared,database,financial,rbac,validation,logger,tracing,config,test-utils}` — 9 Jest configs |
| Event SDK | `packages/@cos/shared/src/kafka/__tests__/` — 8 specs; `test/kafka/kafka.integration.spec.ts` |
| File service | `services/file-service/src/__tests__/` — 15 specs incl. `integration/routes.integration.spec.ts` |
| AI services (Python) | `services/ai-gateway/tests/` (11), `digital_twin/tests/` (2), `ai-embedding-worker/tests/` (2), `ai-ocr-pipeline/tests/` (1), `ai-transcription-pipeline/tests/` (2) |
| Go workers | `services/kg-ingestion-worker/tests/{unit,integration}/`, `services/analytics-worker/internal/carbon/consumer_test.go` |
| MLOps | `mlops/tests/test_dag_tasks.py`, `test_dag_integration.py`; 5 DAGs in `mlops/airflow/dags/` |
| Mobile | `apps/mobile/src/**/__tests__/` (25 specs); `apps/mobile/e2e/` (Detox, 7 specs) |
| Web E2E | `tests/e2e/specs/` — 11 Playwright specs; `tests/e2e/playwright.config.ts` |
| Contract | `tests/contract/` — 3 Pact specs; `jest.contract.config.js` |
| Load | `tests/load/` (4 k6 scripts) and `scripts/loadtest/` (4 k6 scripts) |
| Mutation | `backend/`, `packages/@cos/financial/`, `packages/@cos/rbac/` Stryker configs; `.github/workflows/mutation-tests.yml` |
| Frontend perf | `apps/web/.lighthouserc.json`; `.github/workflows/lighthouse.yml` |
| Isolation probe | `infrastructure/monitoring/isolation-probe/` — `cronjob.yaml`, `configmap.yaml`, `rbac.yaml`, `isolation-probe.js` |
| Readiness | `scripts/readiness/` — 11 scripts |
| API specs | `docs/api/` — 20 OpenAPI 3.1 files + `error-codes.md` + `deprecation-schedule.md` |
| Compliance / security / SLO / runbooks | `docs/compliance/` (5), `docs/security/` (4), `docs/slo/` (registry + `monthly-reviews/`), `docs/runbooks/` (18 entries), `cos-audit/` |

### Gaps found and closed on 2026-08-22

| Case | Finding | Resolution |
| --- | --- | --- |
| `TC-P01-MAN-001` | 11 backend modules had no `README.md`, breaching QM-11 | READMEs written for `analytics`, `compliance`, `crm`, `geo`, `graph`, `master-data`, `platform-webhook`, `safety`, `sync`, `tasks`, `vendor-portal` — all 21 modules now carry the five QM-11 headings |
| `TC-P08-UNIT-016` | `@cos/shared` carried Node-only runtime code and dependencies while Rule 34 requires it to stay bundler-safe for React Native | ADR-055 package split — `@cos/shared` is type-only (0 runtime imports, sole dependency `@cos/types`); the SDK and Avro schemas moved to `@cos/kafka` (8 suites / 97 tests at 100/100) |
| `TC-P18-MAN-006` | `services/file-service` Jest, the four AI-service pytest suites and all Go tests existed but no workflow executed them | `unit-tests` now runs `file-service` `test:cov`; new `go-tests` and `ai-service-tests` jobs added (ESC-05) |
| `TC-P14-LOAD-001` | `analytics-sla.js` asserted p95 < 3,000 ms while §30.9 requires p95 < 1 s | Threshold corrected to 1,000 ms; `00_master` Phase 14 and the E2E/k6 wording aligned to the single §31.6 SLO (ESC-10) |
| `TC-P19-MAN-009` | `api-baseline.js` ran 20→50 VUs against `/health/live` only, not the QM-6 profile `context.md` documents | Script rewritten: 100 VUs × 5 min, mixed read/write, p95 read < 300 ms / write < 500 ms, error < 0.1% (ESC-12) |
| `TC-P16-SEC-005`, `TC-P19-MAN-006` | SonarQube SAST gate never operational, blocking Phase 19 check #4 | Replaced by CodeQL — ADR-054, `.github/workflows/codeql.yml` (ESC-11) |

### Gaps found and closed

| Case | Finding | Status |
| --- | --- | --- |
| `TC-P08-UNIT-010` | The Outbox Pattern was specified and unit-tested but **not wired** — no production code called `OutboxPublisher.write()` and no bootstrap started `OutboxPoller`, so event delivery was not atomic with the database transaction | **CLOSED 2026-08-23** — ESC-13. The QM-4 defect inside the outbox is fixed with a regression test; the poller runs under `AppModule` lifecycle; 46 of 47 events are wired (the one exception is deliberate — see §35.13). The rollback→no-event integration test (§30.4) landed with it in `backend/test/outbox.integration.spec.ts`, and ESC-22 (dedicated-DB tenants were not polled) is resolved |

---

## 35.13 UNSPECIFIED and Escalation Register

Every item a test case could not resolve from the specs. Per §35.2, nothing here was resolved by
inference. `RESOLVED` entries record the product-owner decision and its date.

| ID | Type | Item | Evidence | Impact | Status |
| --- | --- | --- | --- | --- | --- |
| `ESC-01` | UNSPECIFIED | No test case ID convention existed in any spec file | §30 cites IEEE 830 and ISTQB but defines no ID format | Blocked every case in this document | **RESOLVED 2026-08-22** — `TC-P{NN}-{LEVEL}-{NNN}` adopted (§35.4) |
| `ESC-02` | UNSPECIFIED | `SafetyVisionModel` and `GraphMLModel` had no primary metric, secondary metric or pass threshold | §30.11 Layer B listed thresholds for three models only; §22.6 gives algorithms and minimum training data but no acceptance metric | `TC-P23-AI-003`, `TC-P23-AI-004` could not state an expected result | **RESOLVED 2026-08-22** — `SafetyVisionModel`: Precision ≥ 0.85 (secondary Recall); `GraphMLModel`: F1 ≥ 0.80 (secondary AUC-ROC). Written into §30.11 |
| `ESC-03` | Spec conflict | `CostAnomalyModel` had a threshold but was not a Phase 23 model | Appeared only at `30-testing-strategy.md:389`; absent from `00_master` Phase 23, the §22.6 model table and `mlops/models/` | No test case could be designed against it | **RESOLVED 2026-08-22** — it is a **missing model**, now added to `00_master` Phase 23 and §22.6 with use case + metric. Algorithm, input features and minimum training data stay `UNSPECIFIED` (owner: AI/Platform Lead, at Layer B sprint entry) |
| `ESC-04` | UNSPECIFIED | `BiometricCheckIn` acceptance behaviour beyond the signature | §13.5 defined only `verifyCheckIn(workerId, projectId, method) : Promise<boolean>` | `TC-P22-UNIT-009/010/011` carried `UNSPECIFIED` expected results | **RESOLVED 2026-08-22** — §13.5 now specifies: 5-second timeout → fall back to `MANUAL` check-in (worker never blocked), fallback recorded on the attendance row, Type A fail-fast when no adapter is bound, every attempt audited. FAR/FRR remain a per-site vendor SLA, not a platform gate |
| `ESC-05` | Coverage gap | CI executed no Go tests, no AI-service pytest suites and no `services/file-service` Jest run | `.github/workflows/` contained no `go test`; `pytest` ran only `mlops/tests/`; the `unit-tests` job had no `file-service` step | QM-1's gate was not enforced for those suites | **RESOLVED 2026-08-22** — `unit-tests` now runs `services/file-service` `test:cov` (verified locally: 15 suites / 196 tests at 100/100); new `go-tests` job (`go test ./...` × 2 modules) and `ai-service-tests` job (pytest × 4 services). Correctness gate first; the QM-1 `--cov-fail-under=99` Python gate follows once real coverage is measured. No coverage threshold is defined for Go anywhere — that remains `UNSPECIFIED` |
| `ESC-06` | Spec conflict | Two different k6 scenario sets | §30.9 defines five scenarios; `00_master` Phase 18 defines four. Two script sets exist: `tests/load/` and `scripts/loadtest/` | §35.9.4 documented both without merging them | **RESOLVED 2026-08-22** — the two suites serve different purposes and both stay. §30.9 now carries a "Script inventory" table stating that `tests/load/` is the Phase 18 acceptance suite and `scripts/loadtest/` is the QM-6 weekly + Phase 19 readiness suite, and names the three §30.9 scenarios that still have no script |
| `ESC-07` | Spec conflict | Phase 9 `Generate:` called the ClamAV hook "deferred", contradicting the same phase's File Constraints and the shipped implementation | `services/file-service/src/services/antivirus.service.ts`, `scan-runner.ts`, `__tests__/antivirus.service.spec.ts` all exist | Antivirus test design was blocked | **RESOLVED 2026-08-22** — AV is in scope; the stale `00_master` line corrected |
| `ESC-08` | Rule conflict | `@cos/shared` held Node-only runtime code although Rule 34 requires it to be React Native/Metro-safe | `src/kafka/outbox.ts` imported `crypto`; `dependencies` included `kafkajs`, `ioredis`, `prom-client`. Rule 34(c) said move the `OutboxPoller` to `backend/src`; Phase 8 `Generate:` said keep it in the shared package | `TC-P08-UNIT-016` was a `GAP` | **RESOLVED 2026-08-22 — ADR-055.** Package split: `@cos/shared` = event payload **types only** (every import `import type`, sole dependency `@cos/types`, Rule 35 exempt); `@cos/kafka` = the Node-only SDK + Avro schemas, never aliased into `apps/mobile`. Rule 34 in `context.md` and `00_master` updated |
| `ESC-09` | Spec conflict | Phase 12 `Generate:` asked for a "LangGraph orchestration chain" while the same phase's Orchestration section, §22.3 and the `context.md` Never rule all require a plain Python sequential pipeline | `00_master` Phase 12 Generate vs Phase 12 Orchestration | Cases are designed against the sequential pipeline | **RESOLVED 2026-08-22** — the `Generate:` line now reads "plain Python sequential orchestration pipeline", matching the two authoritative sources and the shipped implementation |
| `ESC-10` | Spec conflict | Three different dashboard latency targets | §31.6 / QM-6 and §30.9 → p95 < 1 s; `00_master` Phase 14 → Executive 3 s / PM 2 s; §30.5 E2E #10 and Phase 18 k6 #1 → 3 s | Cases asserted different numbers; the shipped script used 3 s | **RESOLVED 2026-08-22** — **§31.6 wins: p95 < 1 s is the single SLO.** `00_master` Phase 14, Phase 18 k6 scenario 1 and the E2E #10 wording corrected; `scripts/loadtest/analytics-sla.js` and `tests/load/dashboard-sla.js` thresholds changed 3,000 ms → 1,000 ms |
| `ESC-11` | Deferred gate | SonarQube SAST gate was never operational and blocked Phase 19 automated check #4 | §30.10 and QM-4 both carried "⏸ DEFERRED pending EKS server setup" | `TC-P16-SEC-005` and `TC-P19-MAN-006` could not pass | **RESOLVED 2026-08-22 — ADR-054.** Replaced by **CodeQL** (`.github/workflows/codeql.yml`), server-free and free for this public repository; analyses JavaScript/TypeScript, Python and Go; blocks merge on High or above. The former "0% duplication" clause is dropped (CodeQL does not measure duplication) rather than silently claimed |
| `ESC-12` | Doc/implementation divergence | `context.md` described `scripts/loadtest/api-baseline.js` as "100 VU × 5 min; P95 read < 300 ms, P95 write < 500 ms" | The script ran 20→50 VUs against `/health/live` with a single `p(95)<1000` threshold | `TC-P19-MAN-009` could not assert the documented profile | **RESOLVED 2026-08-22** — the script was rewritten to the QM-6 profile: 100 VUs × 5 min, mixed read/write over real endpoints, `http_req_duration{op:read} p(95)<300`, `{op:write} p(95)<500`, error rate < 0.1% |
| `ESC-13` | Implementation gap | **The Outbox Pattern is specified but not wired.** `OutboxPublisher`/`OutboxPoller` exist and are fully unit-tested, but no production code calls `OutboxPublisher.write()` and no bootstrap starts `OutboxPoller`. Services publish directly via `KafkaProducer` and treat failures as non-fatal with the comment "outbox pattern picks up failures" — which is not true today | `grep` across the repo (excluding `node_modules`, `dist`, `__tests__`) finds zero callers; `project/tenant/equipment` services mention the outbox only in comments; the `outbox_events` migration exists | Event delivery is **not atomic** with the database transaction — contradicts `00_master` Phase 8, the Phase 19 manual check "Outbox pattern implemented in all services that emit Kafka events", QM-9 and the R-09 mitigation | **RESOLVED 2026-08-23** — infrastructure complete and all producers converted: (a) QM-4 defect fixed (`INSERT INTO outbox_events` → `platform.outbox_events`) with a regression test; (b) `OutboxPollerService` starts the relay on bootstrap and stops it on SIGTERM (Rule 39), registered in `AppModule`, 4 lifecycle tests; (c) `buildOutboxEvent` envelope helper; (d) **all 46 events converted** across `project`, `boq`, `procurement`, `tenant`, `user`, `equipment`, `workforce`, `finance`, `site-ops` and the `po`/`rfq` Temporal activities — each writes its outbox row inside the same transaction as the business write, using a **builder that receives the written row** wherever an id is server-generated. Per-module anchors and the three anchoring shapes are tabulated below. Verified at 128 backend suites / 1763 unit tests at 100% line+branch, 11 integration suites / 113 tests, and ESLint clean |
| `ESC-14` | Pre-existing defect | `backend/src/modules/safety/safety.service.ts` had a duplicated import and **two** `private get userId()` getters with different semantics (`\|\|` vs `??`), so the file did not compile and the whole backend type-check gate was red | Introduced before this work (file untouched by it; `git log` → `7379d90e fix: E2E`) | Blocked `pnpm type-check` and 3 unit suites | **RESOLVED 2026-08-22** — kept the `\|\| clsUserId()` variant, which is the behaviour both getters' comments describe (an empty-string `userId` must fall back, or `reported_by=''` triggers Postgres `22P02`); removed the duplicate |
| `ESC-18` | Pre-existing defect | `construction.boq.updated.v1` carried a **version id in its `project_id` field**. All three item-mutation call sites called `publishItemsUpdated(version_id, version_id, …)`, where the second parameter is `project_id` | The event contract (`BoqUpdatedPayload`) declares `version_id` and `project_id` as separate fields; `BoqVersionRow` carries the real `project_id` | Every emitted `boq.updated` event was unroutable by project for downstream consumers (analytics, KG) | **RESOLVED 2026-08-23** — the payload now takes `project_id` from the version row fetched inside the recalculation; tests cover both the normal path and the missing-version fallback |
| `ESC-17` | Pre-existing defect | **Two `outbox_events` tables exist.** Migration `20260531000002_outbox_events` created `platform.outbox_events` (the one the poller reads). Migration `20260531000003_project_service` then issued an **unqualified** `CREATE TABLE IF NOT EXISTS outbox_events`, which landed in `public` and was later relocated by `20260605000004_db_refactor_global_schemas` to `projects.outbox_events` | Confirmed by reading all three migrations; `outbox.ts` reads and writes `platform.outbox_events` only | `projects.outbox_events` is an orphan: nothing writes to it and nothing relays it. It is also a direct QM-4 violation ("all SQL must use schema-qualified names — never unqualified"), which is exactly how the stray table appeared | **RESOLVED 2026-08-23** — migration `20260823000001_drop_orphan_projects_outbox_events`, with the rollback script QM-9 requires. Whether a given environment holds rows cannot be known from the repository, so the migration does not assume: it **refuses to drop a non-empty table**, raising with the row count so the deploy stops rather than destroying unrelayed events. All three paths were exercised against a real PostgreSQL — refuses when non-empty, drops when empty, no-ops when already absent — and the rollback script was replayed to recreate the table. `outbox.integration.spec.ts` then asserts that after migrations `to_regclass` on the orphan returns NULL and `outbox_events` exists in exactly one schema (`platform`) |
| `ESC-16` | Pre-existing defect | `equipment` and `workforce` read the actor from `req.user?.sub`, a path **nothing in the codebase ever sets**, so every write recorded the literal `'system'` — and `equipment.service.ts` inserts that value into `assigned_by UUID NOT NULL` | `JwtAuthGuard` publishes `CLS_USER_ID='userId'` from `u.user_id`; the only other `.sub` uses are an MFA call and a log line. The other 14 request-scoped services already use `req.userId` + CLS fallback (ADR-031). Their `tenantId` getters also had no CLS fallback | Equipment assignment would fail with Postgres `22P02` in production; workforce events carried a false actor. Found by sweeping for the ESC-14/ESC-15 defect class rather than by a failing test | **RESOLVED 2026-08-22** — both services now use `req.userId ?? clsUserId()` and `req.tenantId ?? clsTenantId()`, matching the other 14. The two tests that asserted `actor_id: 'system'` were rewritten (the value was never reachable in production), mocks set `userId`, and a getter-invocation test covers each fallback branch |
| `ESC-15` | Pre-existing defect | The `safety`, `crm` and `master-data` specs mocked `REQUEST` as `{ user: { user_id } }` while their services read `req.userId` with a CLS fallback (ADR-031), and their "missing request context" tests never invoked the getter | 4 assertions failed once the file compiled; branch coverage fell to 99.86% | Contradicted the explicit `context.md` QM-1 guidance ("mocks must set `userId`/`tenantId`", "the fallback is covered by **invoking the getter**") | **RESOLVED 2026-08-22** — mocks set `userId`; each no-context test now invokes the getter and asserts `''`. Backend back to 126 suites / 1691 tests at 100/100 |

| `ESC-19` | Pre-existing defect | `tenant.service.createTenant` published `identity.tenant.created.v1` with a hardcoded `tenant_id: 'platform'`, routing it to topic `platform.identity.tenant.created.v1` | `identity.*` is not a `platform.*` event type, so the topic router derives `{tenant_id}.identity.tenant.created.v1`; `provisionTenantTopics` creates exactly that per-tenant topic set, and the producer runs with `allowAutoTopicCreation: false` | The very first event of tenant onboarding targeted a topic that is never provisioned and could not be auto-created — the publish could not succeed | **RESOLVED 2026-08-23** — the envelope now carries the real tenant id from the inserted row, and the event is written to the outbox inside the INSERT transaction |
| `ESC-20` | Pre-existing defect | `tenant.service` read `created.tenantId`, `created.tenantCode`, `created.tenantName`, `created.planType` off a `$queryRaw ... RETURNING *` row — all **`undefined` at runtime** | Prisma applies `@map` (`tenantId` → `tenant_id`) to the query-builder API only; `$queryRaw` returns raw DB column names and the `<Tenant[]>` generic is a compile-time cast. Confirmed against `schema.prisma` (`model Tenant` maps every field) and by the pre-existing spec fixture, which is snake_case. A repo-wide sweep for camelCase reads on raw rows found no other instance — `keycloak-jwt.strategy.ts` maps its raw row correctly | Two live faults: the `tenant.created` payload was four `undefined` fields, and `provisionTenantTopics(tenant.tenantId)` provisioned the per-tenant Kafka topic set for `undefined` | **RESOLVED 2026-08-23** — both call sites read the row through its real snake_case shape. Found while fixing ESC-19, not by a failing test: no test asserted the payload |
| `ESC-21` | Dead code / contract gap | `site.issue.status_changed.v1` is **structurally unreachable**. `site-ops.updateIssue` emits it when `fromStatus !== toStatus`, but `resolveIssueConflict` sets `resolved.status = serverRow.status` ("server status is always authoritative") and `existing` **is** that server row — so the two are always equal | Read `conflict-handler.ts` line-by-line; the pre-outbox code carried an `/* istanbul ignore next */` on the same branch, which hid it from coverage | Far worse than a dead event: `PATCH /site/issues/:issueId` is the **only** writer of `issues.status`, so **no issue could ever leave `OPEN`** — the `IN_PROGRESS`/`RESOLVED`/`CLOSED` enum values and the `resolution_note` column were unreachable, and a required Phase 6 producer never fired | **RESOLVED 2026-08-23** (product owner: separate endpoint) — added `PATCH /api/v1/site/issues/:issueId/status` (`ChangeIssueStatusDto` → `changeIssueStatus` → `SiteOpsRepository.updateIssueStatus`), which bypasses the merge and writes `site.issue.status_changed.v1` to the outbox inside the UPDATE transaction. Mirrors the split the codebase already uses for inspections (`POST /site/inspections` vs `PATCH /site/inspections/:id`) and for reports (`POST /site/reports/sync`); `updateIssue` keeps its offline-sync FIELD_LEVEL_MERGE semantics unchanged, so no client breaks. A no-op transition still persists `resolution_note` but emits nothing. The dead branch and its `istanbul ignore` were removed |
| `ESC-22` | Architecture gap | **The outbox is unreachable for ENTERPRISE dedicated-DB tenants.** `TenantPrismaService` routes those tenants to their own datasource, so their outbox rows land in `platform.outbox_events` **in the tenant DB** — but the single `OutboxPoller` connects only to the default `DATABASE_URL` and polls the shared DB | `tenant-prisma.service.ts` keeps one client per datasource URL; `outbox-poller.service.ts` calls `createPrismaClient()` with no argument; `grep` finds exactly one `new OutboxPoller` in the repo, and `outbox.ts` reads `FROM platform.outbox_events` with no tenant/datasource parameter | Affects **every** converted path, not just this round: on a dedicated-DB tenant no event was ever relayed — silently, with no error, because `runMigrationsActivity` runs the full migration set on the new database so `platform.outbox_events` exists there and the INSERT succeeds. Shared-DB tenants (STARTER/PROFESSIONAL) were unaffected. Also applied to the Temporal activities, whose `withTenantTx` uses `getDbUrlForTenant` | **RESOLVED 2026-08-23** (product owner: poller per datasource) — `OutboxPollerService` now holds a `Map` of pollers: the shared database plus one per active dedicated database, discovered from `platform.tenants` at bootstrap and re-read every `OUTBOX_POLLER_TENANT_REFRESH_MS` (default 60s) so a tenant provisioned mid-run starts relaying without a restart. All pollers, clients and the refresh timer close on shutdown (Rule 39 / ADR-034); a failing tenant lookup or an unconstructable client is logged and retried rather than taking the relay down, and the URL is never logged (it carries the password). **The alternative — writing every outbox row to the platform DB — was rejected**: it would split the business write and the outbox write across two connections, reintroducing exactly the dual-write the pattern exists to eliminate |

| `ESC-23` | UNSPECIFIED | **No Go coverage threshold exists in any spec.** QM-1 names a figure for Jest (100% lines / 100% branches) and for pytest (`--cov-fail-under=99`) but says nothing about Go, while §35.5 of this document lists Go `testing` + testify under a UNIT gate described as 100/100 — a claim this document made, not one inherited from an upstream spec | `grep -niE "go test.*cover\|covermode\|coverprofile"` over `context.md`, `context/` and `docs/specifications/` returns only this document's own rows | The `go-tests` job ran `go test ./... -v` with no coverage assertion, so a Go worker could lose all its tests without CI noticing | **RESOLVED 2026-08-23** (product owner: gate at the measured baseline, then ratchet) — `go-tests` now runs with `-coverpkg=./... -coverprofile` and compares the total against a per-module floor. Two findings came out of measuring rather than assuming: (a) **`-coverpkg` is mandatory here** — both modules keep their tests in a separate `tests/` package and `go test` scores each package against its OWN tests, so without it both report 0.0% however much they exercise; (b) baselines are **kg-ingestion-worker 86.0%** and **analytics-worker 0.0%** — the latter genuinely runs no statement, because its only test unmarshals a struct literal and calls nothing in `consumer.go`. The 0.0 floor is a placeholder to be raised the moment real tests land, not an endorsement |
| `ESC-24` | Process gap | The QM-1 Python coverage gate was specified but never wired. QM-1 states it verbatim — "`pytest --cov` with `--cov-fail-under=99` for lines" — yet all four AI services ran bare `pytest`, none had `pytest-cov` in `requirements-dev.txt`, and none had a coverage config | Read `context.md:145`; `grep -i pytest-cov services/*/requirements*.txt` returned nothing; the `ai-service-tests` step was `run: pytest` | The gate QM-1 mandates was absent, and the shortfall it exists to expose stayed invisible | **RESOLVED 2026-08-23** (product owner: wire it now, per QM-1) — `pytest-cov==7.1.0` pinned in each service, a `.coveragerc` added per service, and the CI step is now `pytest --cov=. --cov-config=.coveragerc --cov-report=term-missing --cov-fail-under=99`. Measured first (python:3.12-slim, source only): ai-embedding-worker 73%, ai-ocr-pipeline 46%, ai-gateway 45%, ai-transcription-pipeline 35% — every one below the 99% floor. **The missing tests were then written, and all four services now sit at 100% with the gate passing** — 13 new test files covering the FastAPI surfaces, the deliberately-inert provider stubs, the LLM response cache, token metering, report persistence and the 6-step pipeline, the Digital Twin router / Kafka handler / read path, and the Thai WER harness. That is the point: QM-1's requirement is now asserted rather than assumed. The `.coveragerc` omits `tests/` because measuring a suite against itself inflates the result sharply here — with tests included the same four report 87/73/64/52% |

| `ESC-25` | Coverage gap | **`apps/web` had no unit tests at all** — 94 source files, zero test files, no `test` script in package.json. CI ran lint, type-check, build and Lighthouse only, so QM-1 covered none of its business logic | `find apps/web/src -name "*.spec.*"` returned nothing; `package.json` had no `test` key; `.github/workflows/ci.yml` had no web test step | Every screen depends on formatting, country/dial-code handling, navigation permissions and role landing routes, none of which was verified | **RESOLVED 2026-08-23** — jest + ts-jest + jsdom added, `jest.config.ts` written, and a web step wired into the `unit-tests` job. **95 tests at 100% lines / branches / functions / statements.** Scope follows the repo's own precedent in `apps/mobile/jest.config.ts`: the gate covers unit-testable logic and every exclusion carries a stated reason (App Router pages → the 11 Playwright journeys; React components and the `useApi`/`useUpload` hooks → no render host until @testing-library/react lands; `queries.ts` → TanStack hooks; `types.ts` → type-only; PWA/IndexedDB → browser APIs). `api/client.ts` is tested but not gated, for that reason |
| `ESC-26` | Pre-existing defect | **`landingFor()` and `navForRole()` resolved inherited Object members.** Both used `role in MAP`, which walks the prototype chain, so a role claim of `toString` or `constructor` returned a Function instead of a route or a NavItem[] | Found by a test written for ESC-25: `landingFor('toString')` returned `[Function toString]` rather than `/pending` | The role comes from a JWT claim, so it is untrusted input. The post-login redirect would have pushed a Function, and the sidebar would have called `.map()` on one | **RESOLVED 2026-08-23** — both switched to `Object.hasOwn(...)`, with the reason recorded at each call site. Regression tests assert `toString` and `constructor` fall through to `/pending` and `[]` |
| `ESC-27` | Coverage gap | Several §35.10 cases were architecture rules rather than function behaviour — "no `console.log` in app code", "no LLM SDK outside ai-gateway", "finance holds no GL logic" — and each sat as `PLANNED` with the note *no automated assertion*. A rule nobody checks is a rule that drifts | Six case rows carried that note; `grep` confirmed no test enforced any of them | The rules were documented and believed, but nothing would have caught the first violation | **RESOLVED 2026-08-23** — `tests/architecture/invariants.spec.ts` (11 tests) enforces them by scanning the tracked source tree via `git ls-files`, so build output and gitignored paths can never mask a violation. Wired into the `contract-tests` job as `pnpm run test:architecture`. Closes TC-P07-UNIT-017, TC-P10-UNIT-018, TC-P11-UNIT-001, TC-P12-UNIT-018 and TC-P15-UNIT-007; TC-P12-UNIT-015 closed alongside them via the ai-gateway token-budget tests |

| `ESC-28` | Coverage gap | Six more §35.10 cases sat as `PLANNED — not located`: audit-log immutability, the TimescaleDB hypertables, equipment tenant isolation, the finance↔procurement boundary, and the PgBouncer connection topology (twice). Each is a property of the **migrated database or the repository**, not of any TypeScript function, so no unit test could ever have covered them | Six case rows carried "not located"; `grep` found no asset for any of them | The RLS policies, the hypertable conversions and the pooler topology were all written and believed, but nothing would have caught a regression in any of them | **RESOLVED 2026-08-23** — `backend/test/rls-immutability.integration.spec.ts` (12 tests) drives a real TimescaleDB **as the `app_user` role**, which is the only way the policies apply at all; `tests/architecture/connectivity.spec.ts` (9 tests) covers the two static ones. Two findings came out of writing them: (a) audit-log immutability manifests as **0 rows affected, not an error** — RLS hides the row for modification rather than raising, so code expecting an exception would read the silent no-op as success, and the test now pins the row count; (b) the first version of the architecture scanner used a `dir/**/*.ts` pathspec, which git matches **only inside a subdirectory** — `backend/src/main.ts` and every module-root file were silently skipped, and the finance scan covered nothing. A coverage-guard test caught it; the shared `tests/architecture/scan.ts` now takes directory pathspecs and filters extensions in code, with a test asserting the top level is reached |

| `ESC-29` | Traceability gap | Three cases were marked `PLANNED — not located` although a test asset for each **already existed** — the case rows had simply never been linked to it. `TC-P13-INT-002` and `TC-P13-ISO-001` are covered by the Go Neo4j integration suite in `services/kg-ingestion-worker`, and `TC-P16-ISO-002` by the `@cos/kafka` consumer spec | Read each assertion directly rather than matching on filename: the Neo4j suite ingests the same `project_id` under two tenants and asserts a scoped traversal returns only its own, and proves MERGE idempotency against the composite `(id, tenant_id)` constraints; the Kafka spec routes both a mismatched and a missing `tenant_id` header to the DLQ | The document understated real coverage, which is its own kind of drift — it invites someone to write a duplicate test, or to treat a covered rule as unverified | **RESOLVED 2026-08-23** — all three re-statused with the specific file and test name cited. No new test was written: the work was to look, not to add |

| `ESC-30` | Coverage gap | `TC-P09-ISO-001` — "a Tenant A signed URL cannot read a Tenant B object" — sat as `PLANNED`. `services/file-service` had a 100%-covered unit suite but **no integration harness at all**, and its S3 client is mocked in every unit test, so the one property that matters (a presigned URL is cryptographically bound to a bucket and key) was never exercised | `services/file-service` had only `jest.config.js` matching `src/**`; `grep` found no test touching a real object store | Cross-tenant file access is a Critical Security Defect under §30.6. A mocked S3 client returns whatever the test tells it to, so the mock could not have caught a bucket-scoping regression | **RESOLVED 2026-08-23** — added `jest.integration.config.js` + `testcontainers` to `services/file-service`, mirroring the backend split (base config keeps `src/**` and its 100% gate; the integration config takes `test/**` and collects no coverage). `minio-tenant-isolation.integration.spec.ts` (8 tests) runs against a real MinIO and asserts the URL is refused when its bucket segment is rewritten to another tenant, when its key is swapped, and when no signature is presented. Wired into the `integration-tests` job |

| `ESC-31` | Coverage gap | `TC-P03-INT-004` and `TC-P06-INT-002` sat as `PLANNED` because the OpenSearch client is **globally stubbed** in the integration harness (§30.4). A stub answers with whatever the test hands it, so it can never show whether the QUERY the service builds matches the DOCUMENT the service indexed — analyzer behaviour, `term`-vs-`match` semantics and field mapping all live inside OpenSearch | `grep` found the client mocked in the integration setup and no spec anywhere driving a real node | Full-text search is a Phase 3 and Phase 6 Generate item. Its correctness is *entirely* a property of the engine, so a mocked suite reporting green says nothing at all about it | **RESOLVED 2026-08-24** — `backend/test/search.integration.spec.ts` (11 tests) starts `opensearchproject/opensearch:2.17.1`, un-mocks the client and drives the real `ProjectService` / `SiteOpsService` with stubbed repositories only. Because both index paths swallow their errors by design, every fixture load asserts through `_count` that the documents actually landed — otherwise a silent indexing failure is indistinguishable from a search that found nothing. Runs under the existing `backend test:integration`; it starts its own container so the other 13 suites stay as fast as they are |
| `ESC-32` | Pre-existing defect | **Every OpenSearch `term` filter targeted a dynamically-mapped `text` field, so full-text search silently returned nothing across projects, site reports and issues.** Nothing in the repository creates an index mapping, so OpenSearch maps these strings dynamically as analyzed `text` with a `.keyword` sub-field. A `term` query is not analyzed, so it never matches a UUID or an enum value held in the analyzed field — the mandatory `tenant_id` filter therefore excluded *every* document | Found the moment ESC-31 pointed a real engine at the real queries: the first run failed 7 of 11 assertions with empty result sets. A throwaway probe confirmed the mechanism directly — `term` on the analyzed field returned 0 hits, on `.keyword` it returned the document | Search was dead in production and could not report itself: `list()` catches the failure and falls back to the DB list, so the endpoint answered 200 with plausible data while the search path contributed nothing. Seven query sites across two services | **RESOLVED 2026-08-24** — all seven `term` filters now target `.keyword` (`tenant_id`, `status`, `project_type` in `project.service.ts`; `tenant_id` and `project_id` ×2 in `site-ops.service.ts`), with a note recording why. Every value involved is far below the 256-char `ignore_above`, so `.keyword` is always populated. Backend unit suite re-verified at 128 suites / 1763 tests / 100-100-100-100 after the change |
| `ESC-33` | Coverage gap (partly resolved — residual named) | `TC-P14-INT-001` asks for a Kafka → ClickHouse → API flow. The ClickHouse half is pure SQL this repository owns, and it is the half most able to be silently wrong: `AggregatingMergeTree` stores **partial** aggregate states, so a read that omits `FINAL` / `sumMerge` reports a fraction of the real figure while looking perfectly healthy. A mocked ClickHouse client cannot catch that class of error at all | `infrastructure/clickhouse/initdb.d/*.sql` was committed but no test ever applied it; the analytics specs mocked the client | An executive dashboard that under-reports cost is worse than one that errors — it is believed | **RESOLVED IN PART 2026-08-24** — `backend/test/analytics-clickhouse.integration.spec.ts` (11 tests) runs `clickhouse/clickhouse-server:24.8-alpine`, applies the committed DDL and drives the real `AnalyticsService`: states summed across days, the budget snapshot taken as a max rather than a sum, the at-risk threshold, cross-tenant exclusion, the date-range filter, division by a zero budget, and an outage surfacing as 503 instead of an empty dashboard. **Residual, stated plainly:** the Kafka → ClickHouse leg needs a live broker plus Schema Registry for the `AvroConfluent` engine tables in `02-kafka-tables.sql`, so `02` and `04` are not applied and **`TC-P14-INT-001` remains `PLANNED`**. What closes is the SQL half; the claim is not stretched past it |
| `ESC-34` | Type/runtime mismatch | `ExecutiveDashboardRow.atRisk` is declared `boolean`, but it is produced by a ClickHouse `if(...)`, which returns `UInt8`. The value on the wire is `0` / `1`, never `false` / `true` | ESC-33 asserted `toBe(false)` and received `0`. The declared type is at `backend/src/modules/analytics/analytics.service.ts:24` | **No behaviour is wrong today** — the only consumer, `apps/web/src/app/(app)/alerts/page.tsx:27`, filters on truthiness, and `0` / `1` behave correctly there. The risk is future: `r.atRisk === true` is false for an at-risk project, and strict schema validation on the response would reject the payload | **RESOLVED 2026-08-24 — product owner chose (b), fix the type.** `ExecutiveDashboardRow.atRisk` is now `0 | 1` in the backend, and in all four client interfaces that re-declare the row (`apps/web/src/lib/api/types.ts`, `apps/web/src/components/analytics/ExecutiveDashboard.tsx`, `apps/mobile/src/app/(app)/alerts.tsx`, `apps/mobile/src/app/(app)/portfolio.tsx`). No wire change, so no client had to be re-deployed in step with the API. The ClickHouse integration assertions were tightened from `Boolean(x)` to the exact `toBe(0)` / `toBe(1)` — a coercion would have passed even if the value silently became a string, which is the regression this case exists to catch. **Making the type honest immediately exposed a live rendering defect: see ESC-36** |

| `ESC-35` | Doc defect (self-inflicted, in this document) | The 2026-08-23 recount reported one `RETIRED` case, `TC-P21-UNIT-001`, "superseded; kept for traceability". **It is not retired and nothing supersedes it.** The count was produced by matching the word `RETIRED` anywhere in the row — and that row's *Steps* column reads "Transition across `AVAILABLE`, `IN_USE`, `MAINTENANCE`, `RETIRED`", because `RETIRED` is an equipment **status value**, not a test-case status | The row's own Status cell reads ``IMPLEMENTED` — `equipment.service.spec.ts``. `VALID_TRANSITIONS` exists at `backend/src/modules/equipment/equipment.service.ts:29` and the spec asserts both an allowed transition (`AVAILABLE → IN_USE`) and a blocked one (`RETIRED → AVAILABLE`). No supersession rationale exists anywhere in this document, and no successor case covers equipment status transitions | Small in size, but it is the failure mode this document exists to prevent: a status asserted from a string match rather than from evidence, then carried forward as fact. It also under-reported `IMPLEMENTED` by one for a full day | **RESOLVED 2026-08-24** — `IMPLEMENTED` corrected to 429, `RETIRED` to 0, and the 2026-08-23 narrative amended to withdraw the claim rather than quietly delete it. The recount now keys on the **Status column** and de-duplicates by case ID, since the §35.13 remediation table re-mentions seven IDs that are not case rows. Verified: 429 + 60 + 0 = 489, matching the stated total |

| `ESC-36` | Pre-existing defect (found by ESC-34) | **The web portfolio table rendered a literal `0` next to every project that was NOT at risk.** `portfolio/page.tsx` wrote `{row.atRisk && (<span>…</span>)}`. `atRisk` is `0` / `1` from ClickHouse, and in JSX `{0 && …}` evaluates to `0`, which React renders as the visible text "0" — the classic falsy-number pitfall. A real `false` renders nothing | Found while applying the ESC-34 decision: a repo-wide sweep of every `atRisk` consumer separated the safe sites from the unsafe. Ternaries (`row.atRisk ? a : b`), `.filter()` and `if` are all correct with `0` / `1`; only the `&&` in a JSX child position is not | Visible on the portfolio screen for every healthy project — a stray `0` beside the utilisation percentage, in the UI most likely to be shown to an executive. It reported no error and no test covered it: `apps/web` collects coverage from four `src/lib` files only, so pages and components are outside the QM-1 gate | **RESOLVED 2026-08-24** — the site now reads `{row.atRisk === 1 && (…)}` with a comment naming the pitfall. One further site was hardened in the same sweep: `apps/mobile/.../alerts.tsx` passed `item.atRisk && styles.cardRisk` into a React Native style array, where a `0` element is falsy-skipped by `StyleSheet.flatten` but relies on that behaviour rather than stating the intent — rewritten as an explicit ternary. All other `atRisk` sites were checked and left alone because they were already correct |

| `ESC-37` | Gate inconsistency (partly resolved — residual named) | **`.markdownlintignore` and `.prettierignore` disagreed about what counts as a legacy document.** `docs/specifications/`, `context/` and `context.md` were excluded from the markdownlint gate as a declared pre-existing backlog, but `format:check` runs Prettier over `**/*.{ts,tsx,js,jsx,json,md,yaml,yml}` and those trees were **not** in `.prettierignore` — so the same files were simultaneously exempt from one Markdown gate and enforced by another | Measured 2026-08-24 with Prettier 3.9.4 and the repo's own `.prettierrc`: 38 files under `docs/specifications/`, 13 under `context/`, plus `context.md` were failing `format:check` | A gate that has been failing since before anyone noticed stops being a gate. It also punishes any edit to a legacy doc with an unrelated reformat of the whole file | **RESOLVED IN PART 2026-08-24** — the three entries were added to `.prettierignore` with a comment tying them to `.markdownlintignore`, so the two lists now agree. Verified by re-running Prettier on `35-test-design.md` and `context.md`: both now report *All matched files use Prettier code style!*. **Residual, stated plainly: 10 files outside those trees still fail `format:check` and were left untouched** — `backend/src/modules/{analytics,geo,graph,platform-webhook,sync,tasks,vendor-portal}/README.md`, `docs/architecture/adr/054-codeql-replaces-sonarqube-sast.md`, `docs/architecture/adr/055-split-cos-kafka-from-cos-shared.md` and `docs/screens/web/component-port-test.md`. Every one is cosmetic (Markdown table column padding, `*em*` → `_em_`); `pnpm exec prettier --write` on those ten closes it, but reformatting documents outside the task at hand is the product owner's call |

**Measuring `format:check` on Windows — read this before repeating the exercise.** This repository is
checked out with `core.autocrlf=true` and carries no `.gitattributes`, so the working tree is CRLF
while every blob in Git is LF. `.prettierrc` sets `"endOfLine": "lf"`. A local `prettier --check`
therefore fails on roughly **1,056 files** that CI, on Linux, passes without complaint — an artefact of
the checkout, not a defect. It was reported as a real failure once during this work and withdrawn.
The measurement above instead reads each file's content **as Git stores it** (`git show HEAD:<path>`,
normalised to LF) and formats it through Prettier's Node API with the real path and the real config.
On that basis: 189 files ignored, 1,152 checked, 10 failing.

### ESC-13 — Outbox wiring: what landed, what remains

**Landed 2026-08-22 — the pattern is now live and proven end-to-end on one path.**

| Piece | Location |
| --- | --- |
| Envelope helper (`buildOutboxEvent`) | `backend/src/shared/outbox/outbox.types.ts` |
| Poller lifecycle provider | `backend/src/shared/outbox/outbox-poller.service.ts`, registered in `AppModule`; starts on `onApplicationBootstrap`, stops + closes producer and Prisma on `onApplicationShutdown` (Rule 39). `OUTBOX_POLLER_ENABLED=false` opts a deployable out |
| Schema-qualification fix | `packages/@cos/kafka/src/outbox.ts` — `INSERT INTO platform.outbox_events` (QM-4) |
| First converted write | `project.create` — `ProjectRepository.create(dto, createdBy, buildOutboxEvent?)` writes the outbox row inside the **same** `TenantPrismaService.run` transaction |
| Tests | 4 poller lifecycle · 2 envelope · 3 repository (writes in-transaction from the inserted row / no builder / empty INSERT) · 2 service builder cases · 1 outbox SQL regression |

**Design note — the parameter is a builder, not an envelope.** `project_id`, `created_at` and the
other server-generated columns exist only after the INSERT returns. A pre-built envelope would carry
ids that match no row; the builder receives the inserted row instead. Any further conversion must
follow the same shape.

**Wiring COMPLETE 2026-08-23 — 46 of 47 events.** Every converted producer no longer holds a
`KafkaProducer` at all; its `publishEvent`/`emitEvent` helper was deleted. The single remaining
direct publisher is deliberate (see the Temporal note below):

| Service | Events | Anchor (transaction the outbox row joins) |
| --- | --- | --- |
| `project` (4) | `created`, `updated`, `status_changed`, `archived` | `create`, `update`, `updateStatus` (the last emits two events from one builder) |
| `boq` (4) | `version_created`, `created`, `version_approved`, `updated` | `createVersion` (two events), `approveVersion`, `updateVersionTotal` — the UPDATE that closes an item add/update/delete recalculation |
| `procurement` (5) | `rfq.created`, `po.created`, `delivery.received`, `invoice.received`, `vendor_invoice.approved` | `setRfqWorkflowId`, `setPoWorkflowId` (both the last DB write of creation, after the Temporal workflow starts, so ordering is unchanged), `createDelivery`, `createInvoice`, `updateInvoiceStatus` |
| `tenant` (4) | `tenant.created`, `tenant.deactivated`, `dedicated_db_assigned`, `enterprise.contract_signed` | `createTenant` (inside the existing INSERT transaction); `deactivateTenant` and `assignDedicatedDb` gained a `$transaction` around their UPDATE; `markAsEnterpriseContracted` is outbox-only (state lives in Temporal) |
| `user` (2) | `user.created`, `user.role_changed` | `createUser` (inside the user + membership transaction, so the Keycloak-rollback path emits nothing); `changeRole` (UPDATE wrapped in a transaction — a permission change no consumer hears about is a security-relevant divergence) |
| `equipment` (3) | `unit.assigned`, `unit.returned`, `unit.maintenance_scheduled` | `updateStatus` for the two assignment events (the last write of the operation), `createMaintenance` |
| `workforce` (2) | `checkin.created`/`checkout.created`, `timesheet.approved` | `recordAttendance`; `approveTimesheet` via a builder (the approved hours are only known from the UPDATEd row, and the builder is skipped when the UPDATE matched nothing) |
| `finance` (5) | `budget.created`, `payment.processed`, `variance.alert`, `billing.approved`, `ar_receipt.recorded` | `upsertBudget`, `createPayment`, `updateBudgetAggregates`, `updateBillingStatus` (both the approval and the PAID settlement) |
| `site-ops` (12) | report created/submitted, conflict flagged ×2, issue created/escalated/status_changed, inspection passed/failed ×2, material consumed | `createSiteReport`, `createConflictRecord`, `createIssue`, `updateIssue`, `createInspection`, `updateInspectionStatus`, `insertMaterialConsumption`, plus `writeOutboxEvent` for `escalateIssue` |
| `po.activities` (3) | `po.status_changed` ×2, `po.approval_requested` | `updatePoStatus` (joins the status UPDATE); `notifyApprover` and `compensateCancelledPo` are outbox-only |
| `rfq.activities` (2) | `rfq.status_changed` ×2 | `updateRfqStatus`, `markQuotationsEvaluated` — both join their status UPDATE |

`createDelivery` additionally moved the `is_partial` computation **into** its transaction: the flag
depends on the rows just inserted, so the service can no longer recompute it after the commit. Its
return type gained `is_partial` and two round-trips were removed.

**Anchoring patterns used.** Three shapes cover every site; which one applies is decided by where
the payload's ids come from, not by preference:

| Shape | When | Examples |
| --- | --- | --- |
| Builder over the written row — `(row) => envelope` | any id in the payload is server-generated | `project.create`, `finance.upsertBudget`, `finance.createPayment`, `workforce.approveTimesheet`, `site-ops.updateInspectionStatus` |
| Pre-built envelope passed to the anchoring write | every id is known before the write | `equipment.*`, most of `site-ops`, `procurement.setRfqWorkflowId` |
| Outbox-only transaction (`writeOutboxEvent`) | the method performs **no** business write, so there is no row to be atomic *with* — the outbox is used purely as the durable at-least-once relay | `tenant.markAsEnterpriseContracted`, `site-ops.escalateIssue`, `po.notifyApprover`, `po.compensateCancelledPo` |

Two conversions required reordering rather than a straight substitution, because the event had to be
decided **before** the write it rides:

- `finance.recalculateAndCheckVariance` — the variance threshold check moved above
  `updateBudgetAggregates` so the alert can join that UPDATE's transaction.
- `site-ops.submitInspection` / `updateIssue` — the PASSED/FAILED outcome and the status transition
  are derived from the DTO and the resolved payload, both available pre-write.

**Temporal activities — resolved 2026-08-23 (product owner decision).** `po.activities` and
`rfq.activities` were converted; `enterprise-provisioning.activities` was deliberately left
publishing directly. The distinction is not stylistic: **`po`/`rfq` `publishEvent` caught the Kafka
error and returned normally**, so the activity reported success and Temporal never retried — the
event was lost exactly as in the request-path services, and Temporal's durability guarantee never
applied to it. `emitProvisionedEventActivity` has no `catch` (`try/finally` only), so a publish
failure propagates and Temporal's retry policy genuinely covers it; converting it would add an
outbox-poller dependency for no gain.

**The §30.4 critical test landed 2026-08-23** — `backend/test/outbox.integration.spec.ts`, against a
real PostgreSQL via Testcontainers. A unit spec cannot prove this: it mocks the transaction, so
"the outbox row joins the business transaction" is only ever asserted by checking that both writes
used the same handle. This spec aborts a real transaction after both writes and asserts neither row
survives, and covers three further cases a mock cannot reach — the commit path, the inverse failure
(a failing outbox INSERT rolls the business row back, which is why the converted services propagate
instead of swallowing), and the relay half (OutboxPoller reads the committed row, publishes it and
marks it published).

### Escalation handling rule

Per Rule 38(d) and the `context.md` NEEDS_ESCALATION protocol, an `OPEN` item is **not** stubbed,
guessed, or worked around. The affected test cases stay `UNSPECIFIED` until the product owner
decides, and this register is the single place those decisions are recorded.

---

## References

| ID | Title | Source |
| --- | --- | --- |
| [IEEE 829] | IEEE Standard for Software and System Test Documentation | IEEE Std 829-2008 |
| [IEEE 830] | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998 |
| [ISTQB] | ISTQB Glossary of Testing Terms | International Software Testing Qualifications Board |
| [Jest] | Jest JavaScript Testing Framework | [jestjs.io/docs](https://jestjs.io/docs/getting-started) |
| [Detox] | Detox — Gray-box E2E testing for React Native | [wix.github.io/Detox](https://wix.github.io/Detox/) |
| [Playwright] | Playwright End-to-End Testing Documentation | [playwright.dev/docs/intro](https://playwright.dev/docs/intro) |
| [Pact] | Pact Contract Testing Documentation | [docs.pact.io](https://docs.pact.io/) |
| [k6] | k6 Load Testing Documentation | [k6.io/docs](https://k6.io/docs/) |
| [Stryker] | StrykerJS Mutation Testing | [stryker-mutator.io](https://stryker-mutator.io/) |
| [Testcontainers] | Testcontainers for Node.js | [node.testcontainers.org](https://node.testcontainers.org/) |
| [LighthouseCI] | Lighthouse CI | [github.com/GoogleChrome/lighthouse-ci](https://github.com/GoogleChrome/lighthouse-ci) |
| [OWASP-ZAP] | OWASP ZAP Dynamic Application Security Testing | [zaproxy.org/docs](https://www.zaproxy.org/docs/) |
| [SonarQube] | SonarQube Static Analysis Documentation | [docs.sonarqube.org](https://docs.sonarqube.org/) |

---

> 📎 See also : [Testing Strategy](30-testing-strategy.md) · [MVP Scope](21-mvp-scope.md) ·
> [AI Architecture](22-ai-architecture.md) · [Monitoring & Observability](31-monitoring-observability.md) ·
> [Implementation Specifications](32-implementation-specifications.md)
