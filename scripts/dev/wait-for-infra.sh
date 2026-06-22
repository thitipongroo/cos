#!/usr/bin/env bash
# wait-for-infra.sh — block until local Docker infra is ready to accept connections.
#
# Why: `turbo run dev` marks every dev task `persistent: true`, so if ONE service loses
# a startup race against still-warming infra (e.g. clamd resetting connections while it
# loads its virus DB, or Kafka not yet accepting clients) and crashes, turbo tears down
# the whole stack — surfacing as a confusing `[ELIFECYCLE] Command failed` under an
# unrelated task box. This gate makes `make dev` wait until infra is actually ready, so
# no dev service can start before its dependencies and crash.
#
# Strategy:
#   1. Docker healthcheck = "healthy" for every infra container that defines one.
#   2. TCP reachability for the host ports the apps actually dial (covers PgBouncer,
#      which has no healthcheck but is the real DB endpoint per QM-18).
#
# Safe to run repeatedly; returns immediately when everything is already ready.

set -euo pipefail

TIMEOUT_SECONDS="${INFRA_WAIT_TIMEOUT:-180}"
POLL_INTERVAL=2

# Essential infra only (the `make docker-up` tier). Optional services (opensearch,
# clamav, neo4j, …) live behind the compose `full` profile and may not be running, so
# the gate must not block on them — the app boots without them.
HEALTH_SERVICES=(postgres redis kafka schema-registry minio)

# host:port endpoints the apps dial (from .env). PgBouncer (6432) has no healthcheck, so
# a TCP probe is the only readiness signal available for it.
TCP_ENDPOINTS=(
  "localhost:6432"   # pgbouncer (DATABASE_URL)
  "localhost:6379"   # redis
  "localhost:29092"  # kafka
  "localhost:8081"   # schema-registry
  "localhost:9100"   # minio
)

cyan() { printf '\033[36m%s\033[0m\n' "$1"; }
red()  { printf '\033[31m%s\033[0m\n' "$1"; }

if ! command -v docker >/dev/null 2>&1; then
  red "docker not found — start infra manually or install Docker, then re-run."
  exit 1
fi

# Resolve a compose service to its running container id (empty if not running).
container_id() { docker compose ps -q "$1" 2>/dev/null | head -1; }

health_status() {
  local cid="$1"
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo "missing"
}

tcp_open() {
  local host="${1%%:*}" port="${1##*:}"
  (exec 3<>"/dev/tcp/${host}/${port}") 2>/dev/null && exec 3>&- 2>/dev/null
}

# Fail fast with a clear message if infra isn't even started.
for svc in "${HEALTH_SERVICES[@]}"; do
  if [ -z "$(container_id "$svc")" ]; then
    red "Infra container '${svc}' is not running. Start infra first:  make docker-up"
    exit 1
  fi
done

cyan "Waiting for infra to become ready (timeout ${TIMEOUT_SECONDS}s)…"
deadline=$(( $(date +%s) + TIMEOUT_SECONDS ))

while :; do
  pending=()

  for svc in "${HEALTH_SERVICES[@]}"; do
    cid="$(container_id "$svc")"
    if [ -z "$cid" ]; then
      pending+=("$svc(stopped)")
      continue
    fi
    status="$(health_status "$cid")"
    # "none" = container has no healthcheck; treat as ready (TCP probe covers it below).
    case "$status" in
      healthy|none) ;;
      *) pending+=("$svc($status)") ;;
    esac
  done

  for ep in "${TCP_ENDPOINTS[@]}"; do
    tcp_open "$ep" || pending+=("$ep")
  done

  if [ "${#pending[@]}" -eq 0 ]; then
    cyan "Infra ready ✓"
    exit 0
  fi

  if [ "$(date +%s)" -ge "$deadline" ]; then
    red "Timed out after ${TIMEOUT_SECONDS}s waiting for: ${pending[*]}"
    red "Check container logs (e.g. docker compose logs ${pending[0]%%(*}) and retry."
    exit 1
  fi

  printf '  still waiting: %s\n' "${pending[*]}"
  sleep "$POLL_INTERVAL"
done
