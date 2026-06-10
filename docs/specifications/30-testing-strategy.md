---
title: 'Testing Strategy'
version: '1.4.0'
status: Active
last_updated: '2026-05-28'
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

| Layer       | Target                                   | Tooling                                |
| ----------- | ---------------------------------------- | -------------------------------------- |
| Unit        | ≥ 80% line coverage per service          | Jest (Node.js/NestJS), pytest (Python) |
| Integration | Key service boundaries and DB queries    | Jest + Testcontainers                  |
| E2E         | Critical user journeys (10–20 scenarios) | Playwright (web), Detox (mobile)       |
| Contract    | All public API endpoints                 | Pact.io (consumer-driven contracts)    |
| Load        | Peak usage scenarios                     | k6                                     |

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
- Soft delete filter (`WHERE deleted_at IS NULL`) is applied in all queries (including GET by ID — soft-deleted records return 404)
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

- **Testcontainers** — spins up real Docker containers for PostgreSQL, Redis, Kafka per test run
- **NestJS testing module** — bootstraps the full module graph without HTTP server
- Tests run in CI with `docker-compose` test profile

### Critical Integration Tests

| Test                         | What It Validates                                                            |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Tenant isolation at DB layer | Cross-tenant query returns zero results                                      |
| Outbox pattern               | DB write + event publish succeed atomically; no event emitted on DB rollback |
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
4. **Safety incident** — Safety Officer reports incident → PM receives push notification → incident acknowledged within 30 min SLA
5. **QC inspection** — Inspector fills checklist → result recorded as fail → issue_severity populated → photo uploaded
6. **Approval escalation** — Approver does not respond in 48 hours → next approver is notified

### Mobile E2E (Detox)

Scenarios:

1. **Offline check-in** — Worker checks in with no connectivity → record queued → sync on reconnect
2. **Offline inspection** — Inspector fills checklist offline → photo attached → sync on reconnect
3. **Sync conflict resolution** — Two users update same task `progress_percent` while offline → Last-write-wins applied on sync

### Environment

- Dedicated test environment on AWS EKS (staging) with seed data reset per release
- E2E tests run on merge to `main` (not on every PR — too slow for PR gates)

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

---

## 30.7 Offline Sync Testing

Tests for the React Native offline sync engine (see `17-offline-mobile-sync`).

### Test Scenarios

| Scenario                                      | Expected Behavior                                                           |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| Device goes offline, user submits task update | Record queued in local FIFO queue                                           |
| Connectivity restored                         | Queue flushes in priority order (safety → attendance → inspections → tasks) |
| Sync fails 5 times for safety incident        | Moved to tenant admin review queue; push alert sent to PM                   |
| Conflict: two users update same task offline  | Last-write-wins applied; lower-timestamp record discarded                   |
| Conflict: safety incident (human review)      | Both versions preserved; presented to admin for manual resolution           |
| Device local DB exceeds 500 MB                | LRU eviction triggered; drawing cache cleared first                         |

### Tooling

- Jest + mock WatermelonDB adapter for unit-level sync logic
- Detox for device-level sync integration tests (real device / emulator)

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

---

## 30.10 Security Testing

### SAST (Static Analysis)

- **SonarQube** — code quality and security vulnerability scanning on every PR
- **ESLint security plugin** — SQL injection, XSS patterns
- **npm audit / pip-audit** — dependency vulnerability scanning in CI

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

| Gate                                     | Trigger          | Blocks                    |
| ---------------------------------------- | ---------------- | ------------------------- |
| Lint + type check                        | Every PR         | PR merge                  |
| Unit tests                               | Every PR         | PR merge                  |
| Unit coverage 100% lines + 100% branches | Every PR         | PR merge                  |
| Integration tests                        | Every PR         | PR merge                  |
| Multi-tenant isolation tests             | Every PR         | PR merge                  |
| API contract tests (Pact)                | Every PR         | PR merge                  |
| Security SAST (SonarQube)                | Every PR         | PR merge (High severity)  |
| E2E tests (Playwright)                   | Merge to `main`  | Staging deploy            |
| Load tests (k6)                          | Weekly scheduled | Alert only (not blocking) |
| DAST (OWASP ZAP)                         | Weekly scheduled | Alert only (not blocking) |

---

## References

| ID           | Title                                                              | Source                                                                   |
| ------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| [IEEE 830]   | IEEE Recommended Practice for Software Requirements Specifications | IEEE Std 830-1998                                                        |
| [ISTQB]      | ISTQB Glossary of Testing Terms                                    | International Software Testing Qualifications Board                      |
| [Pact]       | Pact Contract Testing Documentation                                | [docs.pact.io](https://docs.pact.io/)                                    |
| [k6]         | k6 Load Testing Documentation                                      | [k6.io/docs](https://k6.io/docs/)                                        |
| [Playwright] | Playwright End-to-End Testing Documentation                        | [playwright.dev/docs/intro](https://playwright.dev/docs/intro)           |
| [SonarQube]  | SonarQube Static Analysis Documentation                            | [docs.sonarqube.org](https://docs.sonarqube.org/)                        |
| [OWASP-ZAP]  | OWASP ZAP Dynamic Application Security Testing                     | [zaproxy.org/docs](https://www.zaproxy.org/docs/)                        |
| [Jest]       | Jest JavaScript Testing Framework                                  | [jestjs.io/docs/getting-started](https://jestjs.io/docs/getting-started) |

---

> 📎 See also: [03-system-design](03-system-design.md) · [04-tech-stack](04-tech-stack.md) · [07-multi-tenant-architecture](07-multi-tenant-architecture.md) · [11-database-schema](11-database-schema.md) · [14-api-architecture](14-api-architecture.md) · [17-offline-mobile-sync](17-offline-mobile-sync.md) · [21-mvp-scope](21-mvp-scope.md) · [31-monitoring-observability](31-monitoring-observability.md) · [32-implementation-specifications](32-implementation-specifications.md)
