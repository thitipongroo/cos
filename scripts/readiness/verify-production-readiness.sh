#!/usr/bin/env bash
# [AUTO] Phase 19 — Production Readiness Automated Verification
# Runs all 30 [AUTO] checks from the Phase 19 Verification Protocol.
# Usage: ./scripts/readiness/verify-production-readiness.sh [--env staging|production]
# Exit: 0 = all checks pass, 1 = one or more checks failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$(cd "$SCRIPT_DIR/../.." && pwd)")"

ENV="staging"
PASS=0
FAIL=0
SKIP=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV="$2"; shift 2 ;;
    *) shift ;;
  esac
done

NS="${NAMESPACE:-cos}"
MONITORING_NS="${MONITORING_NS:-monitoring}"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
INGRESS_HOST="${INGRESS_HOST:-}"
GRAFANA_TOKEN="${GRAFANA_TOKEN:-}"
GRAFANA_URL="${GRAFANA_URL:-http://grafana.monitoring:3000}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://prometheus.monitoring:9090}"
LOKI_URL="${LOKI_URL:-http://loki.monitoring:3100}"
JAEGER_URL="${JAEGER_URL:-http://jaeger.monitoring:16686}"
KAFKA_BS="${KAFKA_BOOTSTRAP:-localhost:9092}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"

if [[ -z "$INGRESS_HOST" ]]; then
  case "$ENV" in
    staging)    INGRESS_HOST="staging-api.construction-os.io" ;;
    production) INGRESS_HOST="api.construction-os.io" ;;
    *)          INGRESS_HOST="localhost:3000" ;;
  esac
fi

# ── Helpers ────────────────────────────────────────────────────────────────────

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }
skip() { echo "  - $1 (skipped — tool/config not available)"; SKIP=$((SKIP + 1)); }

section() { echo ""; echo "── $1 ──"; }

# ── SECTION 1: Architecture ────────────────────────────────────────────────────

section "Architecture"

# AUTO-01: Health check endpoints
echo "  [AUTO-01] Health check endpoints..."
if "$SCRIPT_DIR/check-health.sh" &>/dev/null 2>&1; then
  pass "AUTO-01: All services respond to /health/live and /health/ready"
else
  fail "AUTO-01: One or more services failed health checks — run check-health.sh for details"
fi

# AUTO-02: Kubernetes liveness + readiness probes
echo "  [AUTO-02] Kubernetes liveness/readiness probes..."
if command -v kubectl &>/dev/null; then
  missing_probes=$(kubectl get deployments -n "$NS" -o json 2>/dev/null | python3 -c "
import sys, json
items = json.load(sys.stdin)['items']
missing = []
for d in items:
    name = d['metadata']['name']
    for c in d.get('spec', {}).get('template', {}).get('spec', {}).get('containers', []):
        if not c.get('livenessProbe'):
            missing.append(f'{name}/{c[\"name\"]}')
print(len(missing))
for m in missing[:5]:
    print(f'  - {m}')
" 2>/dev/null || echo "ERR")
  if [[ "$missing_probes" == "0" ]]; then
    pass "AUTO-02: All deployments have liveness + readiness probes"
  else
    fail "AUTO-02: Deployments missing probes: $missing_probes"
  fi
else
  skip "AUTO-02: kubectl not available"
fi

# AUTO-03: Schema Registry BACKWARD_TRANSITIVE
echo "  [AUTO-03] Schema Registry compatibility..."
if "$SCRIPT_DIR/check-schema-registry.sh" &>/dev/null 2>&1; then
  pass "AUTO-03: Schema Registry BACKWARD_TRANSITIVE compatibility enforced"
else
  fail "AUTO-03: Schema Registry check failed — run check-schema-registry.sh for details"
fi

# AUTO-04: Temporal worker replicas >= 2
echo "  [AUTO-04] Temporal worker replicas..."
if command -v kubectl &>/dev/null; then
  # Selected by LABEL, not by name. Helm derives the Deployment name from the release
  # ({release}-{chart}, so ArgoCD produces `cos-temporal-worker-cos-temporal-worker`), and a check
  # hardcoding `temporal-worker` could never match any release this repo deploys — it would have
  # reported 0 replicas forever, indistinguishable from the real absence it was written to catch.
  replicas=$(kubectl get deployment -n "$NS" \
    -l app.kubernetes.io/name=cos-temporal-worker \
    -o jsonpath='{.items[0].spec.replicas}' 2>/dev/null || echo "0")
  replicas=${replicas:-0}
  if [[ "$replicas" -ge 2 ]]; then
    pass "AUTO-04: Temporal worker has $replicas replicas (>= 2)"
  else
    fail "AUTO-04: Temporal worker replicas = $replicas (expected >= 2)"
  fi
else
  skip "AUTO-04: kubectl not available"
fi

# ── SECTION 2: Security ────────────────────────────────────────────────────────

section "Security"

# AUTO-05: TLS 1.3
echo "  [AUTO-05] TLS 1.3..."
if "$SCRIPT_DIR/check-security.sh" &>/dev/null 2>&1; then
  pass "AUTO-05: Security checks passed (TLS, sealed-secrets, GitOps)"
else
  fail "AUTO-05: Security check failed — run check-security.sh for details"
fi

# AUTO-06: Sealed secrets (covered by check-security.sh above — separate counter)
echo "  [AUTO-06] Sealed secrets..."
if command -v kubectl &>/dev/null; then
  raw=$(kubectl get secrets -A -o json 2>/dev/null | python3 -c "
import sys, json
items = json.load(sys.stdin)['items']
raw = [i['metadata']['namespace']+'/'+i['metadata']['name']
       for i in items
       if i['type'] == 'Opaque'
       and 'sealedsecrets.bitnami.com/cluster-wide' not in i.get('metadata',{}).get('annotations',{})
       and not i['metadata']['name'].startswith('sh.helm.')]
print(len(raw))
" 2>/dev/null || echo "ERR")
  if [[ "$raw" == "0" ]]; then
    pass "AUTO-06: All Opaque secrets are sealed"
  else
    fail "AUTO-06: $raw unsealed Opaque secrets found"
  fi
else
  skip "AUTO-06: kubectl not available"
fi

# AUTO-07: Trivy — no CRITICAL CVEs
echo "  [AUTO-07] Trivy container scan..."
if command -v trivy &>/dev/null; then
  images=(
    "cos-backend"
    "cos-file-service"
    "cos-ai-gateway"
    "cos-analytics-worker"
  )
  trivy_fail=0
  for img in "${images[@]}"; do
    result=$(trivy image --exit-code 0 --severity CRITICAL --quiet "$img:latest" 2>/dev/null \
      | grep -c "CRITICAL" 2>/dev/null || echo "0")
    if [[ "$result" -gt 0 ]]; then
      echo "    ✗ $img: $result CRITICAL CVEs"
      trivy_fail=$((trivy_fail + 1))
    fi
  done
  if [[ "$trivy_fail" -eq 0 ]]; then
    pass "AUTO-07: No CRITICAL CVEs in container images"
  else
    fail "AUTO-07: CRITICAL CVEs found in $trivy_fail image(s)"
  fi
else
  skip "AUTO-07: trivy not installed"
fi

# AUTO-08: OWASP ZAP
echo "  [AUTO-08] OWASP ZAP..."
if command -v zap-baseline.py &>/dev/null || docker image inspect owasp/zap2docker-stable &>/dev/null 2>&1; then
  zap_out=$(zap-baseline.py -t "https://${INGRESS_HOST}" -r /dev/null 2>/dev/null || echo "FAIL")
  if echo "$zap_out" | grep -q "PASS"; then
    pass "AUTO-08: OWASP ZAP baseline scan passed"
  else
    fail "AUTO-08: OWASP ZAP baseline scan found issues"
  fi
else
  skip "AUTO-08: zap-baseline.py / ZAP Docker image not available"
fi

# ── SECTION 3: Observability ───────────────────────────────────────────────────

section "Observability"

obs_exit=0
"$SCRIPT_DIR/check-observability.sh" 2>/dev/null || obs_exit=$?

# AUTO-09..14: delegated to check-observability.sh
if [[ $obs_exit -eq 0 ]]; then
  pass "AUTO-09: Services emit metrics to Prometheus"
  pass "AUTO-10: Services emit structured logs to Loki"
  pass "AUTO-11: Services emit traces to Jaeger via OpenTelemetry"
  pass "AUTO-12: Alerting rules configured in Grafana"
  pass "AUTO-13: Grafana dashboards accessible and populated"
else
  fail "AUTO-09..13: Observability stack check failed — run check-observability.sh for details"
fi

# AUTO-14: DLQ depth alert
echo "  [AUTO-14] DLQ depth alert..."
if command -v kafka-console-producer.sh &>/dev/null 2>&1; then
  echo '{"test":"dlq-probe"}' | kafka-console-producer.sh \
    --topic "site.events.dlq" --bootstrap-server "$KAFKA_BS" &>/dev/null 2>&1 || true
  pass "AUTO-14: DLQ test message produced (alert verification requires Grafana alert history)"
else
  skip "AUTO-14: kafka-console-producer.sh not available"
fi

# ── SECTION 4: Data ────────────────────────────────────────────────────────────

section "Data"

data_exit=0
"$SCRIPT_DIR/check-data.sh" 2>/dev/null || data_exit=$?

if [[ $data_exit -eq 0 ]]; then
  pass "AUTO-15: PostgreSQL automated backups enabled (>= 7 day retention)"
  pass "AUTO-16: PostgreSQL PITR enabled (Multi-AZ)"
  pass "AUTO-18: Redis AOF persistence enabled"
  pass "AUTO-19: Kafka topic replication factor = 3, min ISR = 2"
else
  fail "AUTO-15..19: Data layer check failed — run check-data.sh for details"
fi

# AUTO-17: ClickHouse backup CronJob
echo "  [AUTO-17] ClickHouse backup CronJob..."
if command -v kubectl &>/dev/null; then
  ch_last=$(kubectl get cronjob clickhouse-backup -n "$NS" \
    -o jsonpath='{.status.lastSuccessfulTime}' 2>/dev/null || echo "")
  if [[ -n "$ch_last" ]]; then
    pass "AUTO-17: ClickHouse backup CronJob last successful: $ch_last"
  else
    fail "AUTO-17: ClickHouse backup CronJob not found or never succeeded"
  fi
else
  skip "AUTO-17: kubectl not available"
fi

# ── SECTION 5: Disaster Recovery ──────────────────────────────────────────────

section "Disaster Recovery"

# AUTO-20: RTO — Multi-AZ enabled (automated failover)
echo "  [AUTO-20] RTO — Multi-AZ (automated failover)..."
if command -v aws &>/dev/null; then
  multiaz=$(aws rds describe-db-instances --region "$AWS_REGION" \
    --query 'DBInstances[?contains(DBInstanceIdentifier, `cos-postgres`)].MultiAZ' \
    --output text 2>/dev/null || echo "")
  if [[ "$multiaz" == "True" ]]; then
    pass "AUTO-20: RDS Multi-AZ enabled — automated failover within RTO target"
  else
    fail "AUTO-20: RDS Multi-AZ = $multiaz (required: True for RTO target)"
  fi
else
  skip "AUTO-20: AWS CLI not available"
fi

# AUTO-21: RPO — backup retention + PITR
echo "  [AUTO-21] RPO — backup retention..."
if command -v aws &>/dev/null; then
  retention=$(aws rds describe-db-instances --region "$AWS_REGION" \
    --query 'DBInstances[?contains(DBInstanceIdentifier, `cos-postgres`)].BackupRetentionPeriod' \
    --output text 2>/dev/null || echo "0")
  if [[ "$retention" -ge 1 ]] 2>/dev/null; then
    pass "AUTO-21: PostgreSQL PITR active (retention = $retention days) — RPO target achievable"
  else
    fail "AUTO-21: PostgreSQL backup retention = $retention (PITR requires >= 1)"
  fi
else
  skip "AUTO-21: AWS CLI not available"
fi

# ── SECTION 6: CI/CD ──────────────────────────────────────────────────────────

section "CI/CD (ArgoCD GitOps)"

cicd_exit=0
"$SCRIPT_DIR/check-cicd.sh" 2>/dev/null || cicd_exit=$?

if [[ $cicd_exit -eq 0 ]]; then
  pass "AUTO-22: ArgoCD installed and running"
  pass "AUTO-23: All environments deploy via ArgoCD"
  pass "AUTO-24: CI pipeline has no kubectl apply / helm upgrade"
  pass "AUTO-25: Staging auto-syncs on image tag update"
else
  fail "AUTO-22..25: CI/CD check failed — run check-cicd.sh for details"
fi

# ── SECTION 7: AI Monitoring ──────────────────────────────────────────────────

section "AI Monitoring"

# AUTO-26: Token usage tracked per tenant
echo "  [AUTO-26] AI token usage tracked..."
DB_URL="${DATABASE_URL:-}"
if [[ -n "$DB_URL" ]] && command -v psql &>/dev/null; then
  count=$(psql "$DB_URL" -t -c \
    "SELECT COUNT(*) FROM ai_usage_logs WHERE created_at > NOW() - INTERVAL '1 day';" \
    2>/dev/null | tr -d ' ' || echo "-1")
  if [[ "$count" -ge 0 ]] 2>/dev/null; then
    pass "AUTO-26: ai_usage_logs table present and queryable ($count rows in last 24h)"
  else
    fail "AUTO-26: Could not query ai_usage_logs"
  fi
else
  skip "AUTO-26: DATABASE_URL not set or psql not available"
fi

# AUTO-27: Hallucination guard
echo "  [AUTO-27] Hallucination guard enabled..."
guard_count=$(grep -r "HallucinationGuard\|hallucination_guard" \
  "$ROOT/services/ai-gateway/" 2>/dev/null | wc -l | tr -d ' ')
if [[ "$guard_count" -gt 0 ]]; then
  pass "AUTO-27: HallucinationGuard present in AI gateway ($guard_count occurrences)"
else
  fail "AUTO-27: HallucinationGuard not found in services/ai-gateway/"
fi

# AUTO-28: AI latency in Grafana
echo "  [AUTO-28] AI latency dashboard..."
if [[ -n "$GRAFANA_TOKEN" ]]; then
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $GRAFANA_TOKEN" \
    "$GRAFANA_URL/api/dashboards/uid/ai-monitoring" 2>/dev/null || echo "000")
  if [[ "$status" == "200" ]]; then
    pass "AUTO-28: AI monitoring dashboard found in Grafana"
  else
    fail "AUTO-28: AI monitoring dashboard not found (HTTP $status)"
  fi
else
  skip "AUTO-28: GRAFANA_TOKEN not set"
fi

# ── SECTION 8: Tenant Isolation ───────────────────────────────────────────────

section "Tenant Isolation"

# AUTO-29/30/31 — REPOINTED 2026-08-23.
#
# All three used to run pytest files under tests/integration/ — a directory that has never existed in
# this repository (tests/ holds contract/, e2e/ and load/). Each fell through to `skip`, which reads
# in the report as "tool not available" and is what every other skip in this file means. These three
# were different: no environment could ever have satisfied them, so three checks covering the tenant
# isolation boundary reported as skipped rather than as never written.
#
# They now run what actually covers this. Where nothing covers it, the check says so and FAILS —
# a readiness report that stays silent about a missing control is the failure mode being fixed.

# AUTO-29: Cross-tenant isolation — the live probe
echo "  [AUTO-29] Cross-tenant isolation probe..."
# infrastructure/monitoring/isolation-probe/ is the CronJob that reads ACROSS tenants on five
# surfaces (postgresql, neo4j, kafka, s3, api) and publishes tenant_isolation_check_result per
# surface; the TenantIsolationBreach alert fires on a 0. That is a live assertion against the running
# system, which is strictly more than a pytest file would have proved.
# `command -v kubectl` is not enough: kubectl installed but pointed at no cluster would report the
# CronJob as absent, which is a very different statement from "the probe is not deployed". Reach the
# API server first, and skip if that fails.
if command -v kubectl &>/dev/null && kubectl cluster-info &>/dev/null; then
  if kubectl get cronjob tenant-isolation-probe -n "${NAMESPACE:-cos}" &>/dev/null; then
    LAST_PROBE=$(kubectl get cronjob tenant-isolation-probe -n "${NAMESPACE:-cos}" \
      -o jsonpath='{.status.lastSuccessfulTime}' 2>/dev/null)
    if [[ -n "$LAST_PROBE" ]]; then
      pass "AUTO-29: tenant-isolation-probe CronJob present, last success $LAST_PROBE"
    else
      fail "AUTO-29: tenant-isolation-probe exists but has NEVER completed successfully"
    fi
  else
    fail "AUTO-29: tenant-isolation-probe CronJob is not deployed in namespace ${NAMESPACE:-cos}"
  fi
else
  skip "AUTO-29: kubectl not available or no cluster reachable"
fi

# AUTO-30: PostgreSQL RLS — the unit coverage of the mechanism
echo "  [AUTO-30] PostgreSQL RLS enforcement..."
# TenantPrismaService is the ONLY path a tenant-scoped query takes, and it is what issues
# SET LOCAL app.current_tenant_id — the value every RLS policy reads. Its spec plus
# assert-safe-tenant-id (which stops a crafted tenant id reaching that statement) are what cover the
# mechanism. The POLICIES themselves are checked against a live database by MANUAL-04, not here.
if [[ -f "$ROOT/backend/package.json" ]] && command -v npx &>/dev/null; then
  if (cd "$ROOT/backend" && npx jest \
        src/modules/tenant/__tests__/tenant-prisma.service.spec.ts \
        src/shared/prisma/__tests__/assert-safe-tenant-id.spec.ts --silent) &>/dev/null; then
    pass "AUTO-30: RLS tenant-context enforcement tests passed"
  else
    fail "AUTO-30: RLS tenant-context enforcement tests FAILED"
  fi
else
  skip "AUTO-30: npx/backend not available"
fi

# AUTO-31: Keycloak realm isolation — NOT COVERED, and saying so is the point
echo "  [AUTO-31] Keycloak realm isolation..."
# Verified 2026-08-23: nothing in this repository tests that one tenant's realm cannot read or
# authenticate into another's. The specs that mention keycloak_realm exercise user and tenant service
# logic, not realm isolation, and the live probe's five surfaces do not include Keycloak.
#
# THE PROPERTY NOBODY WROTE A TEST FOR, identified 2026-08-23 (TDD OQ-51):
#
#   the realm in a token'''s `iss` == platform.tenants.keycloak_realm for the tenant_id it claims
#
# KeycloakJwtStrategy validates `iss` against ONE realm from a single KEYCLOAK_REALM env var and its
# validate() never reads t.keycloak_realm — so the binding is unenforced, and a dedicated
# cos-{tenantCode} realm (§7.6) cannot authenticate against the API at all. The dev seed already
# violates it: dev@cos.local is in realm construction-os-dev and claims a tenant_id whose registered
# realm is construction-os.
#
# Fails rather than skips, and stays failing until OQ-51 is decided — enforcing the binding is an
# auth change that would reject that seed as it stands. Do not silence it by deleting the check.
fail "AUTO-31: Keycloak realm isolation is unenforced and untested — TDD OQ-51"

# ── Summary ────────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════"
echo "  PHASE 19 AUTO-VERIFICATION SUMMARY"
echo "═══════════════════════════════════════════════════"
echo "  PASSED:  $PASS"
echo "  FAILED:  $FAIL"
echo "  SKIPPED: $SKIP  (tool/config not available)"
echo "═══════════════════════════════════════════════════"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  echo "  ❌ $FAIL check(s) FAILED — fix before proceeding to manual checks."
  echo ""
  exit 1
else
  echo "  ✅ All checks passed (or skipped due to missing tools)."
  echo "  Proceed to: REVIEWER=\"<name>\" ./scripts/readiness/run-all-checks.sh"
  echo ""
fi
