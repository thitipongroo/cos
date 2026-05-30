# Construction OS — Knowledge Graph Ingestion Worker (Go)

**Runtime:** Go 1.22+
**Phase:** Phase 13 — Knowledge Graph
**Deployable:** Separate from NestJS monolith (Go runtime)

## Purpose

Consumes Kafka domain events and writes nodes and relationships to Neo4j, building the Construction Knowledge Graph. The graph is eventually consistent with PostgreSQL — Neo4j is for traversal queries only, not the source of truth.

Responsibilities:
- Kafka consumer for all cross-service events (consumer group: `kg-consumer-group`)
- Map event payloads to Cypher `MERGE` statements (nodes + relationships)
- Handle full graph rebuild via admin API (replays all events from earliest offset)

## Node types maintained

`(:Project)` `(:Material)` `(:Vendor)` `(:Inspection)` `(:Invoice)` `(:Delay)`

## Relationships maintained

`HAS_MATERIAL` `SUPPLIED_BY` `DELIVERED_BY` `SUBMITTED` `BELONGS_TO` `VALIDATES` `HAS_INSPECTION` `IMPACTS`

## Public API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/admin/kg/rebuild` | Trigger full graph rebuild from Kafka offset 0 |

## Dependencies

- Kafka (consumer group: `kg-consumer-group`, all domain topics)
- Neo4j 5.x
- Confluent Schema Registry

## Configuration

```bash
KAFKA_BROKERS=localhost:29092
KAFKA_GROUP_ID=kg-consumer-group
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=<from Vault/AWS SM>
SCHEMA_REGISTRY_URL=http://localhost:8081
```

## Usage

```bash
cd services/kg-ingestion-worker
go mod download
go run .

# Build
go build -o kg-ingestion-worker .
```

## Consistency model

Eventually consistent — graph may lag PostgreSQL by seconds to minutes. On worker restart: replay from last committed Kafka offset. Full rebuild: `POST /admin/kg/rebuild` (needed after schema migration or bug fix).
