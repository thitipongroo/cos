# Phase 10 — Mobile Offline Engine

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 3–7, 20–22 · SaaS Maturity Stage 3.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Build offline-first mobile sync engine.

ARCHITECTURE DECISION (resolves previous contradiction — aligned with source §18.2):
  Source file §8.1 specifies BOTH React Native AND IndexedDB in same section.
  Source file §18.2 clarifies: "IndexedDB (PWA-native; IndexedDB for web/PWA builds)"
  — meaning Web App (apps/web/) uses IndexedDB for offline via Serwist, not React Native.

  PLATFORM DECISION — FINAL (confirmed by product owner):
  ทุก role สามารถใช้ได้ทุก platform โดยเลือกตามอุปกรณ์:

  ┌──────────────────────────────┬─────────────────────────────────┐
  │ อุปกรณ์                        │ Platform                        │
  ├──────────────────────────────┼─────────────────────────────────┤
  │ Smartphone (online/offline)  │ React Native เท่านั้น              │
  │ Tablet/laptop                │ Web App (Next.js + Serwist)     │
  └──────────────────────────────┴─────────────────────────────────┘

  Rules:
  - React Native: smartphone เท่านั้น — ทั้ง online และ offline
  - Web App:      tablet/laptop เท่านั้น — online AND offline (unified, no switching)
  - ไม่มี overlap ระหว่าง platform — แต่ละ device มี platform เดียว

  TWO PLATFORMS (ทุก role เข้าถึงได้ทุก platform ตาม device):

  Target A: React Native App (Expo) — smartphone only, online + offline
    Users:         ALL roles
    Device:        iOS/Android smartphone — ไม่รองรับ tablet browser
    Connectivity:  offline-first, sync เมื่อ online
    Local Storage: Drizzle ORM on expo-sqlite (~56.0.5, WAL mode, enableChangeListener)
                   — observable reads via useLiveQuery; versioned runtime DDL
                   (spec 17 §17.10 / ADR-048; replaced WatermelonDB 2026-07-04)

  Target B: Web App (Next.js + Serwist) — tablet/laptop browser, online + offline
    Users:         ALL roles
    Device:        tablet/laptop browser — ไม่รองรับ smartphone
    Connectivity:  online AND offline — Service Worker handles both transparently
    Local Storage: IndexedDB via idb library (offline entity cache)
    Background sync: Background Sync API via Serwist — mutation replay on reconnect

  SCOPE IMPACT — สำคัญมาก:
    React Native ต้องรองรับ ALL roles ไม่ใช่แค่ on-site roles
    Screen set ครบทุก role — ระบุด้านล่าง

  Role-based navigation (React Native — authoritative, ทุก role):
    SITE_WORKER:
      Bottom nav: Home | Issues | Reports | Safety  (PO decision 2026-08-08; supersedes
                  "Home | Tasks | Report | Issues | Profile" above-left)
                  Profile left every role's nav on 2026-08-04 (top-bar avatar instead), and §32.7
                  allows exactly four items — so Safety, a daily obligation with no entry point at
                  all before, took the fourth slot and TASKS became a pushed child of Home, reached
                  from the Tasks quick action FieldHome already carried. The role's mockups
                  (mockup/mobile/05_site_worker) drew Tasks | Issues | Reports | Safety with no
                  Home; the product owner chose Home-first so the bar starts in the same place for
                  all twelve roles. The 2026-08-08 mockup restructure (527231f) did NOT settle
                  this: its five drawings carry four DIFFERENT bars between them — Projects |
                  Tasks | Safety | Directory, the old Tasks | Issues | Reports | Safety, Projects |
                  Daily Logs | Safety | Directory, and a FIVE-item one ending in Profile. The
                  product owner kept Home | Issues | Reports | Safety on 2026-08-08 rather than
                  pick between them, then settled it on 2026-08-09 as Home | Tasks | Safety |
                  Directory — the 01_home/01_sw_dashboard bar with Home in the Projects slot, since a
                  field worker has no project-portfolio screen. Issues and the daily Report gave up
                  their slots and are pushed from the Home FAB's quick-action menu, which carries
                  exactly those two plus Safety.
      Check-in:   REMOVED from the product on 2026-08-09 (product-owner). Self check-in was on the
                  Home screen, moved briefly into the navigation drawer, and was then cut with its
                  project picker, its POST /workers/:id/attendance client and its strings. The Home
                  "Shift hours" tile survives it: `attendance` is one of the six entity types
                  /sync/delta streams down, so its rows are recorded elsewhere and synced — the
                  button was never their only source.
      Workflows:  daily report, quick issue, task list, safety checklist
      Quick actions: an OVERLAY opened by the Home FAB, not a route (PO 2026-08-09) — the mockups
                  head that surface with a close X, and a pushed route gets the shared TopBar's back
                  chevron instead. Same shape as the Tenant Admin quick-command overlay.
      Forms:      The daily report has NO free-text summary and the issue capture has ONE text
                  field, both 2026-08-09 to match the mockups. `site_reports.summary` is nullable
                  and is sent null; `issues.title` is NOT NULL and capped at 255, so the issue's
                  single field supplies the first 255 characters as the title and anything beyond
                  stays in the unbounded `description`.

    SITE_ENGINEER:
      Bottom nav: Home | Issues | Tasks | Reports  (PO decision 2026-08-12; dark tab bar — the
                  role's landing is the dark dashboard; order per mockup, PO decision 2026-07-16)
                  TASKS REPLACED INSPECTIONS on 2026-08-12. The role's mockup set was restructured
                  that day (mockup/mobile/03_site_engineer/ went from ~120 files to 5 screens:
                  01_home/00_project_selection · 01_home/01_se_home_dashboard ·
                  02_issues/02_se_issue_dashboard · 03_tasks/01_se_tasks · 04_reports/04_se_reports)
                  and all four bar-bearing screens draw Home | Issues | Tasks | Reports. Unlike the
                  SITE_WORKER case above — where a mockup restructure produced four DIFFERENT bars
                  between five drawings and therefore settled nothing — this set is unanimous, and
                  the product owner took it as the bar.
                  Inspections is NOT dropped: `/inspections` is a derived drawer row for this role
                  (module "Inspections / QC"), suppressed only while it was a tab, so it reappears
                  in the drawer the moment it leaves the bar. `/tasks` makes the opposite move.
                  SAFETY_OFFICER keeps the same ROUTE on its own bar, labelled "Checklists" there
                  (PO decision 2026-08-13) — one screen, one name per surface; see that role below.
      Workflows:  review reports, conflict resolution, inspection approval,
                  manpower overview, issue escalation, material requisition
      Extra:      ConflictBadge, conflict review screen
      Profile:    NOT a bottom-nav tab for this role — reached from the avatar in the Home
                  header, next to the notification bell (product-owner decision 2026-07-16,
                  from mockup/mobile/03_site_engineer/01_home/01_se_home_dashboard/, renamed from
                  01_dashboard/ in the 2026-08-11 restructure). Four tabs is within the 4–5
                  that spec §32.7 allows for <MobileNav />.
                  SUPERSEDED 2026-08-09 (product-owner): THE NAVIGATION DRAWER IS THE PROFILE, for
                  every role. There is no /profile route any more — the screen was deleted and its
                  content is <AccountSettings />, rendered inside the drawer the avatar opens. The
                  avatar is still the way in; what it opens changed.
      Material requisition: SITE_ENGINEER raises purchase requests — 06-rbac-permission-matrix
                  gives the role RW on "Purchase requests", and a shortage is noticed on site.

    PROJECT_MANAGER:
      Bottom nav: Home | Procurement | Finance | More  (corrected 2026-08-23; this line read
                  "Home | Projects | Procurement | Dashboard | Profile")
                  The corrected mockup set of 2026-08-10 settles it — mockup/mobile/06_project_manager
                  carries exactly 01_home, 02_procurement, 03_finance, 04_more_option, and the bar
                  follows those four. `dashboard` is a tab for NO role now: its content IS the Home
                  screen for this role (01_home draws the dashboard as the first tab), so a second tab
                  would show the same page twice; it stays mountable and pushable. `projects` moved
                  into More. Profile had already left every role's bar on 2026-08-09, when the
                  navigation drawer became the profile — see the SITE_ENGINEER note above.
      Workflows:  project status, procurement status, budget variance (read),
                  site report summary, issue triage

    EXEC role (source §4.2):
      Bottom nav: Home | Portfolio | Alerts | Reports | Profile
      Screens:
        Home:      KPI summary — active projects count, total budget vs actual,
                   open critical issues count (read-only, offline-capable)
        Portfolio: project list with status chips + budget variance badge
                   tap project → project health card (cost, schedule, issues)
        Alerts:    risk alerts feed — delay risk, budget overrun, critical issues
                   sorted by severity (CRITICAL → HIGH → MEDIUM)
        Reports:   AI-generated executive summaries per project (offline: last cached)
        Profile:   account settings, notification preferences
      Offline:    cached last-known data with "last updated X mins ago" timestamp
                  no write operations — EXEC is read-only on mobile

    FINANCE role (source §4.2):
      Bottom nav: Home | Payments | Budget | Invoices | Profile
      Screens:
        Home:      pending payment approvals count + overdue invoices count
        Payments:  list of payments pending approval — swipe right to approve,
                   tap to view PO reference and invoice detail (read offline)
        Budget:    budget vs actual vs committed per project (read-only)
                   variance badge: green < 5%, amber 5-10%, red > 10%
        Invoices:  invoice list — filter by status (Received/Verified/Approved)
                   tap to view detail, add note
        Profile:   account settings
      Offline:    all lists cached, approve action queued and synced when online

    PROCUREMENT_OFFICER / PROC_MANAGER roles (source §4.2):
      Bottom nav: Home | RFQs | Orders | Deliveries | Profile
      Screens:
        Home:      action required — RFQs closing soon, POs awaiting acknowledgment,
                   overdue deliveries count
        RFQs:      RFQ list with status chips (Draft/Published/Closed/Evaluated)
                   PROC_MANAGER: tap → approve/cancel RFQ
                   PROCUREMENT_OFFICER: tap → view quotation comparison
        Orders:    PO list with delivery status timeline
                   tap → view line items, expected delivery date
        Deliveries:record delivery receipt — photo capture + quantity confirmation
                   works offline, syncs when online
        Profile:   account settings
      Offline:    lists cached, delivery recording works fully offline

    TENANT_ADMIN:
      Bottom nav: Home | Users | Alerts | Settings  (dark tab bar — the role's landing is the dark
                  admin dashboard; product-owner decision 2026-07-28, from
                  mockup/mobile/04_tenant_admin/01_home/01_home_dashboard/)
      Screens:
        Home:      admin dashboard — system status, AI token usage vs quota (§26 / §31.3),
                   pending approvals (payments + POs), AI insights
        Users:     tenant user list with role + MFA status (GET /users, TENANT_ADMIN-only, §14.3);
                   Invite action — full mobile invite flow is a follow-up (web console for now)
        Alerts:    notification inbox (the top-bar bell route, promoted to a tab for this role)
        Settings:  notification preferences (§19.6; the notification-preferences route)
      Profile:    NOT a bottom-nav tab — reached from the avatar in the top bar (as SITE_ENGINEER).
                  Four tabs is within the 4–5 spec §32.7 allows for <MobileNav />.

    RBAC enforcement: JWT role claim → bottom nav + screen access
    Shared components: PhotoCapture, VoiceNoteButton, SyncPill (OfflineBanner + SyncStatusBar deleted)

  React Native App Stack:
    Framework:      React Native + Expo (managed workflow)
    Navigation:     Expo Router (file-based, role-aware routing)
    State:          Zustand + React Query
    Local DB:       Drizzle ORM on expo-sqlite (~56.0.5, WAL, enableChangeListener for
                   useLiveQuery) — spec 17 §17.10 / ADR-048
                   sync_queue infrastructure uses its own expo-sqlite handle (unchanged)
    Media cache:    expo-file-system for offline photo queue
    Background sync: expo-background-fetch + expo-task-manager
    Network detect: @react-native-community/netinfo
    Native build:   no DB-related native wiring (expo-sqlite is first-party); dev client via
                   expo run:ios/android
                   as a direct dep so pnpm exposes node_modules/@nozbe/simdjson for the pod path.
                   app.json main = expo-router/entry; build via expo run:ios/android (or EAS).
    E2E offline:    Detox has NO connectivity API (setStatusBar is cosmetic; NetInfo jest mock is unit-only).
                   App-level hook (gated EXPO_PUBLIC_E2E=1): deep link cos://e2e/network?online=0|1 →
                   networkOverride → useNetworkStatus. Visibility idiom: waitFor().toBeVisible().withTimeout()
                   (no boolean isVisible()). See spec §17.8 + §30.7.

  Web App Stack (Target B — apps/web/ directory):
    Framework:      Next.js + Serwist (@serwist/turbopack — Workbox-successor, Turbopack-compatible)
    Local Storage:  IndexedDB via idb library (typed wrapper)
    State:          Zustand + React Query
    Background sync: Service Worker + Background Sync API
    Offline pages:  precached via Serwist during build (precache manifest injected into the SW)
    Target users:   ALL roles — tablet/laptop browser ONLY
    Device:         NOT smartphone (product owner confirmed)
    Connectivity:   online + offline — no app switching; Service Worker handles transparently
    Sync engine:    same REST API endpoints as React Native (shared server-side)

  Generate (React Native):
    - expo-sqlite schema setup and migration utility
    - SyncManager class with full queue processing logic
    - ConflictHandler implementing three resolution strategies from Phase 6
    - DeltaSyncClient (Axios-based, handles auth token injection)
      [IMPLEMENTED: the wired delta-pull caller is `runDeltaSync()` (src/sync/runDeltaSync.ts),
      triggered from (app)/_layout on entry; it pulls GET /sync/delta for all six entity types
      (task/site_report/issue/attendance/safety/material), upserts into the local Drizzle tables, and
      advances the syncStore.lastSyncAt cursor. See spec §17.9. The DeltaSyncClient class is superseded.]
    - Server-side `platform.sync_tombstones` table (backs `GET /sync/delta` `deleted[]`; source spec `11 §11.1`):
      tombstone_id UUID PK, tenant_id UUID NOT NULL (RLS), entity_type VARCHAR(64), entity_id UUID,
      deleted_at TIMESTAMPTZ DEFAULT now(); INDEX (tenant_id, entity_type, deleted_at). Per-entity
      delete→tombstone wiring is deferred (contract complete; `deleted[]` stays empty until each entity records here).
    - Entity offline scope (enforce per spec `17 §17.4` — do NOT allow offline writes outside this list):
        * Offline read/write: tasks, site reports, inspections, workforce attendance, material consumption, safety checklists + incidents, equipment usage, deliveries received against a PO (amended 2026-08-19), purchase requests (amended 2026-08-19)
        * Online-required (read-cache only, no offline write): POs, vendor invoices / AR / receipts / payments, budget-line mutations, vendor master, permissions/roles, tenant settings/configuration, sync conflict resolution (§17.5)
        * Read-only SWR cache: project master, BOQ lines, room/floor reference, drawings (size-limited), vendor directory
        * Pushable types are declared once as `SYNC_PUSHABLE_ENTITY_TYPES` in `@cos/types`, imported by both the API and the mobile client; a backend contract test asserts `SyncService.push()` handles exactly those
    - Sync priority order on reconnect (spec `17 §17.6`): 1 safety incidents → 2 attendance → 3 inspections → 4 task progress → 5 site reports → 6 material → 7 equipment usage → 8 photo/media (deferred last)
    - Data size limits (spec `17 §17.7`): local DB ≤ 500 MB · drawing cache ≤ 200 MB (LRU eviction) · photo queue ≤ 100 (warn user at 80) · sync batch ≤ 500 records/cycle
    - BackgroundSyncTask (expo-task-manager registration)
    - PhotoUploadQueue with chunked upload support
    - React hooks: useSyncStatus(), usePendingCount(), useConflicts()
    - Zustand store slices: syncStore, offlineStore
    - Unit tests: SyncManager, ConflictHandler, DeltaSyncClient
    - UI components: SyncPill, ConflictBadge
    - Feature screens (role-based, FULL functional + offline + testIDs — per the Role-based
      navigation spec above). ADDED per product-owner ruling: the role screens were specified in
      the navigation section but were absent from this Generate list; the mobile feature UI is owned
      by Phase 10. Wire each screen to the existing stores/hooks/Drizzle schema/API:
        * Auth: login — Path A (phone + OTP) AND Path B (email/password via Keycloak OIDC, ADR-050)
          wired to authStore + role-based post-login routing. Both paths are open to every role
          except TENANT_ADMIN and FINANCE, which are Path B only (spec §5.4.4, PO 2026-08-21;
          §20.6.1). Product-owner decision 2026-07-07 first resolved the OTP-only gap; all roles use
          React Native on smartphone, so mobile must render both auth paths, no new mechanism vs §5.4
        * SITE_WORKER: home (KPI) · tasks (list + detail + progress input, offline) · report
          (daily report form) · issues (quick issue + list) · profile
        * SITE_ENGINEER: reports (review + record material consumption per report — enqueues 'material'
          with report_id → /sync/push, PO ruling M1/M2) · issues (escalation) · inspections (list →
          checklist → pass/fail + photo) · conflict-review screen · profile
        * SAFETY_OFFICER: home (safety dashboard — open-incident count from GET /safety/compliance,
          daily-checklist card, recent incidents) · incidents (report safety incident offline —
          local_incidents PENDING + enqueue 'safety' → /sync/push → createIncident, PO ruling D1/D2;
          feed + filter pills + acknowledge) · checklists (the /inspections route, relabelled —
          fill a template, PASS/FAIL per item, sign, submit) · permits (register + approve/reject,
          §20.7.7 + §6.4 "Permits" RW; a SAFETY_PERMIT is PM-final per §9, so this role is not
          offered that control) · profile
          Bar (PO decision 2026-08-13, mockup/mobile/07_safety_officer): Home | Incidents |
          Checklists | Permits. Master enumerates no nav for this role — see spec 20 §20.7.7, which
          says so outright — so the drawings settled it; §32.7's per-role table now records it.
          THE DRAWINGS SHOW FOUR THINGS THIS PLATFORM CANNOT COMPUTE — a compliance percentage,
          safe-hours-since-last-LTI, an AI risk score per incident, and a weather-sourced hazard
          alert. Each is DRAWN and states that it is not available yet; none is given a number.
        * PROJECT_MANAGER: home (triage) · projects · procurement (status) · dashboard · profile
        * EXECUTIVE: home (KPI) · portfolio (health cards) · alerts (risk feed) · reports
          (AI summary) — read-only/offline-cached · profile
        * FINANCE: home · payments (approve PENDING→PROCESSED via PATCH /finance/payments/:id/approve,
          queued offline) · budget (allocated/committed/actual/variance from GET /finance/budget/:id) · invoices · profile
        * PROCUREMENT_OFFICER/PROC_MANAGER: home · rfqs · orders · deliveries (record via
          POST /procurement/deliveries, photo + qty, offline) · profile
    - Shared mobile components (§32.7 Mobile Core Component Library): MobileNav, PhotoCapture,
      VoiceNoteButton, TaskCard, QuickActionCard, StatusChip, OptimisticList, SyncPill
    - Every screen exposes the testIDs consumed by the Detox E2E specs (apps/mobile/e2e/*)

  Generate (Web App — apps/web/):
    - Serwist configuration (@serwist/turbopack: withSerwist + createSerwistRoute) with runtime caching strategies
      createSerwistRoute LEAVES `useNativeEsbuild` at its `platform === 'win32'` default — corrected
      2026-08-23 (TDD OQ-39); this line used to read "MUST pass `useNativeEsbuild: false`" on the premise that `esbuild`
      was not a dependency. It is one now: a devDependency of apps/web pinned to the same version as
      `esbuild-wasm`, with `allowBuilds.esbuild: true` in pnpm-workspace.yaml. Forcing the option to false
      does not work anyway — `esbuild-wasm` rejects a Windows absolute working directory and that directory
      cannot be overridden through @serwist/turbopack's option allowlist. Authoritative: spec §32.7 → Web
      Implementation build constraints, which carries the full account.
    - IndexedDB schema using idb library (typed, versioned)
    - PWA sync service using Background Sync API + IndexedDB queue
    - Service worker registration via SerwistProvider in the Next.js App Router root layout (app/layout.tsx)
    - Offline fallback pages
    - Install prompt component (beforeinstallprompt handler)
    - Web authentication: login (Path A SMS OTP + Path B email/password), MFA challenge,
      session/refresh, role-based post-login routing — per spec §20.6 (no new auth mechanism)
    - Web operational pages for ALL roles (full operational client, not dashboard-only) —
      build the per-role page inventory in spec §20.7 (Executive, PM, Procurement, Finance,
      Site Engineer, Site Worker, Safety Officer, Tenant Admin, Viewer, CRM/Sales Manager
      (basic CRM UI — MVP per ADR-029; the §21.6 UI-excluded note was overridden); SYSTEM_ADMIN
      uses the separate /admin panel §20.4)
    - Web app shell: role-filtered navigation, SSE notification bell, offline/sync indicator,
      th/en language switcher, data-table list views (spec §20.6.2)
    - CRM module (ADR-029, retrofitted — no dedicated phase): `crm` schema
      (crm.leads / crm.opportunities / crm.contacts); Customer = finance.customers (convert writes
      there). APIs (spec §14 CRM, docs/api/crm.openapi.yaml):
        GET|POST /api/v1/crm/leads · GET|POST /api/v1/crm/opportunities
        PATCH /api/v1/crm/opportunities/:id/convert · GET|POST /api/v1/crm/contacts
        GET /api/v1/crm/customers
      RBAC: read = EXECUTIVE + CRM_SALES_MANAGER; write = CRM_SALES_MANAGER (+ TENANT_ADMIN).
      PDPA: `crm.contacts.{name,email,phone}` and `crm.leads.contact_name` are personal data about
      people with NO platform account. The TENANT is the controller and COS the PROCESSOR, so a
      subject request is routed to the tenant rather than answered here — ADR-090; tagged by
      migration 20260816000002; flows in docs/registers/data-flow-map.md §9. `crm.leads.company`
      is NOT tagged: a juristic person is not a data subject. There is no B2B exemption in Thai law.

Local SQLite Schema (mirrors server entities for offline use):
  sync_queue:
    id            INTEGER PK AUTOINCREMENT
    entity_type   TEXT NOT NULL
    entity_id     TEXT NOT NULL  — UUID as string
    operation     TEXT NOT NULL  — CREATE | UPDATE
    payload       TEXT NOT NULL  — JSON string
    status        TEXT DEFAULT 'PENDING'  — PENDING | SYNCING | SYNCED | FAILED
    retry_count   INTEGER DEFAULT 0
    client_submitted_at TEXT NOT NULL  — ISO 8601
    last_attempt_at TEXT
    error_message TEXT

  local_site_reports:
    (mirrors server schema — subset of fields needed offline)
    report_id     TEXT PK
    project_id    TEXT NOT NULL
    report_date   TEXT NOT NULL
    summary       TEXT
    status        TEXT DEFAULT 'DRAFT'
    sync_status   TEXT DEFAULT 'PENDING'  — PENDING | SYNCED | CONFLICT

  local_issues:
    (mirrors server schema — subset of fields needed offline)
    ...

  local_photos:
    photo_id      TEXT PK
    entity_type   TEXT NOT NULL
    entity_id     TEXT NOT NULL
    local_path    TEXT NOT NULL  — expo-file-system URI
    upload_status TEXT DEFAULT 'PENDING'
    server_file_id TEXT         — populated after upload

Sync Engine Architecture:
  SyncManager (core class):
    - processQueue(): reads PENDING items from sync_queue, sends to server
    - markSynced(id): updates status to SYNCED
    - markFailed(id, error): increments retry_count; after 5 retries → calls handleExhaustion(item)
    - handleExhaustion(item): entity-specific behavior per spec §17.2 —
        The categories below are the SPEC's names. On the wire each is the pushable type the queue
        actually holds, 1:1: safety_incidents→safety · workforce_attendance→attendance ·
        inspection_results→inspection · material_consumption→material · task_progress_updates→task ·
        site_report_drafts→site_report · equipment_usage_logs→equipment. Both the client sets and
        the server's EXHAUSTION_ALERT_ROLES were keyed on the category names at first, which nothing
        produces — so §17.2 was dead on both sides until 2026-08-24 (client) and 2026-08-31 (server).
        safety_incidents:      publish to platform.sync.exhausted → tenant admin review queue;
                               push alert to PM and Safety Officer; preserve on device
        workforce_attendance:  publish to platform.sync.exhausted → tenant admin review queue;
                               push alert to PM; preserve on device
        inspection_results:    publish to platform.sync.exhausted → tenant admin review queue;
                               push alert to PM; preserve on device
        material_consumption:  publish to platform.sync.exhausted → tenant admin review queue;
                               preserve on device
        task_progress_updates: discard sync attempt; notify user in-app; preserve on device
        site_report_drafts:    discard sync attempt; notify user in-app; preserve on device
        equipment_usage_logs:  discard sync attempt; preserve on device
    - Tenant admin review queue: server-side queue (platform schema) visible to TENANT_ADMIN;
                                 records never deleted from device until synced or admin-resolved
                                 BUILT 2026-08-22 (TDD OQ-38) — table platform.sync_exhaustions,
                                 event platform.sync.exhausted.v1 (spec §32.4 #22),
                                 POST /api/v1/sync/exhausted (device reports the exhaustion),
                                 GET /api/v1/sync/exhaustions + PATCH :id/resolve (TENANT_ADMIN).
                                 Before that date none of it existed and SyncManager's onExhausted
                                 callback had no provider, so an exhausted safety incident
                                 escalated to nobody.
    - handleConflict(item, serverResponse): updates local record with conflict_status

  Conflict Handling (client-side):
    - ACCEPTED: update local record to SYNCED
    - CONFLICT_FLAGGED: update local record sync_status to CONFLICT,
                        show badge in UI for user awareness
    - CONFLICT_REJECTED: replace local payload with server version,
                         show notification to user

  Delta Sync:
    - API CONTRACT: docs/api/sync.openapi.yaml + spec §14 "Offline Sync APIs" — both written
      2026-08-24. All six routes had run since Phase 10 named in no §14 table and carried by no
      OpenAPI document, while the mobile client depended on every one of them.
    - Server provides: GET /api/v1/sync/delta?since={timestamp}&entity_types[]=...
    - Client requests delta on foreground resume and after background sync
    - Delta response: { updated: [...], deleted: [...], server_timestamp }
    - Client applies delta to local SQLite

  Background Sync:
    - Uses expo-background-fetch (fires every 15 min minimum — OS-imposed limit)
    - On sync: process up to 20 items from queue
    - Photos: uploaded separately via expo-file-system chunked upload
    - Background sync respects battery saver mode (skip if battery < 15%)

  Media Cache:
    - Photos taken offline: stored in expo-file-system cache directory
    - Upload queue: processed in order, 1 at a time on background sync
    - Upload target: File Service /api/v1/files/upload via multipart
    - Retry: up to 3 times per photo, then mark as UPLOAD_FAILED

Constraints:

- Before marking Phase 10 complete: read every Generate item above line by line,
  run ls/grep to verify each exists on disk, show output — Rule 36

```
