#!/usr/bin/env bash
# check-schema-registry.sh — Phase 8 readiness check for Confluent Schema Registry
# Source: context.md FILE REFERENCE MAP (Phase 8); spec §32.4; QM-9
#
# Checks:
#   1. Schema Registry is reachable
#   2. Global compatibility mode is BACKWARD_TRANSITIVE (not just BACKWARD)
#   3. All 23 critical v1 schema subjects are registered
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

pass() { echo "  ✅ $1"; PASS=$((PASS + 1)) || true; }
fail() { echo "  ❌ $1"; FAIL=$((FAIL + 1)) || true; }

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

# Subject naming (§32.4 RecordNameStrategy): the Schema Registry subject is the canonical
# event_type verbatim — one schema per event, shared across tenants. This is exactly what
# the producer registers (subjectForEvent(eventType) === eventType; see
# @cos/kafka/src/topic-catalog.ts). NOT the Confluent default {topic}-value
# (TopicNameStrategy) — topics are per-tenant, subjects are not.
# Critical subset of EVENT_AVSC_MAP (23) verified at this gate — later-phase events whose
# producers may not yet be live in staging (twin.*, carbon.*, platform.enterprise.*, file.*)
# are intentionally omitted.
REQUIRED_SUBJECTS=(
  "ai.risk_prediction.generated.v1"
  "construction.boq.version_created.v1"
  "construction.delay.detected.v1"
  "construction.project.archived.v1"
  "construction.project.created.v1"
  "construction.project.status_changed.v1"
  "construction.project.updated.v1"
  "construction.task.completed.v1"
  "finance.budget.exceeded.v1"
  "finance.cashflow_risk.detected.v1"
  "identity.tenant.created.v1"
  "identity.tenant.deactivated.v1"
  "identity.user.created.v1"
  "identity.user.role_changed.v1"
  "procurement.delivery.received.v1"
  "procurement.po.created.v1"
  "procurement.po.approval_requested.v1"
  "procurement.vendor_invoice.approved.v1"
  "procurement.invoice.received.v1"
  "site.inspection.failed.v1"
  "site.material.consumed.v1"
  "site.report.created.v1"
  "workforce.checkin.created.v1"
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
      AVSC_COUNT=$((AVSC_COUNT + 1)) || true
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
