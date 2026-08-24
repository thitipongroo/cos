# Construction OS — Service Interaction Diagram

> Verified against the codebase on 2026-07-20. Where this file names a concrete route, module, or
> topic it was read from source, not from a plan. The authoritative registries live in code and win
> any disagreement: `packages/@cos/shared/src/kafka/topic-catalog.ts` for events and topics,
> `backend/src/modules/` for the module list, `services/` for the service list.

## Runtime Topology

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                       │
│   React Native (iOS/Android)    Web App (Next.js PWA)    Admin Web          │
└────────────────┬────────────────────────┬────────────────────────┬──────────┘
                 │                        │                        │
                 ▼                        ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     KONG API GATEWAY (ingress)                              │
│   JWT validation · rate limiting · tenant routing · API analytics           │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
              ┌────────────────┼─────────────────┐
              ▼                ▼                  ▼
┌──────────────────────┐  ┌──────────────────┐  ┌───────────────────────────┐
│  NestJS Monolith     │  │  File Service    │  │  AI Gateway               │
│  (backend/) 22 mods  │  │  (Fastify, Node) │  │  (FastAPI, Python)        │
│                      │  │                  │  │                           │
│  analytics  notif    │  │  POST /upload    │  │  /api/v1/ai/completions   │
│  boq        platform-│  │  GET  /url       │  │  /api/v1/ai/transcribe    │
│  compliance  webhook │  │  POST /admin/    │  │  /api/v1/ai/reports/*     │
│  crm        procure- │  │    recover       │  │  /api/v1/rag/query        │
│  equipment   ment    │  └────────┬─────────┘  └────────┬──────────────────┘
│  files      project  │           │                     │
│  finance    safety   │           ▼                     ▼
│  geo        site-ops │  ┌─────────────┐  ┌───────────────────────────┐
│  graph      sync     │  │    MinIO    │  │ ai-embedding-worker       │
│  identity   tasks    │  │  (S3-compat)│  │ ai-ocr-pipeline           │
│  master-    tenant   │  └─────────────┘  │ ai-transcription-pipeline │
│    data     vendor-  │                   │   (all Python)            │
│  workforce   portal  │                   └───────────────────────────┘
└────────┬─────────────┘
         │ Kafka events via transactional outbox (platform.outbox_events → OutboxPoller)
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         KAFKA EVENT BUS                                     │
│  Topics are PER-TENANT: {tenant_id}.{domain}.{entity}.{action}.{version}    │
│  Domains: construction · site · procurement · finance · equipment ·         │
│           workforce · identity · file      (platform.* is NOT tenant-scoped │
│           — it shares the `platform.events` topic)                          │
│  Schema Registry (RecordNameStrategy) · DLQ {tenant_id}.dlq (one per tenant)│
└──────┬────────────────┬────────────────┬────────────────┬───────────────────┘
       │                │                │                │
       ▼                ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌───────────────┐ ┌────────────────────┐
│ notification │ │ finance      │ │ KG Ingestion  │ │ Analytics Worker   │
│ .consumer    │ │ .consumer    │ │ Worker        │ │ (Go, franz-go)     │
│ (NestJS)     │ │ (NestJS)     │ │ (Go,franz-go) │ │ carbon consumer    │
│              │ │              │ │ → Neo4j       │ │ → ClickHouse       │
└──────────────┘ └──────────────┘ └───────────────┘ └────────────────────┘

  Both Go workers subscribe per-tenant topics by regex (franz-go kgo.ConsumeRegex); sarama could
  not — it has no pattern subscription. ClickHouse is written by BOTH the Analytics Worker's carbon
  consumer AND its own Kafka table engine (infrastructure/clickhouse/initdb.d/02-kafka-tables.sql).
```

## Data Store Ownership

| Store                                           | Owner Service                                                                                                                                                                  | Purpose                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| PostgreSQL (shared DB)                          | NestJS monolith                                                                                                                                                                | All domain entities; RLS tenant isolation                                                  |
| PostgreSQL (dedicated DB per enterprise tenant) | NestJS monolith (routed via `dedicated_db_url`)                                                                                                                                | Enterprise tenant isolation                                                                |
| ClickHouse                                      | **written by** the Analytics Worker carbon consumer (`ClickHouse/clickhouse-go/v2`) + its own Kafka table engine; **read by** NestJS `analytics` module (`@clickhouse/client`) | OLAP; time-series dashboards; API usage metering; carbon analytics                         |
| Neo4j                                           | KG Ingestion Worker (`neo4j-go-driver/v5`)                                                                                                                                     | Construction knowledge graph; entity relationships                                         |
| MinIO                                           | File Service (`minio` client)                                                                                                                                                  | Binary object storage; `cos-{tenant_id}` buckets; `cos-quarantine-{tenant_id}`             |
| Redis                                           | AI Gateway (`redis>=8.0`) + NestJS (`ioredis`)                                                                                                                                 | LLM response cache; session cache; **rate-limit store** (`nestjs-throttler-storage-redis`) |
| pgvector (PostgreSQL extension)                 | AI Gateway (`asyncpg`, `rag/backends.py`)                                                                                                                                      | 1536-dim embeddings for semantic search                                                    |
| OpenSearch                                      | File Service (`@opensearch-project/opensearch`) + AI Gateway (`opensearch-py[async]`)                                                                                          | File full-text index; BM25 keyword retrieval over the tenant's embeddings index (RAG)      |

One claim that was in this table and is still **not** true of the running system — corrected above,
kept here so the drift is not silently re-introduced:

- **pgvector is not owned by the AI Embedding Worker.** That service has no database client at all
  (no psycopg/asyncpg/SQLAlchemy in `requirements.txt`); it is a stateless embed-and-return API. The
  vectors are written and queried by the AI Gateway.

(A second correction here — "ClickHouse is not written by the Analytics Worker" — no longer applies:
as of the 2026-07-20 carbon wiring the worker holds a `clickhouse-go/v2` connection and inserts.)

## Kafka Topic → Consumer Mapping

Event names below are CloudEvents `type` values. The Kafka topic that carries them is the
tenant-prefixed form (`{tenant_id}.{type}`) — see the Runtime Topology box.

| Domain            | Producer (backend module) | Consumer(s)                                                |
| ----------------- | ------------------------- | ---------------------------------------------------------- |
| `construction.*`  | project, boq              | KG Ingestion                                               |
| `site.*`          | site-ops                  | notification.consumer, KG Ingestion                        |
| `procurement.*`   | procurement               | notification.consumer, KG Ingestion                        |
| `finance.*`       | finance                   | notification.consumer, finance.consumer, KG Ing            |
| `equipment.*`     | equipment                 | — (no consumer today)                                      |
| `workforce.*`     | workforce                 | — (ClickHouse Kafka engine only)                           |
| `identity.*`      | tenant                    | — (no consumer today)                                      |
| `platform.*`      | platform-webhook / tenant | — shared `platform.events`, not tenant-scoped              |
| `file.document.*` | File Service              | notification.consumer (quarantine → SYSTEM_ADMIN)          |
| `carbon.*`        | site-ops                  | Analytics Worker → ClickHouse (`analytics.carbon_records`) |

### Known gaps (verified 2026-07-20, do not read this diagram as "all of it works")

- **Phase 24 carbon analytics — WIRED (2026-07-20).** site-ops resolves a consumed material against
  the master and emits `carbon.record.created.v1` (Scope 3) via the outbox; analytics-worker consumes
  it over franz-go regex and inserts into `analytics.carbon_records`. Proven end-to-end against a real
  broker, Schema Registry, Postgres and ClickHouse. This gap is closed.
- **Phase 24 digital twin — scaffolded, NOT wired.** `services/ai-gateway/digital_twin/` (router,
  divergence, kafka_handler, sync_service) is not imported by `ai-gateway/main.py`, and migration
  `20260608000007_digital_twin` (`twin_entities`, `twin_states`) is applied but has no producer: the
  IoT-ingestion and BIM-import workers that would emit `twin.*` events do not exist as services.
  Scheduled for a full build (§33.2 build sequence steps 1–6).
- **AI / RAG layer — stubbed by design.** Both `StubEmbeddingProvider` and `StubLLMProvider` are in
  place; `/rag/query` returns 503 deliberately. §22.5 names `text-embedding-3-small`; nothing produces
  real vectors yet. Scheduled for a full build (§22).

**Source of truth — do not maintain a copy of the event list here.** The catalogue is
`EVENT_AVSC_MAP` in [`packages/@cos/shared/src/kafka/topic-catalog.ts`](../../packages/@cos/shared/src/kafka/topic-catalog.ts),
which maps every event type to its Avro schema and feeds both the producer's schema lookup and the
per-tenant topic provisioner. Individual event payload types live in `packages/@cos/shared/src/events/`.
Consumer subscriptions are declared at each consumer: `SUBSCRIBED_EVENT_TYPES` in
`backend/src/modules/notification/notification.consumer.ts`, and `TopicRegex`
(`^[^.]+\.(construction|procurement|site|finance)\..*`) in
`services/kg-ingestion-worker/internal/consumer/kafka_consumer.go`.

## Cross-Service Call Rules

- **Synchronous (HTTP):** only client → Kong → service; never service-to-service HTTP inside monolith boundary
- **Asynchronous:** inter-module coordination via Kafka events, written through a **transactional
  outbox** — services insert into `platform.outbox_events` in the same transaction as the state
  change, and `OutboxPoller` (`packages/@cos/shared/src/kafka/outbox.ts`) publishes to Kafka every
  500ms. Not every module emits yet: 8 do (boq, equipment, finance, procurement, project, site-ops,
  tenant, workforce)
- **AI calls:** NestJS → AI Gateway (HTTP); AI Gateway → OpenAI / Claude / Ollama via `LLMProvider` interface
- **File ops:** NestJS → File Service (HTTP presigned URL flow); File Service → MinIO (internal)
- **Temporal:** NestJS triggers workflows via Temporal client; workers run inside respective service boundary

## Authentication Flow

```text
Field worker (SITE_WORKER / SITE_ENGINEER):
  Mobile app → POST /auth/otp/request → NestJS identity module (custom OTP)
             → SMS via the on-prem SMS gateway abstraction (ADR-040) → device
             NOTE: the concrete provider is UNSPECIFIED and chosen per deployment
             (country/customer), for data-residency reasons. Not AWS SNS.
  Mobile app → POST /auth/otp/verify → NestJS → JWT (RS256, Keycloak-signed)

Office user (PM / Finance / Admin):
  Web app → Keycloak OIDC flow → JWT (RS256, Keycloak-signed)
  → Kong validates JWT on every request
  → NestJS RolesGuard enforces RBAC
```
