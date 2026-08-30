---
title: 'Test Design — Phase 21: Equipment Service'
version: '1.0.0'
status: Active
last_updated: '2026-08-25'
authors:
  - thitipongroo
related_docs:
  - README.md
  - ../../specifications/30-testing-strategy.md
---

# Phase 21 — Equipment Service

> Part of the [Test Design](README.md) set (§35.10.21 of the former single document).
> The strategy this implements is [§30 Testing Strategy](../../specifications/30-testing-strategy.md).

**Objective:** the equipment domain.

**Spec references:** `00_master` §Phase 21 (entities, TimescaleDB tables, APIs, Generate, IoT stub);
§13.5 (IoT), §33.8 (EMQX); ADR-032 (TimescaleDB co-location); §32.9 (Type B stub).

**Scope in:** equipment CRUD and status, assignments, maintenance, utilisation hypertable, equipment
events, the IoT integration stub.
**Scope out:** live IoT ingestion and the digital twin (Phase 24).

| ID                | Title                                                                | Level | Pre-condition                                       | Steps                                                                                             | Expected result                                                                                            | Spec ref                                  | Status                                                                                                                                                                                                                                                               |
| ----------------- | -------------------------------------------------------------------- | ----- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TC-P21-UNIT-001` | Equipment status transitions are valid only between specified states | UNIT  | Equipment record                                    | 1. Transition across `AVAILABLE`, `IN_USE`, `MAINTENANCE`, `RETIRED`                              | Only specified transitions succeed; no state is invented                                                   | Ph21 entities; Rule 8                     | `IMPLEMENTED` — `backend/src/modules/equipment/__tests__/equipment.service.spec.ts`                                                                                                                                                                                  |
| `TC-P21-UNIT-002` | `equipment_code` is unique per tenant                                | UNIT  | Existing equipment                                  | 1. Create a duplicate code in the same tenant; 2. In another tenant                               | 1 → conflict; 2 → succeeds                                                                                 | Ph21 UNIQUE `(tenant_id, equipment_code)` | `IMPLEMENTED` — `equipment.repository.spec.ts`                                                                                                                                                                                                                       |
| `TC-P21-UNIT-003` | Assignment sets the equipment to `IN_USE` and emits the event        | UNIT  | Available equipment                                 | 1. `POST /api/v1/equipment/:id/assignments`                                                       | Status becomes `IN_USE`; `equipment.unit.assigned.v1 { equipment_id, project_id, assigned_by }` is emitted | Ph21 APIs and Kafka producers             | `IMPLEMENTED` — `equipment.service.spec.ts`                                                                                                                                                                                                                          |
| `TC-P21-UNIT-004` | Return records `returned_at` and emits the event                     | UNIT  | Assigned equipment                                  | 1. `PATCH .../assignments/:aid/return`                                                            | `returned_at` is set; `equipment.unit.returned.v1` is emitted                                              | Ph21                                      | `IMPLEMENTED` — `equipment.service.spec.ts`                                                                                                                                                                                                                          |
| `TC-P21-UNIT-005` | Maintenance scheduling emits its event                               | UNIT  | Equipment record                                    | 1. `POST /api/v1/equipment/:id/maintenance`                                                       | `equipment.unit.maintenance_scheduled.v1 { equipment_id, scheduled_at }` is emitted                        | Ph21 Kafka producers                      | `IMPLEMENTED` — `equipment.service.spec.ts`                                                                                                                                                                                                                          |
| `TC-P21-UNIT-006` | Purchase and maintenance costs use 4-decimal money                   | UNIT  | Cost fields                                         | 1. Persist a cost with more than 4 decimals                                                       | Stored as `DECIMAL(19,4)` with an ISO-4217 currency; no float arithmetic                                   | §32.5; Rule 23                            | `IMPLEMENTED` — `equipment.repository.spec.ts`                                                                                                                                                                                                                       |
| `TC-P21-UNIT-007` | The IoT stub returns safe defaults (Type B)                          | UNIT  | IoT stub                                            | 1. Call `streamTelemetry(...)`                                                                    | Logs WARN and returns safe defaults so the service remains operational — Type B is IoT-only                | §32.9 Type B; Ph21 stub                   | `PLANNED` — stub behaviour assertion not located                                                                                                                                                                                                                     |
| `TC-P21-INT-001`  | Utilisation records land in the TimescaleDB hypertable               | INT   | Testcontainers on the `timescale/timescaledb` image | 1. `POST /api/v1/equipment/:id/utilization`; 2. Query `equipment_telemetry.equipment_utilization` | The row is stored in the hypertable partitioned by `recorded_at`                                           | Ph21 TimescaleDB Tables; §30.4 harness    | `IMPLEMENTED` — `backend/test/rls-immutability.integration.spec.ts` asserts `equipment_telemetry.equipment_utilization` is registered in `timescaledb_information.hypertables`, that an inserted record reads back, and that it lands in a chunk (§35.13 ESC-28)     |
| `TC-P21-ISO-001`  | Equipment APIs are tenant-isolated                                   | ISO   | Two tenant fixtures                                 | 1. Read Tenant B's equipment with Tenant A's JWT                                                  | 403 / zero rows                                                                                            | §30.6                                     | `IMPLEMENTED` — `backend/test/rls-immutability.integration.spec.ts` drives the RLS policies as `app_user`: tenant A cannot read or update tenant B equipment even by id, and a request with no tenant context reads zero rows rather than everything (§35.13 ESC-28) |

**Phase 21 exit gate:** equipment APIs pass the isolation-test suite
(`00_master` Phase Register — Phase 21 Exit).

---
