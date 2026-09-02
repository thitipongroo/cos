---
title: Construction OS — Tech Stack
last_updated: 2026-08-07
---

# Tech Stack

Versions are **authoritative in [`specifications/04-tech-stack.md`](../specifications/04-tech-stack.md)**
(§4.3 databases, §4.4 infrastructure). The table below is the working summary from
`context/00_master_construction_os.md`; when the two differ, the spec wins.

## Runtimes — one per deployable, never mixed

| Deployable                                                                                      | Runtime             | Why it is separate                                   |
| ----------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------- |
| `backend/` — the **modular monolith**, all domain modules                                       | NestJS on Node 24   | One deployable; modules talk via DI, not HTTP        |
| `services/file-service/`                                                                        | Fastify             | Extracted for multipart upload throughput            |
| `services/ai-gateway`, `ai-embedding-worker`, `ai-ocr-pipeline`, `ai-transcription-pipeline`    | FastAPI (Python)    | Python ML ecosystem — cannot run in the Node process |
| `services/analytics-worker`, `kg-ingestion-worker`, `iot-ingestion-worker`, `bim-import-worker` | Go                  | Different runtime, same reason                       |
| `services/credential-service`                                                                   | Node                | W3C DID/VC (ADR-019)                                 |
| `apps/web/`                                                                                     | Next.js + Serwist   | Tablet/laptop, online **and** offline                |
| `apps/mobile/`                                                                                  | Expo / React Native | Smartphone, offline-first                            |

**Do not reassign runtimes and do not split a module out of the monolith** unless _both_ hold: a team
ownership boundary is confirmed **and** the module has independent scaling pressure with evidence.
Kafka is an internal event bus inside the monolith boundary — it is not a signal to split.

## Toolchain

| Tool       | Version                                |
| ---------- | -------------------------------------- |
| Node.js    | 24.x                                   |
| pnpm       | 11.x                                   |
| Turborepo  | 2.x                                    |
| TypeScript | 6.x (strict, no implicit `any`)        |
| ESLint     | 10.x flat config (`eslint.config.mjs`) |
| Prettier   | 3.x                                    |
| Husky      | 9.x + lint-staged                      |
| CI/CD      | GitHub Actions (CI) + ArgoCD (CD)      |

## Datastores and infrastructure

| Component                                  | Role                                                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL 18                              | Primary relational store; **RLS on every domain table** (spec §7.7)                                                     |
| TimescaleDB 2.x                            | Time-series (equipment, IoT, workforce) — a PostgreSQL extension co-located on the primary through Stages 1–3 (ADR-032) |
| pgvector                                   | Vector embeddings in PostgreSQL                                                                                         |
| PgBouncer                                  | **Mandatory** connection pooler, transaction mode (QM-18)                                                               |
| Redis 8                                    | Cache, session, consumer idempotency, throttler storage                                                                 |
| Apache Kafka 4.x                           | Event streaming; Confluent Schema Registry for Avro contracts                                                           |
| OpenSearch 3.x                             | Full-text and k-NN vector search                                                                                        |
| Neo4j 2026.x                               | Knowledge graph (derived — PostgreSQL stays authoritative)                                                              |
| ClickHouse 26.x                            | Analytics OLAP (pre-aggregated Gold layer)                                                                              |
| MinIO                                      | S3-compatible object storage; ClamAV scans every upload                                                                 |
| Temporal                                   | Workflow engine (RFQ / PO state machines, provisioning)                                                                 |
| Keycloak                                   | Identity — the single source of truth for auth, both login paths                                                        |
| Kong Gateway                               | Ingress: JWT validation, rate limiting, tenant routing, API analytics                                                   |
| EMQX                                       | MQTT broker → IoT Ingestion Worker → Kafka                                                                              |
| Vault / AWS Secrets Manager                | Runtime secrets (on-prem / cloud) — never a `.env` in production                                                        |
| Istio 1.21+                                | Service mesh, mTLS across VPC/node boundaries                                                                           |
| Kubernetes 1.29+ · Terraform 1.7+ · ArgoCD | Orchestration, IaC, GitOps CD                                                                                           |

> **PostgreSQL 18 everywhere — but verify RDS before applying.** The Terraform modules provisioned
> `16.2` until 2026-08-07 while `docker-compose.yml` ran `timescale/timescaledb:latest-pg18`, so dev
> and production were two major versions apart. Both modules are now `18`. **Two preconditions were
> not verifiable from this repository and must be checked before `terraform apply`:** that AWS RDS
> offers PostgreSQL 18 in `ap-southeast-7`, and that TimescaleDB is available for it (ADR-032
> co-locates TimescaleDB on the primary instance). An already-provisioned instance also needs a
> planned major-version upgrade — the Terraform value alone does not migrate it.

## Shared packages — `packages/@cos/`

`shared` (Kafka SDK + typed events + Avro), `database`, `financial`, `rbac`, `validation`, `logger`,
`tracing`, `config`, `types`, `schemas`, `test-utils`, `ui-logic`.

Rules that bite:

- **Rule 34** — `@cos/shared` is imported by mobile, web and Node. No runtime import of a Node-only
  package (PrismaClient, native addons, server frameworks). Use `import type` (Rule 33).
- **Rule 35** — every `@cos/*` package with executable logic needs `jest.config.js`, a `test:cov`
  script, tests, and CI coverage. Only `@cos/types` is exempt.
- **Rule 26 / 27 / 28** — add the dep to _that package's_ `package.json`; add any new script to
  `turbo.json`; re-run `pnpm install` and commit `pnpm-lock.yaml` in the same PR.

> Three of those post-date `context/phases/phase-01-foundation-repository.md`'s package list (which names
> nine), and each has its own decision record: `@cos/schemas`
> ([ADR-076](../architecture/adr/076-client-side-form-validation.md), zod/mini + react-hook-form),
> `@cos/ui-logic` ([ADR-068](../architecture/adr/068-cross-platform-ui-logic-package.md)) and
> `@cos/test-utils` (a Phase 18 deliverable).

## Money, always

`decimal.js` (TypeScript) or Python `decimal` with `ROUND_HALF_UP`. `DECIMAL(19,4)` in PostgreSQL,
ISO 4217 currency code alongside. **Never** a JavaScript `Number` for a monetary value, never a
`FLOAT`/`DOUBLE` column, never round an intermediate result.

> 📎 [`specifications/04-tech-stack.md`](../specifications/04-tech-stack.md) owns every version above.
