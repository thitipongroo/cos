# Phase 21 — Equipment Service

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 2, 3 · SaaS Maturity Stage —.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Build Equipment Service.

Purpose: track construction equipment, assignments, utilization, and maintenance.
Time-series data (utilization, telemetry): stored in TimescaleDB.

Entities (PostgreSQL — schema: equipment):
  equipment:
    equipment_id    UUID PK
    tenant_id       UUID NOT NULL
    equipment_code  VARCHAR(50) NOT NULL
    equipment_name  VARCHAR(255) NOT NULL
    equipment_type  ENUM('CRANE','EXCAVATOR','CONCRETE_MIXER','GENERATOR',
                         'SCAFFOLD','VEHICLE','OTHER')
    status          ENUM('AVAILABLE','IN_USE','MAINTENANCE','RETIRED')
    purchase_date   DATE
    purchase_cost   DECIMAL(19,4)
    currency_code   VARCHAR(3)
    created_at      TIMESTAMPTZ DEFAULT now()
    UNIQUE: (tenant_id, equipment_code)

  equipment_assignments:
    assignment_id   UUID PK
    equipment_id    UUID FK NOT NULL
    project_id      UUID NOT NULL
    tenant_id       UUID NOT NULL
    assigned_by     UUID NOT NULL
    assigned_at     TIMESTAMPTZ NOT NULL
    returned_at     TIMESTAMPTZ
    notes           TEXT

  equipment_maintenance:
    maintenance_id  UUID PK
    equipment_id    UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    maintenance_type ENUM('SCHEDULED','UNSCHEDULED','REPAIR')
    status          ENUM('PENDING','IN_PROGRESS','COMPLETED')
    scheduled_at    TIMESTAMPTZ NOT NULL
    completed_at    TIMESTAMPTZ
    cost            DECIMAL(19,4)
    currency_code   VARCHAR(3)
    performed_by    VARCHAR(255)
    notes           TEXT

TimescaleDB Tables (schema: equipment_telemetry):
  equipment_utilization (TimescaleDB hypertable, partitioned by time):
    recorded_at     TIMESTAMPTZ NOT NULL  — partition key
    equipment_id    UUID NOT NULL
    tenant_id       UUID NOT NULL
    project_id      UUID
    hours_operated  DECIMAL(5,2)
    fuel_consumed   DECIMAL(8,2)
    operator_id     UUID
    INDEX: (equipment_id, recorded_at DESC)

  IoT telemetry: MQTT 5.0; broker = EMQX self-hosted on EKS (RESOLVED — AWS IoT Core deferred, Azure IoT Hub excluded; see Phase 21 stub note below + spec §13.5, §33.8); topic: cos/v1/tenants/{tenant_id}/devices/{device_id}/telemetry (corrected 2026-08-25 — the
    tenant is a topic segment the broker authenticates per device, never a payload field; spec §33.5)
    Trigger: equipment has IoT sensor attached
    Interface: { streamTelemetry(equipmentId: string): AsyncIterable<TelemetryEvent> }

APIs:
  POST /api/v1/equipment                          — create equipment
  GET  /api/v1/equipment                          — list (filterable by status, type)
  GET  /api/v1/equipment/:id                      — get detail
  PATCH /api/v1/equipment/:id/status             — update status
  POST /api/v1/equipment/:id/assignments          — assign to project
  PATCH /api/v1/equipment/:id/assignments/:aid/return — return from project
  POST /api/v1/equipment/:id/maintenance          — log maintenance
  POST /api/v1/equipment/:id/utilization          — record daily utilization
  GET  /api/v1/projects/:projectId/equipment      — equipment on project

Generate:

- NestJS module, service, repository, controller
- TimescaleDB schema and hypertable creation migration
- PostgreSQL migration for equipment entities
- OpenAPI 3.1 spec
- Unit tests: status transitions, assignment logic
- Kafka event producers:

    equipment.unit.assigned.v1              { equipment_id, project_id, assigned_by }
    equipment.unit.returned.v1              { equipment_id, project_id }
    equipment.unit.maintenance_scheduled.v1 { equipment_id, scheduled_at }

Stub in Phase 21 (generate stub — implement when triggered):

  IoTIntegration:
    Trigger:  fleet includes GPS-tracked equipment or machinery with
              onboard telematics (fuel sensors, engine hours, location)
    Interface: { streamTelemetry(equipmentId: string,
                                 tenantId: string): AsyncIterable<TelemetryEvent> }
    TelemetryEvent: { equipmentId: string, timestamp: Date, eventType: string,
                      payload: Record<string, unknown> }
    Data pipeline: IoT device → MQTT broker → Kafka → TimescaleDB hypertable
                   TimescaleDB is already deployed in Phase 21 — infrastructure ready
    Common event types: GPS_POSITION, FUEL_LEVEL, ENGINE_HOURS, IGNITION_ON/OFF,
                        IDLE_ALERT, GEOFENCE_BREACH
    Candidates: AWS IoT Core, Azure IoT Hub, self-hosted EMQX (MQTT broker)
    Note:     IoT platform RESOLVED — EMQX self-hosted on EKS, open-source edition (Apache-2.0)
              EMQX → IoT Ingestion Worker → Kafka (MSK); the custom worker forwards telemetry
              (NOT EMQX's native/Enterprise Kafka data-bridge, which is a paid feature)
              Azure IoT Hub excluded; AWS IoT Core deferred (device mgmt at scale only)

Constraints:

- Before marking Phase 21 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```
