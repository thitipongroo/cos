# Construction OS

An AI-native Construction Operating System built for global enterprise scale.

---

## Architecture Overview

Construction OS is a **modular monolith** — one NestJS deployable containing all domain modules, with separate deployables only for language-boundary services (Python AI, Go workers).

```text
┌─────────────────────────────────────────────────────────────┐
│                  Construction OS Platform                   │
├──────────────────────┬──────────────────┬───────────────────┤
│  apps/web (Next.js + next-pwa)   │  apps/mobile (RN)  │
├──────────────────────┴──────────────────┴───────────────────┤
│              Kong API Gateway (rate limiting, JWT, routing)  │
├─────────────────────────────────────────────────────────────┤
│           backend/ — NestJS Modular Monolith                │
│  identity │ tenant │ project │ boq │ procurement            │
│  site-ops │ finance │ notification │ equipment │ workforce  │
├──────────────┬──────────────────┬───────────────────────────┤
│ services/    │ services/        │ services/                 │
│ file-service │ ai-gateway       │ analytics-worker (Go)     │
│ (Fastify)    │ ai-embedding-    │ kg-ingestion-worker (Go)  │
│              │ worker, ai-ocr   │                           │
│              │ (FastAPI Python) │                           │
├──────────────┴──────────────────┴───────────────────────────┤
│           Apache Kafka (internal event bus)                 │
├───────────┬─────────┬────────────┬───────────┬─────────────┤
│ PostgreSQL │  Redis  │ ClickHouse │  Neo4j    │  MinIO      │
│ +TimescaleDB│       │ (analytics)│ (KG)      │ (objects)   │
└───────────┴─────────┴────────────┴───────────┴─────────────┘
```

### Key Technology Decisions

| Area                     | Decision                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Backend                  | NestJS Modular Monolith — extract services only with team boundary + scaling evidence      |
| Multi-tenant             | Shared DB + tenant_id + PostgreSQL RLS (`SET LOCAL app.current_tenant_id`) — ADR-008       |
| API versioning           | `/api/v1/` prefix — `setGlobalPrefix('api/v1')` in `backend/src/main.ts`                   |
| Event bus                | Apache Kafka 3.x + Confluent Schema Registry (Avro, `BACKWARD_TRANSITIVE` compat)          |
| Mobile storage           | WatermelonDB 0.28.x + ExpoSQLiteAdapter (business entities); expo-sqlite (sync_queue only) |
| Web offline (PWA)        | next-pwa (Workbox) + IndexedDB via `idb`; unified in apps/web/ (ADR-016)                   |
| Financial precision      | `DECIMAL(19,4)` in DB; `decimal.js` (Node.js); Python `decimal` module — never `float`     |
| Workflow engine          | Temporal (TypeScript SDK)                                                                  |
| Auth — field workers     | Phone + SMS OTP via custom NestJS module + AWS SNS                                         |
| Auth — office/management | Email + password via Keycloak OIDC (RS256 JWT)                                             |
| AI services              | FastAPI Python: LLM Gateway, Embedding Worker, OCR Pipeline                                |
| LLM                      | OpenAI GPT-4o via `LLMProvider` interface — never call OpenAI SDK directly                 |
| Vector store             | pgvector + OpenSearch                                                                      |
| Connection pooler        | PgBouncer (transaction mode) — application NEVER connects to PostgreSQL port 5432 directly |
| WAF (cloud)              | Cloudflare WAF (Pro+) → AWS ALB → EKS                                                      |
| Observability            | OpenTelemetry → Grafana + Loki + Prometheus + Alertmanager                                 |
| Secret management        | AWS Secrets Manager (cloud/EKS); HashiCorp Vault (on-premise)                              |

---

## Getting Started

### Prerequisites

- [pnpm](https://pnpm.io/) 9.x — `npm install -g pnpm@9`
- [Docker](https://www.docker.com/) 24.x + Docker Compose v2
- [Node.js](https://nodejs.org/) 20.x LTS
- [buf](https://buf.build/docs/installation) CLI (for proto generation)

### Local Setup

```bash
# 1. Copy environment config
cp .env.example .env

# 2. Install dependencies
pnpm install

# 3. Start all infrastructure (PostgreSQL+TimescaleDB, Kafka, ClickHouse, Neo4j, MinIO,
#    Redis, Vault dev, Schema Registry, PgBouncer)
docker compose up -d

# 4. Wait for services to be healthy, then run migrations
make migrate

# 5. Seed master data
make seed

# 6. Start the backend in development mode
make dev
```

Or use the all-in-one setup script:

```bash
make setup
```

### Running Tests

```bash
# All tests with coverage (enforced: 100% lines / 100% branches per QM-1)
pnpm test:cov

# Unit tests only (fast, no Docker required)
pnpm test:unit

# Integration tests (requires Docker Compose running)
pnpm test:integration
```

### Code Generation

```bash
# Generate gRPC stubs from proto files (TypeScript + Python output)
make proto-gen
```

---

## Monorepo Structure

```text
apps/
  web/                   — Next.js + next-pwa unified app (tablet/laptop, online + offline)
  mobile/                — React Native + Expo (smartphone, online + offline)

backend/                 — NestJS Modular Monolith (all domain modules)
  src/modules/           — identity, tenant, project, boq, procurement,
                           site-ops, finance, notification, equipment, workforce
  prisma/                — Prisma schema + migrations

services/                — Separate deployables (language/throughput boundary)
  file-service/          — Fastify (multipart upload throughput)
  ai-gateway/            — FastAPI Python (LLM routing, RAG)
  ai-embedding-worker/   — FastAPI Python (vector embedding)
  ai-ocr-pipeline/       — FastAPI Python (OCR processing)
  analytics-worker/      — Go (ClickHouse aggregation)
  kg-ingestion-worker/   — Go (Neo4j knowledge graph ingestion)

packages/@cos/           — Shared packages (2+ consumers only)
  shared/                — Kafka event interfaces + SDK
  database/              — Prisma pagination, ID generation, retry helpers
  rbac/                  — RBAC role definitions and guard utilities
  validation/            — Shared DTO validators
  logger/                — Structured logging (Pino-based)
  tracing/               — OpenTelemetry setup
  financial/             — Decimal.js monetary calculation utilities
  types/                 — Shared TypeScript types and enums
  config/                — Environment config loader
  proto-contracts/       — gRPC proto files + generated stubs

infrastructure/          — Kubernetes Helm charts, Terraform, Kafka topics, monitoring
ai/                      — Prompt templates, LangChain chains, evaluation scripts
docs/                    — ADRs, OpenAPI specs, runbooks, specifications
scripts/                 — Setup, deploy, readiness, load test scripts
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
