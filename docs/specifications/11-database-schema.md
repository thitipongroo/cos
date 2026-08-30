---
title: 'Database Schema'
version: '1.5.0'
status: Active
last_updated: '2026-06-20'
authors:
  - thitipongroo
related_docs:
  - 09-data-architecture.md
  - 10-construction-ontology.md
  - 12-construction-knowledge-graph.md
  - 07-multi-tenant-architecture.md
---

# 11. Database Schema

## Table of Contents

- [11.0 Schema Convention and Isolation Standard](#110-schema-convention-and-isolation-standard)
- [11.1 Multi-tenant Foundation](#111-multi-tenant-foundation)
- [11.2 Core Entities](#112-core-entities)
- [11.3 CRM Entity Lifecycle](#113-crm-entity-lifecycle)
- [11.4 Architectural Principle](#114-architectural-principle)

---

## 11.0 Schema Convention and Isolation Standard

Isolation model: **Shared DB + tenant_id** (SMB tier, MVP baseline) — see §7 for tier mapping.

### Rules — apply to every domain table without exception

1. `tenant_id UUID NOT NULL` on every domain table (`platform` cross-tenant tables are exempt)
2. All SQL MUST use schema-qualified names: `procurement.vendors`, `finance.project_budgets` — never unqualified
3. RLS MUST be enabled on every domain table (see template below)
4. Application layer MUST also pass `tenant_id` in every query (`WHERE tenant_id = $1`) as defense-in-depth

### RLS policy template

```sql
ALTER TABLE {schema}.{table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {schema}.{table} FORCE ROW LEVEL SECURITY;

-- Exactly ONE policy per domain table, AS PERMISSIVE, named rls_tenant_isolation.
CREATE POLICY rls_tenant_isolation ON {schema}.{table}
  AS PERMISSIVE
  FOR ALL
  TO app_user
  USING (
    -- NULLIF: an empty/unset GUC yields NULL → zero rows, instead of an
    -- "invalid input syntax for uuid" error (ADR-031).
    tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid
  )
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);
```

Use `AS PERMISSIVE`, not `AS RESTRICTIVE`: a lone RESTRICTIVE policy grants no access (it can only
narrow, never grant), and with one policy per table the OR/AND distinction is moot. Keep it to a
single tenant-isolation policy — a second permissive policy would OR-widen access. See §7.7.

`app.current_tenant_id` is set by the application at the start of each request (via
`TenantPrismaService.run()`, which runs `SET LOCAL app.current_tenant_id` inside the transaction).

### Schema registry — full list

| Schema                | Owner module                             | tenant_id | Notes                                                                    |
| --------------------- | ---------------------------------------- | --------- | ------------------------------------------------------------------------ |
| `platform`            | Identity / Tenant                        | exempt    | Cross-tenant system tables — no RLS needed                               |
| `projects`            | Project Management                       | NOT NULL  |                                                                          |
| `boq`                 | Bill of Quantities                       | NOT NULL  |                                                                          |
| `procurement`         | Procurement                              | NOT NULL  |                                                                          |
| `site_ops`            | Site Operations                          | NOT NULL  |                                                                          |
| `finance`             | Finance                                  | NOT NULL  |                                                                          |
| `files`               | File Service                             | NOT NULL  |                                                                          |
| `credentials`         | CredentialService (DID/VC, ADR-019)      | NOT NULL  | RLS by tenant_id; RESTRICTED — see §11.6                                 |
| `notifications`       | Notification Service                     | NOT NULL  | `notification_templates` has nullable tenant_id (null = system template) |
| `equipment`           | Equipment Service                        | NOT NULL  |                                                                          |
| `workforce`           | Workforce Service                        | NOT NULL  |                                                                          |
| `crm`                 | CRM (Lead / Opportunity / Contact)       | NOT NULL  | Customer = `finance.customers` (ADR-024/029); MVP per §21.6 update       |
| `ai`                  | AI Services                              | NOT NULL  | Migration tool: Prisma (`backend/prisma/migrations/`)                    |
| `equipment_telemetry` | IoT Telemetry (Timescale)                | NOT NULL  | Hypertable; partitioned by `recorded_at`                                 |
| `workforce_telemetry` | Attendance (Timescale)                   | NOT NULL  | Hypertable; partitioned by `recorded_at`                                 |
| `digital_twin`        | Digital Twin / IoT (Timescale, Phase 24) | NOT NULL  | TwinState hypertable; see `33-digital-twin-iot` §33.4                    |

---

## 11.1 Multi-tenant Foundation

Core :

- tenants
- organizations
- users
- roles
- permissions

### platform.tenants

| Column             | Type                                        | Constraints                       | Notes                                                                                                                                                                                               |
| ------------------ | ------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenant_id`        | UUID                                        | PK DEFAULT gen_random_uuid()      |                                                                                                                                                                                                     |
| `tenant_code`      | VARCHAR(50)                                 | UNIQUE NOT NULL                   |                                                                                                                                                                                                     |
| `tenant_name`      | VARCHAR(255)                                | NOT NULL                          |                                                                                                                                                                                                     |
| `keycloak_realm`   | VARCHAR(100)                                | UNIQUE NOT NULL                   |                                                                                                                                                                                                     |
| `plan_type`        | ENUM('STARTER','PROFESSIONAL','ENTERPRISE') | NOT NULL                          |                                                                                                                                                                                                     |
| `is_active`        | BOOLEAN                                     | NOT NULL DEFAULT true             |                                                                                                                                                                                                     |
| `dedicated_db_url` | VARCHAR(500)                                | NULL                              | NULL = shared DB; non-NULL = enterprise dedicated DB URL                                                                                                                                            |
| `data_region`      | VARCHAR(20)                                 | NOT NULL DEFAULT 'ap-southeast-1' | AWS region for data residency; assigned at provisioning per `05-security-compliance` §5.6 (Thai → `ap-southeast-7`, EU → `eu-west-1`, default → `ap-southeast-1`); immutable after first data write |
| `created_at`       | TIMESTAMPTZ                                 | NOT NULL DEFAULT now()            |                                                                                                                                                                                                     |
| `updated_at`       | TIMESTAMPTZ                                 | NOT NULL DEFAULT now()            |                                                                                                                                                                                                     |

`dedicated_db_url` is set by SYSTEM_ADMIN at one of two points:

- **At tenant creation** (`POST /api/v1/admin/tenants`) — optional; use when dedicated DB is already
  provisioned before the tenant record is created.
- **After creation** (`PATCH /api/v1/admin/tenants/{tenantId}/dedicated-db`) — use when upgrading an
  existing tenant from shared DB to dedicated DB.

See `07-multi-tenant-architecture §7.1` and `docs/runbooks/dedicated-db-provisioning.md`.

---

### platform.users

| Column             | Type         | Constraints                  | Notes                                                                                       |
| ------------------ | ------------ | ---------------------------- | ------------------------------------------------------------------------------------------- |
| `user_id`          | UUID         | PK DEFAULT gen_random_uuid() |                                                                                             |
| `tenant_id`        | UUID         | FK → tenants NOT NULL        |                                                                                             |
| `keycloak_user_id` | VARCHAR(255) | UNIQUE NOT NULL              | Path A: phone_number; Path B: Keycloak UUID                                                 |
| `email`            | VARCHAR(255) | NOT NULL                     | Path A: empty string; Path B: actual email                                                  |
| `display_name`     | VARCHAR(255) | NOT NULL                     |                                                                                             |
| `photo_url`        | TEXT         | NULL                         | Profile photo, uploaded via the file service. NULL → clients show the user's initials       |
| `is_active`        | BOOLEAN      | NOT NULL DEFAULT true        |                                                                                             |
| `mfa_enabled`      | BOOLEAN      | NOT NULL DEFAULT false       |                                                                                             |
| `mfa_totp_secret`  | VARCHAR(255) | NULL                         | TOTP secret, encrypted at rest (app-layer AES-256-GCM); NULL until MFA enrollment completes |
| `created_at`       | TIMESTAMPTZ  | NOT NULL DEFAULT now()       |                                                                                             |
| `updated_at`       | TIMESTAMPTZ  | NOT NULL DEFAULT now()       |                                                                                             |

INDEX: `(tenant_id, email)`

---

### platform.tenant_memberships

| Column          | Type        | Constraints                  | Notes |
| --------------- | ----------- | ---------------------------- | ----- |
| `membership_id` | UUID        | PK DEFAULT gen_random_uuid() |       |
| `tenant_id`     | UUID        | FK → tenants NOT NULL        |       |
| `user_id`       | UUID        | FK → users NOT NULL          |       |
| `role`          | CosRoleEnum | NOT NULL                     |       |
| `assigned_at`   | TIMESTAMPTZ | NOT NULL DEFAULT now()       |       |

UNIQUE: `(tenant_id, user_id)`

---

### platform.tenant_settings

Per-tenant configurable settings managed by `TENANT_ADMIN` (§20.7.8, ADR-028). One row per tenant.

| Column                     | Type         | Constraints            | Notes                             |
| -------------------------- | ------------ | ---------------------- | --------------------------------- |
| `tenant_id`                | UUID         | PK                     | One settings row per tenant       |
| `variance_alert_threshold` | DECIMAL(5,2) | NOT NULL DEFAULT 10.00 | Tenant default budget-variance %  |
| `retention_percentage`     | DECIMAL(5,2) | NOT NULL DEFAULT 5.00  | Tenant default retention %        |
| `line_channel_token`       | VARCHAR(512) | NULL                   | LINE Channel Access Token (§19.4) |
| `notifications_enabled`    | BOOLEAN      | NOT NULL DEFAULT TRUE  | Tenant-level notifications toggle |
| `updated_at`               | TIMESTAMPTZ  | NOT NULL DEFAULT now() |                                   |

---

### platform.audit_logs

| Column          | Type         | Constraints                  | Notes                              |
| --------------- | ------------ | ---------------------------- | ---------------------------------- |
| `log_id`        | UUID         | PK DEFAULT gen_random_uuid() |                                    |
| `tenant_id`     | UUID         | NOT NULL                     | Denormalized for query performance |
| `actor_id`      | UUID         | NOT NULL                     | FK → users                         |
| `action`        | VARCHAR(255) | NOT NULL                     |                                    |
| `resource_type` | VARCHAR(100) | NOT NULL                     |                                    |
| `resource_id`   | UUID         | NULL                         |                                    |
| `ip_address`    | INET         | NULL                         |                                    |
| `user_agent`    | TEXT         | NULL                         |                                    |
| `occurred_at`   | TIMESTAMPTZ  | NOT NULL DEFAULT now()       |                                    |
| `metadata`      | JSONB        | NULL                         |                                    |

INDEX: `(tenant_id, occurred_at DESC)`

---

### platform.vendor_identities

Cross-tenant vendor network identity (ADR-030). **No `tenant_id`** — a vendor is a network
participant, not a tenant member. No RLS (platform schema is exempt). Tier-1 (magic-link) needs no
account; `keycloak_user_id` is populated only when a Tier-2 account is claimed.

| Column               | Type         | Constraints                  | Notes                                  |
| -------------------- | ------------ | ---------------------------- | -------------------------------------- |
| `vendor_identity_id` | UUID         | PK DEFAULT gen_random_uuid() |                                        |
| `email`              | VARCHAR(255) | UNIQUE NOT NULL              | Network-unique vendor contact email    |
| `display_name`       | VARCHAR(255) | NOT NULL                     |                                        |
| `keycloak_user_id`   | VARCHAR(255) | UNIQUE NULL                  | NULL until a Tier-2 account is claimed |
| `is_active`          | BOOLEAN      | NOT NULL DEFAULT true        |                                        |
| `created_at`         | TIMESTAMPTZ  | NOT NULL DEFAULT now()       |                                        |
| `updated_at`         | TIMESTAMPTZ  | NOT NULL DEFAULT now()       |                                        |

---

### platform.vendor_trading_relationships

Binds a network vendor identity to a tenant's internal vendor record (ADR-030; analogous to
`platform.tenant_memberships`). One vendor identity → many relationships → many tenants.

| Column               | Type        | Constraints                     | Notes                                    |
| -------------------- | ----------- | ------------------------------- | ---------------------------------------- |
| `relationship_id`    | UUID        | PK DEFAULT gen_random_uuid()    |                                          |
| `vendor_identity_id` | UUID        | FK → vendor_identities NOT NULL |                                          |
| `tenant_id`          | UUID        | FK → tenants NOT NULL           |                                          |
| `vendor_id`          | UUID        | NOT NULL                        | FK → tenant-scoped `procurement.vendors` |
| `status`             | VARCHAR(20) | NOT NULL DEFAULT 'ACTIVE'       | CHECK ∈ (ACTIVE, REVOKED)                |
| `created_at`         | TIMESTAMPTZ | NOT NULL DEFAULT now()          |                                          |

UNIQUE: `(tenant_id, vendor_identity_id)`

---

### platform.sync_tombstones

Generic deletion tracking for offline sync. `GET /sync/delta` reads this table to return `deleted[]`
to mobile clients (so a row deleted on the server is removed from the device's local cache). Lives in
the `platform` schema (cross-domain) and is tenant-isolated by the standard single PERMISSIVE
`rls_tenant_isolation` policy (§11.0). Per-entity delete→tombstone wiring is deferred (the contract is
complete; until each entity records here, `deleted[]` is empty).

| Column         | Type        | Constraints                  | Notes                               |
| -------------- | ----------- | ---------------------------- | ----------------------------------- |
| `tombstone_id` | UUID        | PK DEFAULT gen_random_uuid() |                                     |
| `tenant_id`    | UUID        | NOT NULL                     | RLS isolation key                   |
| `entity_type`  | VARCHAR(64) | NOT NULL                     | e.g. `task`, `issue`, `site_report` |
| `entity_id`    | UUID        | NOT NULL                     | server id of the deleted row        |
| `deleted_at`   | TIMESTAMPTZ | NOT NULL DEFAULT now()       | delta cursor compares `> since`     |

INDEX: `(tenant_id, entity_type, deleted_at)` — the delta lookup path.

---

## 11.2 Core Entities

Projects :

- project_id
- tenant_id
- project_code
- project_name
- project_type (enum: residential / commercial / infrastructure / industrial)
- status
- budget
- start_date
- end_date
- estimated_completion_date — nullable DATE; entered by PM manually (PATCH /api/v1/projects/:id); used as input for
  AI delay risk detection (falls back to end_date when null)
- work_hours_start / work_hours_end — nullable TIME (ADR-072); the project's standard daily working
  window (the smallest slice of a Primavera "project calendar"). Backs the mobile dashboard time strip
  and a future HR/timesheet baseline; NULL projects render no strip.

ProjectRisk (projects schema — risk register, post-MVP, ADR-065) :

- risk_id
- tenant_id
- project_id (FK → Projects)
- title
- description
- category (ENUM: SAFETY / FINANCIAL / SCHEDULE / TECHNICAL / EXTERNAL / OTHER)
- likelihood (1–5)
- impact (1–5)
- risk_score (= likelihood × impact — 1–25 heat-map band)
- mitigation
- owner (user_id)
- status (ENUM: OPEN / MITIGATING / CLOSED / ACCEPTED)
- source (ENUM: MANUAL / AI_SUGGESTED — Layer B AI delay-risk may create AI_SUGGESTED for human triage)
- created_by, created_at

CommunicationRecord (projects schema — document-control, post-MVP, ADR-066) :

- record_id
- tenant_id
- project_id (FK → Projects)
- record_type (ENUM: SITE_INSTRUCTION / MEETING_MINUTES / CORRESPONDENCE)
- title
- body
- record_date
- linked_task_id (nullable — related RFI/task)
- created_by, created_at

ActionItem (projects schema — minutes action items, post-MVP, ADR-066) :

- action_id
- tenant_id
- record_id (FK → CommunicationRecord)
- description
- owner (user_id)
- due_date
- status (ENUM: OPEN / DONE)
- created_at

Building :

- building_id
- tenant_id
- project_id
- building_name
- building_type
- status

Floor :

- floor_id
- tenant_id
- building_id
- floor_number

Room :

- room_id
- tenant_id
- floor_id (FK → Floor)
- room_number
- room_type
- area_sqm

Unit :

- unit_id
- tenant_id
- building_id
- project_id
- unit_number
- unit_type
- status

Project Phases : (schema: `projects.project_phases` — ADR-070)

A per-project ordered list of construction execution phases (a WBS top level). Populated by BIM
Structure Import (`IfcBuildingStorey → project phases`, §13.4 `phasesCreated`) or entered by the PM;
distinct from `projects.status` (coarse lifecycle) and from `task.work_type` (a task category).

- phase_id
- project_id (FK → Project; ON DELETE CASCADE)
- tenant_id
- seq (INTEGER — display/derivation order; unique per (tenant_id, project_id) via uq_project_phases_seq)
- name (free-form — no fixed taxonomy; matches BIM `IfcBuildingStorey` names)
- status (ENUM via CHECK: NOT_STARTED / IN_PROGRESS / COMPLETED — default NOT_STARTED)
- planned_start / planned_end (nullable DATE)
- actual_start / actual_end (nullable DATE)

The **current phase** is derived, not stored (ADR-070): lowest-`seq` phase with status `IN_PROGRESS`;
else the lowest-`seq` phase not `COMPLETED`; else none. Phases are not linked to tasks in this
increment (no `task.phase_id`); a task↔phase link + status rollup is a documented follow-up.

Tasks :

- task_id
- tenant_id
- project_id
- task_name
- work_type (task category — values include: construction / rfi / administrative; configurable per tenant)
- status (not_started / in_progress / completed / blocked / cancelled)
- floor_id (nullable — FK → Floor; not all tasks are floor-specific)
- room_id (nullable — FK → Room; not all tasks are room-specific)
- boq_item_id (nullable — FK → BOQ; links task to a BOQ line item)
- assigned_to (FK → Employee.employee_id)
- planned_start
- planned_end
- actual_start
- progress_percent (INTEGER 0–100; conflict resolution: Max-wins — see §17.5)
- qc_status (ENUM: none / qc_hold / qc_passed — default none)

Note on Task Completion Gates : A task may only transition to status = completed when ALL
of the following gates pass (server-side validation — not enforced offline).

Hard blocks — system rejects completion :

1. Inspections — no linked inspection with result = fail or status = requires_reinspection
2. Issues — no linked issue with issue_type IN (defect, rework, punch) and status = open
3. Dependencies — all predecessor tasks (via BOQ hierarchy DEPENDS_ON) have status = completed
4. Permit — no linked permit with status IN (expired, revoked)
5. Safety — no linked safety incident with status = open and severity IN (high, critical)
6. Delay — task.status != blocked (delay event auto-sets status = blocked on detection)
7. Material — linked BOQ item's PO has at least one delivery record (corrected 2026-08-22:
   `deliveries` has no status column and none was ever declared; a row means goods were received,
   since delivered_at and received_by are both NOT NULL)

Warn only — UI warning shown; completion still allowed :

1. Budget 85%–99% — BOQ item actual cost >= 85% of budget → orange warning banner in UI
2. Budget >= 100% — BOQ item actual cost >= 100% of budget → red warning banner + PM acknowledgement click required

BOQ :

- boq_item_id
- tenant_id
- project_id
- category
- quantity
- unit
- unit_cost
- estimated_total
- variation_order_id (nullable FK → VariationOrder — post-change BOQ lines, ADR-059)
- central_price_id (nullable FK → platform.central_price_catalog — ราคากลาง reference, ADR-061)
- reference_price (DECIMAL(19,4) nullable — snapshot of ราคากลาง central price at line creation, ADR-061)
- price_variance (DECIMAL(19,4) nullable — unit_cost − reference_price, ADR-061)

Note (ราคากลาง, ADR-061) : `reference_price` is looked up from `platform.central_price_catalog` by item
code. Two modes — (a) reference_price + variance shown against the entered `unit_cost`; (b) auto-populate
`unit_cost` from the central price (editable). The catalog is platform-shared (SYSTEM_ADMIN-managed).

central_price_catalog (platform schema — ราคากลาง shared reference, post-MVP, ADR-061) :

- price_id
- code (item/material code)
- description
- unit
- central_price (DECIMAL(19,4))
- currency_code
- effective_period (year/version)
- source (ENUM: MANUAL_IMPORT / GOV_API)
- source_ref
- published_at, is_active

Note : cross-tenant shared (platform schema, RLS-exempt); ingested via SYSTEM_ADMIN file import OR a
`CentralPriceAdapter` (Strategy pattern, §13.3) against กรมบัญชีกลาง/e-GP when available (⚠️ API availability
to verify at integration). Tenants read-only.

Procurement — Purchase Request (PR) :

- pr_id
- tenant_id
- project_id
- pr_number (VARCHAR(50); UNIQUE per tenant. Server-allocated as `PR-<year>-<seq>` when the client
  omits it — a site engineer must not have to invent a unique document number on their phone)
- requested_by (FK → Employee.employee_id)
- required_date
- status (draft / submitted / approved / rejected / po_created)
- created_at

Procurement — PR Line Item :

- line_id
- pr_id (FK → Purchase Request; ON DELETE CASCADE)
- tenant_id
- material_id (nullable — FK → Material catalogue; free text stays authoritative, a site shortage is
  never blocked on cataloguing it first)
- description
- quantity (DECIMAL(10,4); CHECK > 0)
- unit
- sort_order
- created_at

Note : the requested materials are line items, not columns on the PR (product-owner decision
2026-07-16). §11 previously put a single `description` / `quantity` / `unit` on the PR itself; none
of the three were ever implemented, so a request could record that someone asked for something but
not what — and one PR could only ever have carried one material. Line items mirror `po_line_items`,
which the downstream PO already uses. They carry no `unit_price` / `line_total`: a request states a
need, and pricing appears only once vendors quote against the RFQ (§32.6).

Procurement — RFQ :

- rfq_id
- tenant_id
- project_id
- pr_id (FK → Procurement — Purchase Request)
- rfq_number
- deadline_date
- status (open / closed / cancelled)
- created_by
- created_at

Procurement — RFQ Invitation (Vendor Portal Tier-1 magic-link) :

- invitation_id
- tenant_id
- rfq_id (FK → Procurement — RFQ)
- vendor_identity_id (FK → `platform.vendor_identities`; NULL if invited by raw email only)
- invited_email
- token_hash (single-use; never store the raw token)
- expires_at (5–15 min window)
- status (pending / responded / expired)
- created_at

Procurement — Quotation :

- quotation_id
- tenant_id
- rfq_id (FK → Procurement — RFQ)
- vendor_id (FK → Vendor)
- unit_price
- total_price
- lead_time_days
- validity_date
- status (pending / selected / rejected)
- submitted_at

Procurement — Purchase Order (PO) :

- po_id
- tenant_id
- project_id
- rfq_id (FK → Procurement — RFQ)
- quotation_id (FK → Procurement — Quotation — the selected quotation)
- vendor_id (FK → Vendor)
- po_number
- total_amount
- expected_delivery_date
- status (draft / approved / fulfilled / cancelled)
- approved_by
- created_at

Procurement — Delivery :

- delivery_id
- tenant_id
- po_id (FK → Procurement — Purchase Order)
- project_id
- quantity_delivered
- delivery_date
- received_by (FK → Employee.employee_id)
- status (pending / partial / complete)
- created_at

Procurement — Vendor Invoice :

- vendor_invoice_id
- tenant_id
- po_id (FK → Procurement — Purchase Order)
- vendor_id (FK → Vendor)
- invoice_number
- amount
- due_date
- status (pending / approved / paid)
- approved_by
- created_at

Note : Vendor Invoice (AP — Accounts Payable) records what the platform owes to a vendor
after delivery. It is distinct from Billing (AR — Accounts Receivable) in the Financials
section, which records what clients owe to the contractor for completed work.

Inventory :

- inventory_id
- tenant_id
- project_id
- material_id
- warehouse_id (FK → Warehouse — WMS, ADR-060)
- quantity_on_hand
- unit
- reorder_level
- average_unit_cost (DECIMAL(19,4) — moving average, ADR-060)
- stock_value (DECIMAL(19,4) — quantity_on_hand × average_unit_cost, ADR-060)
- last_updated

Warehouse (procurement schema — WMS, post-MVP, ADR-060) :

- warehouse_id
- tenant_id
- project_id (nullable — site store vs central)
- name
- location
- is_active

StockMovement (procurement schema — stock ledger, post-MVP, ADR-060) :

- movement_id
- tenant_id
- warehouse_id (FK → Warehouse)
- material_id
- movement_type (ENUM: RECEIPT / ISSUE / TRANSFER / ADJUSTMENT)
- quantity (signed)
- unit_cost (DECIMAL(19,4) — at movement)
- source_type (ENUM: GRN / CONSUMPTION / TRANSFER / MANUAL)
- source_id
- moved_at, moved_by

GoodsReceiptNote (procurement schema — GRN, post-MVP, ADR-060) :

- grn_id
- tenant_id
- po_id (FK → Procurement — Purchase Order)
- delivery_id (FK → Procurement — Delivery)
- warehouse_id (FK → Warehouse)
- received_by, received_at, status
- GRN lines: material_id, qty_received, unit

Note : A GRN creates `StockMovement(RECEIPT)` → increments `Inventory.quantity_on_hand` and recomputes the
moving average `new_avg = (old_qty·old_avg + recv_qty·recv_cost)/(old_qty + recv_qty)`. GRN is **stock-only**
— no cost transaction; cost recognition stays PO → COMMITTED, vendor invoice → ACTUAL (Phase 7). Material
Consumption emits `StockMovement(ISSUE, CONSUMPTION)`.

Material Consumption :

- consumption_id
- tenant_id
- project_id
- material_id (FK → Material)
- inventory_id (FK → Inventory — the inventory record drawn from)
- quantity_consumed
- consumed_by (FK → Employee.employee_id)
- consumed_at
- task_id (nullable — FK → Tasks; links consumption to a specific task)

Note : Material Consumption is an append-only log. Each consumption event creates a new
row; Inventory.quantity_on_hand is updated in tandem but does not replace this record.
This separation supports offline sync conflict strategy (see 17-offline-mobile-sync
section 17.5 — append-only) and preserves the full consumption audit trail.

Site Reports :

- report_id
- tenant_id
- project_id
- report_date
- weather
- manpower_count
- completed_work
- blockers

Issues (site_ops schema) :

- issue_id
- issue_number (nullable — human-readable `ISS-<year>-<seq>`, unique per tenant, generated at create;
  mirrors pr_number; pre-existing rows stay NULL — ADR-069)
- tenant_id
- project_id
- report_id (nullable — FK → Site Reports)
- task_id (nullable — FK → Tasks; links issue to a specific task; completion gate #2)
- title
- description
- issue_type (ENUM: defect / rework / punch / general — default general)
- severity (low / medium / high / critical)
- status (open / in_progress / resolved / closed)
- assigned_to (nullable — FK → Employee.employee_id)
- resolution_note (nullable)
- client_submitted_at
- modified_at
- created_at

Note : issue_type distinguishes task-blocking issues (defect / rework / punch) from general
site issues (general). When issue_type IN (defect, rework, punch) and status = open,
the linked task cannot be marked completed (gate #2). Conflict resolution: FIELD_LEVEL_MERGE
(description / resolution_note: last-writer-wins; status: server wins; photos: union).

Note : `photos: union` resolves WHICH photos are attached — that set only ever grows, so attaching
a photo cannot conflict. It does NOT resolve a photo's own contents. A photo's annotation (the
retained-mode stroke list of ADR-056) is editable after sync, so it carries its own strategy,
`CONFLICT_FLAGGED` — see 17-offline-mobile-sync §17.5.

QC Inspection Template :

- qc_template_id
- tenant_id
- template_name
- inspection_type (structural / architectural / MEP / finishing / safety_compliance)
- status (active / archived)
- created_by
- created_at

Inspections :

- inspection_id
- tenant_id
- project_id
- qc_template_id (FK → QC Inspection Template)
- task_id (nullable — FK → Tasks; links inspection to a specific task; see VALIDATED_BY in §10.3)
- result (pass / fail / conditional)
- issue_severity (low / medium / high / critical — nullable; populated when result is fail or conditional)
- photos
- issue_status

Note : qc_template_id references a QC Inspection Template defined above. issue_severity
records the severity of defects found when result is fail or conditional; it is null when
result is pass. QC Inspection Templates are separate from Safety — Checklists — the latter
records completed safety checklist instances, not QC form structure.
task_id links this inspection to a specific task for the completion gate check (gate #1).

Financials — Cost Transaction :

- transaction_id
- tenant_id
- project_id
- cost_category (material / labor / equipment / overhead)
- amount
- reference_id (FK to source record: po_id, vendor_invoice_id, attendance_id, etc.)
- reference_type (purchase_order / vendor_invoice / attendance / other)
- transaction_date
- recorded_by

Financials — Budget Line :

- budget_line_id
- tenant_id
- project_id
- boq_item_id (FK → BOQ — optional; nullable for overhead lines)
- category
- allocated_amount
- spent_amount
- period (month or budget cycle label)

Financials — Payment :

- payment_id
- tenant_id
- project_id
- vendor_invoice_id (FK → Procurement — Vendor Invoice)
- vendor_id (FK → Vendor)
- amount
- payment_date
- payment_method
- status (scheduled / released / reconciled)
- released_by

Financials — Retention :

- retention_id
- tenant_id
- contract_id (FK → Contract)
- amount_retained
- retention_percent — DECIMAL(5,2); set by TENANT_ADMIN per PO in UI; no system default; nullable
  (NULL = 0%: no retention clause applies to this PO)
- scheduled_release_date
- status (held / partially_released / released)

Financials — Billing :

- billing_id
- tenant_id
- project_id
- contract_id (FK → Contract)
- billing_number
- amount
- due_date
- status (draft / issued / paid)
- issued_at

Note : Billing (AR — Accounts Receivable) records amounts the contractor invoices to the
client for completed work milestones. It is distinct from Vendor Invoice (AP) in the
Procurement section.

Financials — AR Receipt :

- ar_receipt_id
- tenant_id
- project_id
- billing_id (FK → Financials — Billing)
- customer_id (FK → Customer)
- amount_received
- received_date
- payment_method
- payment_reference
- received_by (FK → Employee.employee_id)
- created_at

Note : AR Receipt records the actual client payment received against a billing invoice.
Symmetric to Financials — Payment (AP) — both provide a full audit trail of cash movement.
When AR Receipt is created, Financials — Billing status transitions to paid.
This supports accurate cash flow tracking and forecasting (see 09-data-architecture section 9.5).

Contract :

- contract_id
- tenant_id
- project_id
- contract_type (main_contract / subcontract / supply_agreement)
- contract_value (nullable — total contract amount; required for main_contract; may be null for framework agreements)
- customer_id (nullable — FK → Customer; populated for main_contract — client-side contracts)
- vendor_id (nullable — FK → Vendor; populated for subcontract / supply_agreement contracts)
- status (draft / signed / active / terminated) — `signed` is the state the `ContractSigned` event
  (16-enterprise-event-flow §16.2) announces; billing milestones and retention run against `active`
- signed_document_id (nullable — FK → File; the attached/generated contract document that is signed, ADR-058)

Note : Contract covers both client-side and vendor-side agreements.
main_contract = contractor ↔ client/owner — customer_id populated, vendor_id null;
contract_value on main_contract is the basis for retention percentage calculation
(see Financials — Retention) and billing milestone tracking (see Financials — Billing).
subcontract / supply_agreement = contractor ↔ vendor — vendor_id populated, customer_id null.

ContractSignature (finance schema — client contract signing, ADR-058) :

- signature_id
- tenant_id
- contract_id (FK → Contract)
- signer_party (ENUM: INTERNAL / CLIENT) — INTERNAL = contractor-side authorized role; CLIENT = external client
- signer_identity (user_id for INTERNAL; captured name + email/phone for CLIENT)
- credential_ref (VC / DID reference returned by CredentialService — §5.4; PKI/digital-certificate signature)
- document_hash (SHA-256 of `Contract.signed_document_id` content at signing time)
- signed_at
- ip_address
- magic_link_token_id (nullable — populated for CLIENT; single-use token per ADR-030 pattern)
- verification_status (ENUM: VERIFIED / PENDING / FAILED)

Note : `Contract.status = signed` is reached only when BOTH a valid INTERNAL and a valid CLIENT signature
exist and verify; the transition emits `ContractSigned` (§16.2). Signature rows + document hash are written
to the immutable/WORM audit log (§9). Data classification: RESTRICTED (contains signatory identity).

VariationOrder (finance schema — change management, post-MVP, ADR-059) :

- vo_id
- tenant_id
- contract_id (FK → Contract)
- project_id
- vo_number
- title
- description
- vo_value (DECIMAL(19,4) — signed change to the contract: + addition / − omission)
- currency_code
- status (ENUM: DRAFT / SUBMITTED / APPROVED / REJECTED)
- source_claim_id (nullable FK → Claim — set when the VO originated from an accepted claim)
- approved_by, approved_at, created_by, created_at

Note : On `APPROVED`, in one transaction — `Contract.contract_value += vo_value`;
`project_budgets.allocated_amount += vo_value`; create BOQ delta lines tagged `variation_order_id`;
emit `VariationOrderApproved` (§16). Approval reuses the AR chain (PM ≤ limit → Executive, ADR-024).
`boq_items` gains `variation_order_id` (nullable FK → VariationOrder) so BOQ reflects post-change scope
while preserving the original baseline.

Claim (finance schema — contractor claim, post-MVP, ADR-059) :

- claim_id
- tenant_id
- contract_id (FK → Contract)
- project_id
- claim_type (ENUM: TIME / COST / BOTH)
- description
- claimed_amount (DECIMAL(19,4) nullable), claimed_days (INT nullable)
- status (ENUM: SUBMITTED / UNDER_REVIEW / ACCEPTED / REJECTED)
- converted_vo_id (nullable FK → VariationOrder — set on ACCEPTED; a claim converts to a VO)
- created_by, created_at

Bond (finance schema — bank guarantees, post-MVP, ADR-063) :

- bond_id
- tenant_id
- contract_id (nullable FK → Contract)
- tender_id (nullable FK → Tender — for bid bonds)
- bond_type (ENUM: BID / PERFORMANCE / ADVANCE / RETENTION / WARRANTY)
- issuer_bank
- bond_number
- amount (DECIMAL(19,4))
- currency_code
- issue_date, expiry_date
- status (ENUM: ISSUED / ACTIVE / RELEASED / EXPIRED / CALLED)
- created_by, created_at

Note (ADR-063) : a scheduled check emits `BondExpiring` before `expiry_date` → Notification service (§19)
alerts Finance/PM. `CALLED` records a bond drawn by the beneficiary. Bonds are recorded, not bank-issued.

CRM — Lead :

- lead_id
- tenant_id
- contact_name
- company
- status
- source
- assigned_to

Note : contact_name and company capture the initial point-of-contact details when a lead
is first logged (before a formal Contact record exists). Once qualified, Contact records
(CRM — Contact) are created and linked via lead_id. Lead.contact_name and Contact.name
may overlap — Lead fields are the initial capture; CRM — Contact is the full structured
person record.

CRM — Opportunity :

- opportunity_id
- tenant_id
- lead_id
- title
- value
- status
- expected_close_date
- assigned_to

CRM — Contact :

- contact_id
- tenant_id
- lead_id
- name
- email
- phone
- role

Customer :

- customer_id
- tenant_id
- opportunity_id (FK → CRM — Opportunity — the won opportunity this customer was created from)
- company_name
- customer_type
- status

Material :

- material_id
- tenant_id
- material_name
- material_type
- unit
- unit_cost

Vendor :

- vendor_id
- tenant_id
- vendor_name
- vendor_type
- status
- contact_name
- contact_email
- contact_phone

Employee :

- employee_id
- tenant_id
- full_name
- employee_code
- employment_type (FTE / daily_labor / subcontractor)
- role
- department
- status
- contact_phone
- created_at

Workforce (Site Attendance) :

- attendance_id
- tenant_id
- worker_id (FK → Employee.employee_id)
- project_id
- role_on_site
- check_in
- check_out
- timesheet_date

Note : employee_id identifies the person in the master record.
worker_id in site context is attendance_id — not a separate identity.

Safety — Incidents :

- incident_id
- tenant_id
- project_id
- task_id (nullable — FK → Tasks; links incident to a specific task; see IMPACTS in §10.3)
- incident_type
- severity (low / medium / high / critical)
- reported_by
- status (open / in_progress / resolved / closed)
- created_at

Note : task_id links this incident to a specific task for the completion gate check (gate #5).
When severity IN (high, critical) and status = open, the linked task cannot be marked completed.

Safety — Checklists :

- checklist_id
- tenant_id
- project_id
- checklist_type
- completed_by
- status
- created_at

Equipment :

- equipment_id
- tenant_id
- project_id
- equipment_type
- status
- assigned_to

Permit :

- permit_id
- tenant_id
- project_id
- permit_type (work_permit / safety_permit / drawing_approval / entry_permit / building_permit / license)
- issuing_authority (nullable — municipality / กรมโยธาธิการ for building permits; licensing body for licences, ADR-064)
- permit_number
- issued_by
- valid_from
- valid_until
- status (pending / active / expired / revoked)
- linked_task_id (optional — links permit to a specific task)
- created_by
- created_at

Note (ADR-064) : `project_id` is nullable for company licences (tenant-level, not project-scoped). A
scheduled check emits `PermitExpiring` before `valid_until` → Notification service (§19) alerts PM / Tenant
Admin (same pattern as `BondExpiring`, ADR-063). Building permits (อ.1 / อ.6) and company licences share
this register with the existing site/safety permits.

Assets :

- asset_id
- tenant_id
- project_id
- asset_type
- handover_date
- warranty_expiry
- maintenance_status

---

Tender (crm schema — e-GP / Preconstruction, post-MVP, ADR-062) :

- tender_id
- tenant_id
- egp_ref (e-GP project number — nullable for manual)
- title
- agency
- budget_amount (DECIMAL(19,4))
- announcement_date
- submission_deadline
- source (ENUM: EGP_API / MANUAL)
- status (ENUM: WATCHING / PREPARING / SUBMITTED / WON / LOST)
- created_by, created_at

Bid (crm schema — e-GP / Preconstruction, post-MVP, ADR-062) :

- bid_id
- tenant_id
- tender_id (FK → Tender)
- bid_amount (DECIMAL(19,4))
- boq_snapshot_ref (BOQ used to price the bid; lines carry `reference_price` from ราคากลาง, ADR-061)
- status (ENUM: DRAFT / SUBMITTED)
- submitted_at
- result (ENUM: WON / LOST — nullable)

Note (ADR-062) : ingested via `EgpAdapter` (Strategy pattern, §13.3) OR manual entry (⚠️ e-GP API
availability unverified). A `WON` result emits `TenderWon` → the Finance service creates a `main_contract`
(customer = government agency) via the event (no cross-schema write).

## 11.3 CRM Entity Lifecycle

```text
Lead → (qualify) → Opportunity → (win) → Customer

```

- Lead : first point of contact, not yet qualified
- Opportunity : qualified lead with commercial intent, tied to lead_id
- Contact : a person record — associated to Lead (N contacts per Lead); accessible from Customer via lead_id
  chain (Customer → Opportunity → Lead → Contact)
- Customer : created upon Opportunity won — references original lead_id via opportunity

Relationship :

- Contact.lead_id → Lead.lead_id (contact belongs to a lead)
- Opportunity.lead_id → Lead.lead_id
- Customer.opportunity_id → Opportunity.opportunity_id (traceability from win back to lead)
- Customer is a separate entity from Contact — Customer is the company/account, Contact is the person

---

## 11.4 Architectural Principle

Every record includes :

- tenant_id
- created_by
- created_at
- updated_at
- deleted_at (nullable — soft delete; NULL = active, non-NULL = logically deleted)
- audit metadata

Project-scoped records additionally include :

- project_id

Soft Delete :

All records use soft delete (deleted_at timestamp). Hard deletes are not permitted in
production data. This preserves audit trail integrity, supports data retention policies
(see 09-data-architecture section 9.5), and prevents FK cascade failures in multi-tenant
environments.

All queries must filter WHERE deleted_at IS NULL by default, unless explicitly
querying deleted records (e.g., audit log replay, admin recovery).

PII Erasure :

Entities that store PII fields additionally carry a `pii_erased_at` field (nullable
timestamp). This implements the right-to-erasure requirement under **PDPA Section 37**
and **GDPR Article 17**.

PII-bearing entities and the fields subject to erasure:

| Entity        | PII Fields Subject to Erasure                    |
| ------------- | ------------------------------------------------ |
| Employee      | `full_name`, `contact_phone`                     |
| Vendor        | `contact_name`, `contact_email`, `contact_phone` |
| CRM — Lead    | `contact_name`                                   |
| CRM — Contact | `name`, `email`, `phone`                         |

> **Note on `lead_id` FK:** `Contact.lead_id` is intentionally retained after PII erasure.
> It is a business relationship identifier (non-PII) required for audit trail integrity and
> FK consistency. Only the PII fields listed above are nullified.

Erasure procedure :

1. Nullify all PII fields listed above for the target entity (set to `NULL`)
2. Set `pii_erased_at = NOW()` — records the erasure timestamp for compliance audit
3. Do NOT set `deleted_at` unless the record is also being logically deleted — erasure
   and deletion are independent operations
4. Do NOT delete the row — the entity `id` and `tenant_id` must remain for FK integrity
   and audit trail
5. Emit a structured audit log entry:
   `{ event: "pii.erased", entity_type, entity_id, tenant_id, erased_by, erased_at }`

Query behaviour after erasure :

- End-user-facing views must filter `WHERE pii_erased_at IS NULL` for any view that
  renders PII fields — erased records are invisible to regular users
- Admin and audit views may display erased records with `[ERASED]` placeholder values
  in nullified fields

The four lifecycle states of a record:

| `deleted_at` | `pii_erased_at` | Meaning                                                              |
| ------------ | --------------- | -------------------------------------------------------------------- |
| NULL         | NULL            | Active record — normal state                                         |
| Set          | NULL            | Logically deleted — standard soft delete; PII preserved for audit    |
| NULL         | Set             | PII erased — right-to-erasure exercised; record operationally active |
| Set          | Set             | Fully completed lifecycle — deleted and PII erased                   |

See 05-security-compliance section 5.3 for the full PDPA / GDPR compliance strategy.

---

## 11.5 Files Schema (`files`)

The `files` schema (registered in §11.0) backs the File Service. Its tables live in
`backend/prisma/schema.prisma` and were not enumerated here before — the same as `notifications`,
`ai`, and the telemetry schemas, whose §11.0 registry entry is authoritative and whose tables are
owned by their service. The set is enumerated here now because a new sibling (`photo_annotations`)
joins it (ADR-056), and a table cannot reference a parent that the spec never names.

`stored_files` (`files.files`) — one row per uploaded object :

- file_id (PK)
- tenant_id
- original_filename
- stored_key (object key in the bucket)
- bucket_name
- mime_type
- file_size_bytes
- file_status (ENUM: PENDING_SCAN / CLEAN / QUARANTINED — ClamAV gate, §5.9.4)
- uploaded_by (FK → Employee)
- uploaded_at
- deleted_at (nullable — soft delete, §11.4)
- quarantined_at (nullable)

`file_metadata` (`files.file_metadata`) — open key/value metadata attached to a file :

- metadata_id (PK)
- file_id (FK → stored_files)
- tenant_id
- entity_type (nullable — the kind of record the file is attached to, e.g. `issue`, `inspection`)
- entity_id (nullable — that record's id)
- metadata_key
- metadata_value (nullable)

`photo_annotations` (`files.photo_annotations`) — the re-editable markup on a photo (ADR-056) :

- annotation_id (PK)
- file_id (FK → stored_files; the photo being marked up)
- tenant_id
- strokes (JSONB — retained-mode stroke list; coordinates NORMALISED 0..1 so one list renders at any
  resolution; never a flattened raster — the flattened image is exported to a separate `stored_files` row)
- version (INT — bumped on every save; the concurrency token that makes `CONFLICT_FLAGGED` detectable)
- modified_by (FK → Employee)
- modified_at
- created_at
- deleted_at (nullable — soft delete, §11.4)

Note : one annotation row per photo (`file_id` unique per tenant). Conflict resolution is
`CONFLICT_FLAGGED` — on sync the server compares the client's base `version` against the stored one;
a mismatch means someone else edited the same photo offline, so the write is flagged for
`SITE_ENGINEER` review rather than merged or overwritten (17-offline-mobile-sync §17.5). RLS per the
§11.0 template applies to all three tables.

---

## 11.6 Credentials Schema (`credentials`)

The `credentials` schema backs CredentialService (W3C DID/VC — ADR-019, spec §5.3 BG-001), the MVP
prerequisite for client contract signing (ADR-058) and BG-001 worker/equipment/training credentials.
Tenant-scoped (RLS by `tenant_id`); data classification **RESTRICTED**. Created by migration
`20260720000002_credentials` (raw SQL, like the other domain schemas — not Prisma-modelled).

**Roles (ADR-019):** ISSUER = persistent per-tenant `did:web` (Ed25519 key in Vault/AWS SM, ADR-013 — only
`key_ref` is stored here, never the private key); SIGNER (contract signing) = ephemeral `did:key` (no
stored key). VC format = `Ed25519Signature2020` (JSON-LD Data Integrity); revocation = W3C Status List 2021.

`did_documents` :

- did_document_id (PK)
- tenant_id
- did (VARCHAR — `did:web:…` issuer / `did:key:…` signer; UNIQUE per tenant)
- method (ENUM: WEB / KEY)
- did_role (ENUM: ISSUER / SIGNER)
- did_document (JSONB — resolved DID Document)
- encrypted_private_key (nullable TEXT — AES-256-GCM ciphertext of the issuer private key, ADR-035; master
  key via env `APP_SECRET_ENCRYPTION_KEY` from SM/Vault; NULL for an ephemeral signer)
- status (ENUM: ACTIVE / ROTATED / REVOKED)
- created_at

`revocation_status_lists` (W3C Status List 2021) :

- status_list_id (PK)
- tenant_id
- purpose (ENUM: REVOCATION)
- status_list_credential (JSONB — signed StatusList VC)
- encoded_list (TEXT — base64url gzip bitstring)
- capacity, next_index, version
- created_at, updated_at

Lifecycle (CS-6): one list per tenant, provisioned lazily on the first revocable issuance and signed by
that tenant's `did:web` issuer. Each worker VC claims `next_index` atomically (conditional
`UPDATE … RETURNING`) in the same transaction as the VC row, and carries the position as a W3C
`StatusList2021Entry` `credentialStatus`. Revoking flips the bit, re-signs the credential and bumps
`version`, in the same transaction as `verifiable_credentials.status = REVOKED`. A new list is
provisioned once `next_index` reaches `capacity`. Published unauthenticated at
`https://{issuerDomain}/tenants/{tenant_id}/status-lists/{status_list_id}` — the URL embedded in every
revocable VC — mirroring the `did.json` layout (§5.9.8).

`verifiable_credentials` :

- vc_id (PK)
- tenant_id
- credential_type (ENUM: LICENCE / EQUIPMENT_CERT / TRAINING_RECORD / CONTRACT_SIGNATURE)
- issuer_did, subject_did
- credential (JSONB — signed VC, Ed25519Signature2020)
- document_hash (VARCHAR nullable — SHA-256 hex; set for CONTRACT_SIGNATURE)
- status (ENUM: ACTIVE / REVOKED / EXPIRED)
- status_list_id (FK → revocation_status_lists, nullable), status_list_index (nullable — bit position)
- issued_at, expires_at (nullable), created_at

Note : worker VCs are revocable (occupy a status-list bit); ephemeral contract-signature VCs are
point-in-time (non-revocable). Verification is offline/cryptographic (BG-001 — no platform call).

`audit_log` (immutable — QM-4; §5.9.8) :

- audit_id (PK)
- tenant_id
- actor_id (x-user-id of the caller)
- action (CREDENTIAL_ISSUED / CREDENTIAL_REVOKED)
- resource_type ('verifiable_credential'), resource_id (vc_id, nullable)
- metadata (JSONB, nullable)
- occurred_at

Note : written in the same tenant transaction as the issue/revoke it records (no un-audited change);
`app_user` is granted SELECT + INSERT only (no UPDATE/DELETE) — append-only. RLS by tenant_id.

## References

| ID               | Title                                                                | Source                                                                          |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [IEEE 830]       | IEEE Recommended Practice for Software Requirements                  | IEEE Std 830-1998                                                               |
| [PostgreSQL]     | PostgreSQL Documentation                                             | [postgresql/docs](https://www.postgresql.org/docs/)                             |
| [UUID-RFC]       | A Universally Unique Identifier (UUID) URN Namespace                 | RFC 4122                                                                        |
| [Avro]           | Apache Avro Specification                                            | [avro/docs/current](https://avro.apache.org/docs/current/spec.html)             |
| [PostgreSQL-RLS] | PostgreSQL Row Security Policies                                     | [postgresql/docs](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) |
| [ISO-8601]       | Data Elements and Interchange Formats — Date and Time Representation | ISO 8601:2004                                                                   |

> 📎 See also: [05-security-compliance](05-security-compliance.md)
> · [07-multi-tenant-architecture](07-multi-tenant-architecture.md)
> · [09-data-architecture](09-data-architecture.md)
> · [10-construction-ontology](10-construction-ontology.md)
> · [12-construction-knowledge-graph](12-construction-knowledge-graph.md)
