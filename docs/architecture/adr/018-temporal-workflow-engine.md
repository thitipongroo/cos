# Temporal as Workflow Orchestration Engine

**Date:** 2026-06-09
**Status:** Accepted
**Deciders:** Product Owner, Engineering Lead
**Tags:** architecture, infra

---

## Context

Construction OS requires durable, multi-step business workflows that must survive server restarts, network failures, and long wait states:

- **Enterprise tenant provisioning** — 8-step workflow across DB migration, Keycloak realm, Kong routes, MinIO buckets, Neo4j schema, seed data, notification. Must be idempotent and resumable.
- **BOQ change order approval** — multi-party signature flow with day-level wait states
- **Procurement PO lifecycle** — status transitions from DRAFT → APPROVED → ISSUED → RECEIVED with external webhook callbacks

Standard NestJS lifecycle hooks and Kafka retries are insufficient for durable orchestration — they cannot pause a workflow mid-execution, replay from a checkpoint, or coordinate human approval steps.

---

## Decision

Use **Temporal** as the workflow orchestration engine.

- **Workers:** TypeScript Temporal worker embedded in the relevant NestJS service boundary (e.g., `backend/src/modules/tenant/workflows/`)
- **Server:** Self-hosted Temporal cluster (`infrastructure/temporal/`)
- **Activities:** External I/O wrapped as Temporal Activities (DB calls, Kafka publishes, Keycloak Admin API calls, MinIO ops)
- **Workflows:** Business logic as deterministic TypeScript Workflow functions
- **Data Converter:** Custom codec encrypting workflow payloads at rest (AES-256-GCM)

---

## Rationale

**Why Temporal over alternatives?**

| Option | Rejected reason |
|--------|----------------|
| Saga pattern via Kafka | Compensating transactions must be hand-coded; no visibility; complex rollback for 8-step provisioning |
| AWS Step Functions | Vendor lock-in; no local dev parity; per-transition cost |
| Bull/BullMQ | Queue, not orchestrator; no wait-state, no deterministic replay |
| Conductor (Netflix) | JVM-only workers; TypeScript SDK not production-ready at adoption date |

Temporal provides: deterministic replay, built-in retry with backoff, signal/query API for human gates, child workflows, TypeScript-native SDK, and open-source server.

---

## Consequences

### Positive
- Enterprise provisioning rollback is automatic (compensating activities)
- Workflow history is queryable — ops can inspect state of any in-flight provisioning
- Human approval gates (AWAITING_SIGNATURE) are first-class Temporal signals
- 100% workflow coverage testable via `TestWorkflowEnvironment` without a running server

### Negative
- Temporal cluster adds operational overhead (Cassandra or PostgreSQL backend)
- Workflow determinism constraints (no random, no Date.now() inside workflow functions)

### Neutral
- Workers collocated with NestJS modules — no separate deployment unit at MVP scale

---

## References

- `context/00_master_construction_os.md` §Phase 25 — Enterprise Provisioning Workflow
- `backend/src/modules/tenant/workflows/enterprise-provisioning.workflow.ts`
- `infrastructure/temporal/`
