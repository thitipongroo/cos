# Phase 6 — Site Operations

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 3 · SaaS Maturity Stage 2.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Build Site Operations Service.

Offline Conflict Resolution Strategy (authoritative):

  CLOCK SKEW (added 2026-08-23 — TDD OQ-28). client_submitted_at comes from the DEVICE clock and
  nothing bounded it, so a handset running fast won every LAST_WRITE_WINS merge until the clock was
  corrected. It is now capped at the server's clock with 5 minutes of tolerance (the same window
  platform-webhook allows a signed request for replay protection). FORWARD ONLY: a timestamp in the
  past is honoured however old — a report written Tuesday and synced Friday happened on Tuesday, and
  rewriting it would let a stale offline edit overwrite a server-side correction made in between.
  An unparseable value is ordered oldest, so the server row wins. Both cases log
  sync.clock_skew_clamped: not a conflict, but the device that produced it will keep producing them.
  Implementation: clampClientTimestamp in site-ops/conflict-handler.ts; spec §17.5.

  Entity: site_reports
    Strategy: LAST_WRITE_WINS based on client_submitted_at timestamp
    Rationale: one report per day per submitter — concurrent edits are rare
    Implementation: compare client_submitted_at on sync; newer timestamp wins
    Conflict flag: if server version modified_at differs from client's
                   last_known_modified_at, flag as CONFLICT for manual review

  Entity: issues
    Strategy: FIELD_LEVEL_MERGE
    Fields merged independently:
      - description:  last writer wins (client_submitted_at)
      - status:       server wins (status changes are authoritative)
      - photos:       union of both (no conflict — additive)
                      SCOPE: this resolves WHICH photos are attached; the set only grows.
                      A photo's own annotation is NOT covered here — see below.
      - resolution_note: last writer wins
    Conflict flag: if status was changed server-side while client had offline edit,
                   create ConflictRecord for ROLE: SITE_ENGINEER to review

  Entity: photo annotation (the ADR-056 stroke list on a photo)
    Strategy: CONFLICT_FLAGGED — no auto-resolution
    Rationale: an annotation stays editable after sync, so two people can mark up the same
               photo offline. Merging strokes would silently blend two readings of one defect;
               last-write-wins would silently discard one. Neither is acceptable on a record
               used to evidence site defects.
    Implementation: on sync, server checks for concurrent server-side modification since the
                    client's last sync; if found → status CONFLICT_FLAGGED, notify
                    ROLE: SITE_ENGINEER; never auto-merge, auto-overwrite, or discard.
    Product-owner decision 2026-07-17; ADR-056. Authoritative rule table: spec §17.5.

  Entity: safety_checklists
    Strategy: SERVER_WINS
    Rationale: safety data must be authoritative — no client override
    On conflict: reject client version, return server version with CONFLICT_REJECTED status

  Entity: tasks (progress_percent field)
    Strategy: MAX_WINS — higher value wins; progress is monotonic
    Rationale: progress_percent must never decrease; a worker cannot un-complete work
    Implementation: compare client progress_percent vs server progress_percent; apply max(client, server)
    Conflict flag: none — Max-wins resolves silently (no human review required)
    The resolving UPDATE must also stamp projects.tasks.modified_at: /sync/delta pages `task`
    on that column, so a write that leaves it alone resolves the conflict on the server and
    tells no other device. Same for site_ops.incidents on acknowledge. Both columns were
    ADDED 2026-08-23 — until then the delta paged on created_at and could only ever report
    NEW rows, which is why an acknowledged safety incident kept reading OPEN everywhere.
    Enforced by scripts/ci/check-modified-at-writes.mjs, not by a trigger (PO decision).

  Financial entities — ONLINE-REQUIRED, not offline-writable (spec §17.4):
    Entities: POs, vendor invoices / AR / AP, payments, budget-line mutations.
    (BOQ line items are read-only cache per §17.4 — also never offline-mutated.)
    Rule: financial records require server-side validation before any mutation (dual-write
          risk); the mobile client never queues them offline (§17.4 online-required scope).
    Enforcement: the sync push endpoint (POST /sync/push, POST /sync/resolve) has NO case for a
          financial entity_type — any such write falls through to the default and is rejected
          with BadRequestException. Financial data therefore never enters the sync queue and is
          never auto-merged, auto-overwritten, or silently discarded.
    Source of truth: spec §17.4 (Entity Offline Scope). The §17.5 conflict table has no financial
          row because financial entities are never synced offline.

  Sync Protocol:
    Client sends: { entity_type, entity_id, client_version, payload, client_submitted_at }
    Server returns: { resolved_payload, conflict_status, server_version }
    conflict_status: ACCEPTED | CONFLICT_FLAGGED | CONFLICT_REJECTED

Task Completion Gates (server-side validation — not enforced offline):
  A task may only transition to status = COMPLETED when ALL hard-block gates pass.
  Evaluated at PATCH /api/v1/tasks/:id { status: 'completed' }.
  On any hard-block failure → return HTTP 422 with error code COS-TASK-001 and the list
  of blocking gate names.

  Hard blocks — system returns 422 if any gate fails:
    1. Inspections  — no linked inspection (task_id = task.task_id) with
                      result = 'FAIL' or status = 'REQUIRES_REINSPECTION'
    2. Issues       — no linked issue (task_id = task.task_id) with
                      issue_type IN ('DEFECT','REWORK','PUNCH') and status = 'OPEN'
    3. Dependencies — all predecessor tasks derived from BOQ parent-child hierarchy
                      (boq_item_id parent → child = DEPENDS_ON) have status = 'COMPLETED'
    4. Permit       — no linked permit (linked_task_id = task.task_id) with
                      status IN ('EXPIRED','REVOKED')
    5. Safety       — no linked safety incident (task_id = task.task_id) with
                      status = 'OPEN' and severity IN ('HIGH','CRITICAL')
    6. Delay        — task.status != 'BLOCKED'
                      The gate itself is live: tasks.service.ts reads the status, and BLOCKED is a
                      valid value a PM can set by hand via PATCH /tasks/:id.
                      The AUTOMATIC path IS built as of 2026-08-25 (Phase 23, product-owner
                      decision): services/ai-gateway/reports/delay_event.py publishes
                      construction.delay.detected.v1 and TasksDelayConsumer sets the status.
                      Between 2026-08-23 and then this line claimed a path that did not exist —
                      nothing consumed the event and nothing published it either.
                      SCOPE OF THE AUTOMATIC TRANSITION: only a task in NOT_STARTED or IN_PROGRESS
                      is moved to BLOCKED. A COMPLETED or CANCELLED task is left alone. The event
                      carries no ordering guarantee against a completion, so applying it literally
                      would let a late or replayed forecast un-finish work that is already done —
                      and the gate exists to stop a delayed task being completed, not to reopen one
                      that was. A project-level forecast (task_id null) blocks nothing; it still
                      reaches the Knowledge Graph.
                      The producer emits only while DelayForecastModel returns a prediction, and
                      that model is a stub until it has 90+ days of production data.
    7. Material     — linked BOQ item's purchase order has at least one delivery record.
                      Corrected 2026-08-22: this line used to read "with status != 'PENDING'",
                      but `deliveries` has no status column and the entity definition above
                      (§Phase 5 procurement entities) never declared one. A deliveries row carries
                      delivered_at and received_by, both NOT NULL, so filing one IS recording
                      receipt — there is no pending state for it to be in. If partial-vs-complete
                      receipt ever has to be distinguished, that is a delivery-status feature to
                      spec, not a condition this gate can already evaluate.

  Warn only — HTTP 200 returned; response includes warnings[] array:
    8. Budget 85%–99%  — BOQ item actual_cost >= 85% of budget → warning level: ORANGE
    9. Budget >= 100%  — BOQ item actual_cost >= 100% of budget → warning level: RED;
                         requires PM acknowledgement flag in request body: { acknowledge_budget_overrun: true }

Entities (PostgreSQL — schema: site_ops):
  site_reports:
    report_id       UUID PK
    project_id      UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    report_date     DATE NOT NULL
    submitted_by    UUID NOT NULL
    status          ENUM('DRAFT','SUBMITTED','ACKNOWLEDGED')
    summary         TEXT   — max 2000 chars, enforced in DTO
    weather         VARCHAR(100)
    manpower_count  INTEGER
    client_submitted_at TIMESTAMPTZ  — from device clock; capped at the server's on sync (OQ-28)
    server_received_at  TIMESTAMPTZ DEFAULT now()
    modified_at         TIMESTAMPTZ DEFAULT now()
    UNIQUE: (project_id, report_date, submitted_by)

  issues:
    issue_id        UUID PK
    project_id      UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    report_id       UUID FK (optional — FK → site_reports)
    task_id         UUID nullable FK → projects.tasks (completion gate #2; see §11)
    title           VARCHAR(255) NOT NULL
    description     TEXT
    issue_type      ENUM('DEFECT','REWORK','PUNCH','GENERAL') DEFAULT 'GENERAL'
    severity        ENUM('LOW','MEDIUM','HIGH','CRITICAL')
    status          ENUM('OPEN','IN_PROGRESS','RESOLVED','CLOSED')
    assigned_to     UUID
    resolution_note TEXT
    client_submitted_at TIMESTAMPTZ
    modified_at     TIMESTAMPTZ DEFAULT now()
    created_at      TIMESTAMPTZ DEFAULT now()

  inspections:
    inspection_id   UUID PK
    project_id      UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    checklist_id    UUID FK NOT NULL
    task_id         UUID nullable FK → projects.tasks (completion gate #1; see §11)
    status          ENUM('PENDING','PASSED','FAILED','REQUIRES_REINSPECTION')
    inspected_by    UUID NOT NULL
    inspected_at    TIMESTAMPTZ NOT NULL
    notes           TEXT

  safety_checklists:
    checklist_id    UUID PK
    project_id      UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    checklist_name  VARCHAR(255) NOT NULL
    version         INTEGER DEFAULT 1
    items           JSONB NOT NULL  — array of { item_id, description, is_required }
    created_at      TIMESTAMPTZ DEFAULT now()

  manpower_logs:
    log_id          UUID PK
    report_id       UUID FK NOT NULL
    tenant_id       UUID NOT NULL
    trade_type      VARCHAR(100) NOT NULL
    worker_count    INTEGER NOT NULL
    hours_worked    DECIMAL(5,2) NOT NULL

  conflict_records:
    conflict_id     UUID PK
    tenant_id       UUID NOT NULL
    entity_type     VARCHAR(100) NOT NULL
    entity_id       UUID NOT NULL
    client_payload  JSONB NOT NULL
    server_payload  JSONB NOT NULL
    conflict_type   ENUM('FIELD_CONFLICT','STATUS_CONFLICT','REJECTED')
    reviewed_by     UUID
    reviewed_at     TIMESTAMPTZ
    created_at      TIMESTAMPTZ DEFAULT now()

APIs (mobile-first; canonical /api/v1/site/* and /api/v1/safety/* — ADR-025/027):
  POST  /api/v1/site/reports                    — create or sync offline report
  GET   /api/v1/site/reports                    — list (paginated, date range filter)
  GET   /api/v1/site/reports/:id                — get by ID
  POST  /api/v1/site/reports/sync               — bulk offline sync (array of changes)
  POST  /api/v1/site/reports/:reportId/materials — log material consumption
  POST  /api/v1/site/issues                     — create or sync offline issue
  PATCH /api/v1/site/issues/:id                 — update issue (field-level merge)
  GET   /api/v1/site/issues                     — list issues (severity/status/project)
  POST  /api/v1/site/inspections                — submit inspection result
  GET   /api/v1/site/inspections                — list inspection results
  GET   /api/v1/site/inspections/:id            — get inspection
  PATCH /api/v1/site/inspections/:id            — approve / request re-inspection (ADR-025)
  GET   /api/v1/site/conflict-records           — list unresolved conflicts (ROLE: SITE_ENGINEER)
  PATCH /api/v1/site/conflict-records/:id/resolve — manual conflict resolution
  # Tasks + completion gate (1–7 hard blocks + budget warnings 8–9; see Task Completion Gates):
  GET   /api/v1/projects/:projectId/tasks       — list tasks; POST creates; PATCH /api/v1/tasks/:id updates
  # Safety (incidents, permits §15.5, checklists, compliance — ADR-027):
  POST  /api/v1/safety/incidents                — report incident; GET lists; PATCH :id/acknowledge
  POST  /api/v1/safety/permits                  — create; GET lists; PATCH :id/approve|:id/reject (§15.5)
  GET   /api/v1/safety/checklists               — list; POST submit completed checklist (= inspection)
  GET   /api/v1/safety/compliance               — deterministic compliance view (open incidents + bad permits)

Safety APIs (authoritative: spec §14 Safety APIs; MVP scope: spec §21.2 = incident reports,
  safety checklists, work permits, safety permit-approval workflow). Enumerated here so the
  execution view matches §14 and the Procurement/Phase-5-style context-derivation drift is not
  repeated. Backend IMPLEMENTED (safety module: controller/service/repository; ADR-027):
  POST  /api/v1/safety/incidents                         — report safety incident (Site Engineer, Safety Officer)
  GET   /api/v1/safety/incidents                         — list incidents (project/status/severity)
  PATCH /api/v1/safety/incidents/:incidentId/acknowledge — acknowledge incident (Safety Officer)
  POST  /api/v1/safety/permits                           — create a permit request (PENDING)
  GET   /api/v1/safety/permits                           — list permits (project/status)
  PATCH /api/v1/safety/permits/:permitId/approve         — approve permit (§15.5; → ACTIVE)
  PATCH /api/v1/safety/permits/:permitId/reject          — reject permit (→ REVOKED)
  GET   /api/v1/safety/checklists                        — list safety checklists (any role)
  POST  /api/v1/safety/checklists                        — submit completed safety checklist (Site Engineer, Safety Officer)
  GET   /api/v1/safety/compliance                        — compliance summary (open incidents + bad permits)
  Note: WORK PERMITS + the safety permit-approval workflow (§21.2) are now enumerated in §14's
  Safety table AND implemented — the earlier §14-vs-§21.2 gap is closed.

  material_consumptions:
    consumption_id  UUID PK
    project_id      UUID NOT NULL
    tenant_id       UUID NOT NULL
    report_id       UUID FK → site_reports (optional)
    material_name   VARCHAR(255) NOT NULL
    material_id     UUID NOT NULL DEFAULT gen_random_uuid()
                    — own identity now; future FK → materials.material_id when catalogue built
    task_id         VARCHAR(255)   — nullable free-text; no FK until Task entity exists
    quantity        DECIMAL(10,4) NOT NULL
    unit            VARCHAR(50) NOT NULL
    consumed_by     UUID NOT NULL
    consumed_at     TIMESTAMPTZ NOT NULL

APIs (addition):
  POST /api/v1/site/reports/:reportId/materials — log material consumption; emits site.material.consumed.v1

Generate:

- PostgreSQL migration files for all entities (including material_consumptions — KD-SITE-001 RESOLVED)
- NestJS module with offline sync controller
- Conflict resolution service implementing all three strategies above
- ConflictRecord persistence and notification
- Photo upload integration via File Service API (not direct — API call)
- OpenSearch indexing for site_reports and issues (full-text search)
- Response DTOs optimized for mobile (minimal payload option via ?minimal=true)
- Unit tests: all three conflict resolution strategies
- Integration tests: sync flow including conflict scenarios
- Kafka event producers:

    site.material.consumed  { consumption_id, project_id, task_id (nullable free-text),
                              material_id, quantity: DECIMAL(10,4), unit, consumed_by,
                              consumed_at }  — emitted on POST /api/v1/site/reports/:reportId/materials
    site.report.created   (see Event Contract spec)
    site.report.submitted { report_id, project_id, report_date, submitted_by }
    inspection.passed     { inspection_id, project_id, inspected_by }
    inspection.failed     (see Event Contract spec)
    issue.created         (see Event Contract spec)
    issue.status_changed  { issue_id, project_id, from_status, to_status }
    site.conflict.flagged { conflict_id, entity_type, entity_id, conflict_type }
                          — emitted whenever a CONFLICT_FLAGGED ConflictRecord is persisted
                            (site_reports LAST_WRITE_WINS + issues FIELD_LEVEL_MERGE paths);
                            fulfils the "ConflictRecord persistence AND notification" Generate
                            item — NotificationConsumer routes it to SITE_ENGINEER,
                            PROJECT_MANAGER, TENANT_ADMIN for manual review

Decision in Phase 6 (documented in spec):

  CarbonCalculationEngine:
    DECIDED: two complementary standards (see spec §33.4 + 09-data-architecture.md):
      - Material-level factors: EN 15804:2012+A2:2019 / ISO 21930:2017 (EPD source, configurable per tenant)
      - Project-level reporting: GHG Protocol (Scope 1/2/3 classification)
    Implementation: populate boq_items.carbon_factor_kg_co2e from EPD per EN 15804; aggregate via GHG Protocol Scope 3 for project footprint report
    Interface: { calculateProjectFootprint(projectId, tenantId): Promise<{ total_kg_co2e, breakdown_by_material, scope_breakdown }> }
    Data sources (already in schema from Phase 4+):
      - boq_items.carbon_factor_kg_co2e (nullable, populate on EP activation)
      - boq_items.quantity + site.material.consumed events (Phase 6)
    Trigger: implement when tenant requests carbon reporting or regulation requires it

Constraints:

- Before marking Phase 6 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```
