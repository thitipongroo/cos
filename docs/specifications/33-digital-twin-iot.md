---
title: 'Digital Twin and IoT Layer'
version: '1.5.0'
status: Active
last_updated: '2026-07-10'
authors:
  - thitipongroo
related_docs:
  - 22-ai-architecture.md
  - 28-ecosystem-expansion.md
  - 32-implementation-specifications.md
  - 09-data-architecture.md
  - 11-database-schema.md
  - 15-event-driven-workflow.md
---

# 33. Digital Twin and IoT Layer

## Table of Contents

- [33.0 Standards Reference](#330-standards-reference)
- [33.1 Overview and Scope](#331-overview-and-scope)
- [33.2 Phase Dependencies and Entry Criteria](#332-phase-dependencies-and-entry-criteria)
- [33.3 Architecture](#333-architecture)
- [33.4 Data Model](#334-data-model)
- [33.5 Kafka Events](#335-kafka-events)
- [33.6 API Layer](#336-api-layer)
- [33.7 Integrations](#337-integrations)
- [33.8 Infrastructure](#338-infrastructure)
- [33.9 Revenue Model](#339-revenue-model)
- [33.10 Success Metrics](#3310-success-metrics)
- [33.11 Ecosystem Architecture Decisions](#3311-ecosystem-architecture-decisions)

---

## 33.0 Standards Reference

| Domain                  | Standard                                        | Version                  | Role                                                                                                              |
| ----------------------- | ----------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| IoT messaging           | MQTT — OASIS Standard                           | Version 5.0 (2019-03-07) | Normative — device-to-platform telemetry protocol                                                                 |
| BIM data exchange       | Industry Foundation Classes (IFC) — ISO 16739-1 | IFC4 (ISO 16739-1:2018)  | Normative — BIM element identifier format and file exchange for BIM Integration                                   |
| Embodied carbon factors | EN 15804:2012+A2:2019 / ISO 21930:2017          | Current                  | Normative — EPD life cycle module A1–A3 as the basis for material carbon emission factors                         |
| GHG accounting          | ISO 14064-1:2018                                | 2018                     | Informative — organizational GHG inventory framework for tenant carbon reporting                                  |
| Event envelope          | Base Event Envelope (CloudEvents-inspired)      | §32.4                    | Normative — COS Base Event Envelope (see 15-event-driven-workflow §15.6 + 32-implementation-specifications §32.4) |
| Event schema            | Apache Avro / Confluent Schema Registry         | —                        | Normative — event schema format and compatibility (see 32-implementation-specifications §32.4)                    |

**Normative** = implementation must comply with the standard.
**Informative** = provides context and calculation methodology; does not mandate specific tooling.

---

## 33.1 Overview and Scope

Phase 24 — Smart Infrastructure Layer.

This phase corresponds to **28-ecosystem-expansion section 28.2 Phase 5**
(Smart Infrastructure Layer, Year 5+). It is a **Stage 5 (AI-native Ecosystem)**
capability per the SaaS Maturity Model in 32-implementation-specifications section 32.1.

**What this phase adds:**

- **IoT integration** — site sensors (concrete cure sensors, structural monitoring,
  dust, noise), equipment telemetry, worker location tracking
- **Digital twins** — living representation of each project linked to platform operational
  data; real-time entity state visualization; BIM integration
- **Carbon analytics** — embodied carbon tracking per material consumption record;
  carbon footprint reporting for ESG compliance
- **Smart city integration** — data feeds to municipal building inspection systems,
  infrastructure asset registries, urban planning platforms

**What this phase does NOT include:**

- Hardware manufacturing or device firmware (platform integrates with third-party IoT devices)
- BIM authoring tools (platform consumes BIM data via IFC.js parser, IFC format ISO 16739-1:2018;
  see `13-product-architecture` §13.4)
- Autonomous construction control (humans remain in the loop for all physical actions)

> ⚠️ **Stage gate:** Phase 24 may not begin until Phase 4 (Financial Infrastructure,
> 28-ecosystem-expansion section 28.5) has achieved its entry criteria and the IoT hardware
> partner relationship is confirmed. See section 33.2 for full entry criteria.

---

## 33.2 Phase Dependencies and Entry Criteria

### Mandatory Prerequisites

| Prerequisite                                      | Source                                 | Status                   |
| ------------------------------------------------- | -------------------------------------- | ------------------------ |
| Phase 13 — Knowledge Graph                        | 32-implementation-specifications §32.1 | Must be complete         |
| Phase 21 — Equipment Service                      | 32-implementation-specifications §32.1 | Must be complete         |
| Phase 23 — MLOps Pipeline                         | 32-implementation-specifications §32.1 | Must be complete         |
| BIM Integration (IFC.js parser, spec §13.4)       | 13-product-architecture §13.4          | Must be implemented      |
| IoT Device Integration                            | 32-implementation-specifications §32.9 | Must be provisioned      |
| Phase 4 (Financial Infrastructure) entry criteria | 28-ecosystem-expansion §28.5           | Revenue base sustainable |

### Entry Criteria (28-ecosystem-expansion §28.5)

- Dominant market position confirmed in Phases 1–4
- IoT hardware partner contracted and devices certified
- BIM integration partner (e.g. Autodesk Construction Cloud, Trimble) contracted
- Digital twin rendering engine selected and integrated

### Build Sequence Within Phase 24

1. IoT Device Integration provisioned (IoT device SDK and connectivity layer)
2. TwinEntity model and TimescaleDB hypertable deployed
3. Kafka IoT telemetry ingestion pipeline live
4. Twin state query API (`/api/v1/twin/`) deployed
5. BIM Integration implemented (BIM import → planned state; IFC.js parser per spec §13.4)
6. Divergence detection engine live
7. Carbon analytics module live
8. Smart City Integration API (future — municipal partnership required)

---

## 33.3 Architecture

### System Topology

```text
IoT Devices / BIM Files
        │
        ▼
[IoT Ingestion Worker (Go)]     [BIM Import Worker (Python)]
        │                               │
        └──────────► Kafka ◄────────────┘
                       │
                       ▼
             [Digital Twin Service]
                  (FastAPI — AI Gateway)
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
      [TimescaleDB]           [Redis]
       (state history)        (current state cache, TTL 5 min)
             │
             ▼
      [Analytics Worker (Go)]
             │
             ▼
      [ClickHouse]
       (aggregated reports, carbon analytics)
```

**IoT messaging protocol:** Devices communicate via **MQTT 5.0** (OASIS Standard, 2019-03-07).

- QoS 1 (at least once) — telemetry data (sensor readings, equipment position)
- QoS 2 (exactly once) — critical state changes (worker entry/exit, safety alerts)
- Topic structure: `cos/v1/devices/{device_id}/telemetry` (tenant scoped at broker level)

**BIM data exchange:** BIM files follow **IFC4 (ISO 16739-1:2018)**.

- File format: `.ifc` (STEP / ISO 10303-21)
- BIM element identifier mapped to `TwinEntity.digital_ref` as IFC GlobalId (22-character base64-encoded GUID per ISO 16739-1)

**Write path:** IoT telemetry → MQTT broker → IoT Ingestion Worker → Kafka → Digital Twin Service → TimescaleDB.
Direct API writes are prohibited except for entity registration (device provisioning
and BIM element import). All state updates must arrive via Kafka.

**Read path:** API reads current state from Redis cache (5-minute TTL).
Cache is invalidated on any state write to the project. Point-in-time queries
bypass cache and query TimescaleDB directly.

**Confidence scoring:** Every state record carries a confidence score [0.0, 1.0].

| Confidence | Meaning                                              |
| ---------- | ---------------------------------------------------- |
| 1.0        | Live IoT data (sensor reading ≤ 60 seconds old)      |
| 0.7–0.9    | Recent telemetry (last known reading, not yet stale) |
| < 0.7      | AI-inferred state (no direct sensor data)            |

### Service Assignment

| Component           | Service / Worker                               | Runtime          |
| ------------------- | ---------------------------------------------- | ---------------- |
| IoT ingestion       | `services/iot-ingestion-worker/`               | Go               |
| BIM import          | `services/bim-import-worker/`                  | Python           |
| Digital Twin API    | `services/ai-gateway/` (Phase 24 module)       | FastAPI (Python) |
| State cache         | Redis (shared infrastructure)                  | —                |
| Time-series storage | TimescaleDB (new — Phase 24)                   | —                |
| Carbon aggregations | `services/analytics-worker/` (Phase 24 module) | Go → ClickHouse  |

---

## 33.4 Data Model

### TwinEntity

Represents a physical or digital object tracked by the platform.

| Field            | Type                 | Description                                                                                                |
| ---------------- | -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `entity_id`      | UUID                 | Primary key                                                                                                |
| `tenant_id`      | UUID                 | FK → tenants                                                                                               |
| `project_id`     | UUID                 | FK → Projects                                                                                              |
| `entity_type`    | enum                 | STRUCTURE / EQUIPMENT / MATERIAL_STOCK / WORKFORCE_ZONE / INSPECTION_ZONE                                  |
| `physical_ref`   | string (nullable)    | IoT device ID, GPS tracker ID, or sensor ID                                                                |
| `digital_ref`    | string (nullable)    | IFC GlobalId (22-character base64-encoded GUID per ISO 16739-1:2018) or WBS node ID (from BIM Integration) |
| `last_synced_at` | timestamp (nullable) | Timestamp of most recent IoT data write                                                                    |
| `confidence`     | DECIMAL(4,3)         | Current confidence score [0.000, 1.000]                                                                    |
| `created_at`     | timestamp            | —                                                                                                          |
| `updated_at`     | timestamp            | —                                                                                                          |

### TwinState (TimescaleDB hypertable)

Append-only time-series record. Partitioned by `recorded_at`.

| Field         | Type         | Description                                                           |
| ------------- | ------------ | --------------------------------------------------------------------- |
| `entity_id`   | UUID         | FK → TwinEntity (partition key secondary)                             |
| `tenant_id`   | UUID         | For isolation                                                         |
| `recorded_at` | timestamptz  | TimescaleDB partition key                                             |
| `attributes`  | JSONB        | Freeform state attributes (fuel_level, lat, lng, speed, status, etc.) |
| `source`      | enum         | IOT / MANUAL / AI_INFERRED                                            |
| `confidence`  | DECIMAL(4,3) | [0.000, 1.000]                                                        |

**Retention policy:** Raw state records retained for 2 years.
Aggregated daily summaries retained indefinitely (ClickHouse).

### CarbonRecord

| Field                  | Type          | Description                                                                                         |
| ---------------------- | ------------- | --------------------------------------------------------------------------------------------------- |
| `carbon_record_id`     | UUID          | Primary key                                                                                         |
| `tenant_id`            | UUID          | —                                                                                                   |
| `project_id`           | UUID          | FK → Projects                                                                                       |
| `consumption_id`       | UUID          | FK → Material Consumption (11-database-schema)                                                      |
| `material_id`          | UUID          | FK → Material                                                                                       |
| `quantity_consumed`    | DECIMAL(10,4) | Amount used                                                                                         |
| `unit`                 | string        | Unit of measure                                                                                     |
| `carbon_factor`        | DECIMAL(10,6) | kgCO₂e per declared unit — sourced from EPD per EN 15804:2012+A2:2019 / ISO 21930:2017 module A1–A3 |
| `carbon_factor_source` | string        | Reference to the EPD document or database entry that provided the factor                            |
| `carbon_kgco2e`        | DECIMAL(19,4) | `quantity_consumed × carbon_factor`                                                                 |
| `recorded_at`          | timestamp     | —                                                                                                   |

**Carbon factor library:** Maintained as a configurable reference table per tenant.

- Emission factors follow **EN 15804:2012+A2:2019** (Europe) / **ISO 21930:2017** (international) — life cycle module
  **A1–A3** (raw material supply + transport to manufacturer + manufacturing). These modules define embodied carbon for
  construction materials.
- Carbon factor unit: **kgCO₂e per declared unit** (e.g., per kg, per m³, per piece — matching the EPD's declared unit
  for that material).
- Source of factors: EPD programme operators (e.g., EPD International, IBU, BRE) or national inventory data compliant
  with **ISO 14064-1:2018**.
- Factors are configurable per tenant and per material. The platform does not ship a pre-loaded factor database — tenants
  load factors from their chosen EPD source.
- `carbon_factor_source` MUST be recorded for every factor used to enable audit trail.

**Carbon Reporting Framework — GHG Protocol:**

Project-level carbon footprint is aggregated and reported using the **GHG Protocol** framework (Scope 1/2/3 classification):

| Scope   | Construction context                            | Source                                          |
| ------- | ----------------------------------------------- | ----------------------------------------------- |
| Scope 1 | On-site fuel combustion (equipment, generators) | Equipment telemetry (Phase 21 TimescaleDB)      |
| Scope 2 | Grid electricity consumed on site               | Workforce/equipment energy meter data           |
| Scope 3 | Embodied carbon in materials (A1–A3)            | `carbon_kgco2e` per material consumption record |

The two standards work together:

- **EN 15804 / ISO 21930** — defines how to calculate carbon_factor for each material (material-level)
- **GHG Protocol** — defines how to classify and report the aggregated project footprint (project-level)

---

## 33.5 Kafka Events

All events follow the naming convention `{domain}.{entity}.{action}.{version}` per
15-event-driven-workflow section 15.6.

### Events Produced by This Phase

| Event Type                    | Trigger                                                    | Key Consumers                      |
| ----------------------------- | ---------------------------------------------------------- | ---------------------------------- |
| `twin.state.updated.v1`       | Any IoT telemetry write to TwinState                       | AI Gateway, Analytics Worker       |
| `twin.divergence.detected.v1` | Divergence score crosses severity threshold                | Notification Service (Phase 20)    |
| `twin.entity.registered.v1`   | New TwinEntity created (device provisioning or BIM import) | Knowledge Graph Service (Phase 13) |
| `carbon.record.created.v1`    | Carbon record generated from material consumption          | Analytics Worker                   |

### Event Payloads

**`twin.state.updated.v1`**

```text
{
  entity_id:      string (UUID)
  project_id:     string (UUID)
  tenant_id:      string (UUID)
  entity_type:    enum (STRUCTURE / EQUIPMENT / MATERIAL_STOCK / WORKFORCE_ZONE / INSPECTION_ZONE)
  attributes:     object (freeform — source-specific)
  source:         enum (IOT / MANUAL / AI_INFERRED)
  confidence:     string (decimal string, e.g. "0.950")
  recorded_at:    string (ISO 8601 UTC)
}
```

**`twin.divergence.detected.v1`**

```text
{
  entity_id:       string (UUID)
  project_id:      string (UUID)
  tenant_id:       string (UUID)
  divergence_gap:  string (decimal string [0.000, 1.000])
  severity:        enum (LOW / MEDIUM / HIGH)
  planned_state:   object (snapshot from BIM/schedule)
  actual_state:    object (latest TwinState attributes)
  detected_at:     string (ISO 8601 UTC)
}
```

Severity thresholds:

| Severity | Gap threshold     |
| -------- | ----------------- |
| LOW      | gap < 0.15        |
| MEDIUM   | 0.15 ≤ gap < 0.40 |
| HIGH     | gap ≥ 0.40        |

---

## 33.6 API Layer

The Digital Twin query API is documented in `docs/api/digital-twin.openapi.yaml`.

**Base URL:** `/api/v1/twin/` (AI Gateway — FastAPI, port 8001)

**Core endpoints:**

| Method | Path                                       | Description                                               | Auth                         |
| ------ | ------------------------------------------ | --------------------------------------------------------- | ---------------------------- |
| `GET`  | `/api/v1/twin/{projectId}/state`           | Current twin snapshot (Redis cache, 5-min TTL)            | Any role                     |
| `GET`  | `/api/v1/twin/{projectId}/divergence`      | Divergence report vs. planned state (BIM)                 | Executive, PM, Site Engineer |
| `GET`  | `/api/v1/twin/{projectId}/entities`        | List all registered entities for a project                | Any role                     |
| `POST` | `/api/v1/twin/{projectId}/entities`        | Register a new entity (device provisioning or BIM import) | Executive, PM, Site Engineer |
| `GET`  | `/api/v1/twin/entities/{entityId}/history` | State history (TimescaleDB time-series)                   | Any role                     |

> All writes arrive via Kafka — not via the REST API.
> The registration endpoint (`POST /twin/{projectId}/entities`) is the only exception:
> it creates the entity record, not a state update.

**Point-in-time query:** Pass `?asOf=<ISO8601>` to `GET /twin/{projectId}/state`
to retrieve the project state as it was at a specific timestamp. Bypasses Redis cache;
queries TimescaleDB directly.

---

## 33.7 Integrations

| Integration            | Description                                                                                                                                                                                                                                         | Trigger Condition                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| BIM Integration        | Import element tree, material quantities, and planned state from BIM authoring tools. Data exchange format: **IFC4 (ISO 16739-1:2018)**, file format `.ifc` (ISO 10303-21 STEP). Element identity: IFC GlobalId mapped to `TwinEntity.digital_ref`. | IoT hardware partner contracted; BIM partner confirmed                     |
| IoT Device Integration | Device SDK, authentication, device registry. Telemetry protocol: **MQTT 5.0 (OASIS)**. QoS 1 minimum for telemetry; QoS 2 for critical state events. Topic structure: `cos/v1/devices/{device_id}/telemetry`.                                       | Phase 23 (MLOps) complete; IoT hardware partner confirmed                  |
| Smart City Integration | Outbound data feeds to municipal systems, infrastructure registries                                                                                                                                                                                 | Phase 24 core (IoT + Digital Twin) live; municipal partnership established |

**Implementation rule:**

- BIM Integration — spec defined (IFC.js parser, IFC format, see `13-product-architecture` §13.4). **Must be implemented**
  before Phase 24 begins.
- IoT Device Integration — must be provisioned as a stub (safe defaults) from Phase 21 onward.
  The Digital Twin Service must compile and start with this stub returning safe defaults before
  the integration is live. See `32-implementation-specifications` §32.9 for stub pattern.

---

## 33.8 Infrastructure

### New Infrastructure Added by Phase 24

| Component             | Technology                                 | Purpose                                                            |
| --------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| Time-series database  | TimescaleDB (PostgreSQL extension)         | TwinState hypertable — IoT event storage and point-in-time queries |
| IoT message broker    | EMQX self-hosted on EKS (OSS)              | Telemetry ingestion → Kafka via IoT Ingestion Worker (see note)    |
| BIM storage           | Object storage (MinIO/S3, separate bucket) | BIM file storage — large files (100 MB–10 GB)                      |
| Carbon factor library | PostgreSQL table                           | Reference data — emission factors by material type                 |

> **EMQX edition (RESOLVED):** EMQX runs as the **open-source edition (Apache-2.0)** — no
> license cost. It does **not** use EMQX's native/Enterprise Kafka data-bridge; telemetry is
> forwarded to Kafka (MSK) by the custom **IoT Ingestion Worker** per the §33.8 write path
> (`IoT → EMQX → IoT Ingestion Worker → Kafka`). The Enterprise Kafka data-bridge is a paid
> feature and is intentionally not used.

### Infrastructure Scaling Notes

- Redis TTL: 5 minutes per project (invalidated on state write) — defined in `docs/api/digital-twin.openapi.yaml`
- TimescaleDB deployment: co-located on the primary PostgreSQL instance (extension), split to a dedicated instance only
  on the volume trigger
- TimescaleDB chunk interval — **provisional policy :**
  start at the TimescaleDB default **7 days**, then tune so that active chunks (including
  indexes) across hypertables fit within **25% of PostgreSQL memory** (Timescale official
  best practice — "25% rule"); measure with `chunks_detailed_size()`. The Phase 24
  planning gate **validates** this policy against measured IoT write volume (it no longer
  invents a policy from scratch).
- IoT message throughput — **provisional budget formula :** `Σ(device count × sampling rate) ≤ 25,000 msg/s (QoS 1)` per
  EMQX node at 4 vCPU / 8 GiB — the EMQX official performance-reference figure for the
  **bridging scenario** (~75% CPU), which matches this pipeline (EMQX → IoT Ingestion
  Worker → Kafka); scale nodes linearly. The planning gate plugs actual device counts
  and sampling rates into this formula to fix the final budget.
- BIM file upload: async — files stored in object storage, ingestion triggered via Kafka event

### Deployment

The Digital Twin components deploy as separate Kubernetes workloads.
The main NestJS monolith is NOT modified — all Phase 24 logic lives in:

- `services/iot-ingestion-worker/` (new Go service)
- `services/bim-import-worker/` (new Python service)
- `services/ai-gateway/` (Phase 24 module added to existing FastAPI service)
- `services/analytics-worker/` (carbon analytics module added to existing Go service)

---

## 33.9 Revenue Model

From **28-ecosystem-expansion section 28.2 Phase 5**:

| Stream                             | Model                                                   |
| ---------------------------------- | ------------------------------------------------------- |
| IoT platform subscription          | Per-device, per-month fee on top of base SaaS tier      |
| Digital twin SaaS                  | Premium add-on per project with BIM integration enabled |
| Carbon credit verification service | Per-report fee for ESG compliance documentation         |

---

## 33.10 Success Metrics

**Metric definitions** are decided — see below;
**numeric targets** are set at the **Phase 24 planning gate** from measured baseline data.

### Metric definitions

Research basis: Bentley iTwin / Autodesk Tandem publish outcome case studies, not
operational SLO numbers — so definitions follow the **AWS Well-Architected IoT Lens**
measurement pattern, and numeric targets are **learned from baseline** (same eval-driven
principle as RT-001, `22-ai-architecture` §22.7).

**Technical metrics (AWS IoT Lens pattern):**

| Metric                       | Definition                                                                            | Target set from                   |
| ---------------------------- | ------------------------------------------------------------------------------------- | --------------------------------- |
| Device connectivity          | Connected device count; **% devices disconnected + disconnect reasons**               | First 90 days production baseline |
| Data freshness               | Device-vs-cloud timestamp delta, mapped to the §33.3 confidence tiers (≤ 60 s = live) | First 90 days production baseline |
| Twin confidence distribution | % of TwinState records per §33.3 confidence tier (1.0 / 0.7–0.9 / < 0.7)              | First 90 days production baseline |
| Divergence detection latency | State write → `twin.divergence.detected.v1` notification delivered                    | First 90 days production baseline |

**Business metrics (house style per `28-ecosystem-expansion` §28.4 — "% of tenants"):**

| Metric                 | Definition                                                    | Target set from        |
| ---------------------- | ------------------------------------------------------------- | ---------------------- |
| BIM element coverage   | `digital_ref` population rate per project (% of TwinEntities) | Pilot data at the gate |
| Carbon report adoption | % of tenants generating ≥ 1 carbon report per month           | Pilot data at the gate |

**Planning gate definition:**

The Phase 24 planning gate is triggered when both conditions are met:

1. Phase 4 entry criteria achieved (see [28-ecosystem-expansion §28.5](28-ecosystem-expansion.md))
2. ≥ 12 months remain before the Phase 24 target start date

**Gate outputs — all must be produced before Phase 24 begins:**

- **Numeric targets** for the §33.10 metric definitions above (targets from baseline/pilot data)
- TimescaleDB chunk interval — **validate** the provisional 7-day + 25%-rule policy
  (§33.8) against measured IoT write frequency
- IoT message throughput budget — plug actual device count × sensor sampling rate into
  the §33.8 EMQX envelope formula
- Hardware partner confirmation — IoT device vendor and BIM integration partner both contracted

**Owner:** thitipongroo

28-ecosystem-expansion §28.4 defines metrics for Phases 1–4 only. For Phase 5 (Smart
Infrastructure), **metric definitions** are specified above;
**numeric targets** are not pre-specified — they are fixed at the planning gate.

Metric definitions cover, at minimum:

- IoT device connectivity and data freshness
- Twin state confidence distribution
- BIM element coverage (`digital_ref` population rate)
- Divergence detection latency (state write → notification)
- Carbon report adoption by tenants

---

## 33.11 Ecosystem Architecture Decisions

### Industry Standardization Alignment (INT-004)

**Decision:** IFC 4.3 primary + buildingSMART Digital Framework; IFC 5 alpha on watch.

| Standard                        | Status (2026)           | Role in platform               |
| ------------------------------- | ----------------------- | ------------------------------ |
| IFC 4.3 (ISO 16739-1:2023)      | Current normative       | BIM data exchange — primary    |
| IFC 5 alpha                     | Alpha 2026; final ~2028 | Monitor; no implementation yet |
| ISO 19650 (DIS Mar 2026)        | DIS; final ~2027        | Information management process |
| buildingSMART Digital Framework | Active 2026             | Interoperability alignment     |
| CORENET-X (SG mandate Oct 2026) | Mandatory SG            | Singapore compliance layer     |

**ISO 19650 DIS note:** Published March 10, 2026. Terminology shifting from "BIM" to
"Information Management". Platform ontology aligns with this shift. Final publication ~2027.

**CORENET-X:** Full mandate for ALL Singapore projects from October 1, 2026 (previously

> 30,000 m² only). BIM Integration module must emit CORENET-X-compatible IFC output.

---

### Planet-Scale Simulation Platform (CIV-001)

**Decision:** Hybrid — physics-based FEA + ML surrogate models + real-time sensor fusion.

| Component                | Approach                                          | Speed/Accuracy                 |
| ------------------------ | ------------------------------------------------- | ------------------------------ |
| Physics-based simulation | Finite Element Analysis (FEA) for structural twin | Slow / High accuracy           |
| ML surrogate model       | Neural network trained on FEA outputs             | 10,000× faster / ~95% accuracy |
| Sensor fusion            | Apache Kafka real-time IoT data ingestion         | Real-time                      |
| Confidence scoring       | Hybrid: IoT=1.0, AI-inferred<0.7                  | See §33.3                      |

**Scope boundary:** Physics-based simulation applies to structural digital twin only (Phase 24).
General project delay / cost models use gradient boosting ML (see §22.7 INT-003).

---

### Multi-Civilization Interoperability (STEW-005)

**Decision:** Open standards first — IFC, CityGML, OGC API Features; W3C DID for identity.

- **BIM exchange:** IFC 4.3 normative (see INT-004 above); IFC 5 alpha monitored
- **City / infrastructure:** CityGML 3.0 (OGC standard) for urban-scale digital twin data
- **Geospatial API:** OGC API Features (REST replacement for WFS) for spatial queries
- **Decentralised identity:** W3C DID v1.1 (Candidate Recommendation March 5, 2026) for
  cross-organisation device and contractor identity — no vendor lock-in on identity layer
- **Proprietary lock-in policy:** No proprietary format may be the sole exchange mechanism;
  every integration must expose an open-standard alternative

---

> 📎 See also: [22-ai-architecture](22-ai-architecture.md) · [28-ecosystem-expansion](28-ecosystem-expansion.md)
> · [32-implementation-specifications](32-implementation-specifications.md) · [09-data-architecture](09-data-architecture.md)
> · [15-event-driven-workflow](15-event-driven-workflow.md)
