# Phase 3 — Project Service

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 8 · SaaS Maturity Stage 2.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Build Project Service.

Project Status State Machine (authoritative):
  States:
    DRAFT → ACTIVE → ON_HOLD → ACTIVE (resume)
    ACTIVE → COMPLETED
    ACTIVE → CANCELLED
    DRAFT → CANCELLED
    ON_HOLD → CANCELLED

  Transition rules:
    DRAFT → ACTIVE:     requires ROLE: PROJECT_MANAGER or TENANT_ADMIN
    ACTIVE → ON_HOLD:   requires ROLE: PROJECT_MANAGER or TENANT_ADMIN
                        must record: on_hold_reason (VARCHAR 500), on_hold_at
    ON_HOLD → ACTIVE:   requires ROLE: PROJECT_MANAGER or TENANT_ADMIN
    ACTIVE → COMPLETED: requires ROLE: TENANT_ADMIN only
                        requires: end_date must be <= today
    DRAFT | ACTIVE | ON_HOLD → CANCELLED:
                        requires ROLE: TENANT_ADMIN only
                        must record: cancellation_reason (VARCHAR 500), cancelled_at
                        CANCELLED is terminal — no further transitions allowed
                        NOT from COMPLETED, which is terminal too. This line previously read
                        "ANY → CANCELLED", which contradicted both the States: block above and
                        its own next line (ANY would include CANCELLED). The enumeration above
                        and project.state-machine.ts agree; the shorthand was the outlier
                        (TDD OQ-19, corrected 2026-08-22).

  Do NOT invent additional states or transitions.

Entities (PostgreSQL — schema: projects):
  projects:
    project_id      UUID PK DEFAULT gen_random_uuid()
    tenant_id       UUID NOT NULL
    project_code    VARCHAR(50) NOT NULL
    project_name    VARCHAR(255) NOT NULL
    project_type    ENUM('RESIDENTIAL','COMMERCIAL','INFRASTRUCTURE','INDUSTRIAL') NOT NULL
    status          ENUM('DRAFT','ACTIVE','ON_HOLD','COMPLETED','CANCELLED') DEFAULT 'DRAFT'
    budget_amount   DECIMAL(19,4)
    budget_currency VARCHAR(3)    — ISO 4217
    start_date      DATE
    end_date        DATE
    on_hold_reason  VARCHAR(500)
    on_hold_at      TIMESTAMPTZ
    cancellation_reason VARCHAR(500)
    cancelled_at    TIMESTAMPTZ
    created_by      UUID NOT NULL
    created_at      TIMESTAMPTZ DEFAULT now()
    updated_at      TIMESTAMPTZ DEFAULT now()
    UNIQUE: (tenant_id, project_code)
    INDEX: (tenant_id, status)

  project_members:
    membership_id   UUID PK
    project_id      UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    user_id         UUID FK NOT NULL
    role            ENUM(roles from Phase 2) NOT NULL
    assigned_at     TIMESTAMPTZ DEFAULT now()
    assigned_by     UUID NOT NULL
    UNIQUE: (project_id, user_id)

  project_documents:
    document_id     UUID PK
    project_id      UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    file_id         UUID   — FK to File Service (loose coupling — no FK constraint)
    document_type   VARCHAR(100)
    uploaded_by     UUID NOT NULL
    uploaded_at     TIMESTAMPTZ DEFAULT now()

  — Physical / spatial hierarchy (source: spec 10 §10.2 / 11 §11.2; backs task room-assignment,
    offline read-only cache per 17 §17.4; mirrored as KG nodes in the Neo4j graph, Phase 13):
  buildings:
    building_id     UUID PK DEFAULT gen_random_uuid()
    project_id      UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    building_name   VARCHAR(255) NOT NULL   — naming per §11.2 (resolved 2026-07-05)
    building_type   VARCHAR(100)            — naming per §11.2
    total_floors    INTEGER
    location        VARCHAR(255)            — per §10.2 (resolved 2026-07-05)
    status          VARCHAR(50)
    INDEX: (tenant_id, project_id)
  floors:
    floor_id        UUID PK DEFAULT gen_random_uuid()
    building_id     UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    floor_number    INTEGER NOT NULL
    gross_area_sqm  DECIMAL(12,2)
  rooms:
    room_id         UUID PK DEFAULT gen_random_uuid()
    floor_id        UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    room_number     VARCHAR(50) NOT NULL
    room_type       VARCHAR(100)
    area_sqm        DECIMAL(12,2)
  structures:
    structure_id    UUID PK DEFAULT gen_random_uuid()
    building_id     UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    structure_type  ENUM('column','beam','slab','wall') NOT NULL
    material_type   VARCHAR(100)
  units:                                    — §11.2 (added 2026-07-05); created under a building,
    unit_id         UUID PK DEFAULT gen_random_uuid()  project_id derived from the parent building
    tenant_id       UUID NOT NULL
    building_id     UUID FK NOT NULL
    project_id      UUID FK NOT NULL
    unit_number     VARCHAR(50) NOT NULL
    unit_type       VARCHAR(100)
    status          VARCHAR(50)

  — Asset / handover domain (source: spec 11 §11.2; one of the 9 business domains, `01`):
  assets:
    asset_id           UUID PK DEFAULT gen_random_uuid()
    project_id         UUID FK NOT NULL
    tenant_id          UUID NOT NULL
    asset_type         VARCHAR(100)         — per §11.2 (added 2026-07-05)
    handover_date      DATE
    warranty_expiry    DATE
    maintenance_status VARCHAR(50)
    INDEX: (tenant_id, project_id)
  (tasks reference floor_id / room_id nullable FKs for room-assignment — LOCATED_IN in the KG)

APIs:
  POST   /api/v1/projects                    — create (DRAFT status)
  GET    /api/v1/projects                    — list (paginated, filterable by status/type)
  GET    /api/v1/projects/:id                — get by ID
  PATCH  /api/v1/projects/:id               — update metadata (not status)
  POST   /api/v1/projects/:id/transitions   — trigger status transition (body: {to, reason?})
  POST   /api/v1/projects/:id/members       — add member
  DELETE /api/v1/projects/:id/members/:userId — remove member
  GET    /api/v1/projects/:id/members       — list members
  GET    /api/v1/projects/:id/documents     — list documents

  Spatial hierarchy + asset/unit CRUD (added 2026-07-05; full CRUD, nested create/list under the
  parent, flat get/update/delete by own id; RBAC: read = any tenant user, write = PROJECT_MANAGER /
  TENANT_ADMIN; no Kafka events — backing/reference data):
  POST|GET /api/v1/projects/:projectId/buildings   · GET|PATCH|DELETE /api/v1/buildings/:id
  POST|GET /api/v1/buildings/:buildingId/floors     · GET|PATCH|DELETE /api/v1/floors/:id
  POST|GET /api/v1/floors/:floorId/rooms            · GET|PATCH|DELETE /api/v1/rooms/:id
  POST|GET /api/v1/buildings/:buildingId/structures · GET|PATCH|DELETE /api/v1/structures/:id
  POST|GET /api/v1/buildings/:buildingId/units      · GET|PATCH|DELETE /api/v1/units/:id
  POST|GET /api/v1/projects/:projectId/assets       · GET|PATCH|DELETE /api/v1/assets/:id

Generate:

- PostgreSQL migration files for all entities
- NestJS module, service, repository, controller
- DTOs for create, update, transition (with class-validator)
- State machine guard (validates allowed transitions before processing)
- OpenAPI 3.1 spec with all endpoints documented
- Pagination utility (cursor-based preferred over offset)
- Full-text search via OpenSearch (project_name, project_code)
- Unit tests: state machine, business rules
- Integration tests: full CRUD + transition flows
- Kafka event producers:

    project.created   (envelope + project.created payload — see Event Contract spec)
    project.updated   (envelope + changed fields as patch payload)
    project.status_changed (envelope + { project_id, from_status, to_status, reason })
    project.archived  (envelope + { project_id })

Decisions in Phase 3 (generate stub — implement when triggered):

  CRMIntegration (spec §13.4):
    DECIDED: Strategy pattern — generic webhook receiver + per-CRM field mapper
    3 sub-stubs (each STUB until tenant with that CRM onboards):
      SalesforceAdapter: Salesforce REST API
      HubSpotAdapter:    HubSpot Webhooks
      PipedriveAdapter:  Pipedrive Webhooks
    Interface: { createProjectFromLead(crmLeadId, tenantId): Promise<Project> }
    Data flow: CRM won deal → webhook → COS project creation (one direction only)

  BIMIntegration — project structure import (spec §13.4):
    DECIDED: IFC format (ISO 16739-1:2018 IFC4 preferred); IFC.js parser (platform-agnostic)
    Interface: { importProjectStructure(bimFileUrl, projectId, tenantId): Promise<BIMStructureResult> }
    IFC mapping: IfcBuildingStorey → project phases, IfcSpace → milestones
    BIM quantities → BOQ auto-population handled in Phase 4 (same interface, second entry point)

Constraints:

- Before marking Phase 3 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36
- docs/registers/localization-gaps.md must exist by Phase 3 completion (create stub if not yet
  populated); tag TH-specific logic in source with // i18n: TH-SPECIFIC and document before
  each feature merges (source: context.md §Compliance, spec §20.5)

```
