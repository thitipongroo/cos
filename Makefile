# Construction OS — Makefile
# Usage: make <target>

.PHONY: help setup dev dev-backend dev-web dev-file dev-clean dev-ports-free dev-infra-ready test build migrate seed clean lint type-check docker-up docker-up-full docker-down

# Dev ports: backend=3000, web=3001, file-service=3002
DEV_PORTS := 3000 3001 3002

# ─── Colors ──────────────────────────────────────────────────────────────────
BOLD  := $(shell tput bold 2>/dev/null || echo "")
RESET := $(shell tput sgr0 2>/dev/null || echo "")
GREEN := $(shell tput setaf 2 2>/dev/null || echo "")
CYAN  := $(shell tput setaf 6 2>/dev/null || echo "")

help: ## Show this help
	@echo "$(BOLD)Construction OS$(RESET) — available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-20s$(RESET) %s\n", $$1, $$2}'

# ─── Development ──────────────────────────────────────────────────────────────
setup: ## Initial local setup (copies .env, installs deps, starts Docker)
	@bash scripts/setup/local-dev.sh

dev: dev-clean dev-infra-ready dev-ports-free ## Start all services in development mode
	@# --ui=stream (passed to turbo, not the tasks): the turbo Rust TUI hides which task
	@# actually failed — when one persistent dev task crashes, turbo tears the rest down
	@# and every box shows `[ELIFECYCLE] Command failed`. Stream output prints the real
	@# `Failed: @cos/<pkg>#dev` line and the crashing task's error inline.
	@pnpm exec turbo run dev --concurrency=20 --ui=stream

dev-backend: dev-clean dev-infra-ready dev-ports-free ## Run ONLY backend (deps built once) — light, for low-RAM machines
	@pnpm exec turbo run dev --filter=@cos/backend --ui=stream

dev-web: dev-clean dev-infra-ready dev-ports-free ## Run ONLY the web app (deps built once)
	@pnpm exec turbo run dev --filter=@cos/web --ui=stream

dev-file: dev-clean dev-infra-ready dev-ports-free ## Run ONLY file-service (deps built once)
	@pnpm exec turbo run dev --filter=@cos/file-service --ui=stream

dev-clean: ## Kill stale dev watchers/servers orphaned by a previous run
	@bash scripts/dev/kill-stale-dev.sh

dev-infra-ready: ## Block until Docker infra (db, kafka, redis, etc.) is healthy
	@bash scripts/dev/wait-for-infra.sh

dev-ports-free: ## Kill stale dev-server processes holding ports 3000/3001/3002
	@pids=$$(lsof -tiTCP:$(shell echo $(DEV_PORTS) | tr ' ' ',') -sTCP:LISTEN 2>/dev/null); \
	if [ -n "$$pids" ]; then \
	  echo "$(CYAN)Freeing stale dev ports ($(DEV_PORTS)): killing PIDs$(RESET) $$pids"; \
	  kill -9 $$pids 2>/dev/null || true; \
	  sleep 1; \
	fi

docker-up: ## Start essential Docker infra (db, redis, kafka, schema-registry, minio)
	@docker compose up -d

docker-up-full: ## Start ALL Docker infra incl. heavy optional services (full profile)
	@docker compose --profile full up -d

up-apps: ## Start full infra + ALL app services in containers (apps profile — ADR-036)
	@docker compose --profile full --profile apps up -d --build

docker-down: ## Stop all Docker services (essential + full + apps profiles)
	@docker compose --profile full --profile apps down

# ─── Quality ──────────────────────────────────────────────────────────────────
lint: ## Run ESLint across all packages
	@pnpm run lint

lint-fix: ## Auto-fix ESLint issues
	@pnpm run lint:fix

format: ## Format all files with Prettier
	@pnpm run format

type-check: ## Run TypeScript type checking (no emit)
	@pnpm run type-check

# ─── Testing ──────────────────────────────────────────────────────────────────
test: ## Run all tests
	@pnpm run test

test-unit: ## Run unit tests only (fast)
	@pnpm run test:unit

test-integration: ## Run integration tests (requires Docker services)
	@pnpm run test:integration

test-coverage: ## Run tests with coverage report
	@pnpm --filter @cos/backend run test:cov

# ─── Build ────────────────────────────────────────────────────────────────────
build: ## Build all packages and services
	@pnpm run build

# ─── Database ─────────────────────────────────────────────────────────────────
migrate: ## Run Prisma migrations (against PgBouncer — QM-18)
	@pnpm --filter @cos/backend run migrate

migrate-dev: ## Run Prisma migrations in dev mode (creates new migration)
	@pnpm --filter @cos/backend run migrate:dev

seed: ## Seed the database with initial data
	@pnpm --filter @cos/backend run seed

studio: ## Open Prisma Studio
	@pnpm --filter @cos/backend run studio

# ─── Cleanup ──────────────────────────────────────────────────────────────────
clean: ## Remove all build artifacts and node_modules
	@pnpm run clean
	@docker compose down -v --remove-orphans 2>/dev/null || true

# ─── CI helpers ───────────────────────────────────────────────────────────────
ci-check: lint type-check test-unit ## Run all CI checks locally before pushing
	@echo "$(GREEN)All CI checks passed.$(RESET)"
