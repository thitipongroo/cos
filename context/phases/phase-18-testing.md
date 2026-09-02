# Phase 18 — Testing

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 1–17, 20–25 · SaaS Maturity Stage —.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Build testing strategy.

Testing Tools (authoritative):
  Unit testing (TypeScript):   Jest 30.x + @nestjs/testing
  Unit testing (Python):       pytest 9.x + pytest-asyncio
  Unit testing (Go):           testing package (stdlib) + testify
  Integration testing:         Jest + Supertest (NestJS) + testcontainers-node
  E2E testing:                 Playwright 1.x (web) + Detox (React Native mobile)
  API contract testing:        Pact 12.x (consumer-driven contract tests)
  Kafka event testing:         testcontainers Kafka module
  Load testing:                k6 (open-source, Grafana k6)
  Security testing:            OWASP ZAP (in CI pipeline, staging only)

Testing Pyramid:
  Unit tests:        70% — test business logic, calculations, guards, state machines
  Integration tests: 20% — test service + DB + Kafka with testcontainers
  E2E tests:          5% — critical user journeys only
  Load tests:         5% — SLA validation per Phase 14

Required Unit Test Coverage:
  Minimum: 100% line coverage AND 100% branch coverage for all NestJS services (source: spec §30.3)
  Mandatory coverage for:
    - All state machine transitions (Phase 3, Phase 5)
    - All financial calculations (Phase 4, Phase 7) — include decimal edge cases
    - All RBAC guards (Phase 2)
    - HallucinationGuard (Phase 12)
    - SyncManager conflict resolution (Phase 10)
    - Kafka consumer idempotency (Phase 8)

k6 Load Test Scenarios:
  Scenario 1: Dashboard SLA validation
    Target: GET /api/v1/analytics/executive — 100 VUs, 5 min
    Pass criteria: P95 < 1s, error rate < 0.1% (§31.6 dashboard SLO)

  Scenario 2: Concurrent file uploads
    Target: POST /api/v1/files/upload — 20 VUs, 5 MB file, 5 min
    Pass criteria: P95 < 10s, error rate < 0.5%

  Scenario 3: API gateway throughput
    Target: mixed read endpoints — 200 VUs, 10 min
    Pass criteria: P95 < 1s, error rate < 0.1%

  Scenario 4: AI report generation
    Target: POST /api/v1/ai/reports/site-summary — 10 VUs, 5 min
    Pass criteria: P95 < 15s (AI calls are slow), error rate < 1%

Pact Contract Tests:
  Define consumer-provider pairs:
    Finance (consumer) ← Procurement (provider): invoice received event
    Analytics (consumer) ← All services (providers): event schema validation
    Mobile (consumer) ← all services (providers): API response shape

Testcontainers Setup:
  Shared test setup (all integration tests):
    - PostgreSQL container (per service schema) — backend uses the timescale/timescaledb image
      (migrations call create_hypertable, ADR-032); point APP_DATABASE_URL + DIRECT_DATABASE_URL
      at the container and migrate from a cwd without a .env (Prisma CLI gives .env precedence). See spec §30.4.
    - Redis container
    - Kafka + Schema Registry container
    - MinIO container (File Service tests only)
    - Neo4j container (KG tests only)
    - ClickHouse container (Analytics tests only)

Generate:

- Jest config per service (coverage thresholds: 100% lines + 100% branches — source: spec §30.3)
  Note: jest.config.js is a Phase 1 deliverable — Phase 18 adds testcontainers and @cos/test-utils only
- pytest config for Python services
- Shared testcontainers setup utility (@cos/test-utils package)
- packages/@cos/test-utils/README.md (required per QM-11 — purpose, public API, dependencies, configuration, usage example; same README standard as all packages/@cos/* per Rule 31; per spec §30.13)
- k6 load test scripts for all 4 scenarios above
- Playwright E2E tests (web — location: tests/e2e/; runs on merge to `staging` (ADR-020); source: spec §30.5 + Phase 18 Generate):
    1. login — user authentication via SMS OTP and email/password flows; JWT issued; protected route accessible
    2. project create — PM creates project; status transitions DRAFT → ACTIVE
    3. report submit — Site Engineer submits daily site report; Kafka event emitted; PM notified
    4. dashboard view — Executive loads analytics dashboard; ClickHouse queries complete within P95 < 1s SLA
    5. Procurement flow — Create PR → generate RFQ → receive quotation → approve PO → record delivery → approve vendor invoice
    6. Daily site report — Site Engineer submits report with manpower count and blockers
    7. Budget exceeded alert — Cost transaction pushes project over budget → Executive receives push notification
    8. Safety incident — Safety Officer reports incident → PM receives push notification → acknowledged within 30 min SLA
    9. QC inspection — Inspector fills checklist → result recorded as fail → issue_severity populated → photo uploaded
    10. Approval escalation — Approver does not respond in 48 hours → next approver is notified
- Detox E2E tests (React Native mobile — location: apps/mobile/e2e/; runs on merge to `staging` (ADR-020); source: spec §30.5, §30.7):
    1. Offline inspection — Inspector fills checklist offline → photo attached → sync on reconnect
    2. Sync conflict resolution — Two users update same task progress_percent while offline → Max-wins applied on sync (higher value wins; progress is monotonic)
    - RETIRED 2026-08-21 (PO): "Offline check-in — Worker checks in with no connectivity → record queued → sync on reconnect". Self check-in was removed from the mobile product on 2026-08-09, so the scenario had no control to drive; see spec §30 "Mobile E2E (Detox)". Note that 21-mvp-scope.md still places check-in/check-out inside MVP workforce scope — that is a separate open question, not settled by this.
- Pact consumer test examples for Finance ← Procurement
- GitHub Actions integration: lint + type-check + build + unit (incl. serial Temporal workflow step) + integration + isolation + contract + dependency-audit on every PR (spec §30.12); load tests weekly scheduled on staging (not per-deploy; spec §30.9)
- Test data factories (factory_bot pattern — plain TypeScript functions, minimal required fields, spread overrides) per entity — location: packages/@cos/test-utils/src/factories.ts, naming: build<EntityName>Dto for request DTOs; RESOLVED 2026-06-13, see spec §30.13
- Database reset utility for integration tests (truncate + reseed)
- API version sunset dates and tenant notification log: docs/api/deprecation-schedule.md
  (must exist before any endpoint sunset; minimum 90-day notice — source: spec §14.4, context.md §API)

Async fake timer test pattern (Rule 30 — required for retry helpers, pollers, backoff logic):
  Use jest.runAllTimersAsync() NOT jest.runAllTimers() for async functions that sleep internally.
  Correct pattern:
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())
    // For each retry/sleep step: await jest.runAllTimersAsync()
  Wrong pattern (causes test hangs with multi-step retries):
    jest.runAllTimers(); jest.runAllTimers(); // synchronous — microtask queue not drained between calls
  Applies to: withRetry, OutboxPoller, any class using setTimeout/setInterval internally

Temporal workflow test pattern (parallel TestWorkflowEnvironment time-skipping servers starve each other):
  *.workflow.spec.ts run SERIALLY via jest.workflows.config.js (maxWorkers:1, pnpm test:workflows),
  excluded from the parallel test:cov run AND from collectCoverageFrom (coverage-neutral: *.workflow.ts
  is already coverage-excluded; activities are covered by their own *.activities.spec.ts).
  CI runs test:workflows as a separate serial gate after test:cov. Symptom if run in parallel:
  flaky "Exceeded timeout for a hook" + "WorkflowFailedError: Workflow execution timed out". See spec §30.12.


Constraints:

- Before marking Phase 18 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```
