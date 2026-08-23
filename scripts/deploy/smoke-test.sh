#!/usr/bin/env bash
# Smoke test — ArgoCD PostSync wave 1
# Spec §30.12: health + auth + 1 core read, must complete < 30s total
#
# THE AUTH STEP GOES TO KEYCLOAK, NOT TO THE BACKEND — corrected 2026-08-23.
#
# It used to POST /api/v1/auth/login with {email, password}. That endpoint has never existed:
# @Controller('auth') exposes otp/request, otp/verify, otp/attest, devices, step-up/*, refresh,
# logout and mfa/enroll, and no `login`. Path B authenticates against Keycloak directly — the
# Playwright suite drives Keycloak's own form (#username / #password / #kc-login) — so the backend
# never had a password endpoint to call.
#
# WHY A DEDICATED SMOKE USER, AND WHY IT MUST NOT BE PRIVILEGED. The obvious repoint is "use
# E2E_EMAIL against Keycloak's token endpoint". Measured against Keycloak 26.6.4, that cannot work:
#   * `cos-web` — the client the E2E user logs into — is a PUBLIC client with
#     directAccessGrantsEnabled: false, so the password grant is not available on it at all.
#   * `cos-backend` does allow the password grant, but the realm's `Path B only - privileged roles`
#     execution DENIES TENANT_ADMIN and FINANCE on Direct Grant, and E2E_EMAIL is `e2e-admin@…`.
#     It comes back invalid_grant.
# So the smoke user is a separate, NON-PRIVILEGED account. Verified end to end against the dev realm
# with the seeded PROJECT_MANAGER: the grant returns a token carrying role, tenant_id and acr=silver.
#
# Keep it non-privileged for a second reason: this credential lives in a Secret that a PostSync hook
# reads on every deploy. A TENANT_ADMIN there would be a standing admin credential in the cluster to
# prove an API is up.
set -euo pipefail

BASE_URL="${BASE_URL:?BASE_URL is required}"
KEYCLOAK_URL="${KEYCLOAK_URL:?KEYCLOAK_URL is required}"
KEYCLOAK_REALM="${KEYCLOAK_REALM:?KEYCLOAK_REALM is required}"
KEYCLOAK_CLIENT_ID="${KEYCLOAK_CLIENT_ID:-cos-backend}"
KEYCLOAK_CLIENT_SECRET="${KEYCLOAK_CLIENT_SECRET:?KEYCLOAK_CLIENT_SECRET is required}"
# A NON-PRIVILEGED account — see the header. A TENANT_ADMIN or FINANCE user is refused by the realm.
SMOKE_USER="${SMOKE_USER:?SMOKE_USER is required}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:?SMOKE_PASSWORD is required}"

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

# ── Check 2: Auth — obtain a JWT from Keycloak ────────────────────────────────
echo "→ [2/3] Auth check"
# --data-urlencode, not -d: a username in E.164 form starts with '+', which -d sends literally and
# the server decodes as a SPACE. That produced "Invalid user credentials" against a correct password.
AUTH_RESP=$(curl -sf --max-time 10 -X POST \
  "${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token" \
  --data-urlencode "grant_type=password" \
  --data-urlencode "client_id=${KEYCLOAK_CLIENT_ID}" \
  --data-urlencode "client_secret=${KEYCLOAK_CLIENT_SECRET}" \
  --data-urlencode "username=${SMOKE_USER}" \
  --data-urlencode "password=${SMOKE_PASSWORD}") \
  || fail "Keycloak token endpoint unreachable or refused the grant (is SMOKE_USER privileged?)"
TOKEN=$(echo "$AUTH_RESP" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
[[ -n "$TOKEN" ]] || fail "Keycloak did not return an access_token"
echo "  ✓ Keycloak token endpoint → access_token obtained"

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
