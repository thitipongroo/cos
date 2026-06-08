#!/usr/bin/env bash
# [AUTO] Phase 19 — Security headers audit
# Verifies: required HTTP security headers present on API ingress (QM-4)
# Usage: INGRESS_HOST=api.construction-os.io ./scripts/readiness/check-security-headers.sh
#        or: ./scripts/readiness/check-security-headers.sh --env staging
# Exit: 0 = all required headers present, 1 = missing headers

set -euo pipefail

INGRESS_HOST="${INGRESS_HOST:-}"
ENV="${ENV:-}"
PASS=0
FAIL=0

# Parse --env flag
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      ENV="$2"; shift 2 ;;
    *)
      shift ;;
  esac
done

if [[ -z "$INGRESS_HOST" ]]; then
  case "$ENV" in
    staging)    INGRESS_HOST="staging-api.construction-os.io" ;;
    production) INGRESS_HOST="api.construction-os.io" ;;
    *)
      echo "  Usage: INGRESS_HOST=<host> $0  or  $0 --env staging"
      echo "  Defaulting to localhost:3000 for local check"
      INGRESS_HOST="localhost:3000"
      ;;
  esac
fi

SCHEME="https"
[[ "$INGRESS_HOST" == localhost* ]] && SCHEME="http"
BASE_URL="${SCHEME}://${INGRESS_HOST}"

echo "==> Security headers check (target: $BASE_URL)"

check_header() {
  local header_name="$1"
  local expected_pattern="$2"
  local required="${3:-true}"

  value=$(curl -s -I --max-time 5 "$BASE_URL/health/live" 2>/dev/null \
    | grep -i "^${header_name}:" | head -1 | sed 's/^[^:]*: //' | tr -d '\r' || echo "")

  if [[ -z "$value" ]]; then
    if [[ "$required" == "true" ]]; then
      echo "  ✗ $header_name — MISSING"
      ((FAIL++))
    else
      echo "  - $header_name — not set (optional)"
    fi
    return
  fi

  if echo "$value" | grep -qiE "$expected_pattern" 2>/dev/null; then
    echo "  ✓ $header_name: $value"
    ((PASS++))
  else
    echo "  ✗ $header_name: '$value' does not match expected pattern '$expected_pattern'"
    ((FAIL++))
  fi
}

# Required headers (spec §05 §5.2)
check_header "Strict-Transport-Security"   "max-age=[0-9]"           "true"
check_header "X-Content-Type-Options"      "nosniff"                 "true"
check_header "X-Frame-Options"             "DENY|SAMEORIGIN"         "true"
check_header "Content-Security-Policy"     "default-src|script-src"  "true"
check_header "Referrer-Policy"             "no-referrer|strict-origin" "true"
check_header "Permissions-Policy"          "."                        "false"

# Ensure X-Powered-By is absent (information disclosure)
powered_by=$(curl -s -I --max-time 5 "$BASE_URL/health/live" 2>/dev/null \
  | grep -i "^X-Powered-By:" | tr -d '\r' || echo "")
if [[ -z "$powered_by" ]]; then
  echo "  ✓ X-Powered-By — absent (correct)"
  ((PASS++))
else
  echo "  ✗ X-Powered-By present: $powered_by (information disclosure — must be removed)"
  ((FAIL++))
fi

# Ensure Server header doesn't reveal version
server_header=$(curl -s -I --max-time 5 "$BASE_URL/health/live" 2>/dev/null \
  | grep -i "^Server:" | tr -d '\r' || echo "")
if echo "$server_header" | grep -qiE "[0-9]\.[0-9]" 2>/dev/null; then
  echo "  ✗ Server header reveals version: $server_header"
  ((FAIL++))
else
  echo "  ✓ Server header — no version disclosed"
  ((PASS++))
fi

echo ""
echo "==> Result: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] || exit 1
