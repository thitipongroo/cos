---
paths:
  - "**/*.spec.ts"
  - "**/*.test.ts"
  - "**/jest.config.js"
  - "**/jest.*.config.js"
  - "**/test_*.py"
  - "**/*_test.go"
  - "tests/**"
  - "apps/mobile/e2e/**"
---

# QM-1 — Test Coverage

Indexed in: `context.md` §QUALITY MANDATES

- Unit test coverage **100% lines and 100% branches** for all new modules (source: spec §30.3, §30.12); measured by `jest --coverage` with thresholds `{"global":{"lines":100,"branches":100}}` or `pytest --cov` with `--cov-fail-under=99` for lines (branch coverage enforced in jest config)
  - **Backend gate is genuinely green.** The parallel unit run (`pnpm --filter @cos/backend test:cov`) is 139 suites / 1879 tests at 100/100/100/100 (verified 2026-07-21). Temporal `*.workflow.spec.ts` (3 suites / 12 tests) run **serially** via `pnpm --filter @cos/backend test:workflows` (own `jest.workflows.config.js`, `maxWorkers:1`) because parallel `TestWorkflowEnvironment` time-skipping servers starve each other (flaky hook timeouts + `WorkflowFailedError: Workflow execution timed out`); they are excluded from `test:cov` **and** from `collectCoverageFrom` (coverage-neutral — the only source they uniquely touch is `*.workflow.ts`, already coverage-excluded; activities are covered by `*.activities.spec.ts`). Integration specs (13 suites / 129 tests) run via `pnpm --filter @cos/backend test:integration` (Testcontainers; see §30.4). Two recurring traps to avoid: (1) request-scoped services read **`req.userId` / `req.tenantId`** (projected by `TenantContextInterceptor` from `req.user`, ADR-031) with a **CLS fallback** under Fastify (`req.userId ?? clsUserId()`) — unit-test mocks must set `userId`/`tenantId` (not only `req.user.user_id`), and a test that exercises the fallback must run inside a CLS context; (2) the `?? ''` fallback in each lazy `tenantId`/`userId` getter is covered by **invoking the getter** on an empty-`REQUEST` instance (`expect((svc as unknown as {tenantId:string}).tenantId).toBe('')`) — merely constructing the service does not. **`TenantPrismaService` is now a singleton that reads tenant context from CLS** (ADR-031 Update 2026-06-26): its tests establish context via `ClsServiceManager.getClsService().run(...)` rather than a mock `REQUEST`; it still validates lazily in `run()` (not the constructor).
- Integration tests required for every public API endpoint
- Contract tests required whenever a new inter-service HTTP contract is introduced
- E2E tests required for every critical user workflow (site report, procurement approval, cost tracking):
  - Web: Playwright 1.x — `tests/e2e/`; 10 scenarios (spec §30.5):
    1. login — user authentication via SMS OTP and email/password flows; JWT issued; protected route accessible
    2. project create — PM creates project; status transitions DRAFT → ACTIVE
    3. report submit — Site Engineer submits daily site report; Kafka event emitted; PM notified
    4. dashboard view — Executive loads analytics dashboard; ClickHouse queries complete within P95 < 1s SLA
    5. Procurement flow — Create PR → generate RFQ → receive quotation → approve PO →
       record delivery → approve vendor invoice
    6. Daily site report — Site Engineer submits report with manpower count and blockers
    7. Budget exceeded alert — Cost transaction pushes project over budget → Executive receives push notification
    8. Safety incident — Safety Officer reports incident → PM receives push notification →
       acknowledged within 30 min SLA
    9. QC inspection — Inspector fills checklist → result recorded as fail → issue_severity populated → photo uploaded
    10. Approval escalation — Approver does not respond in 48 hours → next approver is notified
  - Mobile: Detox (React Native) — `apps/mobile/e2e/`; 3 scenarios (spec §30.5):
    1. Offline check-in — Worker checks in with no connectivity → record queued → sync on reconnect
    2. Offline inspection — Inspector fills checklist offline → photo attached → sync on reconnect
    3. Sync conflict resolution — Two users update same task progress_percent while offline →
       Max-wins applied on sync (higher value wins; progress is monotonic)
- Test files must be committed in the same PR as the implementation — never as a follow-up
- For financial calculation logic, procurement approval flows, and permission checks → mutation testing required (`stryker` for TypeScript, `mutmut` for Python); mutation score ≥ 70%
