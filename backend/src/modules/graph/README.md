# graph

Thin NestJS read API over the Neo4j construction knowledge graph.

## Purpose

Exposes the Phase 13 graph traversals to clients. This module is **query-only** — the graph is
written exclusively by `services/kg-ingestion-worker` (Go) consuming Kafka events. PostgreSQL
remains the source of truth; the graph is derived and eventually consistent. Source:
`00_master` §Phase 13; `12-construction-knowledge-graph`.

## Public API

```text
GET /api/v1/graph/projects/:projectId/vendors       — vendors supplying a project
GET /api/v1/graph/projects/:projectId/supply-chain  — material supply chain for a project
GET /api/v1/graph/projects/:projectId/inspections   — inspections for a project (pass/fail)
GET /api/v1/graph/vendors/:vendorId/projects        — projects a vendor works on
GET /api/v1/graph/vendors/:vendorId/invoices        — invoices submitted by a vendor
```

## Dependencies

- Neo4j (`neo4j-driver`) — injected via the `NEO4J_DRIVER` token (`graph.tokens.ts`)
- `JwtAuthGuard` + tenant context — every Cypher query is filtered by `tenant_id`

The driver is created in the module factory and closed on shutdown (ADR-034 / Rule 39).

## Configuration

| Variable         | Description                    |
| ---------------- | ------------------------------ |
| `NEO4J_URI`      | Bolt URI of the Neo4j instance |
| `NEO4J_USERNAME` | Neo4j user                     |
| `NEO4J_PASSWORD` | Neo4j password                 |

## Usage

```text
GET /api/v1/graph/projects/<projectId>/supply-chain
GET /api/v1/graph/vendors/<vendorId>/invoices
```

## Notes

- Node labels and relationships are defined in `00_master` §Phase 13 — do not add labels or
  relationships here without updating that spec first.
- Graph may lag PostgreSQL by seconds to minutes; it must never be used as a write path or as the
  authority for operational data.
- Uniqueness constraints are `{label}.{id}` + `tenant_id`.
- OpenAPI spec: `docs/api/graph.openapi.yaml`.
- Test design: `docs/specifications/35-test-design.md` §35.10.13.
