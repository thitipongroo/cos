---
title: Construction OS — Priority Execution Context Commands
stage: BUILD — Priority Execution (MVP Phase 1–19)
lifecycle_position: 1
version: 1.0
last_updated: 2026-05-25
previous: null
next: 02_build_deep_systems.md
parallel_with: 02_build_deep_systems.md
authority: context-only
master: 00_master_construction_os.md
---

# Construction OS — Priority Execution Context Commands

> ---
>
> **⚠️ MASTER DOCUMENT REFERENCE — READ BEFORE EXECUTING**
>
> **Master document:** `00_master_construction_os.md`
> All technology decisions, architecture choices, EP resolutions, and platform
> specifications are defined there. This file provides execution context ONLY.
>
> **Lifecycle stage:** BUILD — Priority Execution (MVP Phase 1–19)
> **Previous:** None — this is the starting point
> **Next:** 02_build_deep_systems.md (parallel BUILD detail)
> **Note:** Use alongside 02_build_deep_systems.md for full build context. File 02 provides deep implementation detail for the same BUILD stage
> **Version:** 1.0
> **Last updated:** 2026-05-25
>
> ---

---

## CONTENTS

- [Master Command](#master-command)
- [Priority 0 — Foundation Infrastructure](#priority-0--foundation-infrastructure)
- [Priority 1 — Site Reporting](#priority-1--site-reporting)
- [Priority 2 — Procurement Visibility](#priority-2--procurement-visibility)
- [Priority 3 — Cost Tracking](#priority-3--cost-tracking)
- [Priority 4 — Mobile-first UX System](#priority-4--mobile-first-ux-system)
- [Priority 5 — AI Compatibility Layer](#priority-5--ai-compatibility-layer)
- [Dependency Map](#dependency-map)
- [Architectural Constraints](#architectural-constraints)
- [Measurable Success Metrics](#measurable-success-metrics)
- [Final Strategic Principle](#final-strategic-principle)

---

## MASTER COMMAND

```text
You are building ONLY the highest-priority operational core
of an AI-native Construction Operating System.

Do NOT attempt to build the entire enterprise platform immediately.

Immediate objective (in priority order):

1. Capture structured operational data daily
2. Solve the highest-pain daily field workflows
3. Create genuine workflow dependency
4. Maximize field adoption without training burden
5. Build a clean data foundation for future AI

Implementation scope — build ONLY these:

1. Foundation infrastructure (auth, tenant, event bus, data schema)
2. Site reporting
3. Procurement visibility
4. Cost tracking
5. Mobile-first UX
6. AI compatibility layer (extension points, not AI itself)

Do NOT build in this phase:

- marketplace or supplier network
- digital twin or BIM integration
- autonomous AI or AI agents
- smart city or IoT integration
- financing or insurance features
- advanced graph AI or ML models
- enterprise customization or SSO
- full ERP accounting

Core principle:
  Operational data quality first.
  Field adoption second.
  AI third — only after clean data exists.

The system must:

- be mobile-first (field workers are the primary users)
- work offline and recover gracefully on reconnect
- support weak and intermittent internet
- minimize typing for field workers
- minimize cognitive load
- support daily usage by non-technical users
- provide instant visibility to managers and executives

The system must NOT:

- feel like legacy ERP software
- require excessive form-filling
- require desktop for any field workflow
- depend on constant internet connectivity
- require more than 30 minutes of onboarding

Architecture stance:
  Start as a modular monolith.
  Kafka is an internal event bus within the monolith — not a signal to split services.
  Extract a service only when: (a) team ownership boundary is clear,
  and (b) the module is experiencing independent scaling pressure.
  Do not split prematurely.

All decisions must optimize for:

- field adoption rate (primary KPI)
- structured data capture quality
- offline reliability
- operational visibility speed
- execution simplicity

```

---

## PRIORITY 0 — FOUNDATION INFRASTRUCTURE

> **Why Priority 0:** Every subsequent Priority requires auth, tenant context,
> event bus, and normalized data schemas. Building P1 without these
> produces dirty data from day one and untestable APIs from day one.
> This Priority blocks all others — complete it fully before starting P1.

```text
Build Foundation Infrastructure.

This Priority is a prerequisite for everything else.
Do not begin Priority 1 until all exit criteria below are met.

--- Section A: Authentication & User Identity ---
📎 See also: 00_master_construction_os.md §Phase 2 — AUTHENTICATION + TENANT SYSTEM for deep auth implementation spec

Primary objective:
Enable secure, low-friction login for field workers and office users.

Field worker login requirements:

- Phone number + OTP (primary method — no password to forget)
- Biometric unlock after first login (Face ID / fingerprint)
- Session persists for 30 days minimum (field workers must not be

  logged out between shifts)

- Offline session: user remains authenticated for up to 7 days

  without internet, re-validates on reconnect

Office / manager login requirements:

- Email + password (secondary method)
- Future SSO hook (interface only — implementation deferred to file 02)

Generate:
MUST-HAVE:
  - OTP authentication service (SMS gateway integration)
  - JWT token issuance and refresh (short-lived access token,
    long-lived refresh token stored securely on device)
  - Session management (device-level, not browser session)
  - Role definitions: SYSTEM_ADMIN, TENANT_ADMIN, PROJECT_MANAGER,
    PROC_MANAGER, PROCUREMENT_OFFICER, FINANCE, SITE_ENGINEER, SITE_WORKER, VIEWER
  - RBAC middleware (enforce role on every API endpoint)
  - Auth API: POST /auth/request-otp, POST /auth/verify-otp,
    POST /auth/refresh, POST /auth/logout

NICE-TO-HAVE:
  - Biometric unlock (device-side, not server-side)
  - Email + password login path

Constraints:
  - Field workers must never be required to remember a password
  - Session must survive app backgrounding and device restart
  - Auth must work in offline mode (cached token validation)

--- Section B: Tenant Architecture ---

Primary objective:
Establish multi-tenant isolation before any data is written.

Tenant model decision:
  Strategy: Shared database, schema-per-tenant
  Rationale: Lowest operational complexity for MVP scale.
             Sufficient isolation for construction company data.
             Migrate to DB-per-tenant if compliance requires it later.

Tenant identity:
  - tenant_id: UUID, assigned at provisioning
  - subdomain: {tenant_slug}.constructionos.app
  - Tenant is a construction company (one company = one tenant)
  - Projects, users, and all operational data are scoped to tenant_id

Generate:
MUST-HAVE:
  - Tenant provisioning flow (admin creates tenant, assigns TENANT_ADMIN role)
  - Tenant context middleware (inject tenant_id into every request)
  - Schema-per-tenant setup scripts
  - Tenant isolation enforcement (query-level: all queries must include
    tenant_id filter — enforced by ORM base class, not per-developer)
  - Tenant provisioning API: POST /admin/tenants

Constraints:
  - No cross-tenant data access under any circumstances
  - Tenant isolation must be enforced at ORM level, not application logic
  - A developer must not be able to query cross-tenant data
    without explicitly bypassing the ORM base class

--- Section C: Event Bus Infrastructure ---
📎 See also: 00_master_construction_os.md §Phase 8 — EVENT-DRIVEN INFRASTRUCTURE for full Kafka + Schema Registry spec

Primary objective:
Establish internal event bus for operational event capture.
This is NOT a microservices signal — Kafka runs inside the monolith boundary.

Event bus decision:
  Technology: Kafka (internal to monolith in MVP)
  Rationale: Event sourcing from day one enables AI/analytics later
             without data migration. Events are append-only truth.
  Deployment: Single Kafka cluster, managed (Confluent Cloud or MSK)

Generate:
MUST-HAVE:
  - Kafka cluster setup (managed, not self-hosted for MVP)
  - Topic naming convention: {domain}.{entity}.{action}
    Examples: site.report.created, procurement.rfq.created
  - Topic configuration: retention 90 days, replication factor 2
  - Producer base class (all domain services publish through this)
  - Consumer group setup (analytics consumer, notification consumer)
  - Dead-letter topic per domain for failed events
  - Schema registry for event contracts (Avro or JSON Schema)
  - Event audit log (all published events persisted with timestamp)

NICE-TO-HAVE:
  - Kafka monitoring dashboard (consumer lag, throughput)
  - Dead-letter queue review interface

Constraints:
  - All Kafka producers must use the schema registry — no ad-hoc schemas
  - Events are immutable once published — no event deletion
  - Dead-letter events must alert on-call within 15 minutes

--- Section D: Structured Data Schema Foundation ---

Primary objective:
Define normalized entity schemas before any feature writes data.
Data written without this schema will be dirty and unrepairable.

Core entities to normalize (all features depend on these):

  Materials:
    - material_id (UUID), name, unit_of_measure, category,
      tenant_id, created_at, updated_at
    - category enum: concrete, steel, formwork, electrical,
      plumbing, finishes, equipment, other
    - unit_of_measure enum: kg, ton, m3, m2, m, unit, set, bag, roll

  Vendors:
    - vendor_id (UUID), name, tax_id, contact_name, contact_phone,
      contact_email, vendor_type, status, tenant_id, created_at

  Work Categories:
    - work_category_id, name, code, phase, tenant_id
    - Standard initial set: earthwork, foundation, structure, MEP,
      architecture, finishing, landscaping, commissioning

  Issue Categories:
    - issue_category_id, name, severity_default, tenant_id
    - Standard initial set: safety, quality, delay, material,
      equipment, weather, design, other

  Cost Categories:
    - cost_category_id, name, type (material/labor/equipment/overhead),
      tenant_id
    - Standard initial set aligned with work categories above

  Inspection Types:
    - inspection_type_id, name, checklist_template, tenant_id

  Projects:
    - project_id (UUID), name, code, status, start_date, end_date,
      budget_thb, PROJECT_MANAGER_id, tenant_id, created_at

Generate:
MUST-HAVE:
  - Database migration scripts for all entities above
  - ORM models with tenant_id enforcement
  - Seed data scripts for all enum/category tables
  - Validation rules (required fields, enum constraints, FK integrity)
  - Master data API: CRUD for materials, vendors, work categories
    (TENANT_ADMIN manages these via admin interface)
  - Data schema documentation (entity dictionary)

Constraints:
  - Free-text is forbidden for all fields that should be normalized
    (material names, vendor names, work categories must reference master data)
  - No feature may create a new entity type without adding it to this schema first
  - All tables must include: tenant_id, created_by, created_at, updated_at

--- Section E: API Foundation ---

Generate:
MUST-HAVE:
  - API versioning strategy: path-based prefix /api/v1/
  - API gateway (rate limiting, auth middleware, tenant context injection)
  - Health check endpoints: GET /health, GET /health/deep
  - Error response standard: {error_code, message, field_errors, request_id}
  - Request ID propagation (all requests get UUID, logged end-to-end)
  - OpenAPI specification base structure

Constraints:
  - Every endpoint must require auth (no unauthenticated endpoints except /auth/*)
  - Every endpoint must enforce tenant context (middleware, not per-controller)
  - API versioning policy: /api/v1 and /api/v2 may coexist; /api/v1 deprecated only
    with 90-day notice after /api/v2 is stable

--- Section F: Mobile Platform Decision ---
📎 See also: 00_master_construction_os.md §Phase 10 — MOBILE OFFLINE ENGINE for authoritative WatermelonDB + ExpoSQLiteAdapter spec

Platform decision:
  Technology: React Native (Expo managed workflow)
  Rationale:
    - Single codebase for iOS and Android
    - Expo Camera, Expo FileSystem, and Expo SQLite cover all offline needs
    - Expo EAS Build enables OTA updates without app store review cycle
    - React Native offline-first libraries (WatermelonDB) are mature
    - Team JavaScript/TypeScript skills transfer directly

  Local storage for offline: WatermelonDB (SQLite-backed)
    Rationale: Replaces IndexedDB (web-only). WatermelonDB is designed
    for React Native offline-first apps with sync engine support.

  OTA updates: Expo EAS Update (critical fixes without app store wait)

  Push notifications: Expo Notifications (wraps APNs + FCM)

Generate:
MUST-HAVE:
  - Expo project scaffold (TypeScript, managed workflow)
  - WatermelonDB schema matching server-side schemas
  - Navigation architecture (React Navigation, tab + stack hybrid)
  - Auth state management (token storage in SecureStore)
  - API client with offline queue (requests queued when offline,
    replayed in order when online)
  - Network status detection and UI state (online/offline indicator)

EXIT CRITERIA (Priority 0 is complete when):
  [ ] OTP login works end-to-end on real device (send SMS, verify, get token)
  [ ] A test tenant can be provisioned and isolated from other tenants
    (verified by attempting cross-tenant query — must fail)
  [ ] Kafka cluster is running with at least one test event published
    and consumed successfully
  [ ] All master data schemas are migrated and seed data is loaded
  [ ] React Native app builds and runs on both iOS and Android
  [ ] API /health returns 200 with version info
  [ ] RBAC: a SITE_WORKER role cannot call a finance endpoint
    (verified by automated test)
  [ ] Unit tests pass with coverage ≥ 80% lines / ≥ 70% branches for all new modules
    (command: pnpm test:cov in backend/, packages/@cos/shared/, packages/@cos/database/)
    (Decision 5, 2026-05-31 — per QM-1 spec §30.3)
  [ ] Exhaustive verification complete (Rule 37): read every Generate item in this Priority's spec
    line by line, run ls/grep for each, confirm ✅ or ❌ with actual output — no summary without evidence
```

**Effort estimate:** Large (4–6 weeks, 3–4 engineers)
**Blocks:** All other Priorities. Nothing starts until all exit criteria pass.

---

## PRIORITY 1 — SITE REPORTING

> **Prerequisite:** Priority 0 exit criteria must be 100% complete.
> Normalized schemas (work categories, materials, issue categories) must
> be loaded before this Priority generates any data.

```text
Build Site Reporting Module.

Primary objective:
Capture structured operational site data daily with minimal friction
for field workers who may have limited connectivity and limited
time to interact with software.

Core users:
  - SITE_WORKER: primary submitter (highest volume, lowest tech fluency)
  - SITE_ENGINEER: reviewer and issue escalator
  - PROJECT_MANAGER: visibility and approval

Adoption target (primary KPI):
  Daily report submission rate > 70% of active project-days
  within 60 days of go-live.
  If rate is below 50% at day 30 → conduct field UX audit immediately.

--- Features ---

Daily site report:
  Required fields (minimum viable):
    - project_id (pre-selected based on user assignment)
    - report_date (auto-filled, editable)
    - work_category_id (from master data — dropdown, not free-text)
    - progress_description (voice note or typed — voice preferred)
    - manpower_count (numeric, by trade type)
    - weather_condition (see weather spec below)
    - submitted_by (auto from auth)

  Optional fields (add after required fields are submitted):
    - photos (see photo spec below)
    - material_usage (material_id + quantity)
    - issues (see issue reporting below)
    - inspection_checklist

Issue reporting:
  - issue_category_id (from master data)
  - severity: low / medium / high / critical
  - description (voice note preferred, typed optional)
  - photos (required for severity = high / critical)
  - blocker: yes/no (yes triggers immediate notification to PROJECT_MANAGER)

Progress tracking:
  - progress unit: percentage (0–100) per work_category
  - baseline schedule linked to project milestone (from project setup)
  - variance is calculated automatically (actual vs planned)

Inspection checklist:
  - inspection_type_id (from master data)
  - checklist items: pass / fail / not applicable
  - failed items auto-create issue records

--- UX Requirements ---

Guiding principle: a field worker wearing gloves, standing in sunlight,
with 2 minutes available must be able to submit a complete daily report.

Concrete UX standards (replaces "WhatsApp-like"):
  - Minimum touch target: 48x48pt (Apple HIG standard)
  - Report submission flow: maximum 4 screens from open to submitted
  - Required fields: maximum 5 (everything else is optional + addable later)
  - Text input: voice note is the primary input method, typing is secondary
  - Dropdowns: show maximum 10 items before search activates
  - Photo capture: opens camera directly, no file picker dialog
  - Submission confirmation: visible within 2 seconds (optimistic)
  - Error state: shown inline, not as modal interruption

--- Photo Handling Spec ---

Capture:
  - Opens native camera directly (no gallery picker on primary path)
  - Maximum 10 photos per report (field constraint for storage and bandwidth)
  - GPS coordinates extracted at capture time (from device location)
  - Timestamp embedded in EXIF (device timestamp, not server time)
  - Caption: optional voice note per photo

Processing (client-side before upload):
  - Compress to maximum 800KB per photo (target quality 75%)
  - Preserve GPS and timestamp metadata after compression
  - Generate thumbnail (200x200px) for offline preview

Storage and delivery:
  - Upload target: object storage (S3-compatible) via presigned URL
  - CDN delivery for all photo views (never direct S3 URL to client)
  - Photos are attached to report_id — not standalone entities

Offline behavior:
  - Photos are stored locally (WatermelonDB attachment) when offline
  - Upload queue processes in background when connectivity returns
  - User sees upload progress per photo
  - Report is marked "submitted (photos pending)" until all photos uploaded

--- Weather Logging Spec ---

Data source decision: API-first with manual fallback
  Primary: Auto-pull from OpenWeatherMap API on report creation
           (using project GPS coordinates set at project setup)
  Fallback: Manual selection if API unavailable
           Options: sunny / partly cloudy / overcast / light rain /
                   heavy rain / storm / extreme heat / other

  Weather condition is attached to report automatically — field worker
  does not need to interact with it unless auto-pull fails.

--- Voice Note Spec ---

Recording:
  - Maximum duration: 3 minutes per voice note
  - Format: AAC, 64kbps (good quality, small file size for upload)
  - Offline recording: stored locally, uploaded in background queue

Transcription:
  - Stage 1 (MVP): voice notes are attached as audio — no transcription
  - Stage 2 (after AI layer in Priority 5): auto-transcription via STT
    for searchability — original audio preserved

Storage:
  - Same pipeline as photos: object storage + CDN delivery

--- Offline Requirements ---

Local storage: WatermelonDB (SQLite-backed, React Native)

Offline behavior:
  - All report creation and editing works fully offline
  - Submitted reports queue locally and sync when online
  - Master data (materials, vendors, categories) cached locally
    and refreshed on app open when online
  - User sees sync status indicator (synced / pending / failed)

Sync strategy:
  - Background sync triggered by: app foreground, connectivity restored,
    manual pull-to-refresh
  - Sync order: oldest pending record first (FIFO)
  - Retry: exponential backoff, maximum 5 retries before marking failed

Conflict resolution policy:
  Daily reports (field-created records):
    → Client-wins: the field worker's submitted record is authoritative.
      Server does not overwrite a submitted report.
      If server has a newer version of the same report_id from another device
      → create a conflict copy, flag for PROJECT_MANAGER review.

  Master data (categories, materials, vendors):
    → Server-wins: master data is managed by TENANT_ADMIN, not field workers.
      Client cache is overwritten on sync.

  Project data (budgets, milestones):
    → Server-wins: managed by PROJECT_MANAGER, not field workers.

--- Structured Data Requirements ---

All records must include:
  tenant_id, project_id, created_by (user_id), created_at, updated_at,
  submitted_at (separate from created_at — records when user hit submit),
  sync_status (local / synced / conflict), device_id

Normalization enforced:
  - work_category must reference work_category_id (no free-text)
  - material entries must reference material_id (no free-text material names)
  - issue_category must reference issue_category_id

--- Generate ---

MUST-HAVE:
  Database:
    - site_reports table schema and migration
    - issues table schema and migration
    - report_photos table schema (metadata only — files in object storage)
    - report_voice_notes table schema
    - inspection_records table schema

  Server APIs:
    - POST /api/v1/reports (create report)
    - PUT /api/v1/reports/:id (update before submission)
    - POST /api/v1/reports/:id/submit (finalize and publish event)
    - GET /api/v1/reports (list with filters: project, date range, status)
    - GET /api/v1/reports/:id (detail)
    - POST /api/v1/reports/:id/photos/presigned-url (get upload URL)
    - POST /api/v1/issues (create issue)
    - GET /api/v1/issues (list with filters)

  Mobile (React Native):
    - WatermelonDB schema for offline reports, issues, photos
    - Offline sync engine (queue + retry + conflict handler)
    - Daily report submission flow (4-screen max)
    - Issue reporting flow
    - Photo capture and compression component
    - Voice note recording component
    - Sync status indicator component

  Events (Kafka, schema registry):
    - site.report.submitted (triggered on submit, not on create)
    - site.issue.created
    - site.issue.severity_critical (separate event for critical issues —
      consumed by notification service for immediate push)
    - site.inspection.failed

  Notifications:
    - Push notification (Expo Notifications → APNs/FCM):
      Triggered by site.issue.severity_critical
      Recipients: PROJECT_MANAGER assigned to project
    - In-app notification center (bell icon, unread count)
    - LINE Notify integration hook (Thai market — send to project LINE group
      when critical issue created)

  Tests:
    - Unit tests: offline sync logic, conflict resolution cases
    - Integration tests: submit report online, submit offline + sync
    - API tests: all endpoints with auth, tenant isolation, validation

  OpenAPI:
    - /api/v1/reports and /api/v1/issues fully documented

NICE-TO-HAVE:
  - Report duplication (copy yesterday's report as starting template)
  - Batch photo upload with progress bar
  - Auto-fill manpower count from previous report

Constraints:
  - No ERP-style forms — maximum 5 required fields on any screen
  - No desktop-only workflow — every action must work on mobile
  - No always-online requirement — every action must have an offline path
  - Report submission must complete the UX flow in under 2 minutes
    (measured by user testing, not estimated)

EXIT CRITERIA (Priority 1 is complete when):
  [ ] Daily report can be submitted fully offline and syncs correctly on reconnect
  [ ] Critical issue triggers push notification to PROJECT_MANAGER within 60 seconds
  [ ] Conflict resolution: tested with two devices submitting same report_id offline
      — conflict copy is created, not silently overwritten
  [ ] Photo upload pipeline: photo taken offline queues and uploads on reconnect
      with GPS and timestamp metadata preserved
  [ ] Report submission time: median < 2 minutes measured across 5 real users
      in field conditions (not office testing)
  [ ] Daily report submission rate > 50% of active project-days by day 14 of pilot
  [ ] RBAC: SITE_WORKER cannot view another tenant's reports (automated test)
  [ ] All Kafka events are published on submission and visible in event log
  [ ] Unit tests pass with coverage ≥ 80% lines / ≥ 70% branches for all new modules in this priority
  [ ] Exhaustive verification complete (Rule 37): read every Generate item in this Priority's spec
    line by line, run ls/grep for each, confirm ✅ or ❌ with actual output — no summary without evidence
```

**Effort estimate:** Extra-Large (8–12 weeks, 4–5 engineers + 1 UX)
**Blocks:** Priority 5 (AI compatibility layer needs report data to exist)

---

## PRIORITY 2 — PROCUREMENT VISIBILITY

> 📎 **See also:** `00_master_construction_os.md §Phase 5 — PROCUREMENT SERVICE` for full state machine, event schema, and API spec

```text
Build Procurement Visibility Module.

Primary objective:
Give procurement officers and executives instant, accurate answers to:
  - What materials are delayed?
  - What RFQs are pending response?
  - What deliveries are expected this week and missing?
  - What purchase orders are blocked and why?

Core users:
  PROCUREMENT_OFFICER: creates and manages procurement records
  PROJECT_MANAGER: tracks procurement against project schedule
  TENANT_ADMIN: portfolio-level procurement health visibility

Adoption target:
  All active purchase requests are tracked in the system
  (zero procurement coordination happening via LINE/WhatsApp only)
  within 45 days of go-live.

--- Procurement Workflow States ---

Purchase Request (PR):
  DRAFT → SUBMITTED → APPROVED → CONVERTED_TO_RFQ | REJECTED

Request for Quotation (RFQ):
  DRAFT → PUBLISHED → CLOSED → EVALUATED → AWARDED | CANCELLED
  (authoritative state machine: 00_master_construction_os.md)

Purchase Order (PO):
  DRAFT → PENDING_APPROVAL → APPROVED → SENT → ACKNOWLEDGED
       → PARTIALLY_DELIVERED → FULLY_DELIVERED → INVOICED → PAID | DISPUTED
  (authoritative state machine: 00_master_construction_os.md;
   MVP scope may implement DRAFT→SENT→ACKNOWLEDGED→PARTIALLY_DELIVERED→FULLY_DELIVERED as minimum)

All state transitions are:
  - timestamped
  - attributed to user_id
  - published as Kafka event
  - immutable (state history preserved — not overwritten)

--- Features ---

Purchase request management:
  - Create PR with: material_id (from master data), quantity, unit,
    required_by_date, project_id, budget_line
  - PR approval routing: PROJECT_MANAGER approves PRs above threshold
    (threshold is configurable per tenant)
  - PR → RFQ conversion (creates RFQ pre-filled from PR)

RFQ tracking:
  - Link RFQ to approved PR
  - Attach vendor_ids (from master data) to receive RFQ
  - Record quotation per vendor: unit_price, total_price, lead_time, validity_date
  - Quotation comparison view (side-by-side vendor comparison)
  - Award decision: select winning vendor → auto-create PO draft

Purchase order tracking:
  - PO detail: vendor, line items (material + quantity + price), delivery_date
  - PO status tracking through delivery
  - Partial delivery recording (quantity_received per delivery)
  - PO completion: fully_delivered triggers inventory update event

Delivery tracking:
  - Expected deliveries calendar (this week / overdue)
  - Delivery confirmation by site team (links to site_report)
  - Discrepancy recording (ordered vs received quantity)

Visibility dashboard (PROCUREMENT_OFFICER and above):
  - Overdue deliveries (delivery_date passed, not received)
  - Pending RFQs (sent to vendors, no quotation received after 3 days)
  - Pending approvals (PRs awaiting PROJECT_MANAGER approval)
  - Blocked POs (confirmed but delivery overdue)
  - Upcoming deliveries (next 7 days)

--- Notification Architecture ---

Channels (in priority order for Thai construction market):
  1. Push notification (Expo → APNs/FCM) — for app users
  2. LINE Notify — for users who prefer LINE over app notifications
     (Thai market: LINE penetration > 90% among construction workers)
  3. In-app notification center — for all users on next app open
  4. Email — for executives and office users (not field workers)

Notification triggers:
  - PR submitted → notify assigned PROJECT_MANAGER (approval needed)
  - RFQ sent → notify PROCUREMENT_OFFICER when vendor responds
  - Delivery overdue (delivery_date + 1 day, not received) →
    notify PROCUREMENT_OFFICER + PROJECT_MANAGER
  - PO blocked (no update for 5 days after confirmed) →
    notify PROCUREMENT_OFFICER

Notification preference:
  - User can set preferred channel per notification type
  - Default: push notification + in-app

--- Structured Data Requirements ---

All procurement records must include:
  tenant_id, project_id, created_by, created_at, updated_at
  State transition log: [{from_state, to_state, changed_by, changed_at, note}]

Vendor normalization:
  - All vendor references use vendor_id from master data
  - No free-text vendor names in procurement records

Material normalization:
  - All material references use material_id from master data
  - Unit of measure validated against material master

--- Generate ---

MUST-HAVE:
  Database:
    - purchase_requests table + state_history table
    - rfqs table + rfq_vendors table + quotations table
    - purchase_orders table + po_line_items table
    - deliveries table + delivery_line_items table

  Server APIs:
    - PR: POST, GET (list), GET (detail), PUT, POST /:id/submit,
          POST /:id/approve, POST /:id/reject, POST /:id/convert-to-rfq
    - RFQ: POST, GET, PUT, POST /:id/send, POST /:id/quotations,
           POST /:id/award
    - PO: POST, GET, PUT, POST /:id/issue, POST /:id/record-delivery
    - Dashboard: GET /api/v1/procurement/dashboard
      (returns: overdue_deliveries, pending_rfqs, pending_approvals,
       blocked_pos, upcoming_deliveries — all in one call)

  Events (Kafka):
    - procurement.pr.submitted
    - procurement.pr.approved
    - procurement.rfq.sent
    - procurement.po.issued
    - procurement.delivery.received
    - procurement.delivery.overdue (published by scheduled job)
    - inventory.quantity.updated (consumed by cost tracking)

  Notifications:
    - Notification service consuming procurement events
    - Push + LINE Notify + in-app channel implementations
    - User notification preference storage

  Tests:
    - Full PR → RFQ → PO → delivery lifecycle integration test
    - State machine tests: invalid transitions must be rejected
    - Overdue detection job test
    - Tenant isolation test

EXIT CRITERIA (Priority 2 is complete when):
  [ ] Full procurement lifecycle (PR → RFQ → PO → delivery) works end-to-end
  [ ] Dashboard answers all 4 primary questions in under 2 seconds
  [ ] Overdue delivery notification fires within 1 hour of deadline
  [ ] All state transitions are logged with user attribution and timestamp
  [ ] Zero procurement records reference free-text vendor or material names
  [ ] RBAC: PROCUREMENT_OFFICER cannot approve their own PR
      (four-eyes enforcement tested)
  [ ] At least 10 real procurement transactions tracked in pilot
    with zero data loss
  [ ] Unit tests pass with coverage ≥ 80% lines / ≥ 70% branches for all new modules in this priority
  [ ] Exhaustive verification complete (Rule 37): read every Generate item in this Priority's spec
    line by line, run ls/grep for each, confirm ✅ or ❌ with actual output — no summary without evidence
    Mutation testing required for approval flow logic (stryker score ≥ 70%)
```

**Effort estimate:** Large (6–8 weeks, 3–4 engineers)

---

## PRIORITY 3 — COST TRACKING

```text
Build Cost Tracking Module.

Primary objective:
Give project managers and executives real-time project cost visibility —
specifically: how much has been committed, how much has been spent,
and what is the variance against budget.

Core users:
  PROJECT_MANAGER: tracks project-level cost and budget
  FINANCE: reviews cost accuracy and approves cost records
  TENANT_ADMIN: portfolio-level cost visibility

Adoption target:
  All active projects have budget entered and cost records updated weekly
  within 30 days of go-live.

--- Cost Model (MVP scope) ---

Cost is tracked at two levels:
  1. Committed cost: cost that is legally committed (PO issued)
  2. Actual cost: cost that has been physically incurred (delivery received)
  3. Budget: approved budget per cost category per project

Cost categories (initial set — TENANT_ADMIN can add more):
  From master data (Priority 0):
    - material cost (linked to procurement POs and deliveries)
    - labor cost (manual entry — see labor data source below)
    - equipment cost (manual entry)
    - subcontractor cost (linked to subcontractor POs)
    - overhead cost (manual entry)

Labor data source (MVP decision):
  Manual entry by SITE_ENGINEER or PROJECT_MANAGER.
  Data: date, trade_type (carpenter/mason/steel_fixer/electrician/plumber/general),
        worker_count, rate_per_day_thb, total_cost_thb
  Rationale: Payroll integration is deferred — it requires access to HR systems
             and adds significant integration complexity for MVP.
             Manual entry is sufficient to establish the data pattern.
             Auto-pull from payroll is planned for file 02 Phase B.

Equipment cost source (MVP decision):
  Manual entry: equipment_type, quantity, rate_per_day, days_used, total_cost
  External rental invoices can be photo-attached for reference.

Material cost source:
  Automatic — pulled from procurement module.
  When a PO is issued → committed cost is recorded.
  When delivery is confirmed → actual cost is recorded.
  No manual entry required for material cost.

--- Features ---

Project budget setup:
  - Enter approved budget per cost category per project
  - Budget can be revised (revision history preserved)
  - Budget baseline locked when project starts (revisions tracked vs baseline)

Cost entry:
  - Labor cost: manual entry form (date, trade, count, rate, total)
  - Equipment cost: manual entry form
  - Material cost: auto-populated from procurement
  - Subcontractor cost: linked to subcontractor PO (same flow as material PO)

Cost summary dashboard:
  Per project:
    - Total budget vs total committed vs total actual (as of today)
    - Budget variance: (budget - actual) in THB and %
    - Cost trend chart: weekly actuals over project timeline
    - Cost breakdown by category (material / labor / equipment / overhead)
    - Top cost items this month

  Portfolio (TENANT_ADMIN view):
    - All projects: budget vs committed vs actual
    - Over-budget projects flagged (actual > budget by > 5%)
    - Total portfolio committed cost

Budget variance alerting:
  - Alert PROJECT_MANAGER when actual cost > 80% of budget
  - Alert TENANT_ADMIN when actual cost > 90% of budget
  - Alert FINANCE when any cost entry has no supporting document
    (over configurable threshold — default: 50,000 THB)

--- Structured Data Requirements ---

All cost records must include:
  tenant_id, project_id, cost_category_id, cost_type (committed/actual),
  amount_thb, cost_date, entered_by, source (procurement/manual),
  source_reference_id (po_id, delivery_id, or null for manual),
  created_at, updated_at

Supporting document:
  - Any manual cost entry > threshold must have at least one photo attachment
    (invoice photo, receipt photo)
  - Same photo pipeline as site reporting (object storage + CDN)

--- Generate ---

MUST-HAVE:
  Database:
    - project_budgets table (budget per category, with revision history)
    - cost_entries table (all cost records, committed and actual)
    - cost_documents table (attached photos/invoices)

  Server APIs:
    - Budget: POST /api/v1/projects/:id/budget (set budget),
              GET /api/v1/projects/:id/budget (current budget with variance)
    - Cost entry: POST /api/v1/cost-entries (manual entry),
                  GET /api/v1/cost-entries (list with filters)
    - Dashboard: GET /api/v1/projects/:id/cost-summary
                 GET /api/v1/portfolio/cost-summary (TENANT_ADMIN view)

  Automation:
    - Cost entry auto-creation on procurement.po.issued event (committed)
    - Cost entry auto-creation on procurement.delivery.received event (actual)
    - Weekly budget variance check job (triggers alerts)

  Events (Kafka):
    - cost.entry.created
    - cost.budget.variance_warning (> 80% consumed)
    - cost.budget.exceeded (> 100% consumed)

  Tests:
    - Auto-cost-entry from procurement event (integration test)
    - Budget variance calculation accuracy test
    - Tenant isolation test (project cost visible only to tenant)
    - Role test: FINANCE can see all projects, PROJECT_MANAGER
      sees only their projects

EXIT CRITERIA (Priority 3 is complete when):
  [ ] Material costs are automatically recorded from PO and delivery events
      (zero manual entry required for material cost)
  [ ] Labor cost manual entry works with photo attachment for invoices
  [ ] Budget variance dashboard is accurate to within 1% of manual calculation
  [ ] Over-budget alert fires when actual cost exceeds 80% of budget
  [ ] All active pilot projects have budget entered
  [ ] Cost data is attributable (every entry has created_by and source)
  [ ] RBAC: PROJECT_MANAGER cannot view cost data from another project
      they are not assigned to
  [ ] Unit tests pass with coverage ≥ 80% lines / ≥ 70% branches for all new modules in this priority
  [ ] Exhaustive verification complete (Rule 37): read every Generate item in this Priority's spec
    line by line, run ls/grep for each, confirm ✅ or ❌ with actual output — no summary without evidence
    Mutation testing required for financial calculation logic (stryker score ≥ 70%)
```

**Effort estimate:** Large (6–8 weeks, 3–4 engineers)

---

## PRIORITY 4 — MOBILE-FIRST UX SYSTEM

> **Platform decision is made in Priority 0 (React Native + Expo).**
> This Priority builds the shared UX layer that Priority 1, 2, and 3 use.
> It may be executed in parallel with Priority 1 since P0 unblocks both.

```text
Build Mobile-First UX System.

Primary objective:
Establish a shared UX foundation that maximizes field adoption
across all modules. The UX system is a deliverable — not a principle.

--- Concrete UX Standards ---

Field-first interaction rules (replaces "WhatsApp-like"):
  Touch targets: minimum 48x48pt on all interactive elements
  Typography: minimum 16pt for body text, 14pt for secondary
  Color contrast: WCAG AA minimum (4.5:1 for normal text)
  Loading: skeleton screens instead of spinners (perceived performance)
  Empty states: actionable (show what to do, not just "no data")
  Error states: inline, specific, and recoverable (not modal blocks)
  Navigation depth: maximum 3 levels deep from home screen
  Scroll: single-axis per screen (no horizontal + vertical on same screen)

Primary input methods (in order of preference for field workers):
  1. Selection from list (dropdown from master data)
  2. Numeric input (large keypad)
  3. Voice note (tap to record)
  4. Camera (tap to open directly)
  5. Typed text (last resort — minimize)

Offline UX requirements:
  - All screens must render correctly offline (no blank screens or errors)
  - Offline indicator: persistent banner when offline
  - Pending sync indicator: shows count of unsynced records
  - No action should be blocked by offline state
    (if server action fails offline → queue it, do not show error)

--- Required Mobile Workflows ---

Each workflow must meet the time target below (measured by user testing):

  Submit daily site report: < 2 minutes
    Screen 1: Project + date selector (pre-filled)
    Screen 2: Work progress + manpower (dropdowns + numeric)
    Screen 3: Photos + voice notes (optional, addable later)
    Screen 4: Review + submit (one tap)

  Report a critical issue: < 45 seconds
    Bottom sheet: category + severity + voice note + photo + submit

  Check procurement status: < 20 seconds
    Dashboard → overdue list → PO detail

  Check project cost vs budget: < 20 seconds
    Dashboard → project → cost summary card

  View assigned tasks: < 10 seconds
    Home screen → task list (no navigation required)

--- Design System ---

Generate:
MUST-HAVE:
  - Color system: primary, secondary, success, warning, danger, neutral
    (all accessible, WCAG AA, dark mode ready)
  - Typography scale: h1, h2, h3, body, caption, label
  - Spacing scale: 4pt base grid (4, 8, 12, 16, 24, 32, 48)
  - Component library:
      Button (primary, secondary, ghost, danger — all 48pt minimum height)
      Input (text, numeric, dropdown, date picker)
      Card (standard, clickable, status indicator)
      Badge (status colors mapped to procurement/cost states)
      Bottom sheet (for quick actions without full navigation)
      Skeleton loader (for all list and detail screens)
      Empty state (with action CTA)
      Offline banner
      Sync status indicator
      Photo grid (thumbnail display + upload progress)
      Voice note recorder (with duration and waveform)

  - Navigation architecture:
      Bottom tab bar: Home, Reports, Procurement, Cost, More
      Stack navigator within each tab
      Modal stack for quick-action flows (issue report, photo capture)

  - Offline UX states:
      All list screens: show cached data with "last synced: X min ago"
      All form screens: save locally first, then sync
      All detail screens: show cached record if offline

NICE-TO-HAVE:
  - Dark mode (low priority — field workers use phones in sunlight)
  - Haptic feedback on key actions (submit, confirm)
  - Accessibility: VoiceOver / TalkBack support

Constraints:
  - No table-style data grids on screens narrower than 375pt
    (use card list or summary cards instead)
  - No deep nested forms (maximum 1 level of sub-form)
  - No mandatory fields beyond the 5-field minimum set per module

EXIT CRITERIA (Priority 4 is complete when):
  [ ] Component library covers all required components above
  [ ] All 5 required workflows meet time targets (measured by user testing
      with 3 real field workers — not engineers testing)
  [ ] Offline UX: app renders correctly with no internet for all main screens
  [ ] Accessibility: all interactive elements have accessible labels
      (tested with VoiceOver on iOS)
  [ ] Design system is documented and used consistently across P1, P2, P3
  [ ] Unit tests pass with coverage ≥ 80% lines / ≥ 70% branches for all new modules in this priority
  [ ] Exhaustive verification complete (Rule 37): read every Generate item in this Priority's spec
    line by line, run ls/grep for each, confirm ✅ or ❌ with actual output — no summary without evidence
```

**Effort estimate:** Large (6–10 weeks, 2 engineers + 1 UX designer)
**Note:** Can run in parallel with Priority 1 after Priority 0 completes.

---

## PRIORITY 5 — AI COMPATIBILITY LAYER

```text
Build AI Compatibility Layer.

Primary objective:
Ensure all operational data captured in Priority 1–4 is structured,
retrievable, and compatible with AI systems that will be built in file 02.

This Priority does NOT build AI.
It builds the extension points and data pipelines that make AI possible later.

AI is NOT built here because:
  - Insufficient operational data history (< 30 days)
  - Model training requires clean, validated data from real usage
  - Building AI before data exists wastes resources and produces
    unreliable outputs that damage user trust

--- AI Staging Plan ---

Stage 1 (file 02, Phase D — AI Expansion):
  - OCR: extract structured data from uploaded invoice and delivery photos
  - Auto-summarization: generate daily report summary from raw report data
  - Semantic search: find past reports, issues, and procurement records
    by natural language query

Stage 2 (file 02, Phase D continued):
  - Risk scoring: flag projects with delay or cost overrun indicators
  - Delay prediction: schedule variance forecasting
  - Anomaly detection: unusual cost entries, procurement patterns

Stage 3 (file 02, Phase D — after 6 months of data):
  - Procurement recommendations: vendor selection, pricing benchmarks
  - Workflow automation: routine approval routing
  - Portfolio forecasting: cross-project resource and cost projection

--- AI Extension Points to Build Now ---

Text fields optimized for future embedding:
  All text fields in reports, issues, and procurement must:
  - Be stored as UTF-8 (no encoding issues)
  - Have a companion field: {field_name}_embedding_id (nullable UUID)
    to be populated when the embedding pipeline is built
  - Be included in the event payload (not just stored in DB)

Event payloads optimized for analytics:
  Every Kafka event payload must include:
  - Full entity snapshot at time of event (not just delta)
  - All foreign key IDs resolved to names (material_name, vendor_name,
    work_category_name) for embedding without join
  - Timestamps in ISO 8601 UTC

Data warehouse ingestion pipeline:
  - Kafka → ClickHouse consumer (decided: team has DevOps bandwidth, real-time dashboard needed)
  - One consumer per domain (site, procurement, cost)
  - Schema is enforced by schema registry (no schema drift)
  - Ingestion latency target: < 5 minutes from event to warehouse
  - ClickHouse table engine: ReplacingMergeTree for facts, AggregatingMergeTree for aggregations
  - Partitioning: by toYYYYMM(event_date)

OCR preparation:
  - All photo uploads store raw image in object storage (never deleted)
  - Photo metadata includes: report_id, issue_id (or po_id), GPS,
    timestamp, uploader_id, image_type (progress/issue/delivery/invoice)
  - image_type annotation enables targeted OCR (invoice photos → OCR,
    progress photos → image classification later)

AI annotation interface (minimal):
  - Internal tool: allow admin to label a sample of records as
    correct/incorrect (5-10 records per week)
  - Labels stored in annotation_labels table (used for model evaluation later)
  - This is a simple yes/no flag — not a full annotation platform

--- Generate ---

MUST-HAVE:
  Database:
    - {entity}_embedding_id columns added to all text-rich tables
    - annotation_labels table (entity_type, entity_id, label, labeled_by, labeled_at)
    - data_export_log table (tracks what has been exported to warehouse and when)

  Event payloads:
    - Updated event contracts for all domains (site, procurement, cost)
      to include full entity snapshot and resolved names

  Data pipeline:
    - Kafka → ClickHouse consumer (one per domain — site, procurement, cost)
    - Pipeline health check: alert if ingestion falls behind > 10 minutes

  OCR preparation:
    - Photo metadata enrichment (image_type tagging on upload)
    - Invoice photo route (separate storage prefix for future OCR targeting)

  Documentation:
    - AI readiness checklist (what must be true before each Stage 1/2/3 feature)
    - Event schema documentation (for future ML team onboarding)

NICE-TO-HAVE:
  - Basic annotation interface (web admin only)
  - Embedding field placeholder migration scripts

EXIT CRITERIA (Priority 5 is complete when):
  [ ] Data warehouse is receiving events from all 3 domains
      (site, procurement, cost) within 5 minutes of event publication
  [ ] Event payloads include full entity snapshots with resolved names
  [ ] All photos have image_type annotation
  [ ] Embedding ID columns exist on all text-rich tables (nullable, empty)
  [ ] AI readiness checklist is documented and reviewed
  [ ] At least 30 days of clean warehouse data exists before Stage 1 AI begins
  [ ] Unit tests pass with coverage ≥ 80% lines / ≥ 70% branches for all new modules in this priority
  [ ] Exhaustive verification complete (Rule 37): read every Generate item in this Priority's spec
    line by line, run ls/grep for each, confirm ✅ or ❌ with actual output — no summary without evidence
```

**Effort estimate:** Medium (4–6 weeks, 2 engineers + 1 data engineer)

---

## DEPENDENCY MAP

```text
Replacing Priority 10 (disconnected implementation list)
with an explicit dependency map.

Priority 0 — Foundation Infrastructure
  Requires: nothing
  Blocks: ALL other Priorities

Priority 1 — Site Reporting
  Requires: Priority 0 (auth, tenant, Kafka, schema)
  Blocks: Priority 5 (needs report data to exist)
  Parallel: Priority 4 (can run in parallel after P0)

Priority 2 — Procurement Visibility
  Requires: Priority 0 (auth, tenant, Kafka, schema — especially vendor + material master)
  Blocks: Priority 3 (material cost auto-population needs procurement events)
  Parallel: Priority 1 (can run in parallel after P0)

Priority 3 — Cost Tracking
  Requires: Priority 0 (schema, cost categories)
            Priority 2 (material cost pulled from procurement events)
  Blocks: none in this file
  Note: labor and equipment cost can be built before Priority 2 completes;
        auto-material-cost requires Priority 2 events to exist

Priority 4 — Mobile-first UX System
  Requires: Priority 0 (platform decision made in P0)
  Parallel: Priority 1 (component library built as P1 screens are built)
  Note: UX components are delivered incrementally alongside feature Priorities

Priority 5 — AI Compatibility Layer
  Requires: Priority 1, 2, 3 (data must exist before pipeline is meaningful)
  Blocks: file 02 Phase D (AI Expansion)

Recommended execution sequencing:
  Week 1–4:   Priority 0 (foundation — all engineering)
  Week 5–12:  Priority 1 + Priority 4 in parallel
  Week 8–14:  Priority 2 (starts after P0, can overlap with P1)
  Week 13–18: Priority 3 (after P2 events are live)
  Week 16–20: Priority 5 (after P1+P2+P3 are generating data)
```

---

## ARCHITECTURAL CONSTRAINTS

```text
Architecture rules:

1. Modular monolith first.

   Extract a service ONLY when: team ownership boundary is confirmed AND
   the module has independent scaling pressure with evidence.
   Do not split preemptively.

2. Kafka is an internal event bus, not a microservices boundary signal.

   All producers and consumers run within the monolith process in MVP.
   Kafka is external infrastructure — the application is still one deployable.

3. Do not optimize for hyperscale before 10,000 DAU.

   Premature scaling optimizations create complexity without benefit.

4. Do not build marketplace, financing, insurance, or advanced AI.

   These are file 02 concerns. Scope creep here delays adoption.

5. Do not build complex ERP accounting.

   Cost tracking is operational visibility only — not financial accounting.

6. Do not allow inconsistent operational data.

   All entities must reference master data. Free-text critical fields
   are a bug, not a feature request.

7. Do not allow desktop-only workflows.

   If a feature cannot be completed on a 375pt-wide screen, redesign it.

8. Do not allow always-online requirements.

   Every user action must have an offline path.

Decision rule when in doubt:
  IF a feature increases form complexity → reject or simplify
  IF a feature requires constant internet → add offline path first
  IF a feature is not in Priority 0–5 scope → defer to file 02
  IF a decision creates inconsistent data → reject
```

---

## MEASURABLE SUCCESS METRICS

```text
Replacing non-measurable metrics from previous version.

Field adoption (primary):
  - Daily report submission rate: > 70% of active project-days
    measured at 30, 60, 90 days post go-live
  - Report submission time: median < 2 minutes (user-tested)
  - App session frequency: > 5 sessions per field worker per week

Data quality:
  - Free-text in normalized fields: 0% (enforced by validation)
  - Duplicate entity rate (materials, vendors): < 1%
  - Offline sync success rate: > 98% (synced within 24h of submission)
  - Event delivery success rate: > 99.9%

Operational visibility:
  - Procurement dashboard load time: < 2 seconds
  - Overdue delivery detection accuracy: 100%
    (all overdue deliveries appear in dashboard within 1 hour)
  - Cost variance accuracy: within 1% of manually calculated variance

Business outcomes (measured at 90 days):
  - Reduction in daily coordination meetings: target > 30%
    (measured by project manager survey)
  - Reduction in time to identify procurement delays: target > 50%
    (measured by comparing time-to-notice before and after)
  - Executive confidence in cost data: measured by NPS-style survey
    asking "Do you trust the cost data in the dashboard?" target > 70% yes
```

---

## FINAL STRATEGIC PRINCIPLE

```text
The initial winner in construction technology is NOT the company
with the most features.

The initial winner is the company that:
  - Captures structured operational data reliably every day
  - Becomes part of the daily workflow that field teams cannot remove
  - Reduces operational friction enough that adoption is self-sustaining
  - Gives managers and executives visibility they could not get before
  - Creates genuine workflow dependency before expanding scope

Execution principle:

  Build the foundation correctly (Priority 0) — dirty data from day one
  is the hardest problem to fix.

  Make field workers want to use it (Priority 1, 4) — adoption cannot
  be mandated. The product must reduce their workload, not add to it.

  Give managers visibility they value (Priority 2, 3) — executives
  who trust the data will champion adoption from the top.

  Prepare for intelligence (Priority 5) — the AI layer built in file 02
  is only valuable if the data underneath it is clean, structured,
  and historically consistent.

  Operational adoption first.
  Data quality second.
  Platform expansion (file 02) only after both are proven.
  AI intelligence only after clean data is confirmed.
```
