#!/usr/bin/env bash
# [AUTO] Phase 19 — Observability stack validation
# Verifies: Prometheus targets up, Loki accessible, Jaeger has services, Grafana dashboards loaded
# Usage: ./scripts/readiness/check-observability.sh

set -euo pipefail

MONITORING_NS="${MONITORING_NS:-monitoring}"
GRAFANA_TOKEN="${GRAFANA_TOKEN:-}"
PASS=0
FAIL=0

check_cmd() {
  local name="$1"
  shift
  if "$@" &>/dev/null; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name"
    FAIL=$((FAIL + 1))
  fi
}

echo "==> Observability checks"

# Prometheus — targets up
PROM_URL="${PROMETHEUS_URL:-http://prometheus.monitoring:9090}"
up_count=$(curl -s "$PROM_URL/api/v1/targets" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(len([t for t in d['data']['activeTargets'] if t['health']=='up']))" 2>/dev/null || echo "0")
if [[ "$up_count" -gt 0 ]]; then
  echo "  ✓ Prometheus: $up_count targets up"
  PASS=$((PASS + 1))
else
  echo "  ✗ Prometheus: 0 targets up (or unreachable)"
  FAIL=$((FAIL + 1))
fi

# Loki — query endpoint
LOKI_URL="${LOKI_URL:-http://loki.monitoring:3100}"
loki_status=$(curl -s -o /dev/null -w "%{http_code}" "$LOKI_URL/ready" 2>/dev/null || echo "000")
if [[ "$loki_status" == "200" ]]; then
  echo "  ✓ Loki: ready"
  PASS=$((PASS + 1))
else
  echo "  ✗ Loki: not ready (HTTP $loki_status)"
  FAIL=$((FAIL + 1))
fi

# Jaeger — services
JAEGER_URL="${JAEGER_URL:-http://jaeger.monitoring:16686}"
jaeger_services=$(curl -s "$JAEGER_URL/api/services" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',[])))" 2>/dev/null || echo "0")
if [[ "$jaeger_services" -gt 0 ]]; then
  echo "  ✓ Jaeger: $jaeger_services services reporting traces"
  PASS=$((PASS + 1))
else
  echo "  ✗ Jaeger: 0 services (or unreachable)"
  FAIL=$((FAIL + 1))
fi

# Grafana — dashboards
GRAFANA_URL="${GRAFANA_URL:-http://grafana.monitoring:3000}"
if [[ -n "$GRAFANA_TOKEN" ]]; then
  dash_count=$(curl -s -H "Authorization: Bearer $GRAFANA_TOKEN" "$GRAFANA_URL/api/search?type=dash-db" 2>/dev/null | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
  if [[ "$dash_count" -gt 0 ]]; then
    echo "  ✓ Grafana: $dash_count dashboards loaded"
    PASS=$((PASS + 1))
  else
    echo "  ✗ Grafana: 0 dashboards found"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  - Grafana: GRAFANA_TOKEN not set — skipping"
fi

echo ""
echo "==> Result: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] || exit 1
