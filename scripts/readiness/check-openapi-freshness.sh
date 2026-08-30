#!/usr/bin/env bash
# [AUTO] Phase 19 — OpenAPI spec freshness check
# Verifies: each docs/api/{service}.openapi.yaml was committed no earlier than
#           its corresponding backend/src/modules/{service}/ source directory.
# Usage: ./scripts/readiness/check-openapi-freshness.sh
# Exit: 0 = all specs fresh, 1 = stale spec(s) detected

set -euo pipefail

# COUNTERS ARE ASSIGNED, NOT POST-INCREMENTED. `((PASS++))` evaluates to the value BEFORE the
# increment, so the first `((PASS++))` on a zero counter returns 0 — a non-zero exit status — and
# `set -e` killed the script there. Every readiness script in this directory had it, so each one
# stopped at whichever counter first moved off zero: this one reported ONE spec and exited 1, and
# verify-production-readiness.sh ran ONE of its 31 checks. That reads like a failing gate rather
# than a gate that never ran. `VAR=$((VAR + 1))` is an assignment and always exits 0.
#
# MODULE_MAP KEYS ARE SPEC NAMES, VALUES ARE DIRECTORY NAMES, and the two differ for exactly one
# entry: the spec is `file.openapi.yaml`, the module directory is `files/`. It was mapped to
# `file`, so this check reported "source dir not found — skipping" on every run since it was
# written and never once compared that spec against its module.

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
API_DIR="$ROOT/docs/api"
BACKEND_DIR="$ROOT/backend/src/modules"
PASS=0
FAIL=0
SKIP=0

echo "==> OpenAPI spec freshness checks"

declare -A MODULE_MAP=(
  [auth]="identity"
  [boq]="boq"
  [equipment]="equipment"
  [file]="files"
  [finance]="finance"
  [notification]="notification"
  [platform-webhooks]="platform-webhook"
  [procurement]="procurement"
  [project]="project"
  [site-ops]="site-ops"
  [tenant]="tenant"
  [workforce]="workforce"
)

for spec_name in "${!MODULE_MAP[@]}"; do
  module="${MODULE_MAP[$spec_name]}"
  spec_file="$API_DIR/${spec_name}.openapi.yaml"
  module_dir="$BACKEND_DIR/$module"

  if [[ ! -f "$spec_file" ]]; then
    echo "  ✗ $spec_name.openapi.yaml — file missing"
    FAIL=$((FAIL + 1))
    continue
  fi

  if [[ ! -d "$module_dir" ]]; then
    echo "  - $spec_name → $module (source dir not found — skipping)"
    SKIP=$((SKIP + 1))
    continue
  fi

  spec_ts=$(git -C "$ROOT" log -1 --format="%ct" -- "$spec_file" 2>/dev/null || echo "0")
  src_ts=$(git -C "$ROOT" log -1 --format="%ct" -- "$module_dir" 2>/dev/null || echo "0")

  if [[ "$spec_ts" == "0" && "$src_ts" == "0" ]]; then
    echo "  - $spec_name — no git history found (skipping)"
    SKIP=$((SKIP + 1))
    continue
  fi

  if [[ "$src_ts" -gt "$spec_ts" ]]; then
    spec_date=$(date -r "$spec_ts" '+%Y-%m-%d' 2>/dev/null || echo "$spec_ts")
    src_date=$(date -r "$src_ts" '+%Y-%m-%d' 2>/dev/null || echo "$src_ts")
    echo "  ✗ $spec_name — spec last updated $spec_date, source last updated $src_date (STALE)"
    FAIL=$((FAIL + 1))
  else
    echo "  ✓ $spec_name — spec is current"
    PASS=$((PASS + 1))
  fi
done

# Check that all spec files in docs/api/ are present
existing_specs=$(find "$API_DIR" -name "*.openapi.yaml" 2>/dev/null | wc -l | tr -d ' ')
echo ""
echo "  Spec files in docs/api/: $existing_specs"

echo ""
echo "==> Result: $PASS passed, $FAIL failed, $SKIP skipped"
[[ "$FAIL" -eq 0 ]] || exit 1
