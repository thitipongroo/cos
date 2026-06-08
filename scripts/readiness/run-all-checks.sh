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
TOTAL=22

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

  ((check_num++))
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
        ((PASS++))
        break
        ;;
      n|N|no|NO)
        read -r -p "   Note (what failed / what needs fixing): " note </dev/tty
        log "   → FAIL: $note"
        ((FAIL++))
        break
        ;;
      s|S|skip|SKIP)
        read -r -p "   Reason for skip: " reason </dev/tty
        log "   → SKIPPED: $reason"
        ((SKIP++))
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
  "No direct DB cross-service queries — all inter-service data access goes via Kafka or API." \
  "Verify no service imports another module's Prisma client or connects to another service's DB directly."

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
  "In Keycloak admin console: Authentication → Required Actions → CONFIGURE_TOTP set as Required for TENANT_ADMIN and FINANCE roles."

# ── SECTION C: Data (2 manual) ────────────────────────────────────────────────

log ""
log "══════════════════════════════════"
log "  SECTION C — Data"
log "══════════════════════════════════"

manual_check \
  "MANUAL-07" "Data" \
  "Neo4j backup: neo4j-admin database backup runs daily and stores to S3 with 7-day retention." \
  "Check CronJob: kubectl get cronjob neo4j-backup -n \$NAMESPACE. Verify last backup exists in S3: aws s3 ls s3://cos-backups/neo4j/"

manual_check \
  "MANUAL-08" "Data" \
  "MinIO replication configured with at least 3 drives (erasure coding minimum)." \
  "Run: mc admin info minio-alias and verify drive count >= 3. Check mc admin heal minio-alias/cos-prod reports no issues."

# ── SECTION D: Disaster Recovery (2 manual) ───────────────────────────────────

log ""
log "══════════════════════════════════"
log "  SECTION D — Disaster Recovery"
log "══════════════════════════════════"

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
  "In ArgoCD UI: verify cos-production app does NOT have syncPolicy.automated set. Confirm manual sync required."

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
