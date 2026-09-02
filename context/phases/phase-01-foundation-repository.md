# Phase 1 — Foundation Repository

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase — · SaaS Maturity Stage 1.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Create a production-grade monorepo for Construction OS.

Naming Conventions:

- Repository root: construction-os
- Package scope: @cos (all shared packages use this scope)
- Service directory names: kebab-case (e.g. identity-service, project-service)
- Package names in package.json: @cos/package-name (kebab-case)
- TypeScript file names: kebab-case (e.g. project.service.ts)
- Environment variables: UPPER_SNAKE_CASE

Directory Structure (authoritative — monolith architecture):
apps/
  web/                    — Next.js + Serwist unified web app (@cos/web) — online + offline
  mobile/                 — React Native + Expo application (@cos/mobile)

backend/                  — NestJS Modular Monolith (ONE deployable)
  src/
    modules/
      identity/           — Auth + Identity module
      tenant/             — Tenant management module
      project/            — Project module
      boq/                — BOQ module
      procurement/        — Procurement module
      site-ops/           — Site Operations module
      finance/            — Finance module
      notification/       — Notification module
      equipment/          — Equipment module
      workforce/          — Workforce module
    shared/               — Cross-module utilities (guards, pipes, interceptors)
    main.ts               — Application bootstrap
  test/                   — Integration tests
  Dockerfile
  package.json

services/                 — Separately deployed services (non-monolith)
  file-service/           — Fastify File Service (@cos/file-service)
  ai-gateway/             — FastAPI AI Gateway (@cos/ai-gateway)
  ai-embedding-worker/    — FastAPI Embedding Worker (@cos/ai-embedding-worker)
  ai-ocr-pipeline/        — FastAPI OCR Pipeline (@cos/ai-ocr-pipeline)
  analytics-worker/       — Go Analytics Aggregation (@cos/analytics-worker; Phase 24 — carbon analytics module; stub only until Phase 24; see docs/specifications/33-digital-twin-iot §33.3)
  kg-ingestion-worker/    — Go Knowledge Graph Ingestion (@cos/kg-worker)

packages/                 — Shared packages (ONLY code used by 2+ apps/services)
  @cos/shared             — Typed Kafka event interfaces ONLY (TypeScript types; mobile-safe, Rule 34).
                            Corrected 2026-08-22 (ADR-055): the Kafka SDK and the Avro schemas moved
                            to @cos/kafka — a package imported by React Native cannot hold kafkajs.
  @cos/kafka/             — Node-only Kafka SDK (Phase 8): KafkaProducer, KafkaConsumer,
                            OutboxPublisher + OutboxPoller, DlqPublisher, KafkaTopicProvisioner,
                            topic catalog, Prometheus metrics, Schema Registry client, Avro .avsc
                            schemas. Server-side only — NEVER aliased into apps/mobile (ADR-055)
  @cos/database/          — Prisma pagination utilities, ID generation, retry helpers
  @cos/rbac/              — RBAC + ABAC role definitions, guard decorators and metadata keys (NOT concrete CanActivate guards — those live in backend/src/shared/guards/; see spec §06 §6.9)
  @cos/validation/        — Shared DTO validators (class-validator decorators)
  @cos/logger/            — Structured logging abstraction (Pino-based)
  @cos/tracing/           — OpenTelemetry setup and trace utilities
  @cos/financial/         — Decimal.js monetary calculation utilities
  @cos/types/             — Shared TypeScript types and enums
  @cos/config/            — Environment config loader and validation

Shared Package Boundary Rules:
  ✓ Belongs in packages/: event contracts, RBAC definitions, financial utils,
    logging, tracing, shared types, environment config validation
  ✗ Does NOT belong in packages/: business logic, module-specific DTOs,
    module-specific repositories
  ✗ Modules must NOT import from each other's src/ directly —
    cross-module communication via Kafka events or shared service layer only

infrastructure/
  kubernetes/             — Helm charts (ONE chart for backend, one per separate service)
  terraform/              — Terraform modules
  kafka/                  — Kafka topic definitions and configs
  monitoring/             — Prometheus + Grafana configs

backend/prisma/           — Database schema and migrations
  schema.prisma           — Prisma schema (single source of truth for all DB models)
  migrations/             — Prisma migration files (per tenant schema)

ai/
  prompts/                — Prompt templates (versioned). Repo-root, and BAKED INTO the ai-gateway
                            image (its Dockerfile builds from the repo-root context and COPYs this
                            directory to /app/ai/prompts). A service-scoped build context cannot
                            reach it, and the image then dies at import with
                            "Could not locate ai/prompts" — compose hid that behind a bind mount
                            while the Helm chart had no equivalent.
  chains/                 — DEPRECATED as a chain-config location; kept empty. LangChain chain
                            definitions are service-local: services/ai-gateway/ai/chains/*.yaml,
                            resolved via providers.langchain_config.CHAINS_DIR (override:
                            AI_CHAINS_DIR). Two divergent rag.yaml files on different schemas existed
                            here and there — retrieval.py read the repo-root one via a parents[3]
                            walk that IndexErrors inside the container, while langchain_config.py
                            read the service-local one. Product-owner decision 2026-07-21:
                            service-local is canonical; the repo-root copy was merged in and deleted.
  (AI output evaluation — it is operationalized via MLflow / Evidently AI on a monthly cadence; see docs/specifications/30-testing-strategy.md §30.11)

docs/
  architecture/           — Architecture decision records (ADRs)
  api/                    — Generated OpenAPI specs
  runbooks/               — Operational runbooks
  specifications/         — Architecture diagrams and system design reference

scripts/
  setup/                  — Local environment setup scripts
  deploy/                 — Deployment helper scripts

Tooling:

- Node.js runtime: 24.x (root `package.json` `engines.node` `>=24.0.0`; Docker images use `node:24-alpine`)
- Package manager: pnpm — latest stable 11.x with workspace protocol. Do NOT pin a fixed patch
  version in this spec: root `package.json` `packageManager` carries whatever 11.x release the repo
  is currently on (Corepack pins the exact build for reproducibility), and `engines.pnpm` stays
  `>=11.0.0`. Only the major line (11) is normative — a patch/minor bump is not a spec deviation.
- Monorepo orchestration: Turborepo 2.x
- TypeScript: 6.x (strict mode, no implicit any)
- Linting: ESLint 10.x flat config (root `eslint.config.mjs`)
- Formatting: Prettier 3.x
- Git hooks: Husky 9.x + lint-staged
- CI/CD: GitHub Actions

Generate:

- complete directory structure with placeholder README per service AND per package:
    services/: file-service, ai-gateway, ai-embedding-worker, ai-ocr-pipeline,
               analytics-worker, kg-ingestion-worker
    apps/: web, mobile
    backend/ (root README)
    backend/src/modules/: identity, tenant, project, boq, procurement, site-ops,
                          finance, notification, equipment, workforce
    packages/@cos/: shared, database, rbac, validation, logger, tracing, financial,
                    types, config
    Each README must contain: purpose, public API, dependencies, configuration, usage example (QM-11)
- root pnpm-workspace.yaml listing every workspace member: `apps/*`, `backend`, `services/*`,
  `packages/@cos/*`.
  **Mobile workspace exception (mirrors the tsconfig exception below):** `apps/mobile` is explicitly
  EXCLUDED via `!apps/mobile`. React Native + Expo + Metro + CocoaPods assume a flat (hoisted)
  `node_modules`, which pnpm's isolated linker breaks — Metro cannot resolve transitive
  `expo-*` / `@react-native/*` packages. `apps/mobile` installs standalone as its OWN pnpm workspace:
  `apps/mobile/pnpm-workspace.yaml` sets `nodeLinker: hoisted` (pnpm 10/11 reads the linker setting
  there, NOT `apps/mobile/.npmrc` — which only documents this) — run `cd apps/mobile && pnpm install`,
  consuming `@cos/types` as a `file:` dependency. Nothing in turbo/CI references `@cos/mobile`; mobile lint,
  type-check and tests run as their own CI job. This exclusion is REQUIRED, not a deviation.
- turbo.json with build, test, lint, dev pipelines
- root tsconfig.base.json (strict, paths for @cos/* packages)
- per-service tsconfig.json extending base
- Docker Compose (local dev: PostgreSQL, TimescaleDB, Redis, Kafka, OpenSearch,

  Neo4j, ClickHouse, MinIO, Confluent Schema Registry, Vault dev mode, PgBouncer)

  PgBouncer container is REQUIRED in local dev Docker Compose (QM-18; spec §7.9);
  dev mode Vault and PgBouncer must start together with the application;
  application must connect to PgBouncer address — never directly to PostgreSQL port 5432

- Docker Compose `apps` profile (ADR-036): optional tier running the app services (backend,
  file-service, ai-gateway/embedding/ocr, analytics/kg workers) in containers —
  `docker compose --profile full --profile apps up` / `make docker-apps-up-full`. Day-to-day dev still uses
  `make dev` (turbo on host); the infra-only default is unchanged.

- Istio local dev: skip Istio for Docker Compose (use plain networking locally)

  Istio enabled from dev Kubernetes environment onwards

- HashiCorp Vault: dev mode container for local secret injection
- .env.example with all required variables documented
- GitHub Actions: CI pipeline (lint → build → test → docker build); lint adds yamllint/sqlfluff/markdownlint — §30.12
- Makefile with: setup, dev, test, build, migrate, seed targets
- root README with architecture overview and getting started
- Git hooks: initialize Husky (husky init); create .husky/pre-commit running lint-staged;
  lint-staged config: eslint --fix + prettier --write on staged .ts/.tsx/.js/.jsx files;
  prettier --write on staged .json/.yaml/.yml files
- Mobile tsconfig exception: apps/mobile extends expo/tsconfig.base (NOT root tsconfig.base.json —
  root base uses "module": "CommonJS" which is incompatible with React Native Metro bundler);
  add only mobile-compatible @cos/* paths: types, types/*, financial, financial/*, validation,
  validation/*, rbac, rbac/*, shared, shared/* — do NOT add logger, tracing, config, database
  (Node.js-only packages)
- jest.config.js per TypeScript package/service with coverage thresholds:
    coverage thresholds: { lines: 100, branches: 100 } per QM-1 (spec §30.3)
    collectCoverageFrom: exclude *.module.ts, *.dto.ts, *.payload.ts, index.ts, main.ts,
      event interface files (pure types — no executable code)
    moduleNameMapper: map all @cos/* workspace paths to source (not dist)
    packages requiring jest.config (Rule 35 — all packages with executable logic):
      backend/
      packages/@cos/shared/         — event payload types only (type-only; Rule 35 EXEMPT since
                                      ADR-055 — no executable logic, no jest config)
      packages/@cos/kafka/          — kafka SDK (producer, consumer, outbox, dlq, metrics,
                                      schema registry, topic catalog) — added by ADR-055
      packages/@cos/database/        — retry, pagination, id
      packages/@cos/financial/       — calculateLineTotal, convertCurrency (QM-1: mutation testing required)
      packages/@cos/rbac/            — ROLE_PERMISSIONS, decorators
      packages/@cos/validation/      — IsCurrencyCode, IsDecimalString
      packages/@cos/logger/          — createLogger
      packages/@cos/tracing/         — initTracing, shutdownTracing, getTraceId
      packages/@cos/config/          — loadConfig, getConfig
      packages/@cos/ui-logic/        — platform-agnostic client helpers, extracted 2026-07-24 (92d4e542)
      packages/@cos/schemas/         — shared client-side validation schemas, added 2026-08-03 (598c8b11)
      packages/@cos/test-utils/      — Phase 18 deliverable (testcontainers, factories, db-reset)
    NOTE (2026-08-22, TDD OQ-1a): the last three postdate this Phase 1 list. Rule 31(a) binds "every
    package listed in the Directory Structure section above it", so a package extracted later is not
    retroactively a Phase 1 deliverable — but leaving it unlisted made the inventory read as
    incomplete. All twelve packages/@cos/* carry the README Rule 31 requires; verified 2026-08-22.
    packages EXEMPT (no executable logic — types/interfaces only):
      packages/@cos/types/
    Note: Phase 18 adds testcontainers setup and @cos/test-utils — jest.config is a Phase 1 deliverable
- pnpm lock file: run `pnpm install` after initial setup and commit pnpm-lock.yaml (Rule 28);
    pnpm-lock.yaml must be committed before CI `--frozen-lockfile` can pass;
    order: (1) create all package.json files, (2) run `pnpm install`, (3) commit pnpm-lock.yaml,
    (4) change CI from `pnpm install` to `pnpm install --frozen-lockfile`

Constraints:

- production-grade only
- scalable architecture only
- no demo code, no placeholder business logic
- all services must start with Docker Compose from day one
- Before marking Phase 1 complete: read every Generate item above line by line, run ls/grep
  to verify each exists on disk, show output — Rule 36

```
