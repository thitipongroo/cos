# Construction OS — Service Interaction Diagram

## Runtime Topology

```
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
┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐
│  NestJS Monolith│  │  File Service    │  │  AI Gateway        │
│  (backend/)     │  │  (Fastify)       │  │  (FastAPI)         │
│                 │  │                  │  │                    │
│  ┌───────────┐  │  │  POST /upload    │  │  /complete         │
│  │ identity  │  │  │  GET  /url       │  │  /embed            │
│  │ tenant    │  │  │  POST /admin/    │  │  /ocr              │
│  │ project   │  │  │    recover       │  │  /report           │
│  │ boq       │  │  └────────┬─────────┘  └────────┬───────────┘
│  │ site-ops  │  │           │                     │
│  │ procure   │  │           ▼                     ▼
│  │ finance   │  │  ┌─────────────┐       ┌─────────────────┐
│  │ notif     │  │  │    MinIO    │       │ Embedding Worker │
│  │ equipment │  │  │  (S3-compat)│       │   (FastAPI)      │
│  │ workforce │  │  └─────────────┘       └─────────────────┘
│  │ analytics │  │
│  │ graph     │  │
│  │ platform- │  │
│  │   webhook │  │
│  └───────────┘  │
└────────┬────────┘
         │ Kafka events (all domain state transitions)
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         KAFKA EVENT BUS                                     │
│   site.* · procurement.* · finance.* · file.* · platform.*                 │
│   Schema Registry (BACKWARD_TRANSITIVE) · Dead-letter topics per domain    │
└──────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────────┘
       │          │          │          │          │          │
       ▼          ▼          ▼          ▼          ▼          ▼
┌──────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────────┐
│Notif     │ │Analyt- │ │KG Ing- │ │Embed-  │ │ClickH- │ │ Enterprise   │
│Consumer  │ │ics     │ │estion  │ │ding    │ │ouse    │ │Provisioning  │
│(NestJS)  │ │Worker  │ │Worker  │ │Worker  │ │Kafka   │ │Workflow      │
│          │ │(Go)    │ │(Go)    │ │(Python)│ │Engine  │ │(Temporal)    │
└──────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └──────────────┘
```

## Data Store Ownership

| Store | Owner Service | Purpose |
|-------|--------------|---------|
| PostgreSQL (shared DB) | NestJS monolith | All domain entities; RLS tenant isolation |
| PostgreSQL (dedicated DB per enterprise tenant) | NestJS monolith (routed via `dedicated_db_url`) | Enterprise tenant isolation |
| ClickHouse | Analytics Worker | OLAP; time-series dashboards; API usage metering |
| Neo4j | KG Ingestion Worker | Construction knowledge graph; entity relationships |
| MinIO | File Service | Binary object storage; `cos-{tenant_id}` buckets; `cos-quarantine-{tenant_id}` |
| Redis | AI Gateway + NestJS | LLM response cache; session cache |
| pgvector (PostgreSQL extension) | AI Embedding Worker | 1536-dim embeddings for semantic search |
| OpenSearch | File Service + AI Gateway | File full-text index; RAG document index |

## Kafka Topic → Consumer Mapping

| Topic pattern | Producer | Consumer(s) |
|---------------|----------|-------------|
| `site.*` | NestJS site-ops | Notification, Analytics Worker, KG Ingestion |
| `procurement.*` | NestJS procurement | Notification, Analytics Worker, Finance (cost auto-entry) |
| `finance.*` | NestJS finance | Notification, Analytics Worker |
| `file.document.*` | File Service | Notification (quarantine alert to SYSTEM_ADMIN) |
| `platform.enterprise.*` | NestJS platform-webhook / tenant | Notification (SYSTEM_ADMIN) |

## Cross-Service Call Rules

- **Synchronous (HTTP):** only client → Kong → service; never service-to-service HTTP inside monolith boundary
- **Asynchronous:** all inter-module coordination via Kafka events (outbox pattern)
- **AI calls:** NestJS → AI Gateway (HTTP); AI Gateway → OpenAI / Claude / Ollama via `LLMProvider` interface
- **File ops:** NestJS → File Service (HTTP presigned URL flow); File Service → MinIO (internal)
- **Temporal:** NestJS triggers workflows via Temporal client; workers run inside respective service boundary

## Authentication Flow

```
Field worker (SITE_WORKER / SITE_ENGINEER):
  Mobile app → POST /auth/otp/request → NestJS identity module (custom OTP)
             → SMS via AWS SNS → device
  Mobile app → POST /auth/otp/verify → NestJS → JWT (RS256, Keycloak-signed)

Office user (PM / Finance / Admin):
  Web app → Keycloak OIDC flow → JWT (RS256, Keycloak-signed)
  → Kong validates JWT on every request
  → NestJS RolesGuard enforces RBAC
```
