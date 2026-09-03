# Construction OS — AI Embedding Worker (FastAPI)

**Runtime:** Python 3.11 + FastAPI
**Phase:** Phase 11 — AI Foundation
**Deployable:** Separate from NestJS monolith (Python ecosystem)

## Purpose

Generates and stores vector embeddings for all text content in the platform. Enables semantic search and RAG
retrieval across site reports, issues, procurement records, and documents.

Responsibilities:

- Embed text via EP-AI-012 `EmbeddingProvider` interface (never call OpenAI SDK directly)
- Store embeddings in pgvector (`vector(1536)` column)
- Store embeddings in OpenSearch (`{tenant_id}-embeddings` index, k-NN)
- Batch processing via Kafka consumer (`file.uploaded`, `site.report.created` events)

## Public API

| Method | Path                          | Description                           |
| ------ | ----------------------------- | ------------------------------------- |
| `POST` | `/api/v1/embeddings/generate` | Generate and store embedding for text |

## Dependencies

- OpenAI text-embedding-3-small (via EP-AI-012 — never call SDK directly)
- PostgreSQL via PgBouncer (pgvector — port 6432)
- OpenSearch (k-NN index)
- Kafka (consumer: `file.uploaded`, `site.report.created`)

## Extension points

| EP        | Status | Trigger                     |
| --------- | ------ | --------------------------- |
| EP-AI-012 | STUB   | Embedding Worker activation |

## Configuration

```bash
OPENAI_API_KEY=<from Vault/AWS SM>
DATABASE_URL=postgresql://cos:password@localhost:6432/construction_os
OPENSEARCH_URL=http://localhost:9200
KAFKA_BROKERS=localhost:29092
```

## Usage

```bash
cd services/ai-embedding-worker
pip install -r requirements.txt
uvicorn main:app --reload --port 8002
```
