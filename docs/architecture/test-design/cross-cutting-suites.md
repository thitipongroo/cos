---
title: 'Test Design — Cross-Cutting Suites'
version: '1.0.0'
status: Active
last_updated: '2026-08-25'
authors:
  - thitipongroo
related_docs:
  - README.md
---

# Cross-Cutting Test Suites

> Part of the [Test Design](README.md) set (§35.9 of the former single document).

These suites span phases. To keep IDs consistent with §35.4, **each case is numbered under the
phase that owns its `Generate:` obligation**; this section defines the suite, its pass criteria,
and where its cases live.

## 35.9.1 Multi-tenant isolation (§30.6)

Cross-tenant data access is a **Critical Security Defect**. The suite runs as a dedicated PR gate
and cannot be waived.

| Isolation layer        | Test                                                             | Pass criteria                                                     |
| ---------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| PostgreSQL (shared DB) | Query Tenant B data using Tenant A JWT                           | Zero rows returned                                                |
| Neo4j                  | Graph traversal from Tenant A node into Tenant B subgraph        | Zero results                                                      |
| Kafka                  | Consumer receives message from another tenant's topic            | Message rejected; DLQ not populated with the cross-tenant message |
| S3                     | Pre-signed URL for Tenant A used against a Tenant B file         | 403 Forbidden                                                     |
| API                    | Tenant A `tenant_id` in JWT used against a Tenant B API resource | 403 Forbidden                                                     |

- Fixtures: `tenant_fixture_a`, `tenant_fixture_b`
- Case ownership: Phase 2 (tenant model), Phase 16 (enforcement) — see §35.10
- Production synthetic probe: Kubernetes CronJob `*/5 * * * *`, same 5 checks against the live
  production API; emits `tenant_isolation_check_result{check_name}` (`1` pass / `0` fail);
  `0` fires `TenantIsolationBreach` and pages the security lead immediately (§31.7).
  Location: `infrastructure/monitoring/isolation-probe/` — verified: `cronjob.yaml`,
  `configmap.yaml`, `rbac.yaml`, `isolation-probe.js`. Probe cases are owned by Phase 15.

## 35.9.2 Offline sync (§30.7)

| Scenario                                     | Expected behaviour                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| Device offline, user submits task update     | Record queued in local FIFO queue                                          |
| Connectivity restored                        | Queue flushes in priority order: safety → attendance → inspections → tasks |
| Sync fails 5 times for a safety incident     | Moved to tenant admin review queue; push alert sent to PM                  |
| Conflict: two users update same task offline | Max-wins — higher value wins (progress is monotonic)                       |
| Conflict: safety incident (human review)     | Both versions preserved; presented to admin for manual resolution          |
| Device local DB exceeds 500 MB               | LRU eviction triggered; drawing cache cleared first                        |

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

## 35.9.3 API contract (§30.8)

- Consumers: Next.js web app and React Native mobile app. Provider: the NestJS backend.
- Each consumer declares expected request/response shapes in Pact files; the provider verifies all
  consumer contracts in CI.
- **Versioning gate:** `/api/v2/` cannot be released while any v1 consumer contract fails. A
  breaking change (field removed or renamed) triggers a new major version per §14.4.
- Suite location (verified): `tests/contract/` — `finance-procurement.pact.spec.ts`,
  `analytics-all-services.pact.spec.ts`, `mobile-backend.pact.spec.ts`.
- Case ownership: Phase 18.

## 35.9.4 Performance and load (§30.9)

Backend load profiles per §30.9:

| Scenario                      | Load profile                                                     | Pass criteria                          |
| ----------------------------- | ---------------------------------------------------------------- | -------------------------------------- |
| Daily site report bulk submit | 100 concurrent Site Engineers submitting simultaneously at 07:00 | p95 < 500 ms                           |
| Executive dashboard load      | 50 concurrent Executive users loading dashboard                  | p95 < 1 s; ClickHouse query < 200 ms   |
| Procurement PO approval       | 20 concurrent Finance + PM approvals                             | p95 < 300 ms                           |
| Kafka consumer throughput     | 10,000 events/second sustained                                   | Consumer lag < 5 s                     |
| Mobile sync burst             | 500 devices syncing simultaneously on connectivity restore       | Zero data loss; sync < 30 s per device |

> **Divergence recorded — see §35.13 ESC-06.** `00_master` Phase 18 defines a _different_ set of
> four k6 scenarios (dashboard SLA, concurrent file uploads, API gateway throughput, AI report
> generation) from the five above. Two k6 script sets used to exist on disk; on 2026-08-29 they were
> merged into `tests/load/` (`dashboard-sla.js`, `file-upload.js`, `api-baseline.js`,
> `ai-report.js`) and `scripts/loadtest/` was deleted. The SCENARIO lists above and in `00_master`
> are still not reconciled — that remains a product-owner decision. The merge also deleted the QM-6
> gate script, which was restored as `tests/load/qm6-baseline.js` (§35.13 ESC-12).

Schedule: weekly on staging, not per-PR. A p95 increase > 20% vs the previous week alerts the
Engineering Lead. Load tests are advisory and do not block merge.

Frontend (Lighthouse CI, §30.9): runs on every `apps/web` PR under a throttled **mobile** profile.
Gate blocks merge on LCP > 2.5 s, CLS > 0.1, TBT > 200 ms (lab proxy for the INP ≤ 200 ms RUM SLO),
or script transfer size > 250 KB per audited route. Budgets verified in
`apps/web/.lighthouserc.json`; workflow `.github/workflows/lighthouse.yml`.

Case ownership: Phase 14 (dashboard SLA), Phase 18 (k6 suite + Lighthouse gate), Phase 19
(one-time production-readiness load gate).

## 35.9.5 Security (§30.10)

| Category         | Tool                                                    | Cadence           | Blocking                                                                                                                                                 |
| ---------------- | ------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SAST             | **CodeQL** (`github/codeql-action`) — JS/TS, Python, Go | Every PR          | Yes — blocks on High or above (ADR-054, replaced SonarQube 2026-08-22). Trivy + `pnpm audit` + `pip-audit` + `govulncheck` + GitLeaks retained alongside |
| SAST (lint)      | ESLint security plugin (SQL injection, XSS patterns)    | Every PR          | Yes                                                                                                                                                      |
| Dependency       | `pnpm audit`, `pip-audit`, `govulncheck`                | Every PR          | Yes — High/Critical                                                                                                                                      |
| Container        | Trivy                                                   | Image build       | Yes — CRITICAL                                                                                                                                           |
| DAST             | OWASP ZAP                                               | Weekly on staging | Alert only; all High findings must be resolved before production release                                                                                 |
| Secrets          | GitLeaks (pre-commit + CI)                              | Every commit      | Yes                                                                                                                                                      |
| Penetration test | Third party, annual, against staging                    | Annual            | Required before Stage 1→2 and Stage 2→3                                                                                                                  |

**ThrottlerGuard unit suite (§30.10)** — mandatory, mocks `ThrottlerStorageRedisService` (no real
Redis in unit tests):

| Case                                   | Assertion                                                 |
| -------------------------------------- | --------------------------------------------------------- |
| Request within limit                   | Returns 200; does not throw                               |
| 101st request within 60 s              | Throws `ThrottlerException`; HTTP 429                     |
| Auth endpoint, 11th within 60 s        | Throws `ThrottlerException`; `@Throttle` override applied |
| File upload endpoint, 21st within 60 s | Throws `ThrottlerException`; `@Throttle` override applied |
| `Retry-After` on 429                   | Header equals seconds until reset window                  |
| Counter resets after TTL               | Next request after TTL returns 200                        |
| Redis storage used                     | `ThrottlerStorageRedisService` is injected and called     |

Case ownership: Phase 16.

## 35.9.6 AI quality (§30.11)

**Layer A (MVP) — Assistive AI:**

| Feature                 | Test method                                         | Pass criteria                            |
| ----------------------- | --------------------------------------------------- | ---------------------------------------- |
| Daily report generation | Compare against 50 golden examples (Thai + English) | ROUGE-L ≥ 0.7; no hallucinated BOQ items |
| OCR accuracy            | 100 construction drawing samples                    | Character error rate < 5%                |
| Voice transcription     | 50 Thai construction site recordings                | Word error rate < 10%                    |
| RAG retrieval           | 50 known questions, verify top-3 retrieved chunks   | Recall@3 ≥ 0.8                           |

**Layer B (Post-MVP) — Analytical AI.** Methodology per §30.11: 70/30 train/held-out split from
production project history; walk-forward time-series validation (never use future data to predict
the past); Monte Carlo simulation with 1,000 iterations for delay-forecast uncertainty; drift
detection via Evidently AI alerting when PSI > 0.2; **monthly** evaluation cadence; retraining
triggered when accuracy drops > 10% month-over-month or a drift alert fires. Tooling: Prophet,
Evidently AI, MLflow.

| Model (Phase 23)     | Primary metric | Secondary metric | Pass threshold   | Source                               |
| -------------------- | -------------- | ---------------- | ---------------- | ------------------------------------ |
| `DelayForecastModel` | RMSE (days)    | MAE (days)       | RMSE ≤ 5 days    | §30.11                               |
| `RiskClassifier`     | F1-score       | AUC-ROC          | F1 ≥ 0.80        | §30.11                               |
| `SafetyVisionModel`  | Precision      | Recall           | Precision ≥ 0.85 | §30.11 (resolved 2026-08-22, ESC-02) |
| `GraphMLModel`       | F1-score       | AUC-ROC          | F1 ≥ 0.80        | §30.11 (resolved 2026-08-22, ESC-02) |

> `CostAnomalyModel` carries a threshold in §30.11 (Precision ≥ 0.85) but is **not** one of the
> four Phase 23 models defined in `00_master` Phase 23 or §22.6. Recorded as an orphan in §35.13
> ESC-03; no test case is designed against it.

Regression rule (§30.11): any metric dropping > 10% versus the previous month alerts the AI Lead.

Case ownership: Phase 11 (RAG retrieval), Phase 12 (report generation, hallucination guard),
Phase 23 (Layer B models).

---
