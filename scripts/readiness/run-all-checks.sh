#!/usr/bin/env bash
# [MANUAL] Phase 19 — Interactive Production Readiness Manual Checklist
# Walks reviewer through all 14 [MANUAL] + 8 global-scale checks.
# Usage: REVIEWER="Product Owner Name" ./scripts/readiness/run-all-checks.sh
# Exit: 0 = all checks passed, 1 = one or more failed/skipped

set -euo pipefail

REVIEWER="${REVIEWER:-}"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)")"
AUDIT_DIR="$ROOT/cos-audit"
LOG_FILE="$AUDIT_DIR/audit-${TIMESTAMP}.log"

if [[ -z "$REVIEWER" ]]; then
  echo "Usage: REVIEWER=\"<name>\" $0"
  echo ""
  read -r -p "Reviewer name: " REVIEWER
fi

mkdir -p "$AUDIT_DIR"

PASS=0
FAIL=0
SKIP=0
# 19 checks: MANUAL-01..06, MANUAL-09..13, GLOBAL-01..08.
#
# Was 22 while the file actually held 21 — the counter has been off since before MANUAL-07/08 were
# moved out on 2026-08-23, so the progress line printed "[21/22]" on the last check and no run ever
# reached the declared total. Counted from the calls, not carried forward.
TOTAL=19

# ── Logging ────────────────────────────────────────────────────────────────────

log() {
  echo "$*" | tee -a "$LOG_FILE"
}

log "═══════════════════════════════════════════════════════════════"
log "  PHASE 19 — MANUAL PRODUCTION READINESS CHECKLIST"
log "  Reviewer: $REVIEWER"
log "  Date:     $(date '+%Y-%m-%d %H:%M:%S')"
log "  Log:      $LOG_FILE"
log "═══════════════════════════════════════════════════════════════"
log ""

# ── Interactive check function ─────────────────────────────────────────────────

check_num=0

manual_check() {
  local id="$1"
  local section="$2"
  local description="$3"
  local verification_hint="$4"

  check_num=$((check_num + 1))
  log ""
  log "── [$check_num/$TOTAL] $id ($section)"
  log "   $description"
  if [[ -n "$verification_hint" ]]; then
    log "   HOW TO VERIFY: $verification_hint"
  fi
  log ""

  while true; do
    read -r -p "   Result [y=pass / n=fail / s=skip]: " answer </dev/tty
    case "$answer" in
      y|Y|yes|YES)
        log "   → PASS"
        PASS=$((PASS + 1))
        break
        ;;
      n|N|no|NO)
        read -r -p "   Note (what failed / what needs fixing): " note </dev/tty
        log "   → FAIL: $note"
        FAIL=$((FAIL + 1))
        break
        ;;
      s|S|skip|SKIP)
        read -r -p "   Reason for skip: " reason </dev/tty
        log "   → SKIPPED: $reason"
        SKIP=$((SKIP + 1))
        break
        ;;
      *)
        echo "   Please enter y, n, or s"
        ;;
    esac
  done
}

# ── SECTION A: Architecture (3 manual) ────────────────────────────────────────

log "══════════════════════════════════"
log "  SECTION A — Architecture"
log "══════════════════════════════════"

manual_check \
  "MANUAL-01" "Architecture" \
  "All services are stateless — no local filesystem state between requests." \
  "Review each service for use of local disk (tmp files, session state). Check: find backend/ services/ -name '*.ts' | xargs grep -l 'writeFile\|fs\.write' | grep -v test | grep -v node_modules"

manual_check \
  "MANUAL-02" "Architecture" \
  "No direct DB cross-service queries — all inter-service data access goes via Kafka or API, with ONE carved exception." \
  "Verify no service imports another module's Prisma client or connects to another service's DB directly. THE EXCEPTION (2026-08-23, TDD OQ-31): backend/src/modules/finance/ledger-reconciliation.service.ts reads procurement.purchase_orders and procurement.invoices, because a ledger built from events cannot detect its own gaps. It is read-only, never answers a request, and never writes a cost transaction. Confirm it is still the ONLY one and still has those three properties."

manual_check \
  "MANUAL-03" "Architecture" \
  "Outbox pattern implemented in all services that emit Kafka events." \
  "Review each Kafka-producing module: confirm events are written to an outbox table before being published."

# ── SECTION B: Security (3 manual) ────────────────────────────────────────────

log ""
log "══════════════════════════════════"
log "  SECTION B — Security"
log "══════════════════════════════════"

manual_check \
  "MANUAL-04" "Security" \
  "PostgreSQL RLS enabled on all tenant-scoped tables." \
  "Run: psql \$DATABASE_URL -c \"SELECT schemaname, tablename FROM pg_tables WHERE tablename NOT IN (SELECT relname FROM pg_class JOIN pg_policy ON pg_class.oid = pg_policy.polrelid) AND schemaname = 'public';\""

manual_check \
  "MANUAL-05" "Security" \
  "Audit logs table has RLS DENY UPDATE/DELETE — rows cannot be modified or deleted." \
  "Run: psql \$DATABASE_URL -c \"\\\\dp audit_logs\" and verify no UPDATE/DELETE policies exist for non-admin roles."

manual_check \
  "MANUAL-06" "Security" \
  "MFA (TOTP) enforced for TENANT_ADMIN and FINANCE roles in Keycloak." \
  "CORRECTED 2026-08-23 — the old hint said 'Authentication -> Required Actions -> CONFIGURE_TOTP set as Required for TENANT_ADMIN and FINANCE roles'. Keycloak required actions are REALM-WIDE, not role-scoped, so that cannot be done and is not how this is built: the realm binds a browser-mfa flow whose Conditional OTP subflow is gated by 'Condition - user attribute' on role ^(TENANT_ADMIN|FINANCE)\$ (CONFIGURE_TOTP is enabled with defaultAction=false, i.e. not required of anyone by default). Verify with: node scripts/ops/verify-keycloak-mfa-live.mjs --realm <realm> --probe"

# ── SECTION C: Data (2 manual) ────────────────────────────────────────────────

log ""
log "══════════════════════════════════"
log "  SECTION C — Data"
log "══════════════════════════════════"

# ── MANUAL-07 / MANUAL-08 MOVED OUT 2026-08-23 (PO decision) ──────────────────
#
# They checked the Neo4j backup CronJob and MinIO erasure coding. Measured on 2026-08-23: NEITHER
# DATASTORE IS DEPLOYED ANYWHERE. Neo4j and MinIO exist only in docker-compose.yml (development) —
# no Helm chart, no Kubernetes manifest, no Terraform, and nothing in infrastructure/onprem/. The
# string `neo4j-backup` appeared in exactly one file in the repository: this one.
#
# So both were Stage 1→2 gates on properties of systems that have no production deployment to have
# properties. They cannot pass in any environment, and a checklist carrying items with no possible
# answer is a checklist people learn to skim.
#
# Neither is dropped as a concern — they move to the phase that owns them:
#   * Neo4j backup      → Phase 13 (knowledge graph). When Neo4j gains a deployment manifest, it
#                         needs a backup CronJob before it holds anything, and the gap the Keycloak
#                         backup had (a CronJob that existed only as prose) is the one to avoid.
#   * MinIO erasure coding → the on-premise track (ADR-013: S3 in cloud, MinIO on-prem). It belongs
#                         with infrastructure/onprem/, which today has RKE2 install and CIS scan
#                         scripts and no object store.
#
# Re-add them here when the corresponding deployment lands.

manual_check \
  "MANUAL-09" "Disaster Recovery" \
  "Failover procedure documented in docs/runbooks/disaster-recovery.md." \
  "Run: cat docs/runbooks/disaster-recovery.md | grep -c '##' (expect >= 5 sections including RTO/RPO procedures)."

manual_check \
  "MANUAL-10" "Disaster Recovery" \
  "Database restore test performed and documented — RTO < 30 min achieved in staging." \
  "Evidence: restore test log in cos-audit/dr-test-*.log. Verify most recent test is within 30 days and RTO was achieved."

# ── SECTION E: CI/CD (2 manual) ───────────────────────────────────────────────

log ""
log "══════════════════════════════════"
log "  SECTION E — CI/CD"
log "══════════════════════════════════"

manual_check \
  "MANUAL-11" "CI/CD" \
  "Production promotion requires manual sync gate in ArgoCD UI — tested and documented." \
  "CORRECTED 2026-08-23 — there is no Application named cos-production. The production set is the 11 UNSUFFIXED Applications in infrastructure/kubernetes/argocd/argocd-apps.yaml; the 10 -staging ones are the automated set. This is now asserted in CI, so run the gate rather than reading YAML by eye: node scripts/ci/check-argocd-sync-policy.mjs — it fails if any production Application gains syncPolicy.automated, and also if a staging one loses it. Then confirm the LIVE cluster agrees with git (argocd app list --output=wide), which is the part the gate cannot see."

manual_check \
  "MANUAL-12" "CI/CD" \
  "Rollback procedure (argocd app rollback) documented and tested in staging." \
  "Run: cat docs/runbooks/rollback.md and verify argocd rollback steps documented. Confirm last staging rollback test succeeded."

# ── SECTION F: AI Monitoring (1 manual) ───────────────────────────────────────

log ""
log "══════════════════════════════════"
log "  SECTION F — AI Monitoring"
log "══════════════════════════════════"

manual_check \
  "MANUAL-13" "AI Monitoring" \
  "LLM provider API key rotation procedure documented." \
  "Run: cat docs/security/secrets-rotation-policy.md | grep -A5 'LLM\|OpenAI\|Claude'"

# ── SECTION G: Global-Scale Additions (8 checks) ──────────────────────────────

log ""
log "══════════════════════════════════"
log "  SECTION G — Global-Scale (8 additional)"
log "══════════════════════════════════"

manual_check \
  "GLOBAL-01" "Compliance" \
  "PDPA data flow reviewed and documented in docs/compliance/data-flow-map.md." \
  "Run: ls -la docs/compliance/data-flow-map.md && wc -l docs/compliance/data-flow-map.md"

manual_check \
  "GLOBAL-02" "Performance" \
  "Rate limiting verified via load test: no tenant can exceed 100 req/min sustained." \
  "Run: k6 run --vus 5 --duration 2m k6/scenarios/rate-limit-check.js and confirm 429s kick in at ~100 req/min."

manual_check \
  "GLOBAL-03" "Disaster Recovery" \
  "DR runbook executed successfully in staging — RTO achieved < 30 minutes." \
  "Verify cos-audit/dr-test-*.log exists with RTO measurement <= 30 min."

manual_check \
  "GLOBAL-04" "Compatibility" \
  "API backward compatibility: old mobile app version (N-1) tested against new backend." \
  "Deploy N-1 mobile app build to device, point at staging. Verify core flows (login, site ops, BOQ) work without errors."

manual_check \
  "GLOBAL-05" "Feature Flags" \
  "Feature flags verified: all mandatory flags present and togglable to OFF within 60 seconds." \
  "Check flag config and toggle test: verify each feature flag can be disabled and takes effect within 60s."

manual_check \
  "GLOBAL-06" "Observability" \
  "SLO dashboard live in Grafana with correct thresholds per QM-14." \
  "Open Grafana SLO dashboard. Verify thresholds: p95 read < 300ms, p95 write < 500ms, 5xx < 0.1%, AI < 5s, notifications < 500ms."

manual_check \
  "GLOBAL-07" "Incident Management" \
  "On-call rotation and PagerDuty escalation policy configured and tested (paging drill completed)." \
  "Confirm on-call rotation schedule is populated in PagerDuty. Verify drill page was received and acknowledged."

manual_check \
  "GLOBAL-08" "Security" \
  "Secrets rotation schedule defined in docs/security/secrets-rotation-policy.md; first rotation executed and verified in staging." \
  "Run: cat docs/security/secrets-rotation-policy.md. Verify rotation schedule entries for DB creds, JWT keys, LLM API keys. Confirm first rotation completed."

# ── Final Report ───────────────────────────────────────────────────────────────

log ""
log "═══════════════════════════════════════════════════════════════"
log "  PHASE 19 MANUAL CHECK SUMMARY"
log "  Reviewer: $REVIEWER"
log "  Date:     $(date '+%Y-%m-%d %H:%M:%S')"
log "═══════════════════════════════════════════════════════════════"
log "  Checks attempted: $check_num / $TOTAL"
log "  PASSED:  $PASS"
log "  FAILED:  $FAIL"
log "  SKIPPED: $SKIP"
log "═══════════════════════════════════════════════════════════════"
log ""

if [[ "$FAIL" -gt 0 ]]; then
  log "  ❌ $FAIL manual check(s) FAILED."
  log "  Fix all failures before proceeding to Phase 19 Step 3 report."
  log ""
  log "  Full audit log: $LOG_FILE"
  exit 1
elif [[ "$SKIP" -gt 0 ]]; then
  log "  ⚠️  All checks passed but $SKIP were skipped."
  log "  Resolve skipped items before final sign-off."
  log ""
  log "  Full audit log: $LOG_FILE"
  exit 0
else
  log "  ✅ All $PASS manual checks PASSED."
  log ""
  log "  Proceed to Phase 19 Step 3: generate final status report."
  log "  Full audit log: $LOG_FILE"
fi
