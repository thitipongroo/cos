# Runtime Language Mapping: Python AI Services vs NestJS Monolith

**Date:** 2026-06-09
**Status:** Accepted
**Deciders:** Product Owner, Engineering Lead
**Tags:** architecture

---

## Context

Construction OS has two primary backend runtimes: NestJS (TypeScript) and FastAPI (Python). The boundary between them must be explicit to prevent scope creep that would degrade maintainability — e.g., LLM calls in NestJS bypassing the AI Gateway, or business logic leaking into Python services.

---

## Decision

**NestJS monolith (`backend/`) owns:**
- All business logic (BOQ, procurement, finance, site operations, projects, tenants)
- All persistence (PostgreSQL via Prisma, ClickHouse reads, Neo4j queries via AI Gateway graph API)
- Authentication and authorization (JWT validation, RolesGuard, RBAC)
- Kafka event production (outbox pattern)
- Temporal workflow triggers (client calls only — workers run inside module boundary)
- REST API surface (all `/api/**` routes)

**Python services own:**
- `services/ai-gateway/` — LLM provider abstraction (OpenAI, Claude, Ollama), prompt routing, response caching, OCR, semantic search
- `mlops/` — model training pipelines, evaluation harnesses, MLflow experiment tracking
- `services/ai-gateway/digital_twin/` — physics simulation, real-time sensor fusion, predictive analytics
- `workers/embedding-worker/` — vector embedding generation (pgvector, OpenSearch indexing)

**Integration contract:**
- NestJS → Python: HTTP only, via `LLMProvider` interface (`services/ai-gateway/`)
- Python → NestJS: Kafka events only (Python services publish events; NestJS consumes)
- Python services MUST NOT directly read/write PostgreSQL domain tables — all persistence goes through NestJS API or Kafka

---

## Rationale

The boundary is drawn at the AI/ML capability surface:

- Python has the dominant LLM and ML library ecosystem (LangChain, sentence-transformers, scikit-learn, PyTorch)
- NestJS has the dominant enterprise application framework ecosystem (Prisma, Guards, Interceptors, Pipes)
- Cross-language HTTP (NestJS → AI Gateway) is a clean, testable boundary — both sides can be mocked in unit tests
- Allowing Python to write to PostgreSQL would require Prisma schema duplication and RLS policy duplication in Python — maintenance burden not justified

---

## Consequences

### Positive
- LLM provider can be swapped (OpenAI → Claude → Ollama) without touching NestJS code
- Python services can be scaled independently of NestJS monolith
- Clear boundary makes security review tractable — PII containment is in NestJS; AI Gateway receives de-identified prompts

### Negative
- Cross-service calls add network latency (HTTP vs in-process)
- Two languages to maintain, test, and lint

### Neutral
- Mobile (React Native) and Web (Next.js) are TypeScript — same language as NestJS

---

## References

- `context/00_master_construction_os.md` §System Architecture — Runtime Boundaries
- `services/ai-gateway/`
- `mlops/`
- `backend/src/modules/`
