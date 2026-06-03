#!/usr/bin/env bash
# check-schema-registry.sh — Phase 8 readiness check for Confluent Schema Registry
# Source: context.md FILE REFERENCE MAP (Phase 8); spec §32.4; QM-9
#
# Checks:
#   1. Schema Registry is reachable
#   2. Global compatibility mode is BACKWARD_TRANSITIVE (not just BACKWARD)
#   3. All 22 critical v1 schema subjects are registered
#   4. All local .avsc files in @cos/shared/src/avro/ are valid JSON
#
# Usage:
#   SCHEMA_REGISTRY_URL=http://localhost:8081 ./scripts/readiness/check-schema-registry.sh
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more checks failed

set -euo pipefail

REGISTRY_URL="${SCHEMA_REGISTRY_URL:-http://localhost:8081}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AVRO_DIR="$REPO_ROOT/packages/@cos/shared/src/avro"

PASS=0
FAIL=0

pass() { echo "  ✅ $1"; ((PASS++)) || true; }
fail() { echo "  ❌ $1"; ((FAIL++)) || true; }

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " Schema Registry Readiness Check — Phase 8"
echo " Registry: $REGISTRY_URL"
echo "═══════════════════════════════════════════════════════════"

# ─── CHECK 1: Connectivity ──────────────────────────────────────
echo ""
echo "── Check 1: Connectivity ──"
if curl -sf --max-time 5 "$REGISTRY_URL/" > /dev/null 2>&1; then
  pass "Schema Registry reachable at $REGISTRY_URL"
else
  fail "Schema Registry NOT reachable at $REGISTRY_URL"
  echo ""
  echo "FATAL: Cannot proceed — Schema Registry is unreachable."
  echo "Start it with: docker compose up -d schema-registry"
  exit 1
fi

# ─── CHECK 2: BACKWARD_TRANSITIVE compatibility mode ────────────
echo ""
echo "── Check 2: BACKWARD_TRANSITIVE compatibility mode ──"
COMPAT=$(curl -sf --max-time 5 "$REGISTRY_URL/config" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('compatibilityLevel', d.get('compatibility','UNKNOWN')))" 2>/dev/null || echo "UNKNOWN")
if [ "$COMPAT" = "BACKWARD_TRANSITIVE" ]; then
  pass "Global compatibility mode is BACKWARD_TRANSITIVE"
else
  fail "Global compatibility mode is '$COMPAT' — expected BACKWARD_TRANSITIVE"
  echo "     Fix: KafkaProducer.connect() calls ensureCompatibilityMode() — ensure producer has connected at least once."
  echo "     Or set manually: curl -X PUT $REGISTRY_URL/config -H 'Content-Type: application/vnd.schemaregistry.v1+json' -d '{\"compatibility\":\"BACKWARD_TRANSITIVE\"}'"
fi

# ─── CHECK 3: All critical v1 schema subjects registered ────────
echo ""
echo "── Check 3: Critical v1 schema subjects registered ──"

# Subject naming: event_type strips .v1 suffix → topic name → {topic}-value
# Event avsc files (22 total — matches EVENT_AVSC_MAP in producer.ts; base-event-envelope excluded)
REQUIRED_SUBJECTS=(
  "ai.risk_prediction.generated-value"
  "construction.boq.version_created-value"
  "construction.delay.detected-value"
  "construction.project.archived-value"
  "construction.project.created-value"
  "construction.project.status_changed-value"
  "construction.project.updated-value"
  "construction.task.completed-value"
  "finance.budget.exceeded-value"
  "finance.cashflow_risk.detected-value"
  "identity.tenant.created-value"
  "identity.tenant.deactivated-value"
  "identity.user.created-value"
  "identity.user.role_changed-value"
  "procurement.delivery.received-value"
  "procurement.purchase_order.created-value"
  "procurement.vendor_invoice.approved-value"
  "procurement.vendor_invoice.received-value"
  "site.inspection.failed-value"
  "site.material.consumed-value"
  "site.report.created-value"
  "workforce.checkin.created-value"
)

REGISTERED_SUBJECTS=$(curl -sf --max-time 5 "$REGISTRY_URL/subjects" 2>/dev/null || echo "[]")

for subject in "${REQUIRED_SUBJECTS[@]}"; do
  if echo "$REGISTERED_SUBJECTS" | python3 -c "import sys,json; subjects=json.load(sys.stdin); exit(0 if '$subject' in subjects else 1)" 2>/dev/null; then
    pass "Subject registered: $subject"
  else
    fail "Subject NOT registered: $subject"
  fi
done

# ─── CHECK 4: Local .avsc files are valid JSON ──────────────────
echo ""
echo "── Check 4: Local .avsc files valid JSON ──"

if [ ! -d "$AVRO_DIR" ]; then
  fail "Avro directory not found: $AVRO_DIR"
else
  AVSC_COUNT=0
  for avsc_file in "$AVRO_DIR"/*.avsc; do
    filename=$(basename "$avsc_file")
    if python3 -c "import json,sys; json.load(open('$avsc_file'))" 2>/dev/null; then
      pass "Valid JSON: $filename"
      ((AVSC_COUNT++)) || true
    else
      fail "Invalid JSON: $filename"
    fi
  done
  if [ "$AVSC_COUNT" -eq 0 ]; then
    fail "No .avsc files found in $AVRO_DIR"
  fi
fi

# ─── Summary ────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo " RESULTS: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════════════════════"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "❌ Schema Registry check FAILED — $FAIL item(s) need attention."
  exit 1
else
  echo "✅ Schema Registry check PASSED — all $PASS items verified."
  exit 0
fi
