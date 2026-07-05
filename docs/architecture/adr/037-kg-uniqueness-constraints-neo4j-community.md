# ADR-037: Knowledge Graph uses composite UNIQUE constraints (Neo4j Community compatible)

**Date:** 2026-06-29
**Status:** Accepted
**Deciders:** Product owner, Engineering
**Tags:** data, infra

---

## Context

The Knowledge Graph ingestion worker (`services/kg-ingestion-worker`, Phase 13) applies schema
constraints on startup for all 8 node labels — `Project`, `Task`, `Material`, `Vendor`,
`Inspection`, `Invoice`, `Contract`, `Delay` — keyed on the composite `(<entity>_id, tenant_id)`.

The original implementation (`internal/graph/constraints.go`) used `REQUIRE (...) IS NODE KEY`.
**`NODE KEY` constraints require Neo4j Enterprise Edition.** The local/dev and SMB stack runs
`neo4j:5.19-community` (`docker-compose.yml`), so the worker crashed on startup:

```
Neo.DatabaseError.Schema.ConstraintCreationFailed:
Node Key constraint requires Neo4j Enterprise Edition.
```

(`docs/specifications/07-multi-tenant-architecture.md` reserves Neo4j Enterprise for the
ENTERPRISE tier's dedicated-DB-per-tenant model — not for the shared/SMB or dev stack.)

## Decision

Change all 8 KG constraints from `IS NODE KEY` to composite `IS UNIQUE`, e.g.:

```cypher
CREATE CONSTRAINT kg_project_key IF NOT EXISTS
  FOR (n:Project) REQUIRE (n.project_id, n.tenant_id) IS UNIQUE
```

Composite uniqueness constraints are supported on **Neo4j Community 5.x** (verified on
`neo4j:5.19-community`: the constraint is created with type `UNIQUENESS`).

## Rationale

- `IS UNIQUE` works on **both Community and Enterprise**, so one code path serves dev, SMB, and
  enterprise tiers.
- It preserves the key guarantee that matters for ingestion idempotency: **uniqueness of
  `(entity_id, tenant_id)`** plus the backing index used for `MERGE`/lookup.
- `NODE KEY` additionally guarantees the keyed properties _exist_ (non-null). The ingestion worker
  always sets `entity_id` and `tenant_id` on every node it writes, so that guarantee is enforced at
  the application layer instead.
- **Alternative considered — run Neo4j Enterprise:** rejected for dev + SMB because it adds a
  commercial license and operational complexity to environments that do not need it. Enterprise
  tenants may still run Enterprise Neo4j; the `IS UNIQUE` constraints remain valid there.

## Consequences

### Positive

- KG ingestion worker boots cleanly on Neo4j Community (dev + SMB), no license required.
- Single constraint definition valid across all editions.

### Negative

- Loses the DB-enforced property-existence guarantee of `NODE KEY`; correctness now relies on the
  ingestion worker always populating `entity_id` / `tenant_id` (covered by its write path + tests).

### Neutral

- The `UNIQUE` constraint still creates the backing range index, so `MERGE`/lookup performance is
  unchanged.

## References

- `services/kg-ingestion-worker/internal/graph/constraints.go`
- `docs/specifications/07-multi-tenant-architecture.md` (Neo4j Enterprise — enterprise-tier dedicated DB)
- `docs/specifications/12-construction-knowledge-graph.md` (Phase 13 KG schema)
- ADR-032 (TimescaleDB co-located then split) — related infra-edition decision pattern
