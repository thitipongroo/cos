---
title: 'ADR-009 — Runtime Mapping (Node.js / Go / Python per Service)'
status: Accepted
last_updated: '2026-01-15'
authors:
  - thitipongroo
---

# ADR-009 — Runtime Mapping (Node.js / Go / Python per Service)

**Status:** Accepted
**Date:** 2026-01-15
**Deciders:** Engineering team

## Context

Construction OS runs three distinct categories of compute:

1. **Business logic** — API request handling, domain rules, tenant context, auth, Kafka event publishing
2. **High-throughput stream processing** — Kafka consumption at high message rates, batch writes to Neo4j and ClickHouse
3. **ML/AI inference** — LLM orchestration, vector embedding, OCR, RAG pipelines

Each category has different primary constraints. Choosing a single runtime for all three
would require trade-offs that are unacceptable in at least one category.

## Options considered

| Option                 | Business logic                                           | Stream workers                                                 | AI/ML                                                      |
| ---------------------- | -------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| **Node.js everywhere** | ✅ Ideal                                                 | ⚠️ GC pauses under sustained load; single-threaded per process | ❌ No mature ML ecosystem; PyTorch/HuggingFace unavailable |
| **Python everywhere**  | ⚠️ Slow cold starts; poor concurrency                    | ⚠️ GIL limits parallelism under CPU pressure                   | ✅ Dominant ML ecosystem                                   |
| **Go everywhere**      | ⚠️ No mature NestJS equivalent; DI overhead to replicate | ✅ Excellent goroutine concurrency; predictable GC             | ❌ No mature ML ecosystem                                  |
| **Language-per-role**  | ✅ Node.js                                               | ✅ Go                                                          | ✅ Python                                                  |

## Decision

**Three-runtime model, bounded by role:**

| Runtime                    | Services                                               | Primary reason                                                                                                                                 |
| -------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Node.js 20 / NestJS 10** | `backend` (main monolith)                              | Rich DI, TypeScript type safety, Prisma ORM, fastest iteration for business logic; team expertise                                              |
| **Go 1.22**                | `analytics-worker`, `kg-ingestion-worker`              | Goroutine-based Kafka consumer groups handle burst ingestion without GC pauses; compiled binary in distroless = minimal attack surface; no GIL |
| **Python 3.11**            | `ai-gateway`, `ai-embedding-worker`, `ai-ocr-pipeline` | LangChain, OpenAI SDK, Transformers, Tesseract, pgvector client — the ML/AI ecosystem is Python-first; no equivalent in Go or Node             |

Cross-runtime communication is always via Kafka events or REST (never shared memory or direct DB calls).

## Rationale

**Why not Node.js workers?**
Node.js processes a Kafka message sequentially per partition consumer unless workers are
explicitly managed. Under sustained 1,000 msg/sec ingestion, Node.js GC pressure causes
latency spikes that Go handles gracefully via goroutines with pre-emptive scheduling.

**Why not Python workers?**
The GIL prevents true CPU parallelism per process. Running N Python worker processes for
Kafka parallelism requires N times the memory. Go achieves the same parallelism with a
single process and lightweight goroutines.

**Why not Go for AI services?**
LangChain, LangGraph, HuggingFace Transformers, Tesseract OCR, and the full OpenAI Python
SDK have no Go equivalents with comparable community support. Rebuilding RAG pipelines in
Go would require maintaining custom implementations of battle-tested Python libraries.

**Why not Python for business logic?**
Python's lack of a mature NestJS/DI equivalent makes structuring large domain models with
proper module boundaries significantly harder. Django REST Framework exists but lacks the
decorator-based DI pattern that makes NestJS module isolation clean. TypeScript provides
compile-time contracts that catch cross-module leaks before runtime.

## Consequences

- Three CI pipelines (Node.js/pnpm, Go modules, pip/pytest) — mitigated by Turborepo + GitHub Actions matrix
- Three Dockerfile patterns (Node.js multi-stage, Go distroless, Python slim) — documented in each service
- Language boundary = Kafka boundary: cross-runtime calls MUST go through Kafka or REST, never direct function calls
- Each runtime is independently scalable via Kubernetes HPA

## Constraints this ADR enforces

1. No Go service may import Python packages (and vice versa) — only event contracts from `@cos/shared` Zod schemas
2. No Node.js service may write directly to ClickHouse or Neo4j — only via Kafka events consumed by the Go workers
3. No Python service may read from PostgreSQL except via the backend REST API

---

## Implementation notes

Consolidated from the former ADR-021 (runtime language mapping: Python AI vs NestJS,
2026-06-09) when the duplicate was merged on 2026-07-23:

- **Python service inventory:** `services/ai-gateway/` (LLM provider abstraction — OpenAI/
  Claude/Ollama, prompt routing, OCR, semantic search), `services/ai-gateway/digital_twin/`
  (sensor fusion, predictive analytics), `mlops/` (training pipelines, MLflow tracking),
  `workers/embedding-worker/` (vector embedding, pgvector / OpenSearch indexing)
- **Integration contract direction:** NestJS → Python is **HTTP only** (via the `LLMProvider`
  interface); Python → NestJS is **Kafka only**; Python services never touch PostgreSQL
  domain tables directly (persistence goes through the NestJS API or Kafka)

---

## Alternatives Considered

| Option                            | Reason Rejected                                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Node.js everywhere                | No mature ML ecosystem; GC pauses under sustained Kafka ingestion; GIL-equivalent event loop saturation under CPU load |
| Python everywhere                 | GIL limits parallelism for stream workers; slow cold starts; no NestJS-equivalent DI for clean domain boundaries       |
| Go everywhere                     | No mature ML/AI ecosystem (LangChain, Transformers, Tesseract unavailable); no NestJS-equivalent for business logic    |
| Polyglot per module (free choice) | Unmanageable dependency surface; onboarding cost scales with language count beyond three                               |

---

## References

- `docs/00-specifications/03-system-design.md` §3.2 — Deployable units
- `docs/00-specifications/04-tech-stack.md` §4.2–4.4 — Runtime and language versions
- `docs/01-architecture/adr/001-modular-monolith.md` — Establishes the NestJS monolith boundary that this ADR builds on

---

_Template source: `docs/01-architecture/adr/000-template.md`_
_Format: Based on Michael Nygard's ADR format_
