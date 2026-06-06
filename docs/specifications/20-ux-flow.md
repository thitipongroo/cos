---
title: 'UX Flow'
version: '1.3.0'
status: Active
last_updated: '2026-06-06'
authors:
  - thitipongroo
related_docs:
  - 06-rbac-permission-matrix.md
  - 13-product-architecture.md
  - 21-mvp-scope.md
---

# 20. UX Flow

## Table of Contents

- [20.1 UX Philosophy](#201-ux-philosophy)
- [20.2 Role-based UX](#202-role-based-ux)
  - [Executive](#executive)
  - [Project Manager](#project-manager)
  - [Site Engineer](#site-engineer)
  - [Procurement Officer](#procurement-officer)
  - [Finance](#finance)
  - [Safety Officer](#safety-officer)
  - [CRM / Sales Manager](#crm--sales-manager)
- [20.3 Example Daily Site Workflow](#203-example-daily-site-workflow)
- [20.4 SYSTEM_ADMIN Panel](#204-system_admin-panel)

---

## 20.1 UX Philosophy

Construction workers do NOT behave like SaaS office users.

Therefore UX MUST be :

- Mobile-first
- Offline-capable
- Low cognitive load
- Fast data entry
- Voice/photo friendly
- WhatsApp/LINE-like simplicity
- Role-based simplicity

---

## 20.2 Role-based UX

### Executive

Needs :

- Portfolio health
- Risk alerts
- Cash flow
- Margin forecast
- Delay prediction

### Project Manager

Needs :

- Schedule tracking
- Procurement status
- Budget variance
- Site blockers

### Site Engineer

Needs :

- Daily tasks
- Drawing access
- Inspection forms
- Material requests

### Procurement Officer

Needs :

- RFQs
- Vendor comparisons
- Delivery tracking

### Finance

Needs :

- Cost recognition
- Payment approvals
- Cash flow

### Safety Officer

Needs :

- Safety checklists
- Incident reporting
- Safety compliance status
- Violation alerts

### CRM / Sales Manager

Needs :

- Lead pipeline
- Opportunity tracking
- Proposal generation
- Contract management

---

## 20.3 Example Daily Site Workflow

Morning :

1. Worker check-in
2. Task assignment
3. Material verification
4. Safety checklist

During work :

1. Progress updates
2. Photo uploads
3. Issue reporting
4. RFI submission (Request for Information — recorded as a Task record with work_type: rfi,
   linked to project_id and optionally to a BOQ item or drawing; see 11-database-schema Tasks)

End of day :

1. Daily report generation
2. Cost updates
3. Delay/risk analysis
4. Executive summary

AI Copilot assists at key steps.

MVP AI scope (Layer A — Assistive only) :

- Daily report generation
- Voice transcription for field notes
- OCR for drawings and invoices
- Document summarization

Layer B (Analytical — predictions) and Layer C (Autonomous — auto-actions) activate post-MVP.
See 21-mvp-scope for full AI phasing.

---

## 20.4 SYSTEM_ADMIN Panel

Internal platform administration UI. Accessible only to users with the `SYSTEM_ADMIN` role.
Not visible to tenant users.

### Access

- Route: `/admin` (protected — SYSTEM_ADMIN role required)
- Authentication: same Keycloak JWT flow as the main application
- All actions are logged to `platform.audit_logs`

### 20.4.1 Tenant List

**Purpose:** View and manage all tenants on the platform.

**Displays per row:**

| Field        | Notes                                             |
| ------------ | ------------------------------------------------- |
| Tenant code  | Unique slug                                       |
| Tenant name  | Display name                                      |
| Plan type    | STARTER / PROFESSIONAL / ENTERPRISE               |
| Status       | Active / Inactive                                 |
| Dedicated DB | — (shared) or URL hostname (dedicated, truncated) |
| Created at   | Date                                              |

**Actions per row:** View detail · Deactivate · Assign Dedicated DB (ENTERPRISE only)

### 20.4.2 Create Tenant

**Purpose:** Provision a new tenant on the platform.

**Form fields:**

| Field            | Required | Validation                          |
| ---------------- | -------- | ----------------------------------- |
| Tenant code      | Yes      | a-z, 0-9, underscore; 2-50 chars    |
| Tenant name      | Yes      | 2-255 characters                    |
| Plan type        | Yes      | STARTER / PROFESSIONAL / ENTERPRISE |
| Dedicated DB URL | No       | Must start with postgresql://       |

> Dedicated DB URL is optional at creation time — can be assigned later via §20.4.3.
> If plan type = ENTERPRISE and the DB is already provisioned, it may be set here directly.

**On submit:** calls `POST /api/v1/admin/tenants`

**Success state:** redirect to Tenant List with new tenant highlighted.

### 20.4.3 Assign Dedicated DB

**Purpose:** Route an enterprise tenant's domain queries to a dedicated PostgreSQL instance.

**Trigger:** operator clicks "Assign Dedicated DB" on a tenant row, or via tenant detail page.

**Prerequisites shown in UI (checklist before form is enabled):**

- [ ] Dedicated PostgreSQL instance provisioned and reachable
- [ ] `prisma migrate deploy` run against the dedicated DB
- [ ] Existing data migrated (if upgrading from shared DB)

**Form fields:**

| Field            | Required | Validation                                     |
| ---------------- | -------- | ---------------------------------------------- |
| Dedicated DB URL | Yes      | Must start with `postgresql://`; max 500 chars |

**On submit:** calls `PATCH /api/v1/admin/tenants/{tenantId}/dedicated-db`

**Success state:** tenant row in list shows dedicated DB hostname; routing takes effect immediately on next request.

**Warning shown before submit:**

> Once assigned, all new requests for this tenant will route to the dedicated DB.
> Ensure data migration is complete before proceeding.

### 20.4.4 Mark as Enterprise Contracted

**Purpose:** Signal that an Enterprise tenant has signed a contract requiring dedicated DB
isolation, triggering `EnterpriseProvisioningWorkflow` via Temporal.

**Trigger:** operator clicks "Mark as Contracted" on an ENTERPRISE tenant row.

**Prerequisites shown before button is enabled:**

- [ ] Tenant `plan_type` is `ENTERPRISE`
- [ ] Tenant `is_active` is `true`
- [ ] `dedicated_db_url` is currently `NULL` (not already provisioned)

**Confirmation dialog:**

> Marking `{tenant_name}` as contracted will start automated dedicated DB provisioning.
> This will create a new AWS RDS instance and run database migrations.
> The workflow will pause before data migration and notify you for approval.
> Type the tenant code to confirm: `[ _________ ]`

**On confirm:** calls `PATCH /api/v1/admin/tenants/{tenantId}/mark-contracted`

**Success state:** workflow started banner shown; tenant row in Tenant List displays
provisioning status badge ("Provisioning..."). SYSTEM_ADMIN receives in-app + email notification
when workflow reaches the human gate (before data migration step).

**Error states:**

| Condition                | Message shown                                   |
| ------------------------ | ----------------------------------------------- |
| Tenant not ENTERPRISE    | Button disabled — "ENTERPRISE plan required"    |
| Tenant inactive          | Button disabled — "Activate tenant first"       |
| Already has dedicated DB | Button hidden — "Dedicated DB already assigned" |

> See runbook: `docs/runbooks/dedicated-db-provisioning.md` for the full provisioning steps
> that the automated workflow executes.

### 20.4.5 Deactivate Tenant

**Purpose:** Suspend a tenant — prevents all logins and API access.

**Trigger:** operator clicks "Deactivate" on a tenant row.

**Confirmation dialog required:**

> Deactivating `{tenant_name}` will prevent all users from logging in.
> Tenant data is preserved. This action can be reversed by re-activating via the API.
> Type the tenant code to confirm: `[ _________ ]`

**On confirm:** calls `PATCH /api/v1/admin/tenants/{tenantId}/deactivate`

**Success state:** tenant row status changes to Inactive; row greyed out.

---

> 📎 See also: [06-rbac-permission-matrix](06-rbac-permission-matrix.md) · [13-product-architecture](13-product-architecture.md) · [21-mvp-scope](21-mvp-scope.md)
