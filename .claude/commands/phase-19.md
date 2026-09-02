---
description: Run the Phase 19 production-readiness protocol — 39 automated checks, 22 manual, then the adoption gates
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Skill
---

# Phase 19 Verification Protocol

Authoritative text: `context.md` §PHASE 19 VERIFICATION PROTOCOL

This file IS that text, moved out of `context.md` on 2026-09-02. It runs on demand;
it was never something every session needed to carry.

> ⚠️ Applies to Stage 1 BUILD only. Skip if current stage ≠ BUILD.

Triggered in two ways — either is valid:

- **Auto:** agent completes Phase 18 implementation → run verification immediately
- **Manual:** product owner says "verify production readiness" or "รัน production readiness check"

### Step 0 — CI/CD pre-check

Before running local scripts, confirm CI is green:

```bash
gh run list --branch main --limit 5 --json status,conclusion,name
```

If the latest CI run is FAILED → do not proceed. Fix CI first.

### Step 1 — Run automated checks (30 items via script + 9 global-scale additions = 39 total)

```bash
./scripts/readiness/verify-production-readiness.sh --env staging
```

Report results to product owner:

- ✅ PASSED: X items
- ❌ FAILED: list each failed item with error detail
- ⏭ SKIPPED: list items skipped due to missing tool/config

If any FAILED → do not proceed to Step 2. Fix failed items first, then re-run.

**Additional automated checks (9 global-scale additions — all must pass before Step 2):**

```bash
# 1. Test coverage gate (100% lines + 100% branches — source: spec §30.3)
npx jest --coverage --coverageThreshold='{"global":{"lines":100,"branches":100}}'

# 2. Node dependency vulnerability check
npm audit --audit-level=high

# 3. Python dependency vulnerability check
pip-audit --requirement ai/requirements.txt

# 4. SAST + code quality scan (ADR-011 — replaced SonarQube)
#    All three already run in CI on every PR; this is re-verification, not a separate gate.
semgrep --config .semgrep/ --error          # project policy rules (blocking)
pnpm exec jscpd backend/src packages apps/web/src services   # duplication ratchet (.jscpd.json)
gh api repos/:owner/:repo/code-scanning/alerts --jq '[.[]|select(.state=="open")]|length'
# Pass = semgrep exit 0, jscpd exit 0, and 0 open CodeQL/Semgrep code-scanning alerts

# 5. OpenAPI spec freshness
./scripts/readiness/check-openapi-freshness.sh

# 6. i18n completeness (no untranslated keys in th.json vs en.json)
./scripts/readiness/check-i18n-completeness.sh

# 7. Load test gate (100 VU × 5 min — must pass before manual checks begin)
#    qm6-baseline.js, NOT api-baseline.js: the latter is the Phase 18 scenario (200 VU over 10 min,
#    reads only, p95 < 1 s) and asserts none of the QM-6 budgets. The two sat in different directories
#    under the same name until 2026-08-29 and were confused for each other once (§35.13 ESC-12).
k6 run --vus 100 --duration 300s ./tests/load/qm6-baseline.js

# 8. Security headers audit
./scripts/readiness/check-security-headers.sh --env staging

# 9. Kafka schema registry validation
./scripts/readiness/check-schema-registry.sh
```

### Step 2 — Run manual checks interactively (14 items via script + 8 global-scale additions = 22 total)

```bash
REVIEWER="<product owner name>" ./scripts/readiness/run-all-checks.sh
```

Walk product owner through each check one by one.
Wait for y/n/s answer before proceeding to next check.
Save audit log to `cos-audit/audit-<timestamp>.log`

**Additional manual checks (8 global-scale additions):**

- [ ] PDPA data flow reviewed and documented in `docs/registers/data-flow-map.md`
- [ ] Rate limiting verified via load test (k6): no tenant can exceed 100 req/min sustained
- [ ] DR runbook executed successfully in staging (RTO achieved < 30 minutes)
- [ ] API backward compatibility: old mobile app version (N-1) tested against new backend
- [ ] Feature flags verified: all mandatory flags present and togglable to OFF in < 60 seconds
- [ ] SLO dashboard live in Grafana with correct thresholds per QM-14
- [ ] On-call rotation and PagerDuty escalation policy configured and tested (paging drill completed)
- [ ] Secrets rotation schedule defined in `docs/policies/secrets-rotation-policy.md`; first rotation executed and verified in staging

### Step 3 — Report final status

```text
SECTION A — PRE-LAUNCH CHECKLIST
  Auto checks:   X/39 passed  (30 original script + 9 global-scale additions)
  Manual checks: X/22 passed  (14 original script + 8 global-scale additions)

SECTION B — QUALITY MANDATES GATE
  QM-1  Test Coverage:             PASS / FAIL (coverage %)
  QM-2  API Versioning:            PASS / FAIL
  QM-3  i18n Completeness:         PASS / FAIL
  QM-4  Security SAST + Headers:   PASS / FAIL
  QM-5  PDPA/GDPR Compliance:      PASS / FAIL
  QM-6  Performance Budget:        PASS / FAIL (p95 read: _ms, write: _ms)
  QM-7  Rate Limiting:             PASS / FAIL
  QM-8  Observability:             PASS / FAIL
  QM-9  Backward Compat:           PASS / FAIL
  QM-10 Error Taxonomy:            PASS / FAIL
  QM-11 Documentation:             PASS / FAIL
  QM-12 DR Drill:                  PASS / FAIL (RTO achieved: ___ min)
  QM-13 Multi-Region Design:       PASS / FAIL (no hardcoded ARNs; UTC storage; no region assumptions in schema or API)
  QM-14 SLO Dashboard:             PASS / FAIL
  QM-15 Feature Flags:             PASS / FAIL
  QM-16 Deployment Runbook:        PASS / FAIL
  QM-17 Incident Management:       PASS / FAIL
  QM-18 Connection Pool (PgBouncer): PASS / FAIL (client_waiting alert tested)

SECTION C — PRODUCTION ADOPTION GATES
  [ ] 8 gates to verify after go-live (tracked in Grafana dashboard)
```

If all checks pass → confirm to product owner:

> "Phase 19 production readiness verified ✅
> Proceed to go-live → load context/03_operationalize_execution.md (stage 2).
> Track 8 adoption gates in Grafana for ≥ 14 consecutive days.
> Also track all SLO targets per QM-14 for ≥ 14 consecutive days.
> When all 8 adoption gates AND all SLO targets pass → load context/04_post_launch_enterprise_evolution.md (stage 3)."

If any check fails → list what needs to be fixed before re-running. Do not advance stage.
