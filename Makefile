# Construction OS — Makefile
# Usage: make <target>

.PHONY: help setup dev test build migrate seed proto-gen clean lint type-check docker-up docker-down

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

dev: ## Start all services in development mode
	@pnpm run dev

docker-up: ## Start all Docker services (infrastructure only)
	@docker compose up -d

docker-down: ## Stop all Docker services
	@docker compose down

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

# ─── Code Generation ──────────────────────────────────────────────────────────
proto-gen: ## Generate gRPC stubs from proto files (requires buf CLI)
	@pnpm run proto-gen

# ─── Cleanup ──────────────────────────────────────────────────────────────────
clean: ## Remove all build artifacts and node_modules
	@pnpm run clean
	@docker compose down -v --remove-orphans 2>/dev/null || true

# ─── CI helpers ───────────────────────────────────────────────────────────────
ci-check: lint type-check test-unit ## Run all CI checks locally before pushing
	@echo "$(GREEN)All CI checks passed.$(RESET)"
