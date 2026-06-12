#!/usr/bin/env bash
# Smoke test — ArgoCD PostSync wave 1
# Spec §30.12: health + auth + 1 core read, must complete < 30s total
# Env vars: BASE_URL, E2E_EMAIL, E2E_PASSWORD
# Exit 0 = pass (unblocks E2E wave 2), exit 1 = fail (blocks E2E wave 2)

set -euo pipefail

BASE_URL="${BASE_URL:?BASE_URL is required}"
E2E_EMAIL="${E2E_EMAIL:?E2E_EMAIL is required}"
E2E_PASSWORD="${E2E_PASSWORD:?E2E_PASSWORD is required}"

START_TS=$(date +%s)

fail() {
  echo "SMOKE FAIL: $1" >&2
  exit 1
}

# ── Check 1: Health endpoint ────────────────────────────────────────────────
echo "→ [1/3] Health check"
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 "${BASE_URL}/health") || fail "health endpoint unreachable"
[[ "$STATUS" == "200" ]] || fail "health returned HTTP ${STATUS}"
echo "  ✓ /health → 200"

# ── Check 2: Auth — obtain JWT ────────────────────────────────────────────────
echo "→ [2/3] Auth check"
AUTH_RESP=$(curl -sf --max-time 10 -X POST "${BASE_URL}/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${E2E_EMAIL}\",\"password\":\"${E2E_PASSWORD}\"}") \
  || fail "auth endpoint unreachable"
TOKEN=$(echo "$AUTH_RESP" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
[[ -n "$TOKEN" ]] || fail "auth did not return accessToken"
echo "  ✓ /auth/login → accessToken obtained"

# ── Check 3: Core read — list projects ──────────────────────────────────────
echo "→ [3/3] Core read check"
PROJECTS_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 \
  "${BASE_URL}/api/v1/projects" \
  -H "Authorization: Bearer ${TOKEN}") \
  || fail "projects endpoint unreachable"
[[ "$PROJECTS_STATUS" == "200" ]] || fail "projects returned HTTP ${PROJECTS_STATUS}"
echo "  ✓ /api/v1/projects → 200"

# ── Duration guard ────────────────────────────────────────────────────────────
END_TS=$(date +%s)
ELAPSED=$((END_TS - START_TS))
echo "→ Smoke tests passed in ${ELAPSED}s"
[[ $ELAPSED -lt 30 ]] || fail "smoke tests exceeded 30s limit (took ${ELAPSED}s)"
