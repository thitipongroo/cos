# Phase 4 — Boq Service

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 3 · SaaS Maturity Stage 2.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Build BOQ (Bill of Quantities) Service.

Financial Precision: follow FINANCIAL PRECISION SPEC section above.
All monetary fields: DECIMAL(19,4) + currency_code VARCHAR(3).
All calculations: use decimal.js library — never native JS float.

Entities (PostgreSQL — schema: boq):
  boq_versions:
    version_id      UUID PK DEFAULT gen_random_uuid()
    project_id      UUID NOT NULL
    tenant_id       UUID NOT NULL
    version_number  INTEGER NOT NULL
    version_name    VARCHAR(100)
    status          ENUM('DRAFT','APPROVED','SUPERSEDED') DEFAULT 'DRAFT'
    total_estimated_amount   DECIMAL(19,4) NOT NULL DEFAULT 0
    total_estimated_currency VARCHAR(3) NOT NULL
    approved_by     UUID
    approved_at     TIMESTAMPTZ
    created_by      UUID NOT NULL
    created_at      TIMESTAMPTZ DEFAULT now()
    updated_at      TIMESTAMPTZ DEFAULT now()
    UNIQUE: (project_id, version_number)
    INDEX: (project_id, tenant_id)

  boq_categories:
    category_id     UUID PK
    version_id      UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    parent_category_id UUID FK (self-ref, nullable — for hierarchy)
    category_code   VARCHAR(50) NOT NULL
    category_name   VARCHAR(255) NOT NULL
    sort_order      INTEGER DEFAULT 0
    subtotal_amount DECIMAL(19,4) DEFAULT 0  — computed, stored for query perf
    INDEX: (version_id)

  boq_items:
    item_id         UUID PK
    category_id     UUID FK NOT NULL
    version_id      UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    item_code       VARCHAR(100)
    description     TEXT NOT NULL
    unit            VARCHAR(50) NOT NULL
    quantity        DECIMAL(10,4) NOT NULL
    unit_cost       DECIMAL(19,4) NOT NULL
    estimated_total DECIMAL(19,4) NOT NULL  — computed: ROUND(quantity × unit_cost, 4)
    currency_code   VARCHAR(3) NOT NULL
    sort_order      INTEGER DEFAULT 0
    carbon_factor_kg_co2e DECIMAL(10,6) NULL  — kgCO2e per unit (NULL until CarbonCalculationEngine activated)
    carbon_total_kg_co2e  DECIMAL(14,4)  NULL  — computed: ROUND(quantity × carbon_factor, 4)
    created_at      TIMESTAMPTZ DEFAULT now()
    updated_at      TIMESTAMPTZ DEFAULT now()
    INDEX: (version_id, category_id)

  Note: carbon_factor_kg_co2e and carbon_total_kg_co2e are NULLABLE from day one.
        Data capture hook only — analytics require CarbonCalculationEngine.
        Carbon data is forward-compatible: populate when factor is known, NULL is valid.

Calculation Rules:
  estimated_total = ROUND(quantity × unit_cost, 4)    — HALF_UP
  category.subtotal = SUM(item.estimated_total) for all items in category
  version.total_estimated = SUM(category.subtotal) for ALL categories, at every depth
      Corrected 2026-08-22 (TDD OQ-23, closed by product-owner decision). This line read
      "for all root categories" — and categories are hierarchical, so every item in a
      sub-category was worth nothing to the BOQ's total. That total is what
      construction.boq.version_approved.v1 publishes and what Finance generates contracts
      against. Summing all categories cannot double-count: boq_items.category_id is a single
      FK, so an item appears in exactly one subtotal, and a category's subtotal stays its own
      items — never a roll-up of its children. See
      docs/architecture/technical-design/phase-04-boq-service.md OQ-23.
  Recalculation: triggered on any item create/update/delete (synchronous)
  Rounding mode: HALF_UP throughout — use decimal.js ROUND_HALF_UP constant

Versioning Rules:
  - New project starts with version_number = 1
  - Creating a new version: copies all items from latest APPROVED version
  - Only one DRAFT version per project at a time
  - Approving a version: sets previous APPROVED to SUPERSEDED
  - APPROVED and SUPERSEDED versions are immutable

APIs:
  POST   /api/v1/projects/:projectId/boq/versions           — create new version
  GET    /api/v1/projects/:projectId/boq/versions           — list versions
  GET    /api/v1/projects/:projectId/boq/versions/:versionId — get version detail
  POST   /api/v1/projects/:projectId/boq/versions/:versionId/approve
  POST   /api/v1/boq/versions/:versionId/categories         — add category
  POST   /api/v1/boq/versions/:versionId/items              — add item
  PATCH  /api/v1/boq/items/:itemId                          — update item (DRAFT only)
  DELETE /api/v1/boq/items/:itemId                          — delete item (DRAFT only)
  GET    /api/v1/boq/versions/:versionId/export             — export as JSON/CSV

Generate:

- PostgreSQL migration files with all constraints
- NestJS module, service, repository, controller
- Decimal.js calculation service (unit-tested)
- Versioning service with copy-on-create logic
- DTOs with financial field validation
- OpenAPI 3.1 spec
- Unit tests: calculation accuracy (test: 0.1 + 0.2 precision, edge cases)
- Integration tests: full BOQ lifecycle
- Kafka event producers:

    boq.created        (envelope + { project_id, version_id, version_number })
    boq.updated        (envelope + { version_id, changed_items_count })
    boq.version.created(envelope + boq.version.created payload — see Event Contract)
    boq.version.approved(envelope + { project_id, version_id, total_estimated })

Decisions in Phase 4 (generate stub — implement when triggered):

  BIMIntegration — BOQ auto-population (spec §13.4):
    DECIDED: IFC.js parser (platform-agnostic) as primary; optional Autodesk Forge / Trimble Connect API connectors
    Interface: { importQuantities(bimFileUrl, boqVersionId, tenantId): Promise<BIMImportResult> }
    IFC mapping: IfcElement quantities → BOQ line items
    Data flow: IFC file → parse quantities → map to BOQ items (~80% entry reduction)
    See also: BIMIntegration Phase 3 (project structure import) — same IFC parser

Constraints:

- Before marking Phase 4 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```
