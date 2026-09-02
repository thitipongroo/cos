# Phase 13 — Knowledge Graph

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 3–7, 11 · SaaS Maturity Stage 3.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Build Construction Knowledge Graph.

Neo4j Sync Strategy (authoritative):
  Method: Event-Driven Sync via Kafka (NOT CDC, NOT batch ETL)
  Implementation: kg-ingestion-worker (Go) consumes Kafka events from all services
  Consistency model: Eventually Consistent
    - Graph may lag PostgreSQL by seconds to minutes under normal load
    - Graph is NOT the source of truth — PostgreSQL is authoritative
    - Graph is for traversal and relationship queries only

  Consumer groups for kg-ingestion-worker:
    kg-ingestion-worker.shared: subscribes to all cross-service events (§7.3 shared-tier convention
      {service_name}.shared; supersedes the earlier literal name "kg-consumer-group")
    Topics consumed (regex): ^[^.]+\.(construction|procurement|site|finance)\..*
      (cross-tenant wildcard — all tenant-scoped topics for these domains;
       see docs/specifications/07-multi-tenant-architecture §7.3 and
       docs/specifications/15-event-driven-workflow §15.6)
  Go Kafka client: github.com/twmb/franz-go v1.21.5 via the shared coskafka pipeline (kgo.ConsumeRegex).
    sarama was replaced — it has no regex topic subscription (which the pattern above requires) and it
    json.Unmarshal'd Avro-framed bytes; both broke against a real broker. The analytics-worker uses the
    same franz-go/coskafka path. See docs/specifications/32-implementation-specifications

  Conflict handling: last-event-wins (graph is derived, not authoritative)
  Replay: on kg-worker restart, replay from last committed offset
  Full rebuild: triggered manually via admin API — replays all events from beginning
    (needed after schema migration or bug fix)

Neo4j Node Labels and Properties:
  (:Project)
    project_id:   String (UUID)
    tenant_id:    String
    project_name: String
    status:       String
    budget_amount: Float

  (:Task)
    task_id:     String  — maps to boq_item_id (BOQ line items are the authoritative task source in Phase 13)

  (:Material)
    material_id:  String (maps to boq_item_id)
    description:  String
    unit:         String

  (:Vendor)
    vendor_id:    String
    vendor_name:  String
    tenant_id:    String

  (:Inspection)
    inspection_id: String
    status:        String
    inspected_at:  DateTime

  (:Invoice)
    invoice_id:    String
    amount:        Float
    currency:      String
    status:        String

  (:Contract)
    contract_id:   String  — maps to po_id of APPROVED Purchase Orders (APPROVED PO = contractual agreement; no separate Contract module needed)

  (:Delay)
    delay_id:    String (UUID — maps to event_id from CloudEvents envelope; MERGE key)
    project_id:  String (UUID)
    task_id:     String (UUID, nullable — may be project-level only)
    delay_days:  Integer
    cause:       String (enum: PROCUREMENT/WEATHER/WORKFORCE/EQUIPMENT/SCOPE_CHANGE/OTHER)
    detected_by: String (enum: AI_FORECAST/MANUAL_REPORT)
    severity:    String (enum: LOW/MEDIUM/HIGH/CRITICAL — LOW=1-2d, MEDIUM=3-6d, HIGH=7-13d, CRITICAL=14+d)
    tenant_id:   String
    occurred_at: DateTime
    Source: construction.delay.detected.v1 payload (see docs/specifications/32-implementation-specifications §32.4)

  (:Building)                                — physical hierarchy (source: spec 10 §10.2 / 12 §12.2)
    building_id:  String (UUID)
    name:         String
    type:         String
    total_floors: Integer
    status:       String
  (:Floor)
    floor_id:       String (UUID)
    building_id:    String
    floor_number:   Integer
    gross_area_sqm: Float
  (:Room)
    room_id:     String (UUID)
    floor_id:    String
    room_number: String
    room_type:   String
    area_sqm:    Float
  (:Structure)
    structure_id:   String (UUID)
    building_id:    String
    structure_type: String (enum: column/beam/slab/wall)
    material_type:  String

  NOTE — Building/Floor/Room/Structure are NOT ingested into the KG (PO decision 2026-07-05).
    They are backing/reference data and emit no Kafka events (see
    backend/src/modules/project/{buildings,floors,rooms,structures}/*.service.ts). KG sync is
    event-driven only (Neo4j Sync Strategy above — NOT CDC/batch), so with no events these four
    labels cannot be materialised in Neo4j; they are intentionally absent from the mapper and the
    constraints (8 event-backed labels only). Retained here to document the intended graph model.

Relationships:
  (:Project)-[:HAS_MATERIAL]->(:Material)
  (:Material)-[:SUPPLIED_BY]->(:Vendor)
  (:Material)-[:DELIVERED_BY]->(:Vendor)    — fulfillment relationship (source: procurement.delivery.received)
  (:Vendor)-[:SUBMITTED]->(:Invoice)
  (:Invoice)-[:BELONGS_TO]->(:Project)
  (:Inspection)-[:VALIDATES]->(:Project)
  (:Project)-[:HAS_INSPECTION]->(:Inspection)
  (:Delay)-[:IMPACTS]->(:Project)           — source: delay.detected event (delay_days, cause, severity)
  (:Delay)-[:IMPACTS]->(:Task)              — task-level delay (nullable — may be project-level only)
  (:Building)-[:HAS_FLOOR]->(:Floor)             — 1:N (source: spec 10 §10.3 / 12 §12.3)
  (:Floor)-[:HAS_ROOM]->(:Room)                  — 1:N
  (:Building)-[:CONTAINS_STRUCTURE]->(:Structure) — 1:N
  (:Task)-[:LOCATED_IN]->(:Floor)                — N:1 (task room-assignment; offline-cached per 17 §17.4)
  (:Task)-[:LOCATED_IN]->(:Room)                 — N:1
  (The five relationships above all touch Building/Floor/Room/Structure and are therefore NOT
   materialised in the KG — see the physical-hierarchy NOTE under Node Labels; PO 2026-07-05.)

  Note: DEPENDS_ON and USES relationships for Tasks derive from BOQ item hierarchy
        (task_id = boq_item_id; BOQ parent-child = DEPENDS_ON)

Additional graph queries enabled by new relationships:
  6. Delivery chain per vendor per project (DELIVERED_BY traversal)
  7. All delays impacting a project (Delay → IMPACTS → Project)
  8. Procurement risk propagation: if vendor delayed → which tasks/projects at risk?
     (traverse: Vendor → DELIVERED_BY ← Material ← HAS_MATERIAL ← Project)

Graph Queries (required):
  1. All vendors supplying to a project (traverse: Project → Material → Vendor)
  2. All invoices for a vendor on a project
  3. All inspections for a project (pass/fail summary)
  4. Material supply chain for a project
  5. Vendor relationship map (which vendors share projects)

Graph APIs (NestJS thin API — delegates to Neo4j):
  GET /api/v1/graph/projects/:projectId/vendors
  GET /api/v1/graph/projects/:projectId/supply-chain
  GET /api/v1/graph/projects/:projectId/inspections
  GET /api/v1/graph/vendors/:vendorId/projects
  GET /api/v1/graph/vendors/:vendorId/invoices

Generate:

- kg-ingestion-worker (Go): Kafka consumer, Neo4j writer
- Neo4j Cypher queries for all node/relationship types
- Relationship mapper (event payload → Cypher MERGE statement)
- Graph query service (NestJS — for graph APIs)
- Neo4j schema constraints (uniqueness on {label}.{id} + tenant_id)
- Full rebuild admin endpoint
- Unit tests: Kafka event → Cypher transformation
- Integration tests: full ingest pipeline with Neo4j test container
- OpenAPI 3.1 spec: docs/api/graph.openapi.yaml (per spec §14.3 canonical table — Knowledge Graph, MVP Phase 13)


Constraints:

- Before marking Phase 13 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```
