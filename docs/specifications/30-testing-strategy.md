---
title: 'Testing Strategy'
version: '1.5.0'
status: Active
last_updated: '2026-07-04'
authors:
  - thitipongroo
related_docs:
  - 03-system-design.md
  - 04-tech-stack.md
  - 07-multi-tenant-architecture.md
  - 11-database-schema.md
  - 14-api-architecture.md
  - 17-offline-mobile-sync.md
  - 21-mvp-scope.md
  - 32-implementation-specifications.md
---

# 30. Testing Strategy

## Table of Contents

- [30.1 Testing Philosophy](#301-testing-philosophy)
- [30.2 Test Pyramid](#302-test-pyramid)
- [30.3 Unit Testing](#303-unit-testing)
- [30.4 Integration Testing](#304-integration-testing)
- [30.5 End-to-End Testing](#305-end-to-end-testing)
- [30.6 Multi-tenant Isolation Testing](#306-multi-tenant-isolation-testing)
- [30.7 Offline Sync Testing](#307-offline-sync-testing)
- [30.8 API Contract Testing](#308-api-contract-testing)
- [30.9 Performance & Load Testing](#309-performance--load-testing)
- [30.10 Security Testing](#3010-security-testing)
- [30.11 AI Quality Testing](#3011-ai-quality-testing)
- [30.12 CI/CD Test Gates](#3012-cicd-test-gates)

---

## 30.1 Testing Philosophy

All tests MUST be:

- **Fast** — unit tests complete in milliseconds; CI pipeline must finish in under 10 minutes
- **Deterministic** — no flaky tests; flaky tests are treated as build failures
- **Isolated** — tests do not share state across runs or across test cases
- **Tenant-safe** — multi-tenant isolation MUST be validated at every layer (see section 30.6)

Testing is part of the Definition of Done — no PR merges without passing test gates
defined in section 30.12.

---

## 30.2 Test Pyramid

```text
         ▲ E2E (few, slow, high confidence)
        ▲▲▲ Integration (moderate, catches service boundaries)
      ▲▲▲▲▲▲▲ Unit (many, fast, catches logic errors)

```

Target coverage by layer:

| Layer       | Target                                                           | Tooling                                |
| ----------- | ---------------------------------------------------------------- | -------------------------------------- |
| Unit        | 100% lines + 100% branches per service (see §30.3, §30.12; QM-1) | Jest (Node.js/NestJS), pytest (Python) |
| Integration | Key service boundaries and DB queries                            | Jest + Testcontainers                  |
| E2E         | Critical user journeys (10–20 scenarios)                         | Playwright (web), Detox (mobile)       |
| Contract    | All public API endpoints                                         | Pact.io (consumer-driven contracts)    |
| Load        | Peak usage scenarios                                             | k6                                     |

---

## 30.3 Unit Testing

### Scope

- Business logic in service classes
- Utility functions and helpers
- DTO validation (class-validator)
- Event payload construction
- Workflow step logic (Temporal.io activity functions)

### Standards

- Each service has a `__tests__/unit/` directory
- Mocks: Jest auto-mocking for external dependencies (DB, Kafka, Redis)
- Coverage gate: 100% lines, 100% branches — enforced in CI (see section 30.12)
- No network calls in unit tests — all I/O is mocked

### Key Invariants to Test

- `tenant_id` is always injected into DB queries — never accepts null
- Soft delete filter (`WHERE deleted_at IS NULL`) is applied in all queries (including GET by ID — soft-deleted records
  return 404)
- Approval threshold logic returns the correct approver chain for all THB ranges
- Event naming convention follows `{domain}.{entity}.{action}.{version}` format

---

## 30.4 Integration Testing

### Scope

- Service-to-database interactions (PostgreSQL, Redis, Neo4j)
- Kafka producer/consumer message flow
- Keycloak token validation middleware
- API gateway routing (Kong)
- Debezium CDC pipeline (Outbox Pattern — see `09-data-architecture` section 9.4)

### Tooling

- **Testcontainers** — spins up real Docker containers per test run. Backend specs share
  `test/helpers/integration-infra.ts`; run via `pnpm --filter @cos/backend test:integration`
  (`jest.integration.config.js`, `--runInBand`).
- **NestJS testing module** — bootstraps the full `AppModule` (HTTP via supertest)

#### Harness conventions (non-obvious, enforced by `integration-infra.ts`)

- **DB image must be `timescale/timescaledb:*`**, not plain `postgres` — migrations call `create_hypertable`
  (TimescaleDB extension). Plain postgres fails to migrate.
- **Point the app at the container**: set `APP_DATABASE_URL` (the role the app connects with, falling back to
  `DATABASE_URL`) **and** `DIRECT_DATABASE_URL` (migrations) at the container URL, or the app reads/writes a different
  DB than the one migrated.
- **Migrate from a cwd without a `.env`** (absolute `--schema`) — the Prisma CLI gives `.env` precedence over the passed
  `DATABASE_URL`, otherwise it migrates the dev DB instead of the container.
- **Tenant context via CLS** — override `JwtAuthGuard` with a guard that publishes `tenantId`/`userId`/`userRole`
  into CLS; a bare `canActivate: () => true` boots the app but leaves context empty → `401`. Tenant ids must be valid
  UUIDs (the `@IsUUID` version nibble too).
- **RLS** is only enforced for the non-superuser `app_user` role; use an `app_user` connection (not the container superuser)
  to exercise RLS policies.
- Kafka/OpenSearch network clients are stubbed globally via `test/helpers/integration-mocks.ts`.
- **No `forceExit`** — the suite closes every long-lived handle on `app.close()` (each provider's
  `OnModuleDestroy`/`OnApplicationShutdown` quits its Redis / disconnects its Prisma / closes its ClickHouse and the
  OTel SDK), so Jest exits on its own. A hang after the specs pass means a NEW unclosed handle — diagnose with
  `--detectOpenHandles`; never re-add `forceExit` to mask it.

### Critical Integration Tests

| Test                         | What It Validates                                                            |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Tenant isolation at DB layer | Cross-tenant query returns zero results                                      |
| Outbox pattern               | A queued event is delivered exactly once per `event_id` and survives a broker outage; a poison row retires after 10 attempts rather than blocking the queue (ADR-094) |
| Approval workflow step       | Temporal.io activity correctly transitions workflow state                    |
| RBAC middleware              | Requests without valid `tenant_id` in JWT return 403                         |
| Soft delete                  | Deleted records excluded from all queries; GET by ID returns 404             |

---

## 30.5 End-to-End Testing

### Scope

Critical user journeys only (10–20 scenarios per release). E2E tests cover the full stack:
browser/app → API Gateway → service → DB.

### Web E2E (Playwright)

Scenarios for MVP:

1. **Procurement flow** — Create PR → generate RFQ → receive quotation → approve PO → record delivery → approve vendor invoice
2. **Daily site report** — Site Engineer submits report with manpower count and blockers
3. **Budget exceeded alert** — Cost transaction pushes project over budget → Executive receives push notification
4. **Safety incident** — Safety Officer reports incident → PM receives push notification → incident acknowledged within
   30 min SLA
5. **QC inspection** — Inspector fills checklist → result recorded as fail → issue_severity populated → photo uploaded
6. **Approval escalation** — Approver does not respond in 48 hours → next approver is notified
7. **Login** — User authentication via SMS OTP and email/password flows; JWT issued; protected route accessible
8. **Project create** — PM creates a new project; status transitions from DRAFT → ACTIVE
9. **Report submit** — Site Engineer submits daily site report; Kafka event emitted; notification received by PM
10. **Dashboard view** — Executive loads analytics dashboard; ClickHouse queries complete within P95 < 3s SLA

### Mobile E2E (Detox)

Scenarios:

1. **Offline inspection** — Inspector fills checklist offline → photo attached → sync on reconnect
2. **Sync conflict resolution** — Two users update same task `progress_percent` while offline → Max-wins applied on sync
   (higher value wins; progress is monotonic)

> **Offline check-in was scenario 1 until 2026-08-21, and was retired with the feature it tested.**
> Self check-in was removed from the mobile product on 2026-08-09 (product-owner decision, recorded
> in `apps/mobile/src/components/home/FieldHome.tsx`): it left the Site Worker home, then the
> navigation drawer, then the product. Attendance rows are still READ — the Shift Hours tile counts
> them and they arrive through `/sync/delta` — but nothing in the app writes one, so there was no
> control left for the scenario to drive. The offline queue-and-sync path it covered is exercised by
> scenario 1 above.
>
> This retires the E2E SCENARIO only. `21-mvp-scope.md` still lists check-in/check-out inside MVP
> workforce scope — see the note there.

### Environment

- Dedicated test environment on AWS EKS (staging) with seed data reset per release
- E2E tests run on merge to `staging` (not on every PR — too slow for PR gates); the `staging` branch deploys to the
  staging environment via update-gitops → ArgoCD auto-sync
- Branch flow : `develop` (integration) → `staging` (staging-env deploy + E2E gate) → `main` (production; manual
  ArgoCD promotion gate)

---

## 30.6 Multi-tenant Isolation Testing

This is a mandatory test category. Cross-tenant data access is a **Critical Security Defect**.

### Required Tests

| Isolation Layer        | Test                                                             | Pass Criteria                                                 |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| PostgreSQL (shared DB) | Query Tenant B data using Tenant A JWT                           | Zero rows returned                                            |
| Neo4j                  | Graph traversal from Tenant A node into Tenant B subgraph        | Zero results                                                  |
| Kafka                  | Consumer receives message from another tenant's topic            | Message rejected; DLQ not populated with cross-tenant message |
| S3                     | Pre-signed URL for Tenant A used to access Tenant B file         | 403 Forbidden                                                 |
| API                    | Tenant A `tenant_id` in JWT used to access Tenant B API resource | 403 Forbidden                                                 |

### Automation

- Isolation tests run in a dedicated `isolation/` test suite
- Part of the PR gate — PR cannot merge if any isolation test fails
- Uses two test tenant fixtures: `tenant_fixture_a` and `tenant_fixture_b`

### Production Synthetic Probe

A Kubernetes CronJob runs the same isolation checks against the **live production API**
every 5 minutes. This provides continuous assurance that RLS/tenant controls are working
in production, independently of CI/CD. Results are emitted as Prometheus metrics and
trigger the `TenantIsolationBreach` alert (see §31.7 of
[31-monitoring-observability](31-monitoring-observability.md)).

| Property      | Value                                                                   |
| ------------- | ----------------------------------------------------------------------- |
| Schedule      | `*/5 * * * *` (every 5 minutes)                                         |
| Test fixtures | `tenant_fixture_a`, `tenant_fixture_b` (production-only test tenants)   |
| Scope         | Same 5 checks as PR gate (PostgreSQL, Neo4j, Kafka, S3, API)            |
| Pass          | `tenant_isolation_check_result{check_name} = 1` (all checks)            |
| Fail          | `tenant_isolation_check_result{check_name} = 0` → TenantIsolationBreach |
| Alert         | §31.7 TenantIsolationBreach - pages security lead immediately           |
| Location      | `infrastructure/monitoring/isolation-probe/` (CronJob + test script)    |

---

## 30.7 Offline Sync Testing

Tests for the React Native offline sync engine (see `17-offline-mobile-sync`).

### Test Scenarios

| Scenario                                      | Expected Behavior                                                           |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| Device goes offline, user submits task update | Record queued in local FIFO queue                                           |
| Connectivity restored                         | Queue flushes in priority order (safety → attendance → inspections → tasks) |
| Sync fails 5 times for safety incident        | Moved to tenant admin review queue; push alert sent to PM                   |
| Conflict: two users update same task offline  | Max-wins applied; higher value wins (progress is monotonic)                 |
| Conflict: safety incident (human review)      | Both versions preserved; presented to admin for manual resolution           |
| Device local DB exceeds 500 MB                | LRU eviction triggered; drawing cache cleared first                         |

### Tooling

- Jest + mocked db seams (`upsertByKey`/`deleteByKey`, Drizzle/expo-sqlite) for unit-level sync logic
- Detox for device-level sync integration tests (real device / emulator)

### Detox conventions (offline simulation + visibility)

- **Detox has NO built-in connectivity API.** `device.setStatusBar(...)` is cosmetic only (no `network`
  key), and the `@react-native-community/netinfo` Jest mock does **not** apply to Detox (Detox runs the
  real binary against the real native module). To simulate offline/online, use an **app-level test hook**:
  a dev/E2E-only override (gated by `EXPO_PUBLIC_E2E=1`) that `useNetworkStatus` consults, driven from
  Detox via a deep link (`cos://e2e/network?online=0|1`) so connectivity toggles **mid-test without
  relaunch**. Android may also use `adb shell svc wifi/data`; iOS simulators have no programmatic airplane mode.
- **Visibility idiom:** use `await waitFor(element).toBeVisible().withTimeout(ms)`. There is **no**
  synchronous boolean `element(...).isVisible()` (it is an unimplemented Detox feature request) — for
  conditional branches wrap `waitFor(...).toBeVisible()` in try/catch.

---

## 30.8 API Contract Testing

All public API endpoints (see `14-api-architecture` section 14.3) must have contract tests
using **Pact.io** (consumer-driven contract testing).

### Principles

- Frontend (Next.js) and mobile (React Native) are the consumers
- Each consumer defines expected request/response shapes in Pact files
- Provider (NestJS service) verifies it satisfies all consumer contracts in CI

### Versioning Gate

- A new API version (`/api/v2/`) cannot be released without all v1 consumer contracts still passing
- Breaking change (field removed/renamed) triggers a new major version per `14-api-architecture` section 14.4

---

## 30.9 Performance & Load Testing

### Tool

- **k6** — developer-friendly load testing tool with JavaScript scripting

### Target Scenarios

| Scenario                      | Load Profile                                                     | Pass Criteria                                       |
| ----------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| Daily site report bulk submit | 100 concurrent Site Engineers submitting simultaneously at 07:00 | p95 latency < 500 ms                                |
| Executive dashboard load      | 50 concurrent Executive users loading dashboard                  | p95 latency < 1 s; ClickHouse query < 200 ms        |
| Procurement PO approval       | 20 concurrent Finance + PM approvals                             | p95 latency < 300 ms                                |
| Kafka consumer throughput     | 10,000 events/second sustained                                   | Consumer lag < 5 seconds                            |
| Mobile sync burst             | 500 devices syncing simultaneously on connectivity restore       | Zero data loss; sync completes in < 30 s per device |

### Schedule

- Load tests run weekly on staging, not per-PR
- Regression alert: if p95 latency increases > 20% vs. previous week → alert Engineering Lead

### Frontend Performance (Lighthouse CI)

The k6 tests above cover the backend; the web app's user-perceived performance is gated separately.

- **Lighthouse CI** runs on every `apps/web` PR under a **throttled mobile profile** (mid/low-end device + slow network)
  — matching the field-worker reality.
- **Gate (blocks merge):** a Core Web Vitals lab metric regressing past budget — **lab LCP ≤ 3.2 s**, **CLS ≤ 0.1**, and
  **TBT ≤ 200 ms** (Total Blocking Time, Lighthouse's lab proxy for INP; matches the INP ≤ 200 ms RUM SLO) — or the JS
  **bundle-size budget ≤ 250 KB** (script transfer size per audited route) exceeded. Budgets live in the CI config
  (`apps/web/.lighthouserc.json`; workflow `.github/workflows/lighthouse.yml`).
- **The lab LCP budget is 3.2 s and the field SLO is 2.5 s. They are different numbers on purpose.** §31.6's 2.5 s is
  a RUM p75 across real devices and networks. This one is a single throttled profile — 1,638 Kbps, 150 ms RTT, 4× CPU —
  on a GitHub `ubuntu-latest` runner, which is slower and far more variable than a developer machine: measured
  2026-08-03, `benchmarkIndex` ranged 2,154–3,368 across five runs while the same page reported ~3,860 locally. Holding
  the lab gate to the field number would have meant a gate that has never once passed.
  3,200 ms is the highest median observed across those five runs (2,913 ms) plus ~10 % headroom. It is a
  **regression gate, not a performance target**: it catches a change that makes `/login` ~10 % slower, and it does not
  say the page is fast enough.
- **`aggregationMethod: median`,** not lhci's `optimistic` default. Optimistic compares the _best_ of the three runs,
  which is how a 1,190 ms TBT — nearly 6× its budget — passed unnoticed on 2026-08-03. Median is what the numbers above
  are calibrated against.
- **The server is started and warmed before collection** (`pnpm run lighthouse`, not `lhci autorun`). Letting lhci
  start it through `startServerCommand` made the first of the three runs partly a cold-server measurement: on
  2026-08-03 that run reported `server-response-time` ~30 ms against ~5 ms for the other two. Warming it fixed exactly
  that — the same metric now reads 4 / 4 / 3 ms across the three runs.
- **The first run is still an outlier, and warming the server did not change that.** On the first fully green run
  (2026-08-03), run one reported **TBT 3,061 ms** and **CLS 0.133** with `bootup-time` 2,715 ms, against 72–82 ms TBT,
  0.000 CLS and 493–541 ms bootup for runs two and three — while its `server-response-time` was already warm at 4 ms.
  What remains is Chrome's own first-run cost (V8 compilation, no code cache), which a warm-up request to the server
  cannot touch. **No verified fix is in place.** A discarded Lighthouse run before the measured ones would be the
  obvious candidate; lhci exposes no option for it and it has not been tested.
  This is why `aggregationMethod` is `median` and not `pessimistic`: pessimistic would fail today on both TBT
  (3,061 > 200) and CLS (0.133 > 0.1), from a first run that says nothing about the application.
- **Measured baselines (2026-08-03, five CI runs each).** Before the `/login` server-rendering and font fixes: median
  LCP up to 3,673 ms. After: **up to 2,913 ms**. Script transfer size 223,234 B against the 256,000 B budget;
  accessibility 1.0 on every run.
- **Accessibility is gated in the same run:** the Lighthouse **accessibility category must score 1.0**
  (`categories:accessibility` `minScore: 1`), which is the automated half of the §20.8 gate. The floor is 1.0 rather
  than a fraction because the category has 24 scored audits totalling weight 163 and the lightest weighs 1 — failing a
  single audit still scores 0.9939, so any threshold below 1 would let a real regression through. Measured 1.0 across
  three consecutive runs on 2026-08-03; the Lighthouse version is pinned by `pnpm-lock.yaml` + `--frozen-lockfile`, so
  the audit set cannot shift without a deliberate dependency PR. `color-contrast` is asserted separately only because
  its failure message names the offending element.
- **Measured baseline (2026-08-03):** `/login` script transfer size **194,995 B** before the react-hook-form migration
  and **223,086 B** after it, against the 256,000 B budget — 32,914 B of headroom. Recorded because it is what the
  per-route field budget in `apps/web/src/components/form/README.md` is computed against.
- **Complements RUM:** Lighthouse catches regressions pre-merge (lab); production Core Web Vitals are measured from
  real users at p75 (`31 §31.6 Frontend Web Vitals SLO`).

---

## 30.10 Security Testing

### SAST (Static Analysis)

- **CodeQL** — semantic SAST with cross-file taint analysis, on every PR. Languages: JS/TS, Python,
  Go (`.github/workflows/codeql.yml`). Free on this public repository; a private repository would
  require a GitHub Code Security licence per active committer. Cannot run air-gapped.
- **Semgrep CE** — pattern SAST (`.github/workflows/semgrep.yml`). Two tiers: project-policy rules in
  `.semgrep/` **block the merge**; registry security rulesets are advisory and reported to code
  scanning. Runs fully offline, so it is the scanner available to on-premise/air-gapped deployments
  where CodeQL cannot run.
- **jscpd** — duplication, run in the CI lint job against the ratchet in `.jscpd.json`.
- **npm audit / pip-audit / govulncheck / Trivy** — dependency and container scanning (SCA). Note
  these scan _dependencies_, not first-party code; CodeQL and Semgrep are what read code we wrote.

> Replaced SonarQube (ADR-011). SonarQube **Community** Build has no branch or pull-request
> analysis, so the "before merge, on new code" gate this section requires is not achievable on it,
> and it has no taint analysis; both start at Developer Edition (paid).
>
> ⚠️ An earlier version of this list also claimed an **ESLint security plugin** covering SQL
> injection and XSS. No such plugin was ever installed — `eslint.config.mjs` carries only
> `@typescript-eslint`. It is listed here as a gap, not a control.

### DAST (Dynamic Analysis)

- **OWASP ZAP** — automated API scan run weekly on staging
- Must resolve all High-severity findings before production release

### Penetration Testing

- Annual third-party penetration test against the staging environment
- Scope: API endpoints, authentication flows, multi-tenant isolation, file upload/download
- Required for SOC 2 and ISO 27001 compliance (see `05-security-compliance` section 5.3)

### Secrets Scanning

- **GitLeaks** — pre-commit hook scanning for hardcoded secrets in all commits
- Configured in CI pipeline — build fails if secrets detected

### Rate Limiting Guard (Unit Tests)

The NestJS ThrottlerGuard must have a dedicated unit test.

Required test cases:

| Test case                                             | Assertion                                                 |
| ----------------------------------------------------- | --------------------------------------------------------- |
| Request within limit                                  | Returns 200; does not throw                               |
| Request exceeding default limit (101st within 60 s)   | Throws `ThrottlerException`; response is HTTP 429         |
| Auth endpoint exceeds limit (11th within 60 s)        | Throws `ThrottlerException`; `@Throttle` override applied |
| File upload endpoint exceeds limit (21st within 60 s) | Throws `ThrottlerException`; `@Throttle` override applied |
| `Retry-After` header present on 429                   | Header value equals seconds until reset window            |
| Counter resets after TTL expires                      | Next request after TTL returns 200                        |
| Redis storage used (not in-memory)                    | `ThrottlerStorageRedisService` is injected and called     |

Tests must mock `ThrottlerStorageRedisService` — do not connect to a real Redis instance in
unit tests. Integration tests against a real Redis are covered in the e2e test suite.

---

## 30.11 AI Quality Testing

### Layer A (MVP) — Assistive AI

| Feature                 | Test Method                                                   | Pass Criteria                                  |
| ----------------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| Daily report generation | Compare AI output against 50 golden examples (Thai + English) | ROUGE-L score ≥ 0.7; no hallucinated BOQ items |
| OCR accuracy            | Test against 100 construction drawing samples                 | Character error rate < 5%                      |
| Voice transcription     | Test against 50 Thai construction site recordings             | Word error rate < 10%                          |
| RAG retrieval           | Query 50 known questions; verify top-3 retrieved chunks       | Recall@3 ≥ 0.8                                 |

### Layer B (Post-MVP) — Analytical AI

**Decision:** Time-series validation + Monte Carlo simulation + drift detection pipeline.
**Resolved:** 2026-06-10

**Evaluation framework:**

| Model              | Primary Metric | Secondary Metric | Pass Threshold   |
| ------------------ | -------------- | ---------------- | ---------------- |
| DelayForecastModel | RMSE (days)    | MAE (days)       | RMSE ≤ 5 days    |
| RiskClassifier     | F1-score       | AUC-ROC          | F1 ≥ 0.80        |
| CostAnomalyModel   | Precision      | Recall           | Precision ≥ 0.85 |

**Test methodology:**

- **Data split:** 70% training / 30% held-out from production project history
- **Time-series validation:** Walk-forward validation — never use future data to predict the past
- **Monte Carlo simulation:** 1,000 iterations for uncertainty quantification on delay forecasts
- **Drift detection:** Evidently AI monitors feature distribution shift; alert when PSI > 0.2
- **Evaluation cadence:** Monthly (not per-PR — model performance degrades over time, not per commit)
- **Retraining trigger:** Accuracy drops > 10% vs. previous month OR drift alert fires

**Tooling:**

- **Prophet:** Time-series baseline for delay and cost forecasting
- **Evidently AI:** Data drift and model performance monitoring
- **MLflow:** Experiment tracking and model registry (existing — see §22.7 Model Registry)

**Owner:** AI/Platform Lead. **Trigger:** Layer B enters active development sprint.

### Evaluation Schedule

- AI quality metrics evaluated monthly (not per-PR)
- Regression: if any metric drops > 10% vs. previous month → alert AI Lead

---

## 30.12 CI/CD Test Gates

CI pipeline (GitHub Actions) enforces these gates per `04-tech-stack` section 4.9:

| Gate                                      | Trigger               | Blocks                     |
| ----------------------------------------- | --------------------- | -------------------------- |
| Lint + type check                         | Every PR              | PR merge                   |
| YAML lint (yamllint)                      | Every PR              | PR merge                   |
| SQL lint (sqlfluff, PostgreSQL)           | Every PR              | PR merge                   |
| Markdown lint (markdownlint, changed .md) | Every PR              | PR merge                   |
| Build (`turbo run build`)                 | Every PR              | PR merge                   |
| Unit tests                                | Every PR              | PR merge                   |
| Unit coverage 100% lines + 100% branches  | Every PR              | PR merge                   |
| Integration tests                         | Every PR              | PR merge                   |
| Temporal workflow tests (serial)          | Every PR              | PR merge — own jest config |
| Multi-tenant isolation tests              | Every PR              | PR merge                   |
| API contract tests (Pact)                 | Every PR              | PR merge                   |
| Dependency audit (pnpm/govulncheck/pip)   | Every PR              | PR merge (High/Critical)   |
| Security SAST (CodeQL)                    | Every PR              | PR merge                   |
| Security SAST (Semgrep — project rules)   | Every PR              | PR merge                   |
| Security SAST (Semgrep — registry rules)  | Every PR              | Alert only (code scanning) |
| Duplication (jscpd, ratchet)              | Every PR              | PR merge                   |
| Keycloak realm carries MFA Layer 1        | Every PR              | PR merge                   |
| Migration↔rollback pairing (§9.7.1)       | Every PR              | PR merge                   |
| Smoke tests (ArgoCD PostSync wave 1)      | Post-deploy (staging) | Blocks E2E wave 2          |
| E2E tests (Playwright)                    | Merge to `staging`    | Production promotion       |
| E2E tests (Detox — React Native mobile)   | Merge to `staging`    | Production promotion       |
| Load tests (k6)                           | Weekly scheduled      | Alert only (not blocking)  |
| DAST (OWASP ZAP)                          | Weekly scheduled      | Alert only (not blocking)  |

---

## References

| ID           | Title                                                              | Source                                                                   |
| ------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| [IEEE 830]   | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998                                                        |
| [ISTQB]      | ISTQB Glossary of Testing Terms                                    | International Software Testing Qualifications Board                      |
| [Pact]       | Pact Contract Testing Documentation                                | [docs.pact.io](https://docs.pact.io/)                                    |
| [k6]         | k6 Load Testing Documentation                                      | [k6.io/docs](https://k6.io/docs/)                                        |
| [Playwright] | Playwright End-to-End Testing Documentation                        | [playwright.dev/docs/intro](https://playwright.dev/docs/intro)           |
| [CodeQL]     | CodeQL Documentation                                               | [codeql.github.com/docs](https://codeql.github.com/docs/)                |
| [Semgrep]    | Semgrep Documentation                                              | [semgrep.dev/docs](https://semgrep.dev/docs/)                            |
| [jscpd]      | jscpd — Copy/Paste Detector                                        | [github.com/kucherenko/jscpd](https://github.com/kucherenko/jscpd)       |
| [OWASP-ZAP]  | OWASP ZAP Dynamic Application Security Testing                     | [zaproxy.org/docs](https://www.zaproxy.org/docs/)                        |
| [Jest]       | Jest JavaScript Testing Framework                                  | [jestjs.io/docs/getting-started](https://jestjs.io/docs/getting-started) |

---

## 30.13 Test Data Factories

**Decision:** plain TypeScript factory functions (factory_bot pattern). **Resolved:** 2026-06-13.

### Rationale

Domain entities in this project are managed as raw SQL tables accessed via Prisma `$queryRaw` /
`$executeRaw`. Schema-driven generators (prisma-fabbrica, factory-js Prisma plugin) generate
factories from Prisma schema models only — not applicable here because domain entities are not
Prisma models. Plain factory functions (the factory_bot canonical pattern) work with any TypeScript
interface and are the industry standard for this architecture.

### Pattern

One factory function per DTO type. Signature: `build<EntityName>Dto(requiredArgs, overrides?)`.

Rules (from factory_bot canonical source) :

- Provide only **required fields** (fields that would fail validation if absent)
- Fields with server-generated defaults (id, created_at, tenant_id from JWT) are NOT included
- All factories accept a final `overrides: Partial<T> = {}` argument — spread last
- Factory must produce a valid payload that passes API validation with no overrides

### Location

All factories live in the `@cos/test-utils` package (exported from its index).

`packages/@cos/test-utils/README.md` is required per QM-11 (purpose, public API,
dependencies, configuration, usage example). This package was introduced in Phase 18
and must follow the same README standard as all other `packages/@cos/*` packages
defined in Phase 1.

### Naming convention

```text
build<EntityName>Dto   — request payload factories (used in HTTP integration tests)
build<EntityName>       — seed data factories (used for direct DB seeding)
```

### Current factories

| Factory                          | Type | Fields                                                                                         |
| -------------------------------- | ---- | ---------------------------------------------------------------------------------------------- |
| `buildTenant`                    | seed | id, name, slug, tier, active, created_at                                                       |
| `buildUser`                      | seed | id, tenant_id, email, name, role, created_at                                                   |
| `buildProject`                   | seed | id, tenant_id, name, status, budget, currency, created_at                                      |
| `buildDocument`                  | seed | id, tenant_id, project_id, name, mime_type, size_bytes, storage_key, uploaded_by, created_at   |
| `buildInvoice`                   | seed | id, tenant_id, project_id, vendor_id, amount, currency, status, due_date, created_at           |
| `buildCreateProjectDto`          | DTO  | project_code, project_name, project_type, budget_amount, budget_currency, start_date, end_date |
| `buildCreateVendorDto`           | DTO  | vendor_code, vendor_name, contact_email                                                        |
| `buildCreatePurchaseRequestDto`  | DTO  | pr_number, required_date                                                                       |
| `buildCreateRfqDto`              | DTO  | project_id, rfq_number                                                                         |
| `buildCreatePurchaseOrderDto`    | DTO  | vendor_id, project_id, po_number                                                               |
| `buildCreateBoqItemDto`          | DTO  | category_id, description, unit, quantity                                                       |
| `buildSetBudgetDto`              | DTO  | total_budget_amount, total_budget_currency                                                     |
| `buildCreateSiteReportDto`       | DTO  | project_id, report_date                                                                        |
| `buildCreateWorkerDto`           | DTO  | employee_code, full_name, trade_type, employment_type                                          |
| `buildCreateCheckInDto`          | DTO  | project_id, check_in_at                                                                        |
| `buildNotificationPreferenceDto` | DTO  | event_type, channel, is_enabled                                                                |
| `buildRegisterDeviceDto`         | DTO  | push_token, platform                                                                           |

### When NOT to use a factory

- Single-field payloads where the specific value is the test (`{ phoneNumber: 'not-a-phone' }`)
- State transition commands (`{ to: 'ACTIVE' }`)
- Validation-failure payloads (intentionally malformed data — keep inline to make the intent clear)

### Adding new factories

When adding a new domain module with integration tests :

1. Identify all multi-field CREATE payloads in the new integration test
2. Add one `build<EntityName>Dto` function per entity to `factories.ts`
3. Use the new factory in the integration test — no inline multi-field objects

---

> 📎 See also : [System Design](03-system-design.md) · [Tech Stack](04-tech-stack.md) · [Mult Tenant Architecture](07-multi-tenant-architecture.md)
> · [Database Schema](11-database-schema.md) · [API Architecture](14-api-architecture.md) · [OFF-Line Mobile Sync](17-offline-mobile-sync.md)
> · [MVP Scope](21-mvp-scope.md) · [Monitoring Obserbability](31-monitoring-observability.md) · [Implementation Specifications](32-implementation-specifications.md)
