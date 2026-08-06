---
title: 'UX Flow'
version: '1.6.0'
status: Active
last_updated: '2026-07-10'
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
- [20.5 Internationalisation and Localisation](#205-internationalisation-and-localisation)
- [20.6 Web Application — Authentication and Session](#206-web-application--authentication-and-session)
- [20.7 Web Application — Page Inventory per Role](#207-web-application--page-inventory-per-role)
- [20.8 Accessibility (WCAG 2.2 AA)](#208-accessibility-wcag-22-aa)

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
- `/admin/central-prices` — ราคากลาง catalog: import (CSV/Excel) + API-sync status + browse (ADR-061).
  Tenant-facing: the BOQ editor surfaces `reference_price` / variance + a project BOQ-vs-ราคากลาง view.

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

## 20.5 Internationalisation and Localisation

### Language Support

| Language | Status | Scope                                   |
| -------- | ------ | --------------------------------------- |
| Thai     | MVP    | All UI strings, error messages, reports |
| English  | MVP    | All UI strings, error messages, reports |

All UI strings must be externalised via the i18n library — no hardcoded human-readable
text in component source. Thai is the primary field language for site workers.

### Locale Codes and File Convention

- **Default locale:** `en-US` (product-owner decision 2026-07-26 — overrides the original `th-TH`
  default). **Fallback locale:** `en-US`. Users switch to `th-TH` in-app; Buddhist Era display
  (configurable per tenant — see Thai-specific Rules below) still applies when Thai is selected.
- **Locale negotiation:** honour the `Accept-Language` HTTP header for API responses; a user's
  stored profile locale overrides the header when present.
- **Translation file location:** `apps/{web,mobile}/src/i18n/{locale}.json` — one file per locale
  per app, applying to **both** the web app and the React Native mobile app.
- **i18n key format:** `{domain}.{screen}.{element}` (e.g. `procurement.list.emptyState`).
- **Plural forms:** use ICU MessageFormat syntax for any count-dependent string — never assume
  English plural rules apply to other locales.

### Thai-specific Rules

- Date format: `DD/MM/YYYY` (Buddhist Era optional, configurable per tenant)
- Currency: THB as default for Thai tenants; format `฿1,234,567.89`
- Phone numbers: displayed as `(+66) 0XX-XXX-XXXX` — the dial code in parentheses, then the national
  number with its leading trunk `0` and hyphen groups. Amended 2026-08-06; the rule previously said
  only `0XX-XXX-XXXX`, which dropped the country from a screen a person may be reading precisely to
  check which number the platform holds for them. Storage is unchanged: E.164 (`+66811000003`) on
  the wire and in the database, this format on screen only.
  - **Other countries keep their own grouping**, not Thailand's. The dial code is stripped, the
    national number is grouped by that country's convention, and the same parenthesised `(+CC)`
    prefix is applied. A number whose country has no grouping rule on file is shown as stored rather than
    forced into 3-3-4 — a wrongly grouped phone number reads as a typo in the record.
- Number separators: `.` for decimal, `,` for thousands (standard Thai business convention)

### Localisation Gap Tracking

Thai-specific business rules that have no direct international equivalent (e.g., WHT
calculation logic, BoT regulatory fields, Buddhist Era dates) must be:

1. Tagged in source code with `// i18n: TH-SPECIFIC`
2. Documented in `docs/i18n/localization-gaps.md` before the feature merges

`docs/i18n/localization-gaps.md` is the authoritative registry of all TH-specific rules.
It must be reviewed before adding support for any new country (VN, SG, MY, ID) to ensure
TH-specific logic is not silently applied to non-TH tenants.

---

## 20.6 Web Application — Authentication and Session

> **Platform:** `apps/web/` (Next.js + Serwist) — tablet/laptop browser, online + offline
> (deployable: `32-implementation-specifications` §32.2).
> **Scope:** the web app is a **full operational client** for all roles — not a dashboard-only
> surface. It renders the same authentication paths and RBAC model defined for the platform;
> it introduces **no new auth mechanism**. Authoritative auth spec: §5.4
>
> the React Native app also renders
> **both** paths — Path A (phone + OTP) for field roles AND Path B (email/password via Keycloak OIDC)
> for office/management roles on their smartphone. Same §5.4 mechanism, no new auth. See
> `context/00_master_construction_os.md` §Phase 10 Auth.

### 20.6.1 Login

The web login renders **both** authentication paths already defined in §5.4 (master Phase 2):

| Path                      | Users                                                                           | Mechanism                                 | Route        |
| ------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------- | ------------ |
| Path B — email + password | Office / management (PM, Finance, Executive, Tenant Admin, Procurement, Safety) | Keycloak OIDC (OAuth2), RS256 JWT         | `/login`     |
| Path A — phone + SMS OTP  | Field roles on tablet (Site Engineer, Site Worker)                              | Custom OTP module → Keycloak Direct Grant | `/login/otp` |

- **MFA (TOTP):** required for `TENANT_ADMIN` and `FINANCE` (§5.4; master Phase 2) — MFA challenge
  page shown after primary factor succeeds.
- **Session:** Keycloak-issued JWT — access token 15 min, refresh token 7 days, with native
  Keycloak refresh-token rotation (`refreshTokenMaxReuse: 0`) per §5.4 (step 6). The web client
  consumes this same session model; no web-specific token lifetime is introduced.
- **Post-login routing:** redirect to the role's landing page (first row of that role's table in
  §20.7), resolved from the JWT `role` claim.
- **Logout:** `/logout` clears the local session and performs Keycloak RP-initiated logout.
- **Device trust (mobile Path A):** the OTP verification screen shows a trusted/untrusted device
  indicator — green when the device is trusted, red when not. "Trusted" is a **server-side fact**, not
  a client claim: the mobile app holds a non-extractable P-256 key (Secure Enclave / Android Keystore)
  whose SPKI public key is registered per user in `platform.trusted_devices`; the device proves
  possession by signing a single-use challenge (`/auth/otp/request` → `challenge`, verified at
  `/auth/otp/attest` → `deviceTrusted`) **before** the OTP step, so the banner shows a real state while
  the user enters the code. Login (`/auth/otp/verify`) is plain OTP and never gated on trust. Trust is
  **earned** — a device is untrusted on its first
  login (the OTP is the authenticator) and enrols on success, so the next login from it is trusted;
  trust has a 30-day sliding window and can be revoked (`/auth/devices`). Device trust is **additive
  and non-blocking**: a failed check only shows red, it never prevents login. See ADR-054. The
  hardened **v2 — platform attestation (Play Integrity on Android / App Attest on iOS, via
  `@expo/app-integrity`, verified server-side) — is no longer deferred: it was accepted on
  2026-08-04 (ADR-082)**, because the device-integrity rows on the transparency portal
  (security patch level, root/jailbreak state) and the trust score of ADR-081 have no other honest
  source. Attestation keeps ADR-054's safety property: it is additive and non-blocking, its registry
  columns are nullable (absent attestation is a distinct state from failed), and it never gates
  login. The `deviceId`/`signature` fields are optional in the OTP API
  (`docs/api/auth.openapi.yaml`).

### 20.6.2 Web Application Shell (all authenticated pages)

- **Role-filtered navigation:** left sidebar + top bar; visible items are filtered by the JWT
  `role` claim (RBAC) — a role never sees navigation for pages it cannot access.
- **In-app notifications:** notification bell fed by SSE (`19-notification-architecture` §19.2,
  §19 "active in web UI") — never WebSocket.
- **Offline indicator + sync status:** PWA offline support via Serwist + IndexedDB
  (Phase 10 Target B). Offline-capable pages mirror the mobile sync entities (site reports,
  issues, inspections, deliveries); read views are served from cache when offline.
- **Language switcher:** `th` / `en` per §20.5.
- **Layout convention:** list views use **data tables** (web/desktop design tokens —
  `32-implementation-specifications` §32.7 "table content"); the mobile no-tables rule does
  **not** apply to web.
- **Authorization:** every page enforces RBAC (role claim) + ABAC (`project_membership`,
  `tenant_match`, `resource_ownership`) per master Phase 2 / §6.

---

## 20.7 Web Application — Page Inventory per Role

> **Derivation:** each page below maps to (a) the role's documented needs in §20.2, (b) the
> per-role mobile navigation in master Phase 10 (where enumerated), and (c) the module APIs in
> §14 / master Phases 3–7, 14, 20–22. Routes follow API resource names. No page introduces a
> capability not already specified for that role.
> **Tenant-scoping:** all routes are within the authenticated tenant; SYSTEM_ADMIN cross-tenant
> pages are the separate `/admin` panel in §20.4.

### 20.7.1 Executive (`EXECUTIVE`)

Source: §20.2 Executive; master Phase 10 EXEC nav; Analytics (Phase 14) + AI reports (Phase 12).

| Route        | Page              | Purpose                                                                         | Source                                                          |
| ------------ | ----------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `/`          | Portfolio home    | KPI summary: active projects, total budget vs actual, open critical issues      | `GET /api/v1/analytics/executive`                               |
| `/portfolio` | Portfolio         | Project list with status chips + budget-variance badge; drill to project health | Analytics + Project APIs                                        |
| `/alerts`    | Risk alerts       | Delay risk, budget overrun, critical issues sorted by severity                  | `finance.variance.alert`, `construction.delay.detected`, issues |
| `/reports`   | Executive reports | AI executive summaries per project                                              | `POST /api/v1/ai/reports/executive-summary`                     |

### 20.7.2 Project Manager (`PROJECT_MANAGER`)

Source: §20.2 PM; master Phase 10 PM nav; Phases 3, 5, 6, 14.

| Route                           | Page               | Purpose                                                                    | Source                                                          |
| ------------------------------- | ------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `/projects`                     | Projects           | List/create projects; filter by status/type                                | Phase 3 Project APIs                                            |
| `/projects/{id}`                | Project detail     | Status transitions, members, documents, BOQ summary                        | Phase 3 + Phase 4                                               |
| `/projects/{id}/procurement`    | Procurement status | RFQ/PO status (read), delivery tracking                                    | Phase 5 (read)                                                  |
| `/projects/{id}/finance`        | Budget variance    | Budget vs actual vs committed (read)                                       | Phase 7 (read)                                                  |
| `/projects/{id}/site`           | Site summary       | Site report summary, issue triage                                          | Phase 6                                                         |
| `/projects/{id}/risks`          | Risk register      | Likelihood×impact heat map; raise/mitigate/close; AI-suggested triage      | §14, ADR-065                                                    |
| `/projects/{id}/communications` | Doc-control        | Site instructions / meeting minutes / correspondence + action-item tracker | §14, ADR-066                                                    |
| `/analytics/pm/{projectId}`     | PM dashboard       | Manpower trend, issues by severity, inspection rate, procurement KPIs      | `GET /api/v1/analytics/pm/{projectId}` (Phase 14 — implemented) |

### 20.7.3 Procurement Officer / Procurement Manager (`PROCUREMENT_OFFICER`, `PROC_MANAGER`)

Source: §20.2 Procurement Officer; master Phase 10 Procurement nav; Phase 5.

| Route                     | Page                 | Purpose                                                                      | Source               |
| ------------------------- | -------------------- | ---------------------------------------------------------------------------- | -------------------- |
| `/procurement/requests`   | Purchase requests    | PR list/create                                                               | Phase 5              |
| `/procurement/rfqs`       | RFQs                 | RFQ list/detail; `PROC_MANAGER` approve/cancel (EVALUATED→AWARDED/CANCELLED) | Phase 5 RFQ workflow |
| `/procurement/quotations` | Quotation comparison | Compare quotations, mark selected                                            | Phase 5              |
| `/procurement/orders`     | Purchase orders      | PO list + approval chain + delivery timeline                                 | Phase 5 PO workflow  |
| `/procurement/deliveries` | Deliveries           | Record/receive deliveries                                                    | Phase 5              |
| `/procurement/vendors`    | Vendors              | Vendor master, vendor scoring                                                | Phase 5              |
| `/procurement/warehouses` | Warehouses           | Warehouse list (site store / central)                                        | §14, ADR-060         |
| `/procurement/inventory`  | Inventory            | Stock-on-hand by warehouse/material; low-stock (reorder) view                | §14, ADR-060         |
| `/procurement/grn`        | Goods receipt        | Receive against deliveries (GRN); stock-movement ledger                      | §14, ADR-060         |

### 20.7.4 Finance (`FINANCE`)

Source: §20.2 Finance; master Phase 10 FINANCE nav; Phase 7.

| Route                                | Page               | Purpose                                                                                         | Source                                 |
| ------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------- |
| `/finance/payments`                  | Payments           | Pending payment approvals; approve/record payment                                               | Phase 7                                |
| `/finance/budget/{projectId}`        | Budget             | Budget vs actual vs committed; budget lines                                                     | Phase 7                                |
| `/finance/invoices`                  | Invoices           | Invoice list/detail; verify/approve/dispute                                                     | Phase 5/7 invoice flow                 |
| `/finance/reports/variance`          | Variance report    | Budget variance across projects                                                                 | `GET /api/v1/finance/reports/variance` |
| `/finance/contracts`                 | Contracts          | Contract list; create; open detail                                                              | §14 `finance/contracts`                |
| `/finance/contracts/{id}`            | Contract detail    | Attach/generate document · contractor sign (PKI/VC) · issue client magic-link · signature audit | §14, ADR-058                           |
| `/finance/contracts/{id}/variations` | Variation Orders   | VO list/detail; create/submit/approve; BOQ + budget delta                                       | §14, ADR-059                           |
| `/finance/claims`                    | Claims             | Claim list/detail; submit/accept (→ VO)/reject                                                  | §14, ADR-059                           |
| `/finance/bonds`                     | Bonds              | Bank-guarantee register (type/bank/amount/expiry/status) + expiry alerts                        | §14, ADR-063                           |
| `/compliance/permits`                | Permits & licences | Permit/licence register (building permit + company licence) + expiry alerts                     | §14, ADR-064                           |

### 20.7.5 Site Engineer (`SITE_ENGINEER`)

Source: §20.2 Site Engineer; master Phase 10 SITE_ENGINEER nav; Phase 6.

| Route               | Page                | Purpose                                             | Source                      |
| ------------------- | ------------------- | --------------------------------------------------- | --------------------------- |
| `/site/reports`     | Site reports        | Review/submit daily site reports; manpower overview | Phase 6                     |
| `/site/issues`      | Issues              | Issue list, triage, escalation                      | Phase 6                     |
| `/site/inspections` | Inspections         | Inspection results, approval/re-inspection          | Phase 6                     |
| `/site/conflicts`   | Conflict resolution | Resolve `ConflictRecord` (offline sync conflicts)   | Phase 6 `/conflict-records` |

### 20.7.6 Site Worker (`SITE_WORKER`)

Source: §20.2 Site Engineer needs; master Phase 10 SITE_WORKER nav; Phases 6, 22.
Mobile-primary role; web pages provide the same functions for tablet use.

| Route               | Page             | Purpose                                       | Source             |
| ------------------- | ---------------- | --------------------------------------------- | ------------------ |
| `/tasks`            | Tasks            | Assigned task list; progress update           | Phase 6 task gates |
| `/site/reports/new` | Daily report     | Submit daily site report (manpower, blockers) | Phase 6            |
| `/site/issues/new`  | Quick issue      | Report an issue with photo                    | Phase 6            |
| `/site/checklists`  | Safety checklist | Complete assigned safety checklist            | Phase 6 safety     |

### 20.7.7 Safety Officer (`SAFETY_OFFICER`)

Source: §20.2 Safety Officer + §21.2 MVP Safety scope (incident reports, checklists, work permits,
permit approval). **Derived from role needs** — master Phase 10 does not enumerate a Safety Officer
mobile nav; the functions are specified in §20.2 + §21.2 + master §9 (safety permit approval chain).

| Route                | Page              | Purpose                                             | Source                   |
| -------------------- | ----------------- | --------------------------------------------------- | ------------------------ |
| `/safety/incidents`  | Incidents         | Report/track safety incidents                       | §21.2 Safety; Phase 6    |
| `/safety/checklists` | Safety checklists | Manage/review safety checklists                     | §21.2 Safety; Phase 6    |
| `/safety/permits`    | Work permits      | Permit approval (Safety Officer approves; PM final) | master §9 approval chain |
| `/safety/compliance` | Compliance        | Compliance status + violation alerts                | §20.2 Safety Officer     |

### 20.7.8 Tenant Admin (`TENANT_ADMIN`)

Source: master Phase 2 User Management API (§14.3) + tenant settings. Full access to all
tenant pages above, plus tenant administration. (Distinct from the SYSTEM_ADMIN `/admin` panel in §20.4.)

| Route              | Page            | Purpose                                                                  | Source                                    |
| ------------------ | --------------- | ------------------------------------------------------------------------ | ----------------------------------------- |
| `/settings/users`  | User management | List/create users (Path A phone / Path B email), change role, deactivate | master Phase 2 User Management API        |
| `/settings/tenant` | Tenant settings | Variance thresholds, retention %, LINE channel token, notification prefs | Phases 7, 20 tenant-configurable settings |

### 20.7.9 Viewer (`VIEWER`)

Source: RBAC role definition (master Phase 2 — read-only across modules, per project assignment).

- Read-only access to the pages of whichever modules the viewer is assigned to (per
  `project_membership`). No create/edit/approve actions are rendered.

### 20.7.10 CRM / Sales Manager (`CRM_SALES_MANAGER`)

Source: §11.3 CRM lifecycle + §14 CRM APIs. Basic CRM UI is MVP (ADR-029; §21.6 updated). Advanced
CRM UI (pipeline kanban, dashboards, proposal generation) remains post-MVP.

| Route                | Page          | Purpose                                                | Source     |
| -------------------- | ------------- | ------------------------------------------------------ | ---------- |
| `/crm/leads`         | Leads         | List / create leads                                    | §11.3, §14 |
| `/crm/opportunities` | Opportunities | Create opportunity from a lead; convert won → Customer | §11.3, §14 |
| `/crm/customers`     | Customers     | Read-only customer list (`finance.customers`)          | §11.3, §14 |

### 20.7.11 System Admin (`SYSTEM_ADMIN`)

- Cross-tenant platform administration is the separate **`/admin` panel** specified in §20.4 —
  not part of the tenant-scoped page set above.

### 20.7.12b Asset Management (post-MVP)

Source: module permissions §06 §6.4 (Asset Management); entities §11 §11.2 (Unit, Assets).
**IA decision: Hybrid** — tenant-level asset registry +
project-scoped handover entry (registry: Yardi Voyager / MRI standalone pattern, aligned
with the V3 direction in §28.9; handover: Procore / Autodesk Construction Cloud
project-closeout pattern).

| Route                 | Page           | Purpose                                                   | Source      |
| --------------------- | -------------- | --------------------------------------------------------- | ----------- |
| `/assets/units`       | Unit inventory | Unit list (unit_number, unit_type, status)                | §6.4, §11.2 |
| `/projects/{id}`      | Handover tab   | Record handover; emits `AssetHandedOver`; writes registry | §6.4, §11.2 |
| `/assets/warranty`    | Warranty       | warranty_expiry tracking (`WarrantyActivated`)            | §6.4, §11.2 |
| `/assets/maintenance` | Maintenance    | maintenance_status (`MaintenanceScheduled`)               | §6.4, §11.2 |

### 20.7.12c Preconstruction (post-MVP)

Source: §01 §1.2 (Phase-2 extensions to the CRM Service). **UI decision (product owner,
2026-07-10): separate "Preconstruction" nav section** (Procore Preconstruction /
Autodesk BuildingConnected pattern — tender & bid management as its own product area);
backend remains a CRM Service extension per §01 §1.2.

| Route                          | Page                | Purpose                                                          | Source            |
| ------------------------------ | ------------------- | ---------------------------------------------------------------- | ----------------- |
| `/preconstruction/feasibility` | Feasibility studies | Feasibility study capability                                     | §01 §1.2          |
| `/preconstruction/land`        | Land acquisition    | Land acquisition capability                                      | §01 §1.2          |
| `/preconstruction/tenders`     | Tenders             | e-GP tender feed (sync/manual) + status; award import → Contract | §01 §1.2, ADR-062 |
| `/preconstruction/bids`        | Contractor bids     | BOQ-priced bid prep (ราคากลาง) + submit (adapter/manual)         | §01 §1.2, ADR-062 |

> Detailed screen contents for both sections are elaborated in `DESIGN.md` §15.3 /
> §15.10; capability-level scope only is defined here until each phase begins.

### 20.7.12 Vendor Portal (`VENDOR_PORTAL`)

Source: §28 Vendor portal capabilities. External vendor-network users — **not** a
tenant-scoped role. Served by a **separate `/vendor` section** (its own `app/vendor/layout.tsx`,
outside the `(app)` AppShell) with a minimal external shell — no internal nav / role switcher,
matching SAP Ariba Network / Coupa Supplier Portal / Procore (external portal is a separate surface).

| Route                     | Page         | Purpose                                                 | Auth tier        |
| ------------------------- | ------------ | ------------------------------------------------------- | ---------------- |
| `/vendor/rfq/[token]`     | RFQ response | Open an invited RFQ and submit a quotation (magic-link) | Tier 1 (no acct) |
| `/vendor`                 | Dashboard    | Invited RFQs + linked POs overview                      | Tier 2 (account) |
| `/vendor/quotations`      | Quotations   | Submitted-quotation history                             | Tier 2           |
| `/vendor/purchase-orders` | PO status    | Track status of POs on linked trading relationships     | Tier 2           |
| `/vendor/invoices`        | Invoices     | Submit and track the vendor's own invoices              | Tier 2           |

---

## 20.8 Accessibility (WCAG 2.2 AA)

**Conformance target: WCAG 2.2 Level AA** for every user-facing screen (web + React Native mobile).
For Construction OS this is an operational-usability requirement, not only compliance: primary users
are field workers on a phone one-handed, in direct sunlight, wearing gloves, often with situational
or permanent motor/vision limitations.

Native mobile maps WCAG intent to OS a11y APIs: iOS **VoiceOver** / Dynamic Type, Android
**TalkBack** / font scale. React Native uses `accessibilityLabel`, `accessibilityRole`,
`accessibilityState`, `accessible` on every interactive element.

### Required success criteria (the ones that bite for a field app)

| WCAG 2.2 SC                               | Requirement (as applied)                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.4.3 Contrast (Minimum)                  | Text contrast ≥ **4.5:1** (≥ 3:1 large text). Verify the §32.7 design tokens against a sunlight-readable floor.                                                     |
| 1.4.11 Non-text Contrast                  | UI components / state indicators (input borders, focus, chips) ≥ **3:1**.                                                                                           |
| 1.4.4 Resize Text                         | Layout must not break at **200% font scale**.                                                                                                                       |
| 2.5.8 Target Size (Minimum)               | Interactive targets ≥ **24×24 px** — already exceeded: buttons min 44px (see `32-implementation-specifications §32.7` / master §TOUCH TARGET STANDARDS). Keep this. |
| 2.5.7 Dragging Movements                  | Any drag (reorder, swipe-to-sync) has a single-pointer tap alternative.                                                                                             |
| 2.4.7 / 2.4.11 Focus Visible + Appearance | Visible, non-obscured keyboard/switch focus (web); logical focus order (RN).                                                                                        |
| 3.3.7 Redundant Entry                     | Don't re-ask data already provided in the same flow.                                                                                                                |
| 3.3.8 Accessible Authentication           | OTP login requires no cognitive test / no inaccessible CAPTCHA.                                                                                                     |
| 4.1.2 Name/Role/Value                     | Every control exposes an accessible name + role + state.                                                                                                            |

Non-negotiable for safety flows (incident / safety report): **color is never the only signal**
(WCAG 1.4.1) — pair with icon + text; safety alerts must be announced by the screen reader.

### Acceptance criteria / gate

- [x] Automated a11y lint in CI: `eslint-plugin-jsx-a11y` (web) + RN a11y checks — 0 errors on merge
      — **done 2026-08-03.** jsx-a11y runs at error level over `apps/web/src/**/*.tsx` via the root
      `eslint.config.mjs` (0 violations across 81 files); axe-core scans 6 routes in the Playwright
      suite; the Lighthouse accessibility category is gated at 1.0 (see §30.9).
- [x] Contrast audit of §32.7 tokens passes 4.5:1 / 3:1 (`docs/a11y/contrast-report.md`)
      — **audit done 2026-08-03, and it does NOT pass.** 7 findings (F1–F7) against the §32.7 tokens
      themselves, worst `--mobile-syncing #FFD60A` at 1.41:1 as a status indicator, and
      `--cos-dark-elevated #111827` at 1.14:1 as the dark-surface input border. Each hex is a §32.7
      product-owner decision, so none was changed — **awaiting product-owner decision.**
- [~] Every interactive RN component has `accessibilityLabel` + `accessibilityRole` (CI grep gate)
  — **gate built, target not met.** `scripts/a11y/check-rn-a11y.sh` runs in CI (`mobile-tests`).
  Measured 2026-08-03: 24 of the 50 `apps/mobile` files with tappable elements have no
  accessibility prop at all. It runs as a **ratchet** — warns on the 24, fails when the count
  grows — because failing on the existing 24 would only mean disabling the check.
- [ ] Manual screen-reader pass (VoiceOver + TalkBack) on the 5 critical flows (login, daily report,
      issue, safety incident, sync-status) — `docs/a11y/screenreader-checklist.md`
      — **checklist written 2026-08-03, no pass recorded yet.** Not automatable; this remains open.
- [x] Layout verified at 200% font scale on the smallest supported device (375pt)
      — **done 2026-08-03** for `/login`, via `expectUsableAt200PercentText` in the Playwright suite
      (375px viewport, asserts no horizontal overflow at `font-size: 200%`). The 5 authenticated
      routes it also covers need a backend + Keycloak, so their first run is the staging pipeline.
- **Gate:** a screen cannot ship if it fails automated a11y lint or lacks the screen-reader pass for
  a critical flow.

---

> 📎 See also: [06-rbac-permission-matrix](06-rbac-permission-matrix.md)
> · [13-product-architecture](13-product-architecture.md) · [21-mvp-scope](21-mvp-scope.md)
