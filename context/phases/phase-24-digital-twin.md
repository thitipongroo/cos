# Phase 24 — Digital Twin

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 13, 21, 23 · SaaS Maturity Stage 5.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Build Construction Digital Twin Layer.

Prerequisites (ALL must be complete before Phase 24 begins):
  Phase 13 — Knowledge Graph     (graph structure of project entities)
  Phase 21 — Equipment Service   (IoT telemetry pipeline — MQTT 5.0, see spec §13.5)
  Phase 23 — MLOps Pipeline      (ML models for prediction)
  BIM Integration — implement IFC.js parser per spec §13.4 (source geometry and structure)
  IoT Integration — live telemetry feeds (MQTT 5.0, see spec §13.5)

Purpose:
  Unify physical construction site state with operational data model.
  A digital twin in construction context is NOT a 3D visualization tool —
  it is a real-time data synchronization layer between:
    - Physical site (IoT sensors, GPS, inspections)
    - Digital model (BIM geometry, WBS, project schedule)
    - Operational intelligence (KG relationships, ML predictions)

Digital Twin data model:
  TwinEntity: { id, projectId, entityType, physicalRef, digitalRef,
                lastSyncedAt, confidence, tenantId }
  EntityType: ENUM(STRUCTURE, EQUIPMENT, MATERIAL_STOCK, WORKFORCE_ZONE,
                   INSPECTION_ZONE)
  TwinState:  { entityId, timestamp, attributes: Record<string, unknown>,
                source: ENUM(IOT, MANUAL, AI_INFERRED) }

Core capabilities:
  1. State synchronization:
     IoT telemetry → TwinState update → Knowledge Graph node update
     Frequency: real-time for critical assets, batch 15min for others

  2. Divergence detection:
     Compare planned (BIM/schedule) vs actual (IoT/inspections)
     Alert when divergence > configured threshold per entity type

  3. AI-enhanced inference:
     Where IoT coverage is incomplete, use ML models (Phase 23) to
     infer probable state (DelayForecastModel feeds twin schedule)

  4. Query interface:
     { getTwinState(projectId, entityType, timestamp): TwinSnapshot }
     { getDivergenceReport(projectId): DivergenceReport }
     { subscribeToStateChanges(projectId): AsyncIterable<TwinStateEvent> }

TwinSnapshot:  { projectId, asOf: Date, entities: TwinEntity[],
                 overallConfidence: number, divergenceScore: number }
DivergenceReport: { projectId, generatedAt: Date,
                    divergences: Divergence[], riskLevel: RiskLevel }
Divergence:   { entityId, plannedState, actualState, gap: number,
                severity: ENUM(LOW, MEDIUM, HIGH) }

Infrastructure:
  Storage:   TimescaleDB (time-series twin states — co-located on primary PostgreSQL
             instance through Stages 1–3, split to dedicated instance only on volume
             trigger; same instance as Phase 21/22; see ADR-032)
  Graph:     Neo4j (twin entity relationships — same instance as Phase 13)
  Streaming: Kafka topic: twin.state.updated (consumers: AI Gateway, Analytics)
  Cache:     Redis (current twin state per project — TTL 5 min)

Generate:

- TwinEntity and TwinState TimescaleDB schema + hypertable
- State synchronization service (IoT event consumer → twin state update)
- Divergence detection engine (scheduled job, configurable thresholds)
- Twin query API (FastAPI — ai-gateway service, Python for ML integration)
- Kafka consumer: equipment.telemetry.* → twin state update
- Kafka producer: twin.state.updated, twin.divergence.detected
- OpenAPI 3.1 spec for twin query endpoints
- Unit tests: divergence calculation, state merge logic
- Integration tests: end-to-end IoT event → twin state → divergence alert
- services/analytics-worker/ — carbon analytics module: consumes carbon.record.created.v1
    → aggregates carbon_kgco2e to ClickHouse (GHG Protocol Scope 1/2/3);
    source: docs/specifications/33-digital-twin-iot §33.3 Service Assignment

Constraints:

- Digital Twin is READ-OPTIMIZED — do not use as write-path for operational data
- All writes come from source systems (IoT, inspection, schedule) via Kafka
- Twin state is eventually consistent — not a transactional system
- Confidence score mandatory on every inferred state
- Phase 24 MUST NOT block Phase 15–19 (deploy as post-production layer)

- Before marking Phase 24 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```
