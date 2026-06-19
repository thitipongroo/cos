---
title: 'Database Schema'
version: '1.4.0'
status: Active
last_updated: '2026-06-05'
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

CREATE POLICY tenant_isolation ON {schema}.{table}
  AS RESTRICTIVE
  USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid);
```

`app.current_tenant_id` is set by the application at the start of each request.

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

| Column             | Type         | Constraints                  | Notes                                            |
| ------------------ | ------------ | ---------------------------- | ------------------------------------------------ |
| `user_id`          | UUID         | PK DEFAULT gen_random_uuid() |                                                  |
| `tenant_id`        | UUID         | FK → tenants NOT NULL        |                                                  |
| `keycloak_user_id` | VARCHAR(255) | UNIQUE NOT NULL              | Path A: phone_number; Path B: Keycloak UUID      |
| `email`            | VARCHAR(255) | NOT NULL                     | Path A: empty string; Path B: actual email       |
| `display_name`     | VARCHAR(255) | NOT NULL                     |                                                  |
| `is_active`        | BOOLEAN      | NOT NULL DEFAULT true        |                                                  |
| `mfa_enabled`      | BOOLEAN      | NOT NULL DEFAULT false       |                                                  |
| `mfa_totp_secret`  | VARCHAR(255) | NULL                         | TOTP secret; NULL until MFA enrollment completes |
| `created_at`       | TIMESTAMPTZ  | NOT NULL DEFAULT now()       |                                                  |
| `updated_at`       | TIMESTAMPTZ  | NOT NULL DEFAULT now()       |                                                  |

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
- estimated_completion_date — nullable DATE; entered by PM manually (PATCH /api/v1/projects/:id); used as input for AI delay risk detection (falls back to end_date when null)

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
7. Material — linked BOQ item's PO has at least one delivery with status != pending

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

Procurement — Purchase Request (PR) :

- pr_id
- tenant_id
- project_id
- requested_by (FK → Employee.employee_id)
- description
- quantity
- unit
- required_by_date
- status (draft / submitted / approved / rejected)
- created_at

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
- quantity_on_hand
- unit
- reorder_level
- last_updated

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
- status

Note : Contract covers both client-side and vendor-side agreements.
main_contract = contractor ↔ client/owner — customer_id populated, vendor_id null;
contract_value on main_contract is the basis for retention percentage calculation
(see Financials — Retention) and billing milestone tracking (see Financials — Billing).
subcontract / supply_agreement = contractor ↔ vendor — vendor_id populated, customer_id null.

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
- permit_type (work_permit / safety_permit / drawing_approval / entry_permit)
- permit_number
- issued_by
- valid_from
- valid_until
- status (pending / active / expired / revoked)
- linked_task_id (optional — links permit to a specific task)
- created_by
- created_at

Assets :

- asset_id
- tenant_id
- project_id
- asset_type
- handover_date
- warranty_expiry
- maintenance_status

---

## 11.3 CRM Entity Lifecycle

```text
Lead → (qualify) → Opportunity → (win) → Customer

```

- Lead : first point of contact, not yet qualified
- Opportunity : qualified lead with commercial intent, tied to lead_id
- Contact : a person record — associated to Lead (N contacts per Lead); accessible from Customer via lead_id chain (Customer → Opportunity → Lead → Contact)
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

## References

| ID               | Title                                                                | Source                                                                          |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [IEEE 830]       | IEEE Recommended Practice for Software Requirements                  | IEEE Std 830-1998                                                               |
| [PostgreSQL]     | PostgreSQL Documentation                                             | [postgresql/docs](https://www.postgresql.org/docs/)                             |
| [UUID-RFC]       | A Universally Unique Identifier (UUID) URN Namespace                 | RFC 4122                                                                        |
| [Avro]           | Apache Avro Specification                                            | [avro/docs/current](https://avro.apache.org/docs/current/spec.html)             |
| [PostgreSQL-RLS] | PostgreSQL Row Security Policies                                     | [postgresql/docs](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) |
| [ISO-8601]       | Data Elements and Interchange Formats — Date and Time Representation | ISO 8601:2004                                                                   |

> 📎 See also: [09-data-architecture](09-data-architecture.md) · [10-construction-ontology](10-construction-ontology.md) · [12-construction-knowledge-graph](12-construction-knowledge-graph.md) · [07-multi-tenant-architecture](07-multi-tenant-architecture.md) · [05-security-compliance](05-security-compliance.md)
