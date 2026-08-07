# Construction OS

An AI-native Construction Operating System built for global enterprise scale.

---

## Architecture Overview

Construction OS is a **modular monolith** — one NestJS deployable containing all domain modules, with
separate deployables only for language-boundary services (Python AI, Go workers).

```text
┌─────────────────────────────────────────────────────────────┐
│                  Construction OS Platform                   │
├──────────────────────────┬──────────────────────────────────┤
│  apps/web (Next.js +     │  apps/mobile (React Native +     │
│  Serwist PWA)            │  Expo, Drizzle/expo-sqlite)      │
├──────────────────────────┴──────────────────────────────────┤
│        Kong API Gateway (rate limiting, JWT, routing)       │
├─────────────────────────────────────────────────────────────┤
│           backend/ — NestJS Modular Monolith                │
│  identity │ tenant │ project │ boq │ procurement            │
│  site-ops │ finance │ notification │ equipment │ workforce  │
├──────────────────┬──────────────────┬───────────────────────┤
│ services/ (Node) │ services/ (Py)   │ services/ (Go)        │
│ file-service     │ ai-gateway       │ analytics-worker      │
│   (Fastify)      │ ai-embedding-    │ kg-ingestion-worker   │
│ credential-      │   worker         │ iot-ingestion-worker  │
│   service        │ ai-ocr-pipeline  │                       │
│                  │ ai-transcription-│                       │
│                  │   pipeline       │                       │
│                  │ bim-import-worker│                       │
├──────────────────┴──────────────────┴───────────────────────┤
│           Apache Kafka (internal event bus)                 │
├─────────────┬─────────┬────────────┬───────────┬────────────┤
│  PostgreSQL │  Redis  │ ClickHouse │  Neo4j    │  MinIO     │
│ +TimescaleDB│         │ (analytics)│ (KG)      │ (objects)  │
└─────────────┴─────────┴────────────┴───────────┴────────────┘
```

### Key Technology Decisions

| Area                     | Decision                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Backend                  | NestJS Modular Monolith — extract services only with team boundary + scaling evidence      |
| Multi-tenant             | Shared DB + tenant_id + PostgreSQL RLS (`SET LOCAL app.current_tenant_id`) — ADR-008       |
| API versioning           | `/api/v1/` prefix — `setGlobalPrefix('api/v1')` in `backend/src/main.ts`                   |
| Event bus                | Apache Kafka 4.x (Confluent Platform 8.x) + Schema Registry (Avro, `BACKWARD_TRANSITIVE`)  |
| Mobile storage           | Drizzle ORM on expo-sqlite (business entities); expo-sqlite (sync_queue only) — ADR-048    |
| Web offline (PWA)        | Serwist (`@serwist/turbopack`) + IndexedDB via `idb`; unified in apps/web/ (ADR-047)       |
| Financial precision      | `DECIMAL(19,4)` in DB; `decimal.js` (Node.js); Python `decimal` module — never `float`     |
| Workflow engine          | Temporal (TypeScript SDK)                                                                  |
| Auth — field workers     | Phone + SMS OTP via custom NestJS module + AWS SNS                                         |
| Auth — office/management | Email + password via Keycloak OIDC (RS256 JWT)                                             |
| AI services              | FastAPI Python: LLM Gateway, Embedding Worker, OCR Pipeline, Transcription                 |
| LLM                      | OpenAI GPT-4o via `LLMProvider` interface — never call OpenAI SDK directly                 |
| Vector store             | pgvector + OpenSearch                                                                      |
| Connection pooler        | PgBouncer (transaction mode) — application NEVER connects to PostgreSQL port 5432 directly |
| WAF (cloud)              | Cloudflare WAF (Pro+) → AWS ALB → EKS                                                      |
| Observability            | OpenTelemetry → Grafana + Loki + Prometheus + Alertmanager                                 |
| Secret management        | AWS Secrets Manager (cloud/EKS); HashiCorp Vault (on-premise)                              |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) **24.x** (`package.json` → `engines.node >=24.0.0`)
- [pnpm](https://pnpm.io/) **11.x** (`engines.pnpm >=11.0.0`) — `corepack enable` picks up the exact
  build pinned in `packageManager`; only the major line is normative
- [Docker](https://www.docker.com/) 24.x + Docker Compose v2

### Local Setup

```bash
# 1. Create your .env from the committed template (two-file scheme — spec §08).
#    .env.example covers dev/staging/production; the dev defaults already work.
make env-init                     # or: cp .env.example .env
#    Real staging/production never run from a file — secrets are injected via
#    Vault / AWS Secrets Manager through Helm (QM-4, docs/specifications/08).

# 2. Install dependencies
pnpm install

# 3. Start all infrastructure (PostgreSQL+TimescaleDB, Kafka, ClickHouse, Neo4j, MinIO,
#    Redis, Vault dev, Schema Registry, PgBouncer).
#    ClickHouse, Neo4j, Vault, Keycloak and Temporal sit behind the `full` Compose profile,
#    so a bare `docker compose up -d` does NOT start them — use the full tier (see below).
make docker-up-full

# 4. Wait for services to be healthy, then run migrations
make migrate

# 5. Seed master data
make seed

# 6. Start the backend in development mode
make dev
```

Or use the all-in-one setup script (creates `.env` from `.env.example` if missing, then installs
deps and starts Docker):

```bash
make setup
```

**Environment files (two-file scheme — spec §08).** `.env` and `.env.example` live at the **repo
root only**. `.env.example` is the single committed template — it documents every variable and covers
dev/staging/production inline (dev value as the default, with `# staging:` / `# production:` comments
for anything that differs). Each environment copies it and fills its own values: `cp .env.example .env`
(or `make env-init`), then edit `.env` (dev defaults already work). `.env` is gitignored and is the
only file you hand-edit. Keep the two **in sync** — add a variable to one, add it to the other. The
backend reads this root `.env` in every mode (under turbo its cwd is `backend/`, so NestJS and Prisma
resolve `../.env`; docker injects it via `env_file`). The **one exception is `apps/mobile`**, which
keeps its own `.env` / `.env.example` because Expo inlines `EXPO_PUBLIC_*` from the mobile package at
bundle time (public client values only — no secrets). Real staging/production secrets are injected at
runtime via Vault / AWS Secrets Manager through Helm, never written to a file.

### Local run tiers (Docker Compose profiles)

The Compose stack has three tiers (see ADR-036):

```bash
make docker-up        # essential infra only (postgres, pgbouncer, redis, kafka,
                      #   schema-registry, minio) — ~1 GB
make docker-up-full   # all infra incl. heavy services (opensearch, neo4j, clickhouse,
                      #   clamav, keycloak, vault, temporal, UIs) — ~4 GB
make docker-apps-up-full   # full infra + ALL app services in containers (backend, file-service,
                           #   ai-gateway/embedding/ocr, analytics/kg workers)
```

`make docker-apps-up-full` (= `docker compose --profile full --profile apps up -d --build`) runs the entire
stack in Docker — this is the literal "all services start with Docker Compose" path. For the fast
day-to-day inner loop, prefer `make dev` (turbo on host, native hot-reload) with infra from
`make docker-up`/`docker-up-full`.

### Running Tests

```bash
# All tests with coverage (enforced: 100% lines / 100% branches per QM-1)
pnpm test:cov

# Unit tests only (fast, no Docker required)
pnpm test:unit

# Integration tests (requires Docker Compose running)
pnpm test:integration
```

---

## Monorepo Structure

```text
apps/
  web/                        — Next.js + Serwist unified app (tablet/laptop, online + offline)
  mobile/                     — React Native + Expo (smartphone, online + offline)

backend/                      — NestJS Modular Monolith (all domain modules)
  src/modules/                — identity, tenant, project, boq, procurement,
                                site-ops, finance, notification, equipment, workforce
  prisma/                     — Prisma schema + migrations

services/                     — Separate deployables (language/throughput boundary)
  ai-embedding-worker/        — FastAPI Python (vector embedding)
  ai-gateway/                 — FastAPI Python (LLM routing, RAG)
  ai-ocr-pipeline/            — FastAPI Python (OCR processing)
  ai-transcription-pipeline/  — FastAPI Python (voice-note transcription — ADR-052)
  analytics-worker/           — Go (ClickHouse aggregation)
  bim-import-worker/          — Python (IFC4 parse → TwinEntity; ifcopenshell)
  credential-service/         — Node (W3C DID/VC issuance + verification — ADR-019)
  file-service/               — Fastify (multipart upload throughput)
  iot-ingestion-worker/       — Go (EMQX MQTT 5.0 → Kafka)
  kg-ingestion-worker/        — Go (Neo4j knowledge graph ingestion)

packages/@cos/                — Shared packages (2+ consumers only)
  config/                     — Environment config loader
  database/                   — Prisma pagination, ID generation, retry helpers
  financial/                  — Decimal.js monetary calculation utilities
  logger/                     — Structured logging (Pino-based)
  rbac/                       — RBAC role definitions and guard utilities
  schemas/                    — Shared client-side validation schemas
  shared/                     — Kafka event interfaces + SDK
  test-utils/                 — Testcontainers setup, DB reset, factories (spec §30.13)
  tracing/                    — OpenTelemetry setup
  types/                      — Shared TypeScript types and enums
  ui-logic/                   — Cross-platform client logic, no runtime deps (ADR-068)
  validation/                 — Shared DTO validators

infrastructure/               — Kubernetes Helm charts, Terraform, Kafka topics, monitoring
ai/                           — Prompt templates, LangChain chains, evaluation scripts
docs/                         — ADRs, OpenAPI specs, runbooks, specifications
scripts/                      — Setup, deploy, readiness, load test scripts
```

---

## Development Conventions

- **No hardcoded secrets** — use `.env` locally; AWS Secrets Manager / Vault in production
- **No `console.log`** — use `@cos/logger` (structured JSON logging with trace IDs)
- **No `float` for money** — use `@cos/financial` (Decimal.js, `DECIMAL(19,4)` in DB)
- **No direct cross-module DB access** — communicate via NestJS DI (sync) or Kafka events (async)
- **No raw SQL string interpolation** — Prisma ORM only
- **Every API endpoint** must be prefixed `/api/v1/` and require authentication

See `context.md` for the full agent execution context and quality mandates (QM-1 through QM-18).

---

## Agent Context

This repository uses a lifecycle-stage context system in the `context/` directory.
See [`context/README.md`](context/README.md) for navigation between stage files.
Current stage: **Stage 1 — BUILD** (`.cos-stage` = `1`).
