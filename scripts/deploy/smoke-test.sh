#!/usr/bin/env bash
# Smoke test — ArgoCD PostSync wave 1
# Spec §30.12: health + auth + 1 core read, must complete < 30s total
#
# ⚠️ THE AUTH STEP CALLS AN ENDPOINT THAT HAS NEVER EXISTED (measured 2026-08-23).
#
#   POST /api/v1/auth/login  {email, password}   →  404.
#
# `@Controller('auth')` in backend/src/modules/identity/identity.controller.ts exposes
# otp/request, otp/verify, otp/attest, devices, step-up/*, refresh, logout, mfa/enroll — and no
# `login`. Path B authenticates against Keycloak directly (the Playwright suite drives Keycloak's
# hosted form: #username / #password / #kc-login), so the backend never had a password endpoint.
#
# IT CANNOT BE REPOINTED AT KEYCLOAK WITHOUT A DECISION, and the reason is not obvious:
#   * `cos-web` — the client the E2E user actually logs into — is a PUBLIC client with
#     directAccessGrantsEnabled: false, so the password grant is not available on it.
#   * `cos-backend` has directAccessGrantsEnabled: true, but the realm's
#     `Path B only - privileged roles` execution DENIES TENANT_ADMIN and FINANCE on Direct Grant —
#     verified against Keycloak 26.6.4. E2E_EMAIL is `e2e-admin@…`, a TENANT_ADMIN. It would be
#     refused with invalid_grant.
#
# So there is no non-browser way to obtain a token for THIS user, and inventing one means either
# seeding a non-privileged smoke user or weakening the privileged-role rule. Both are product
# decisions, not a scripting fix — spec §30.12 asks for "health + auth + 1 core read" and does not
# say which identity. Left failing on purpose rather than quietly dropped: a smoke test that stopped
# checking auth would go green while proving less. See docs/runbooks/deployment.md § ⚠️.
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
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 "${BASE_URL}/api/v1/health/ready") || fail "health endpoint unreachable"
[[ "$STATUS" == "200" ]] || fail "health returned HTTP ${STATUS}"
echo "  ✓ /api/v1/health/ready → 200"

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
