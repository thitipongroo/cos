#!/usr/bin/env bash
# e2e-local.sh — run the web E2E suite (tests/e2e) against a LOCAL stack, start to finish.
#
# There was no written recipe: seed-e2e-users.sh targeted the shared realm, prisma/seed.ts aborted on a
# fresh database, and the one sequence that worked lived only in the dependency-advisories register
# (fix/web-e2e-local-recipe, 2026-11-15). This is that sequence:
#
#   1. infra: postgres pgbouncer redis kafka schema-registry keycloak temporal (docker compose)
#   2. migrations             (backend: prisma migrate deploy)
#   3. seed-realistic.ts      (EKC: projects, POs, reports, checklists — the data the specs read)
#   4. seed.ts                (dev tenant + field-staff fixture, which needs EKC)
#   5. seed-e2e-users.sh      (the eight role users the specs log in as, in EKC)
#   6. backend on :3000, web on :3001 — a production build by default (E2E_WEB_MODE=build|dev; logs under .e2e-local/)
#   7. playwright test        (BASE_URL=http://localhost:3001; extra args are passed through)
#
# LOCAL ONLY. It writes seed data and test users; it refuses a BASE_URL that is not localhost.
# The infra is left running afterwards (`docker compose stop` to stop it); backend and web are stopped.
#
# Usage: bash scripts/dev/e2e-local.sh [playwright args…]   e.g.  … specs/approval-escalation.spec.ts
set -euo pipefail
exec 3>&2 # a message that must survive wait_for's redirects

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

BASE_URL=${BASE_URL:-http://localhost:3001}
KEYCLOAK_URL=${KEYCLOAK_URL:-http://localhost:8090}
export KEYCLOAK_URL
for url in "$BASE_URL" "$KEYCLOAK_URL"; do
  case "$url" in
    http://localhost:* | http://127.0.0.1:*) ;;
    *)
      echo "e2e-local.sh runs against a local stack only (got $url)" >&2
      exit 1
      ;;
  esac
done

E2E_WEB_MODE=${E2E_WEB_MODE:-build}
case "$E2E_WEB_MODE" in
  build | dev) ;;
  *)
    echo "E2E_WEB_MODE must be build or dev (got $E2E_WEB_MODE)" >&2
    exit 1
    ;;
esac

# Refuse to start over servers already listening: the readiness waits below only see that SOMETHING
# answers, so a leftover backend/web would be the one under test and the new ones would die on EADDRINUSE.
for port in 3000 3001; do
  if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "port $port is already in use — stop that process first (lsof -iTCP:$port -sTCP:LISTEN)" >&2
    exit 1
  fi
done

SERVICES=(postgres pgbouncer redis kafka schema-registry keycloak temporal)
LOG_DIR="$ROOT/.e2e-local"
mkdir -p "$LOG_DIR"
PIDS=()

step() { printf '\n── %s\n' "$*"; }

# Stop a process and every descendant. `pnpm run dev` is a chain (shim → pnpm → sh → nest/next) and the shim
# ignores SIGTERM; killing $! alone left the servers running, orphaned, on :3000/:3001. The tree is collected
# FIRST (a killed parent orphans its children to PID 1, out of reach of pgrep -P), sent TERM, and whatever is
# still alive after 5 s gets KILL — `nest start --watch` and its dist/main outlived TERM in a run.
descendants() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do
    echo "$child"
    descendants "$child"
  done
}

cleanup() {
  local tree=() pid
  for pid in "${PIDS[@]:-}"; do
    [[ -n "$pid" ]] || continue
    tree+=("$pid")
    while read -r child; do tree+=("$child"); done < <(descendants "$pid")
  done
  ((${#tree[@]})) || return 0
  kill "${tree[@]}" 2>/dev/null || true
  local alive
  for _ in 1 2 3 4 5; do
    alive=()
    for pid in "${tree[@]}"; do kill -0 "$pid" 2>/dev/null && alive+=("$pid"); done
    ((${#alive[@]})) || return 0
    sleep 1
  done
  kill -9 "${alive[@]}" 2>/dev/null || true
}
trap cleanup EXIT

# wait_for <label> <seconds> <command…> — retry the command until it succeeds.
wait_for() {
  local label=$1 timeout=$2
  shift 2
  local start=$SECONDS
  until "$@" >/dev/null 2>&1; do
    if ((SECONDS - start > timeout)); then
      echo "timed out after ${timeout}s waiting for $label" >&2
      return 1
    fi
    sleep 2
  done
  echo "  ready: $label"
}

tcp() { nc -z "$1" "$2"; }
# up_and_http_ok <pid> <url> — the server this script started is alive AND answers.
up_and_http_ok() {
  kill -0 "$1" 2>/dev/null || { echo "  process $1 exited — see $LOG_DIR" >&3; exit 1; }
  curl -fsS -o /dev/null "$2"
}
http_ok() { curl -fsS -o /dev/null "$1"; }

# The direct (non-pgbouncer) URL, read from backend/.env without echoing it.
direct_db_url() { grep -E '^DIRECT_DATABASE_URL=' backend/.env | head -1 | cut -d= -f2-; }

step "1/7 infra: ${SERVICES[*]}"
docker compose up -d "${SERVICES[@]}"
wait_for "postgres :5432" 180 tcp localhost 5432
wait_for "pgbouncer :6432" 120 tcp localhost 6432
wait_for "redis :6379" 120 tcp localhost 6379
wait_for "kafka :29092" 240 tcp localhost 29092
wait_for "schema-registry :8081" 240 http_ok http://localhost:8081/subjects
wait_for "keycloak realm" 300 http_ok "$KEYCLOAK_URL/realms/${KEYCLOAK_REALM:-construction-os-dev}"
wait_for "temporal :7233" 240 tcp localhost 7233

step "2/7 migrations"
(cd backend && pnpm run migrate)

step "3/7 seed-realistic.ts (EKC)"
DIRECT_URL=$(direct_db_url || true) # read from the repo root, before the cd
DIRECT_URL=${DIRECT_URL%\"}
DIRECT_URL=${DIRECT_URL#\"}
[[ -n "$DIRECT_URL" ]] || { echo "DIRECT_DATABASE_URL missing in backend/.env" >&2; exit 1; }
(cd backend && DATABASE_URL="$DIRECT_URL" pnpm exec ts-node prisma/seed-realistic.ts)

step "4/7 seed.ts"
(cd backend && pnpm run seed)

step "5/7 E2E role users"
bash scripts/dev/seed-e2e-users.sh

step "6/7 backend :3000 and web :3001 (logs: $LOG_DIR)"
(cd backend && exec pnpm run dev) >"$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
PIDS+=("$BACKEND_PID")
# E2E_WEB_MODE=build (default): `next build`, then `next start` — every page compiled before the first test. With
# `next dev` each page compiled on its first request, and the 60 s test timeouts were spent there (a fresh run: 23
# failures, most at the login field; the same spec failed cold and passed warm). E2E_WEB_MODE=dev keeps next dev.
if [[ "$E2E_WEB_MODE" == build ]]; then
  (cd apps/web && pnpm run build) >"$LOG_DIR/web-build.log" 2>&1 || {
    echo "web build failed — see $LOG_DIR/web-build.log" >&2
    exit 1
  }
  WEB_CMD=start
else
  WEB_CMD=dev
fi
(cd apps/web && exec pnpm run "$WEB_CMD") >"$LOG_DIR/web.log" 2>&1 &
WEB_PID=$!
PIDS+=("$WEB_PID")
wait_for "backend /api/v1/health/live" 300 up_and_http_ok "$BACKEND_PID" http://localhost:3000/api/v1/health/live
wait_for "web :3001" 300 up_and_http_ok "$WEB_PID" "$BASE_URL"

# Warm Keycloak's login page once. On a fresh stack the first test that logs in (a11y's, alphabetically) timed out
# at the #username field while every later login was quick; the first render of the login theme is the slow part.
# The web client's own authorize URL (PKCE is required; any challenge renders the page), checked for the field.
WEB_CLIENT_ID=$(grep -E '^KEYCLOAK_WEB_CLIENT_ID=' apps/web/.env 2>/dev/null | cut -d= -f2- || true)
LOGIN_URL="$KEYCLOAK_URL/realms/${KEYCLOAK_REALM:-construction-os-dev}/protocol/openid-connect/auth"
LOGIN_URL+="?client_id=${WEB_CLIENT_ID:-cos-web}&response_type=code&scope=openid&code_challenge_method=S256"
LOGIN_URL+="&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
# The redirect must be the web's own callback or Keycloak answers 400; BASE_URL is plain http://localhost:<port> or
# http://127.0.0.1:<port> (guarded above), so encoding ':' and '/' is enough.
CALLBACK="${BASE_URL%/}/api/auth/callback/keycloak"
CALLBACK=${CALLBACK//:/%3A}
LOGIN_URL+="&redirect_uri=${CALLBACK//\//%2F}"
login_page_ready() { curl -fsSL "$LOGIN_URL" | grep -q 'id="username"'; }
wait_for "keycloak login page" 120 login_page_ready || echo "  (login page not confirmed; continuing)"

step "7/7 playwright"
# One worker unless E2E_WORKERS says otherwise: parallel workers all log in through the one local Keycloak at
# once, and the first logins timed out at its #username field; with one worker none did (2026-11-16).
BASE_URL="$BASE_URL" pnpm exec playwright test -c tests/e2e/playwright.config.ts \
  --workers="${E2E_WORKERS:-1}" "$@"
