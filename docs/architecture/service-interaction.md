# Construction OS — Service Interaction Diagram

> Verified against the codebase on 2026-07-18. Where this file names a concrete route, module, or
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
│  Schema Registry (RecordNameStrategy) · DLQ {tenant_id}.{domain}.dlq        │
└──────┬────────────────┬────────────────┬────────────────┬───────────────────┘
       │                │                │                │
       ▼                ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────────────┐
│ notification │ │ finance      │ │ KG Ingestion │ │ Analytics Worker    │
│ .consumer    │ │ .consumer    │ │ Worker (Go)  │ │ (Go, sarama)        │
│ (NestJS)     │ │ (NestJS)     │ │ → Neo4j      │ │ carbon consumer NOT │
│              │ │              │ │              │ │ WIRED — see Gaps    │
└──────────────┘ └──────────────┘ └──────────────┘ └─────────────────────┘

  ClickHouse is fed by its own Kafka table engine
  (infrastructure/clickhouse/initdb.d/02-kafka-tables.sql), NOT by the Analytics Worker.
```

## Data Store Ownership

| Store                                           | Owner Service                                                                                           | Purpose                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| PostgreSQL (shared DB)                          | NestJS monolith                                                                                         | All domain entities; RLS tenant isolation                                                  |
| PostgreSQL (dedicated DB per enterprise tenant) | NestJS monolith (routed via `dedicated_db_url`)                                                         | Enterprise tenant isolation                                                                |
| ClickHouse                                      | **written by** its own Kafka table engine; **read by** NestJS `analytics` module (`@clickhouse/client`) | OLAP; time-series dashboards; API usage metering                                           |
| Neo4j                                           | KG Ingestion Worker (`neo4j-go-driver/v5`)                                                              | Construction knowledge graph; entity relationships                                         |
| MinIO                                           | File Service (`minio` client)                                                                           | Binary object storage; `cos-{tenant_id}` buckets; `cos-quarantine-{tenant_id}`             |
| Redis                                           | AI Gateway (`redis>=8.0`) + NestJS (`ioredis`)                                                          | LLM response cache; session cache; **rate-limit store** (`nestjs-throttler-storage-redis`) |
| pgvector (PostgreSQL extension)                 | AI Gateway (`asyncpg`, `rag/backends.py`)                                                               | 1536-dim embeddings for semantic search                                                    |
| OpenSearch                                      | File Service (`@opensearch-project/opensearch`) + AI Gateway (`opensearch-py[async]`)                   | File full-text index; BM25 keyword retrieval over the tenant's embeddings index (RAG)      |

Two claims that were in this table and are **not** true of the running system — corrected above, kept
here so the drift is not silently re-introduced:

- **ClickHouse is not owned by the Analytics Worker.** `services/analytics-worker` has no ClickHouse
  driver in `go.mod` and its `main.go` never opens a connection — see the Phase 24 note below.
- **pgvector is not owned by the AI Embedding Worker.** That service has no database client at all
  (no psycopg/asyncpg/SQLAlchemy in `requirements.txt`); it is a stateless embed-and-return API. The
  vectors are written and queried by the AI Gateway.

## Kafka Topic → Consumer Mapping

Event names below are CloudEvents `type` values. The Kafka topic that carries them is the
tenant-prefixed form (`{tenant_id}.{type}`) — see the Runtime Topology box.

| Domain            | Producer (backend module) | Consumer(s)                                         |
| ----------------- | ------------------------- | --------------------------------------------------- |
| `construction.*`  | project, boq              | KG Ingestion                                        |
| `site.*`          | site-ops                  | notification.consumer, KG Ingestion                 |
| `procurement.*`   | procurement               | notification.consumer, KG Ingestion                 |
| `finance.*`       | finance                   | notification.consumer, finance.consumer, KG Ing     |
| `equipment.*`     | equipment                 | — (no consumer today)                               |
| `workforce.*`     | workforce                 | — (ClickHouse Kafka engine only)                    |
| `identity.*`      | tenant                    | — (no consumer today)                               |
| `platform.*`      | platform-webhook / tenant | — shared `platform.events`, not tenant-scoped       |
| `file.document.*` | File Service              | notification.consumer (quarantine → SYSTEM_ADMIN)   |
| `carbon.*`        | — (nothing emits it yet)  | Analytics Worker — **code exists but is not wired** |

### Known gaps (verified 2026-07-18, do not read this diagram as "all of it works")

- **Phase 24 carbon analytics is inert.** `services/analytics-worker/internal/carbon/consumer.go` is
  written and unit-tested, but `cmd/analytics-worker/main.go` never constructs it, `go.mod` carries
  no ClickHouse driver, **no module emits `carbon.record.created.v1`**, and the table it inserts into
  (`carbon_analytics.carbon_records`) is not in `infrastructure/clickhouse/initdb.d/`. Three pieces
  are missing, not one — spec §33.3/§33.4 describes the intended design.
- **Semantic search / RAG cannot run.** `services/ai-embedding-worker` ships only
  `StubEmbeddingProvider`, whose `embed()` raises `NotImplementedError("real embedding provider not
configured")`. The 1536 dimension is that stub's declared constant for the model the spec names
  (`text-embedding-3-small`, §22.5), not a value produced by a working pipeline.

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
