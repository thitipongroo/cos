# Construction OS — AI Gateway (FastAPI)

**Runtime:** Python 3.11 + FastAPI
**Phase:** Phase 11 — AI Foundation
**Deployable:** Separate from NestJS monolith (Python ecosystem)

## Purpose

Single entrypoint for all LLM calls from every service. No service calls OpenAI SDK directly — all LLM traffic routes through this gateway via the `LLMProvider` interface (EP-AI-001).

Responsibilities:

- LLM routing via configurable routing table (YAML-based — no hardcoded model names)
- Token usage tracking per tenant (persisted to `ai.ai_usage_logs`)
- Prompt template rendering (Jinja2 from `ai/prompts/`)
- Response caching (Redis, TTL configurable per template)
- Hallucination guard enforcement on all report endpoints (Phase 12)

## Public API

All endpoints require `Authorization: Bearer <JWT>` validated by Kong Gateway.

| Method | Path                                     | Description                       |
| ------ | ---------------------------------------- | --------------------------------- |
| `POST` | `/api/v1/ai/completions`                 | LLM completion via template       |
| `POST` | `/api/v1/rag/query`                      | Hybrid RAG retrieval + generation |
| `POST` | `/api/v1/ai/reports/site-summary`        | Site report summary (Phase 12)    |
| `POST` | `/api/v1/ai/reports/procurement-summary` | Procurement summary (Phase 12)    |
| `POST` | `/api/v1/ai/reports/executive-summary`   | Executive summary (Phase 12)      |
| `POST` | `/api/v1/ai/reports/delay-risk`          | Delay risk detection (Phase 12)   |

## Dependencies

- OpenAI API (via EP-AI-001 LLMProvider — never call SDK directly)
- Redis (response cache, idempotency)
- PostgreSQL via PgBouncer (ai_usage_logs — port 6432)
- ai-embedding-worker (RAG retrieval)

## Extension points

| EP        | Status | Trigger                            |
| --------- | ------ | ---------------------------------- |
| EP-AI-001 | STUB   | AI Gateway activation              |
| EP-AI-002 | STUB   | RAG retrieval quality insufficient |
| EP-AI-006 | STUB   | Governance review complete         |
| EP-AI-014 | STUB   | Need to swap LLM provider          |

## Configuration

```bash
OPENAI_API_KEY=<from Vault/AWS SM — never hardcode>
REDIS_URL=redis://:password@localhost:6379
DATABASE_URL=postgresql://cos:password@localhost:6432/construction_os
LLM_ROUTING_CONFIG=ai/config/llm-routing.yaml
```

## Usage

```bash
cd services/ai-gateway
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```
