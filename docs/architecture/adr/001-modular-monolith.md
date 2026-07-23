---
title: 'ADR-001 — Modular Monolith Architecture'
status: Accepted
last_updated: '2026-01-15'
authors:
  - thitipongroo
---

# ADR-001 — Modular Monolith Architecture

**Status:** Accepted
**Date:** 2026-01-15
**Deciders:** Engineering team

## Context

Construction OS needs to serve multiple construction workflows (projects, procurement,
finance, site operations, equipment, workforce) with shared auth, tenant context, and
event bus. The team is small and moving fast toward MVP.

Two options were considered:

1. **Microservices from day 1** — each domain module as a separate deployable service
2. **Modular Monolith** — all domain modules in a single NestJS deployable with clean module boundaries

## Decision

**Modular Monolith.** Extract a service ONLY when BOTH conditions are true:

- (a) Team ownership boundary is confirmed (a dedicated team owns it)
- (b) The module has independent scaling pressure with evidence

## Rationale

- Small team cannot sustain the operational overhead of 10+ services (service mesh,
  separate CI, separate DB schemas, distributed tracing of inter-service calls)
- Module boundaries are enforced by NestJS DI — no direct cross-module DB queries
- Kafka is deployed as shared infrastructure but used as an internal event bus, not a microservices boundary
- AI services (Python) and Go workers are always separate — different language runtimes, cannot be merged into Node.js

## Consequences

- Single deployable unit for all NestJS modules — simpler CI, simpler local dev
- Kafka events between modules are async, not blocking
- When scaling pressure emerges on a specific module, extraction is possible without
  rewriting (module boundaries are already clean)

## Exceptions (always separate)

- AI Gateway, AI Embedding Worker, AI OCR Pipeline — Python runtime
- Analytics Worker, KG Ingestion Worker — Go runtime
- File Service — extracted for I/O throughput isolation

---

## Alternatives Considered

| Option                                 | Reason Rejected                                                                                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Microservices from day 1               | Operational overhead (service mesh, distributed CI, cross-service tracing) unsustainable for a small team moving toward MVP; premature decomposition before team ownership boundaries are established |
| Single monolith (no module boundaries) | No enforced module separation — cross-module DB queries become undetectable; migration to services later would require significant refactoring                                                        |

---

## References

- `docs/00-specifications/03-system-design.md` §3.2 — Deployable units and service decomposition rationale
- `docs/00-specifications/04-tech-stack.md` §4.1 — NestJS as primary backend runtime
- `docs/01-architecture/adr/009-runtime-mapping.md` — Runtime decisions for AI/Go services that are always separate

---

_Template source: `docs/01-architecture/adr/000-template.md`_
_Format: Based on Michael Nygard's ADR format_
