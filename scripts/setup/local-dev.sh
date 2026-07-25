#!/usr/bin/env bash
# Construction OS — Local development setup
# Usage: ./scripts/setup/local-dev.sh

set -euo pipefail

echo "==> Construction OS local setup"

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker not installed"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "ERROR: pnpm not installed (npm install -g pnpm)"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "ERROR: Node.js not installed"; exit 1; }

# Check Docker daemon is running
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker is not running — please start Docker Desktop before running make setup"
  exit 1
fi

# Activate an environment if none is selected yet (default: develop).
# .env is the ACTIVE env — built from .env.example (base) + the chosen overlay.
# Override the target env with: APP_ENV=staging ./scripts/setup/local-dev.sh
APP_ENV="${APP_ENV:-dev}"
if [ ! -f .env ]; then
  echo "==> Activating environment '$APP_ENV' (.env ← .env.$APP_ENV)"
  if [ ! -f ".env.$APP_ENV" ]; then
    cat .env.example ".env.$APP_ENV.example" > ".env.$APP_ENV"
    echo "    Built .env.$APP_ENV — fill any REPLACE_ME secrets (real staging/prod → Vault/SM)."
  fi
  cp ".env.$APP_ENV" .env
fi

# Create .cos-stage if missing (default: stage 1 — BUILD)
if [ ! -f .cos-stage ]; then
  echo "==> Creating .cos-stage (default: 1)"
  echo "1" > .cos-stage
fi

# Install dependencies
echo "==> Installing dependencies"
pnpm install

# Start local infrastructure
echo "==> Starting Docker services"
docker compose up -d postgres pgbouncer redis kafka schema-registry opensearch neo4j clickhouse minio vault

# Wait for Postgres to be ready
echo "==> Waiting for PostgreSQL..."
until docker compose exec postgres pg_isready -U cos -d construction_os 2>/dev/null; do
  sleep 2
done
echo "    PostgreSQL ready."

# Wait for Kafka
echo "==> Waiting for Kafka..."
until docker compose exec kafka kafka-broker-api-versions --bootstrap-server localhost:9092 2>/dev/null; do
  sleep 3
done
echo "    Kafka ready."

echo ""
echo "==> Setup complete. Run 'make dev' to start the application."
