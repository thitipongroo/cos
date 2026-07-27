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

# Two-file env scheme (spec §08): .env.example is the committed template; each environment
# copies it to .env (gitignored) and fills its own values. Dev defaults already work.
if [ ! -f .env ]; then
  echo "==> Creating .env from .env.example"
  cp .env.example .env
  echo "    Dev defaults already work. For staging/production set the values shown in the"
  echo "    '# staging:/production:' comments and pull secrets from Vault/SM (never commit .env)."
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
