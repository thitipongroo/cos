#!/usr/bin/env bash
# [AUTO] Phase 19 — Health check validation
# Verifies: all services respond to /health/live and /health/ready
# Usage: NAMESPACE=cos ./scripts/readiness/check-health.sh

set -euo pipefail

NS="${NAMESPACE:-cos}"
PASS=0
FAIL=0

check() {
  local name="$1" url="$2"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "000")
  if [[ "$code" == "200" ]]; then
    echo "  ✓ $name ($url)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name ($url) — HTTP $code"
    FAIL=$((FAIL + 1))
  fi
}

echo "==> Health checks (namespace: $NS)"

SERVICES=(cos-backend cos-file-service cos-ai-gateway cos-analytics-worker)
for svc in "${SERVICES[@]}"; do
  pod=$(kubectl get pods -n "$NS" -l "app.kubernetes.io/name=$svc" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
  if [[ -z "$pod" ]]; then
    echo "  ✗ $svc — no pod found"
    FAIL=$((FAIL + 1))
    continue
  fi
  port=$(kubectl get svc "$svc" -n "$NS" -o jsonpath='{.spec.ports[0].port}' 2>/dev/null || echo "3000")
  kubectl port-forward "pod/$pod" "58080:$port" -n "$NS" &>/dev/null &
  PF_PID=$!
  sleep 1
  check "$svc /health/live"  "http://localhost:58080/health/live"
  check "$svc /health/ready" "http://localhost:58080/health/ready"
  kill $PF_PID 2>/dev/null || true
done

echo ""
echo "==> Result: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] || exit 1
