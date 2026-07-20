# Construction OS — DESIGN.md

> **Purpose:** Design brief for the UX/UI AI Agent designing every screen of the
> **entire** Construction OS platform — MVP AND all post-MVP phases (external portals,
> marketplace, financial infrastructure, Layer B/C AI, IoT / Digital Twin, and the V2
> Infrastructure / V3 Real Estate verticals). Compiled line-by-line from the 36
> specification documents in `docs/specifications/` (numbered 00–34; `00` covers both
> `00-executive-overview` and `00-glossary`). Two carry no design surface and are
> deliberately uncited: `07-multi-tenant-architecture` (isolation internals — its
> operator-facing provisioning workflow reaches design through `34` §34.5, cited in §7) and
> `24-ai-training-pipeline` (MLOps; §24 states no model training is required for MVP LLM
> features). Every rule below cites its authoritative spec section — on any conflict,
> `docs/specifications/` wins (and `32-implementation-specifications.md` wins within the
> spec set).
>
> **Scope of design work:** Web app (Next.js), Mobile field app (React Native/Expo),
> SYSTEM_ADMIN panel (`/admin`), external Vendor Portal (`/vendor`), plus the post-MVP
> surfaces specified in §15 (Contractor / Customer portals, marketplaces, financial
> services, digital-twin & carbon screens, V2 map-first UX, V3 real-estate UX).
> Every screen carries a **phase tag** (§15.1) so delivery can be sequenced without
> re-design.

---

## 1. Product Identity

### 1.1 What the product is (spec 00-executive-overview, 29-final-strategic-positioning)

- **Construction OS (COS)** — an AI-native, multi-tenant SaaS "Operating System for
  Construction & Real Estate", built Thai-first for the Thailand / Southeast Asia market.
- It is NOT just ERP, project management, BIM, or accounting — it is the
  **Digital Operating Layer** of the entire construction business:
  Single Source of Truth + Operational Intelligence + AI-native Workflow Platform.
- Strategic aesthetic positioning: comparable to SAP (manufacturing), Salesforce (CRM),
  GitHub (software), Figma (design) — the OS layer for construction.
- Primary customers: **mid-sized Thai contractors** (3–20 concurrent projects, 20–500
  employees) currently on Excel + LINE + basic accounting software (spec 25 §25.1).
  90–95% of the market is un-digitized (spec 29 §29.4).
- MVP wedge = **site reporting + procurement visibility + cost tracking** (spec 25 §25.2).

### 1.2 Brand identity (spec 32 §32.7 — authoritative)

| Token             | Value                                                                             |
| ----------------- | --------------------------------------------------------------------------------- |
| Brand name        | CONSTRUCTION OS                                                                   |
| Product shortform | COS (favicon, app icon, monogram)                                                 |
| Tagline           | "AI-Native Construction Platform" — 11px, uppercase, letter-spacing 3.5px         |
| Personality       | Industrial · Intelligent · Enterprise · AI-native · Mission-critical              |
| Positioning       | **Palantir / Datadog / Linear aesthetic** — NOT construction-contractor aesthetic |

**PROHIBITED in all visual work (spec 32 §32.7):**

- ❌ Building / crane / hard-hat / blueprint / gear icons
- ❌ Orange / amber as brand colour (note: orange IS allowed as the mobile _warning_
  semantic token and web dark-theme warning — just never as brand identity)
- ❌ Rounded playful shapes
- ❌ Gradients or glow effects

---

## 2. Design Tokens (spec 32 §32.7 — authoritative, do not invent values)

### 2.1 Web / PWA / Desktop colours

| Token         | Hex       | Usage                                                |
| ------------- | --------- | ---------------------------------------------------- |
| `--cos-navy`  | `#0B1020` | Infrastructure Core — wordmark, headers, dark UI     |
| `--cos-blue`  | `#2563EB` | System Blue — CTAs, active states, navigation        |
| `--cos-cyan`  | `#06B6D4` | AI Cyan — AI modules, insights, event highlights     |
| `--cos-gray`  | `#64748B` | Steel Gray — secondary text, borders, inactive       |
| `--cos-white` | `#F8FAFC` | Concrete White — page backgrounds, surfaces, reports |

### 2.2 Web dark theme

| Token                 | Hex       |
| --------------------- | --------- |
| `--cos-dark-bg`       | `#020617` |
| `--cos-dark-surface`  | `#0F172A` |
| `--cos-dark-elevated` | `#111827` |
| `--cos-dark-text`     | `#F8FAFC` |
| `--cos-dark-muted`    | `#94A3B8` |
| `--cos-dark-blue`     | `#2563EB` |
| `--cos-dark-cyan`     | `#22D3EE` |
| `--cos-dark-success`  | `#10B981` |
| `--cos-dark-warning`  | `#F59E0B` |
| `--cos-dark-danger`   | `#EF4444` |

### 2.3 Mobile colours (React Native field app — optimised for direct sunlight)

| Token                     | Hex       | Usage                            |
| ------------------------- | --------- | -------------------------------- |
| `--mobile-primary`        | `#0066FF` | Bright blue (outdoor visibility) |
| `--mobile-success`        | `#00C853` | Confirmation green               |
| `--mobile-warning`        | `#FF9500` | Caution orange                   |
| `--mobile-danger`         | `#FF3B30` | Urgent / delete red              |
| `--mobile-bg`             | `#FFFFFF` | Background                       |
| `--mobile-surface`        | `#F5F5F5` | Card surface                     |
| `--mobile-text-primary`   | `#1C1C1E` | Primary text                     |
| `--mobile-text-secondary` | `#6C6C70` | Secondary text                   |
| `--mobile-offline`        | `#8E8E93` | Offline indicator                |
| `--mobile-syncing`        | `#FFD60A` | Syncing indicator                |
| `--mobile-synced`         | `#00C853` | Synced indicator                 |

> **Intentional divergence:** `--mobile-primary #0066FF` ≠ `--cos-blue #2563EB`.
> Field workers use the app in direct sunlight; `#0066FF` has higher outdoor visibility.
> Use `--mobile-primary` for tap targets/CTAs in React Native ONLY; use `--cos-blue`
> on all web (Next.js) and PWA surfaces. Never reuse web `--cos-*` values on mobile.

**Exception — mobile auth screens (spec 32 §32.7 Mobile Auth Screens):** the table above is the
**signed-in** field app. The pre-auth screens (login, OTP verify, session-securing overlay) render
**dark**, on the shared `--cos-dark-*` tokens of §2.2 — the same surface as the web login and the
Keycloak `cos` theme, so all three entry points to the product look like one product. CTAs keep
`--mobile-primary` so the tap target a field worker learns never changes colour. The sunlight
rationale governs all-day outdoor use; signing in is a one-off, usually indoor.

| Surface on the mobile auth screens | Token                 |
| ---------------------------------- | --------------------- |
| Background                         | `--cos-dark-bg`       |
| Card                               | `--cos-dark-surface`  |
| Input / border / logo plate        | `--cos-dark-elevated` |
| Text                               | `--cos-dark-text`     |
| Secondary / footer                 | `--cos-dark-muted`    |
| CTA                                | `--mobile-primary`    |

### 2.4 Typography

**Brand font: Inter Tight** — weights 400 (body), 500 (labels/UI), 600 (headings),
700 (wordmark). Fallback: `Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif`.
Web via `@fontsource/inter-tight`; mobile via `expo-font` + `@expo-google-fonts/inter-tight`.

**Web scale — base unit 14px (compact enterprise SaaS):**

| Token                | Size | Weight | Usage                                  |
| -------------------- | ---- | ------ | -------------------------------------- |
| `--web-text-display` | 32px | 700    | Hero numbers, project budgets          |
| `--web-text-h1`      | 24px | 600    | Page titles                            |
| `--web-text-h2`      | 20px | 600    | Section headers, card titles           |
| `--web-text-h3`      | 16px | 500    | Sub-section headers, table headers     |
| `--web-text-body`    | 14px | 400    | Default body, table content            |
| `--web-text-small`   | 12px | 400    | Metadata, timestamps, secondary labels |
| `--web-text-tiny`    | 11px | 400    | Badges, footnotes, fine print          |

**Mobile scale:**

| Token                   | Size | Usage                    |
| ----------------------- | ---- | ------------------------ |
| `--mobile-text-hero`    | 28px | Page titles              |
| `--mobile-text-title`   | 22px | Card titles              |
| `--mobile-text-body`    | 17px | Body text (iOS standard) |
| `--mobile-text-caption` | 15px | Metadata                 |
| `--mobile-text-label`   | 13px | Input labels             |

### 2.5 Spacing & radius

**Web (base unit 4px):** `--web-space-1` 4px (icon-to-text) · `--web-space-2` 8px (inline
gaps) · `--web-space-3` 12px (form-field internal padding) · `--web-space-4` 16px (card
internal padding) · `--web-space-6` 24px (card padding / section gap) · `--web-space-8`
32px (between cards) · `--web-space-12` 48px (major page section gap).

**Border radius:** `--web-radius-sm` 4px · `md` 8px · `lg` 12px · `xl` 16px.

**Mobile:** `--mobile-space-xs` 8px (icon padding) · `sm` 12px (card internal) ·
`md` 16px (section) · `lg` 24px (screen edge) · `xl` 32px (major section separation).

### 2.6 Touch targets (mobile — spec 32 §32.7, WCAG-driven)

| Element                 | Minimum         | Recommended    |
| ----------------------- | --------------- | -------------- |
| Primary button          | 44px            | 52px           |
| Secondary button        | 44px            | 48px           |
| Icon button             | 44px (WCAG AAA) | —              |
| List item               | 52px            | 60px           |
| Form input              | 48px            | 52px           |
| Checkbox / radio        | 44px tap area   | 24–28px visual |
| Spacing between targets | 8px minimum     | —              |

### 2.7 Token wiring contracts (implementation constraints designers must respect)

- **Web:** tokens live as CSS vars in `:root` + `.dark {}` in `apps/web/src/app/globals.css`,
  mapped through `tailwind.config.js` `theme.extend` (`colors.cos.*`, named `fontSize`
  utilities, radius mapping); `darkMode: 'class'`. Tailwind's default 4px spacing scale IS
  the spacing system — do not invent off-scale spacing (spec 32 §32.7 Web Implementation).
- **Mobile:** RN has no CSS variables — tokens are a typed module
  `apps/mobile/src/theme/tokens.ts`. Components must reference the theme; with custom
  fonts, weight is selected by `fontFamily` (e.g. `fontFamily.semibold`), never
  `fontWeight`. Never hardcode hex (spec 32 §32.7 Mobile Implementation).

---

## 3. UX Philosophy (spec 20 §20.1 — the non-negotiable frame)

> Construction workers do NOT behave like SaaS office users.

Every design MUST be:

1. **Mobile-first** — field roles live on smartphones
2. **Offline-capable** — sites have weak/no connectivity (spec 17 §17.1)
3. **Low cognitive load**
4. **Fast data entry**
5. **Voice/photo friendly**
6. **WhatsApp/LINE-like simplicity**
7. **Role-based simplicity** — each role sees only what it needs

Field-worker reality check (spec 20 §20.8): user is on a phone, one-handed, in direct
sunlight, wearing gloves, possibly with motor/vision limitations, on a mid/low-end
Android over a poor network.

---

## 4. Users & Roles (spec 06 §6.2, 20 §20.2 — authoritative role list)

### 4.1 Tenant roles and their core needs

| Role (display name) | JWT enum              | Primary surface  | Core UX needs (spec 20 §20.2)                                               |
| ------------------- | --------------------- | ---------------- | --------------------------------------------------------------------------- |
| Executive           | `EXECUTIVE`           | Web dashboard    | Portfolio health, risk alerts, cash flow, margin forecast, delay prediction |
| Project Manager     | `PROJECT_MANAGER`     | Web + mobile     | Schedule tracking, procurement status, budget variance, site blockers       |
| Site Engineer       | `SITE_ENGINEER`       | **Mobile-first** | Daily tasks, drawing access, inspection forms, material requests            |
| Procurement Officer | `PROCUREMENT_OFFICER` | Web              | RFQs, vendor comparisons, delivery tracking                                 |
| Finance             | `FINANCE`             | Web              | Cost recognition, payment approvals, cash flow                              |
| Safety Officer      | `SAFETY_OFFICER`      | Web + mobile     | Safety checklists, incident reporting, compliance status, violation alerts  |
| CRM / Sales Manager | `CRM_SALES_MANAGER`   | Web              | Lead pipeline, opportunity tracking (basic UI in MVP)                       |
| Tenant Admin        | `TENANT_ADMIN`        | Web              | Users, roles, workflows, tenant settings, integrations                      |

Sub-roles (spec 06 §6.8): `PROC_MANAGER` (procurement approval tier above Officer),
`SITE_WORKER` (field worker — mobile-primary; tasks/reports/checklists/issues read-write),
`VIEWER` (read-only everywhere; render NO create/edit/approve actions).

External principals (spec 06 §6.8b): `VENDOR_PORTAL` — never a tenant role; separate
external surface (§8 below). Platform operator: `SYSTEM_ADMIN` — separate `/admin` panel
(§7 below), never mixed with tenant UI.

### 4.2 Permission-driven rendering rules

- Navigation is **role-filtered**: a role never sees nav items for pages it cannot access
  (spec 20 §20.6.2).
- Permission levels (spec 06 §6.3): `—` no access · `R` read · `RW` read/write ·
  `RWD` +delete · `A` approve · `FULL` incl. configuration. Use the full module matrix in
  spec 06 §6.4 to decide which buttons/actions render per role per screen.
- ABAC on top of RBAC (spec 06 §6.5): PM sees only assigned projects; approval limits
  gate approve buttons; Site Engineer edits only their own attendance.
- Human + AI collaboration per role (spec 23 §23.2): Executive ← forecasting/risk
  simulation; PM ← schedule optimization; Procurement ← cost analysis; Site Engineer ←
  report generation; Finance ← cash-flow prediction; Safety ← compliance detection;
  CRM ← proposal generation.

---

## 5. Platform Surfaces & Information Architecture

### 5.1 Deployable client surfaces (spec 32 §32.2, 03 §3.1, 04 §4.1)

| Surface    | Tech                                | Audience                                    |
| ---------- | ----------------------------------- | ------------------------------------------- |
| Web app    | Next.js + Serwist PWA (`apps/web`)  | All roles — tablet/laptop, online + offline |
| Mobile app | React Native + Expo (`apps/mobile`) | Field roles primarily; renders ALL roles    |
| `/admin`   | Part of web app, separate section   | SYSTEM_ADMIN only (platform operator)       |
| `/vendor`  | Separate section, own layout        | External vendor network (no internal shell) |

### 5.2 Web application shell (spec 20 §20.6.2)

- **Left sidebar + top bar**; nav items filtered by JWT `role` claim.
- **Notification bell** fed by SSE (never WebSocket) — in-app inbox with unread state
  (spec 19 §19.2, §19.5 `read_at`).
- **Offline indicator + sync status** — PWA offline; offline-capable pages mirror mobile
  sync entities (site reports, issues, inspections, deliveries); read views served from
  cache offline.
- **Language switcher** `th` / `en`.
- **List views on web use data tables** — the mobile "no tables" rule does NOT apply to web.
- Every page enforces RBAC + ABAC.

### 5.3 Authentication screens (spec 20 §20.6.1, 05 §5.4, 14 §14.3)

Two login paths — BOTH rendered on web and on mobile:

| Path | Route (web)  | Users                                                             | Mechanism                        |
| ---- | ------------ | ----------------------------------------------------------------- | -------------------------------- |
| B    | `/login`     | Office/management (PM, Finance, Exec, Admin, Procurement, Safety) | Email + password (Keycloak OIDC) |
| A    | `/login/otp` | Field roles (Site Engineer, Site Worker)                          | Phone + 6-digit SMS OTP          |

- OTP: 6-digit numeric, TTL 5 min, max 3 attempts/session, 10 requests/phone/day —
  design countdown, resend limits, attempt errors (spec 05 §5.4.2).
- **MFA (TOTP)** required for `TENANT_ADMIN` and `FINANCE` — MFA challenge screen after
  primary factor; enrollment flow shows QR from `otpauth://` URI (spec 14 §14.3 auth APIs).
- Session: access token 15 min / refresh 7 days — design silent-refresh, session-expiry
  states. Post-login redirect = first page of the role's page inventory (§5.4).
- Accessible authentication (WCAG 3.3.8): OTP login must not require cognitive tests or
  inaccessible CAPTCHA (spec 20 §20.8).

### 5.4 Web page inventory per role (spec 20 §20.7 — authoritative page list)

**Executive** (`20.7.1`): `/` Portfolio home (KPI summary: active projects, budget vs
actual, open critical issues) · `/portfolio` (project list + status chips + budget-variance
badge, drill to project health) · `/alerts` (delay risk, budget overrun, critical issues
sorted by severity) · `/reports` (AI executive summaries per project).

**Project Manager** (`20.7.2`): `/projects` (list/create, filter status/type) ·
`/projects/{id}` (status transitions, members, documents, BOQ summary) ·
`/projects/{id}/procurement` (RFQ/PO status read, delivery tracking) ·
`/projects/{id}/finance` (budget vs actual vs committed, read) · `/projects/{id}/site`
(site report summary, issue triage) · `/analytics/pm/{projectId}` (manpower trend, issues
by severity, inspection rate, procurement KPIs).

**Procurement Officer / Manager** (`20.7.3`): `/procurement/requests` (PR list/create) ·
`/procurement/rfqs` (RFQ list/detail; PROC_MANAGER approves/cancels EVALUATED→AWARDED/CANCELLED) ·
`/procurement/quotations` (quotation comparison, mark selected) · `/procurement/orders`
(PO list + approval chain + delivery timeline) · `/procurement/deliveries` (record/receive) ·
`/procurement/vendors` (vendor master, vendor scoring).

**Finance** (`20.7.4`): `/finance/payments` (pending approvals; approve/record) ·
`/finance/budget/{projectId}` (budget vs actual vs committed; budget lines) ·
`/finance/invoices` (verify/approve/dispute) · `/finance/reports/variance` (variance across
projects).

**Site Engineer** (`20.7.5`): `/site/reports` (review/submit daily reports; manpower
overview) · `/site/issues` (list, triage, escalation) · `/site/inspections` (results,
approval/re-inspection) · `/site/conflicts` (resolve offline-sync ConflictRecords).

**Site Worker** (`20.7.6` — tablet-web mirror of mobile): `/tasks` (assigned tasks;
progress update) · `/site/reports/new` (daily report: manpower, blockers) ·
`/site/issues/new` (quick issue + photo) · `/site/checklists` (safety checklist).

**Safety Officer** (`20.7.7`): `/safety/incidents` (report/track) · `/safety/checklists`
(manage/review) · `/safety/permits` (permit approval — Safety approves, PM final) ·
`/safety/compliance` (compliance status + violation alerts).

**Tenant Admin** (`20.7.8`): all tenant pages above + `/settings/users` (list/create Path A
phone / Path B email users, change role, deactivate) + `/settings/tenant` (variance
threshold %, retention %, LINE channel token, notification prefs).

**Viewer** (`20.7.9`): read-only render of assigned modules — no action buttons at all.

**CRM / Sales Manager** (`20.7.10` — basic UI only in MVP): `/crm/leads` (list/create) ·
`/crm/opportunities` (create from lead; convert won → Customer) · `/crm/customers`
(read-only list). Kanban pipeline, CRM dashboards, proposal generation = post-MVP —
full screen specs in §15.3.

### 5.5 Mobile app IA (spec 17, 32 §32.7, 20 §20.3)

- **Bottom navigation, 4–5 items max** (`<MobileNav />`), icons + labels.
- Role-based screen sets; both auth paths on mobile.
- Known role screens from delta-sync spec (spec 17 §17.9): Site Engineer — reports screen
  with embedded material consumption; Safety Officer — dedicated `incidents` tab; issues
  screens with reactive lists + SYNCED badges; home shows issue count.
- **Daily site workflow to optimize for (spec 20 §20.3):**
  - Morning: worker check-in → task assignment → material verification → safety checklist
  - During work: progress updates → photo uploads → issue reporting → RFI submission
  - End of day: daily report generation (AI-assisted) → cost updates → delay/risk analysis
    → executive summary
- **Mobile core component library (spec 32 §32.7 — design these first):**

| Component             | Spec behaviour                                            |
| --------------------- | --------------------------------------------------------- |
| `<MobileNav />`       | Bottom nav, 4–5 items max, icons + labels                 |
| `<QuickActionCard />` | 60px min height, icon + label + badge, single tap         |
| `<PhotoCapture />`    | Camera + gallery grid, inline annotation, offline queue   |
| `<VoiceNoteButton />` | Hold-to-record, waveform animation, auto-transcription    |
| `<OfflineBanner />`   | Fixed top, queue count, auto-dismiss on reconnect         |
| `<TaskCard />`        | Swipeable (swipe-right = done), status badge, photo count |
| `<StatusChip />`      | Todo / InProgress / Done / Syncing / Synced               |
| `<OptimisticList />`  | Instant UI update, rollback on failure, retry option      |

- **Mobile prohibitions (spec 32 §32.7 + context Never-rules):**
  - ❌ Tables — use card layouts
  - ❌ Navigation deeper than 3 levels — restructure with bottom sheets / tabs
  - ❌ Modal-on-modal — use bottom sheets
  - ❌ Dropdowns with 50+ items without search
  - ❌ Any tap target below 44px height
  - Swipe/drag interactions must have a single-tap alternative (WCAG 2.5.7).

---

## 6. Offline-First UX (spec 17 — critical differentiator)

### 6.1 Sync-status vocabulary (visible everywhere on mobile)

Local records carry `sync_status`: **PENDING → SYNCING → SYNCED** (colour tokens:
`--mobile-offline #8E8E93`, `--mobile-syncing #FFD60A`, `--mobile-synced #00C853`).
Design badges on cards/lists, a queue count in `<OfflineBanner />`, and optimistic writes
with rollback (`<OptimisticList />`).

### 6.2 What works offline (spec 17 §17.4 — do not design offline writes beyond this list)

- **Full offline read/write:** tasks (progress %, status, notes) · site report drafts ·
  inspections (checklist + photos) · workforce attendance check-in/out · material
  consumption · safety checklists + incidents · equipment usage logs.
- **Online-required (read-cache only — design clear disabled/queued states):** POs,
  vendor invoices/AR/receipts/payments, budget-line mutations, vendor master,
  permissions/roles.
- **Read-only stale-while-revalidate cache:** project master, BOQ lines, room/floor
  reference, drawings (size-limited), vendor directory.

### 6.3 Sync behaviour to surface in UI

- **Priority flush order on reconnect (spec 17 §17.6):** 1 safety incidents → 2 attendance
  → 3 inspections → 4 task progress → 5 site reports → 6 material → 7 equipment →
  8 photos/media (deferred last). Progress UI should reflect this ordering.
- **Background sync:** every ≥15 min, ≤20 items/run; skipped when battery saver active or
  battery < 15% — communicate why sync is paused (spec 17 §17.2).
- **Retry exhaustion (5 retries, spec 17 §17.2):** safety incidents / attendance /
  inspections / material → moved to **Tenant Admin review queue** + push alert to PM
  (records preserved on device); task progress / report drafts / equipment → discarded
  attempt + in-app notification + manual retry option. Design both end states.
- **Limits & warnings (spec 17 §17.7):** photo queue max 100 — **warn the user at 80**;
  local DB ≤ 500 MB; drawing cache ≤ 200 MB LRU.

### 6.4 Conflict-resolution UX (spec 17 §17.5, context QM-9)

| Entity                | Strategy                          | UI implication                                              |
| --------------------- | --------------------------------- | ----------------------------------------------------------- |
| Task progress_percent | Max-wins (monotonic)              | No conflict UI needed; progress never regresses             |
| Inspection checklist  | Field-level merge                 | Show merged result; flag per-field overwrite where relevant |
| Site report           | Last-write-wins + review flag     | `CONFLICT_FLAGGED` → Site Engineer review queue             |
| Issues                | Field merge (status: server wins) | ConflictRecord for SE review if status changed server-side  |
| Workforce attendance  | Server wins on check_in           | Explain "server time kept" state                            |
| Safety incident       | Human review queue                | Both versions preserved, admin resolves side-by-side        |
| Financial entities    | No auto-resolution                | `CONFLICT_FLAGGED` + push to FINANCE/PM for manual decision |

Dedicated screens: `/site/conflicts` (web, spec 20 §20.7.5) and the Tenant Admin manual
review queue for failed syncs. Conflict statuses from the wire protocol:
`ACCEPTED | CONFLICT_FLAGGED | CONFLICT_REJECTED` (safety checklists are always
SERVER_WINS → `CONFLICT_REJECTED`).

---

## 7. SYSTEM_ADMIN Panel `/admin` (spec 20 §20.4 — fully specified screens)

Internal platform-operator UI. Not visible to tenants. All actions audit-logged.

1. **Tenant List (20.4.1)** — table columns: tenant code, name, plan type
   (STARTER/PROFESSIONAL/ENTERPRISE), status (Active/Inactive), Dedicated DB (— or
   truncated hostname), created date. Row actions: View detail · Deactivate ·
   Assign Dedicated DB (ENTERPRISE only). Provisioning-in-progress badge ("Provisioning…").
2. **Create Tenant (20.4.2)** — form: tenant code (a-z, 0-9, underscore; 2–50 chars),
   tenant name (2–255), plan type, optional dedicated DB URL (`postgresql://`).
   Success → redirect to list with new tenant highlighted.
3. **Assign Dedicated DB (20.4.3)** — prerequisite checklist gates the form (DB
   provisioned/reachable, migrations run, data migrated); URL field; warning callout
   before submit.
4. **Mark as Enterprise Contracted (20.4.4)** — prerequisites shown before enabling
   button; **type-the-tenant-code confirmation dialog**; success banner + provisioning
   status badge; error states: not ENTERPRISE (disabled + reason), inactive (disabled),
   already has dedicated DB (button hidden).
5. **Deactivate Tenant (20.4.5)** — type-code confirmation dialog; row greys out.

Human-gate notifications: workflow pauses at AWAITING_APPROVAL → SYSTEM_ADMIN gets in-app +
email ("Data migration approval required — Approve or abort") — design an approval action
surface (spec 19 §19.8, 34 §34.5).

---

## 8. Vendor Portal `/vendor` (spec 20 §20.7.12, 05 §5.4.3, 06 §6.8b, 28 §28.2)

External surface with a **minimal shell — no internal nav/role switcher** (own
`vendor/layout.tsx`, pattern: SAP Ariba / Coupa Supplier Portal).

| Route                     | Page                                  | Auth tier                                  |
| ------------------------- | ------------------------------------- | ------------------------------------------ |
| `/vendor/rfq/[token]`     | RFQ response                          | Tier 1 — magic-link, **no account needed** |
| `/vendor`                 | Dashboard (invited RFQs + linked POs) | Tier 2 (lightweight account)               |
| `/vendor/quotations`      | Quotation history                     | Tier 2                                     |
| `/vendor/purchase-orders` | PO status tracking                    | Tier 2                                     |
| `/vendor/invoices`        | Submit/track own invoices             | Tier 2                                     |

Design constraints: magic-link expires in 5–15 minutes and is single-use — design expiry
and already-used states; Tier-2 sessions are scoped per buyer tenant; frictionless
onboarding is a strategic goal (no account required to answer an RFQ — spec 27 §27.6).

---

## 9. Domain Screens — Data & Workflow Rules the UI Must Encode

### 9.1 Status vocabularies (spec 11 §11.2 — use exact states for chips/filters)

- Project: DRAFT → ACTIVE (+ types: residential/commercial/infrastructure/industrial)
- Task: not_started / in_progress / completed / blocked / cancelled; `progress_percent`
  0–100; `qc_status`: none / qc_hold / qc_passed
- PR: draft / submitted / approved / rejected
- RFQ: open / closed / cancelled (workflow: DRAFT→PUBLISHED→CLOSED→EVALUATED→AWARDED|CANCELLED,
  spec 32 §32.6)
- Quotation: pending / selected / rejected
- PO (workflow, spec 32 §32.6): DRAFT → PENDING_APPROVAL → APPROVED → SENT → ACKNOWLEDGED
  → PARTIALLY_DELIVERED → FULLY_DELIVERED → INVOICED → PAID | DISPUTED (reject returns to
  DRAFT). **Do not invent states.**
- Delivery: pending / partial / complete
- Vendor invoice (AP): pending / approved / paid
- Billing (AR): draft / issued / paid; Payment: scheduled / released / reconciled
- Retention: held / partially_released / released
- Contract (spec 11): draft / signed / active / terminated; `contract_type`
  main_contract / subcontract / supply_agreement. **A Contract is not a PO** — main_contract is the
  client-side agreement (`customer_id`, no vendor), subcontract/supply_agreement are vendor-side
  (`vendor_id`, no customer). `contract_value` on a main_contract is the basis for retention % and
  billing milestones, so Contract screens are the entry point to both (spec 12 §12.2 Note on
  Contract).
- Issue: open / in_progress / resolved / closed; types defect/rework/punch/general;
  severity low/medium/high/critical
- Inspection result: pass / fail / conditional (+ issue_severity when fail/conditional)
- Incident: severity low/medium/high/critical; status open/in_progress/resolved/closed
- Permit: pending / active / expired / revoked (types: work_permit / safety_permit /
  drawing_approval / entry_permit / building_permit / license) — building_permit + license `[MVP+]`
  (ADR-064) add `issuing_authority`; `project_id` nullable for a company licence
- CRM lifecycle: **Lead → (qualify) → Opportunity → (win) → Customer** (spec 11 §11.3)
- `[MVP+]` Variation Order (ADR-059): DRAFT / SUBMITTED / APPROVED / REJECTED — APPROVED auto-adjusts
  `contract_value` + budget + BOQ delta; Claim: SUBMITTED / UNDER_REVIEW / ACCEPTED / REJECTED
  (ACCEPTED → converts to VO)
- `[MVP+]` Bond (ADR-063): ISSUED / ACTIVE / RELEASED / EXPIRED / CALLED — expiry alert before `expiry_date`
- `[MVP+]` ProjectRisk (ADR-065): OPEN / MITIGATING / CLOSED / ACCEPTED; score = likelihood × impact (1–25)
- Contract signing `[MVP]` (ADR-058): bilateral ContractSignature INTERNAL + CLIENT (magic-link, PKI/VC);
  Contract reaches `signed` only when both signatures verify

### 9.2 Task completion gates (spec 11 §11.2 — design the blocking/warning UI)

Hard blocks (server rejects completion — show reason): failed/re-inspection pending;
open defect/rework/punch issue; incomplete predecessor tasks; expired/revoked permit;
open high/critical safety incident; task blocked by delay; no material delivery on the
linked BOQ item's PO.

Warn-only budget banners:

- Actual cost **85–99%** of BOQ budget → **orange warning banner**
- Actual cost **≥ 100%** → **red warning banner + PM acknowledgement click required**

### 9.3 Approval workflows (spec 15 §15.5 — design chains, timers, escalation)

| Workflow              | Initiator           | Approver(s)       | Final authority             |
| --------------------- | ------------------- | ----------------- | --------------------------- |
| PR → PO               | Site Eng / Proc Off | PM (to threshold) | Finance + Executive (above) |
| Vendor Invoice (AP)   | Procurement Officer | Finance           | Executive (above limit)     |
| Client Billing (AR)   | Finance             | PM                | Executive (above limit)     |
| Budget amendment / VO | PM                  | Finance           | Executive                   |
| Safety permit         | Site Engineer       | Safety Officer    | PM                          |
| Work permit           | Site Engineer       | Safety Officer    | —                           |
| Drawing approval      | Site Engineer       | PM                | —                           |
| Contractor payment    | Finance             | Executive         | —                           |

- Default PO thresholds (tenant-configurable): ≤ 50,000 THB PM alone; 50,001–500,000
  PM + Finance; > 500,000 PM + Finance + Executive.
- **48-hour approval timeout → escalate to next approver; second escalation → Tenant
  Admin** — design pending-approval ages, escalation indicators, and approval history
  (approver, decision, timestamp, comment — all recorded).
- Rejection at any step terminates the flow — notify initiator with reason.
- AI never approves anything: approve PO/invoice, budget change, workflow state changes
  are ALWAYS human actions (spec 22 §22.7 Autonomous Workflow Executor).

### 9.4 Dashboards & analytics (spec 09 §9.5, 20 §20.7)

- Role-based dashboard views only — no external BI tool in MVP; dashboards are built in
  the Next.js frontend.
- Executive portfolio dashboard is real-time (5-min cache); performance budget:
  dashboard p95 < 1s (context QM-6) — design skeleton/loading states.
- Report catalogue to design (spec 09 §9.5): daily site report (SE/PM) · project cost
  summary (PM/Finance) · procurement status (Procurement) · executive portfolio
  dashboard (Exec) · cash-flow forecast incl. 13-week direct-method view (Finance) ·
  safety compliance weekly (Safety) · AI risk report (Exec/PM).
- Tenant usage dashboard: AI token consumption vs monthly quota visible to Tenant Admin
  (spec 26 §26.1); warn at 80% (spec 22 §22.10 COST-001).

### 9.5 Financial display rules (spec 32 §32.5, context QM-3)

- Money: store DECIMAL(19,4), **display 2 decimal places**; currency = ISO 4217; THB
  default for Thai tenants formatted `฿1,234,567.89`.
- Never display float artifacts; reporting currency configurable per tenant.

---

## 10. Notifications UX (spec 19 — authoritative)

### 10.1 Channels

| Channel       | Mechanism               | Use                                                                   |
| ------------- | ----------------------- | --------------------------------------------------------------------- |
| In-app (web)  | SSE feed → bell + inbox | Real-time while active in web UI                                      |
| Push (mobile) | Expo Push (APNs/FCM)    | Field alerts                                                          |
| Email         | SendGrid → AWS SES      | Digests, escalations                                                  |
| LINE          | LINE Messaging API      | Parallel channel (tenant configures Channel Access Token in settings) |

SMS exists in the enum but has **no MVP adapter** — do not design SMS notification UI.

### 10.2 Types & routing (design the inbox taxonomy)

- **Immediate:** safety incident, inspection failed, budget exceeded, delay detected,
  AI risk prediction, PO approved/rejected, task assigned.
- **Digest:** daily site summary (18:00 local), weekly cost + procurement (Mon 08:00).
- **Escalation:** safety incident unacknowledged 30 min → PM; budget alert 2 h →
  Executive; AI risk 24 h → PM. Design acknowledge affordances so escalation timers are
  visible/stoppable.
- Role routing matrix in spec 19 §19.4 (Push vs In-app per event per role); routing is
  **project-scoped**.

### 10.3 Preferences screen (spec 19 §19.6)

- Per-channel enable/disable per notification type.
- Quiet hours (default 22:00–07:00) for push.
- Digest frequency daily/weekly.
- **Critical safety notifications (SafetyIncidentReported, SafetyViolationDetected)
  cannot be disabled** — render locked/always-on state.

---

## 11. AI Experience (spec 21 §21.4, 22 — MVP = Layer A only)

### 11.1 MVP AI features to design (Layer A — Assistive)

1. **Daily report generation** — AI drafts from raw Thai notes
   (e.g. input: `"งานเทพื้นชั้น 3 เสร็จ 80% แรงงาน 25 คน"`); output is a DRAFT the human
   reviews before publish.
2. **Voice transcription** for field notes (`<VoiceNoteButton />` hold-to-record).
3. **OCR** for drawings and invoices (upload → extracted text/fields).
4. **Document summarization**.
5. **AI Copilot** (RAG-backed contextual Q&A — `POST /api/v1/rag/query`, any role).

Report endpoints per role: site-summary (PM/SE) · procurement-summary (Procurement) ·
executive-summary (Exec) · delay-risk (Exec/PM) · history list (spec 14 §14.3).

### 11.2 AI UX guardrails (design these into every AI surface)

- **All AI output is advisory — never auto-posts.** Report drafts require PM review
  before publish; extracted financial fields stay advisory (spec 22 §22.4/§22.7).
- AI autonomy ladder (COORD-001, spec 22 §22.7): < THB 50k autonomous (logged);
  50k–500k recommend-only; 500k–5M flag & pause; > 5M block. Surfaces displaying AI
  recommendations should show confidence + data sources; any human may override with a
  recorded reason.
- Visual identity: AI modules/insights use **AI Cyan** `--cos-cyan #06B6D4`
  (dark: `#22D3EE`).
- Performance budget: AI report generation p95 < 5s — design generation progress states.
- Layer B (delay prediction, cost-overrun forecast) and Layer C (autonomous agents) are
  **post-MVP by delivery** but ARE in design scope — full screen specs in §15.4 (Layer B)
  and §15.5 (Layer C). Executive `/alerts` already carries the Layer B extension slot.
- Token quota: usage dashboard for Tenant Admin; soft alert 80%, hard cap 100% (request
  rejected with clear error or downgraded) — design quota states (spec 22 §22.10, 26 §26.1).

---

## 12. Internationalisation (spec 20 §20.5, context QM-3)

- **Languages:** Thai (primary, first-class) + English — ALL UI strings, errors, reports.
  Default locale `th-TH`, fallback `en-US`.
- **Zero hardcoded strings** — every label keys through i18n:
  `{domain}.{screen}.{element}` (e.g. `procurement.list.emptyState`). Design deliverables
  should name keys, not just literal copy.
- **Thai formats:** dates `DD/MM/YYYY` with optional **Buddhist Era** (พ.ศ. 2569 not 2026;
  configurable per tenant); currency `฿1,234,567.89`; phones `+66` displayed
  `0XX-XXX-XXXX`; `.` decimal / `,` thousands.
- ICU plural forms for all count strings; text must survive Thai/English length variance.
- **RTL support** is a platform mandate (test vs `ar-SA`) — avoid direction-locked layouts.
- Timestamps stored UTC, displayed in user timezone.

---

## 13. Accessibility — WCAG 2.2 AA (spec 20 §20.8 — shipping gate)

| Criterion                       | Applied requirement                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| 1.4.3 Contrast                  | Text ≥ **4.5:1** (≥ 3:1 large) — verify §32.7 tokens against a sunlight-readable floor |
| 1.4.11 Non-text contrast        | Component/state indicators (borders, focus, chips) ≥ **3:1**                           |
| 1.4.4 Resize text               | Layout survives **200% font scale** (verify at 375pt width)                            |
| 2.5.8 Target size               | ≥ 24×24px — already exceeded by 44px minimum; keep it                                  |
| 2.5.7 Dragging                  | Every drag/swipe has a single-tap alternative                                          |
| 2.4.7/2.4.11 Focus visible      | Visible, non-obscured focus (web); logical focus order (RN)                            |
| 3.3.7 Redundant entry           | Never re-ask data already provided in the same flow                                    |
| 3.3.8 Accessible authentication | No cognitive tests / inaccessible CAPTCHA on OTP login                                 |
| 4.1.2 Name/Role/Value           | Every control exposes accessible name + role + state                                   |

- **Colour is never the only signal** (1.4.1) — pair status colours with icon + text;
  mandatory for safety flows; safety alerts must be screen-reader announced.
- Screen-reader pass required on 5 critical flows: login, daily report, issue, safety
  incident, sync-status. A screen cannot ship without it.
- RN: every interactive element needs `accessibilityLabel` + `accessibilityRole` (+state).

---

## 14. Performance Budgets that Constrain Design (context QM-6, spec 30 §30.9, 31 §31.6)

| Metric                     | Budget                                 |
| -------------------------- | -------------------------------------- |
| Web LCP (p75)              | ≤ 2.5 s (throttled mobile profile)     |
| Web INP (p75)              | ≤ 200 ms                               |
| Web CLS (p75)              | ≤ 0.1 — reserve space; no layout shift |
| JS bundle per route        | ≤ 250 KB script transfer               |
| API read p95 / write p95   | < 300 ms / < 500 ms                    |
| Dashboard (ClickHouse) p95 | < 1 s                                  |
| AI report generation p95   | < 5 s                                  |
| Mobile cold start          | < 3 s on mid-range Android             |
| Offline sync (3G, 5 MB)    | < 30 s                                 |

Design implications: skeletons over spinners for dashboards; fixed-height media/badge
slots (CLS); lightweight imagery; no heavy chart libraries beyond budget; p75 must hold
on the **low-end-device + slow-network cohort** (spec 31 §31.6).

---

## 15. Full-Platform Design Scope — All Features & Screens by Phase

> Design scope covers the ENTIRE platform. Every screen below is a design deliverable,
> tagged with the phase in which it ships so the design system scales without re-design.
> Post-MVP screens must still obey every rule in §1–§14 (tokens, a11y, i18n, offline,
> performance) and ship behind feature flags (§16.7).

### 15.1 Phase tags (spec 28 §28.2, 32 §32.1, 18 §18.3)

| Tag     | Phase                                            | Timeline (spec 28)  |
| ------- | ------------------------------------------------ | ------------------- |
| `[MVP]` | Phase 1 — Internal Operations                    | Year 1              |
| `[MVP+]`| Post-MVP construction extensions (ADR-057..066)  | context/04 Ph 2/5   |
| `[P2]`  | Phase 2 — External Collaboration                 | Year 1–2            |
| `[P3]`  | Phase 3 — Marketplace Economy                    | Year 2–3            |
| `[P4]`  | Phase 4 — Financial Infrastructure               | Year 3–5            |
| `[P5]`  | Phase 5 — Smart Infrastructure (IoT/Twin, Ph 24) | Year 5+             |
| `[V2]`  | Vertical 2 — Infrastructure (civil/roads)        | Post-P4 + 18 months |
| `[V3]`  | Vertical 3 — Real Estate                         | Post-V2 + 18 months |

### 15.2 `[MVP]` baseline (spec 21 §21.2 — already specified in §5–§11)

Project management · BOQ · procurement (PR→RFQ→Quotation→PO→Delivery→Vendor Invoice) ·
daily site reports · cost tracking · workforce (check-in/out, timesheet, manpower) ·
safety (incidents, checklists, work permits, deterministic compliance view) · QC
(inspection forms pass/fail/conditional + photos) · mobile field app · role dashboards ·
AI report assistant (Layer A) · vendor portal · basic CRM · notifications · tenant
admin + SYSTEM_ADMIN panel · client contract signing (e-signature, bilateral PKI/VC — ADR-058).

### 15.3 Post-MVP extensions of core modules

**CRM advanced UI (spec 21 §21.6, 20 §20.2 CRM needs):**

- **Lead pipeline kanban** — pipeline (kanban) views over `crm.leads` /
  `crm.opportunities`; same lifecycle Lead → Opportunity → Customer (§9.1).
- **Opportunity tracking dashboards** — CRM analytics dashboards.
- **Proposal generation workflows** — AI-assisted proposal generation is the CRM/Sales
  AI collaboration point (spec 23 §23.2); advisory-only rules of §11.2 apply.
- **Contract management** views (spec 20 §20.2 CRM needs; Contract entity spec 11, statuses in
  §9.1). API is `finance/contracts` (spec 14 §14.3) and signing emits `ContractSigned`
  (spec 16 §16.2) — the module spans CRM and Finance; design one Contract record reachable from
  both.
- **CRM mobile screens** (excluded from MVP per spec 21 §21.6 — design for post-MVP
  mobile with the §5.5 component library and mobile prohibitions).

**Pre-Construction — Phase-2 extensions to the CRM Service (spec 01 §1.2):**
Feasibility study · Land acquisition · Tender management · Contractor bidding.
**UI decided (product owner, 2026-07-10): separate "Preconstruction" nav section**
(`/preconstruction/*` — Procore Preconstruction / Autodesk BuildingConnected pattern:
tender & bid management as its own product area). Backend remains a CRM Service
extension per spec 01 §1.2 (service placement, not UI). Recorded in spec 20 §20.7.12c.
Tendering is Phase A of the end-to-end lifecycle (spec 02 §2.1).

**Document engine — post-MVP capabilities (spec 03 §3.2, 13 §13.1):**
Version management · format conversion · **drawing viewer** (MVP has only OCR + file
storage). Drawing viewer must respect the mobile drawing cache limit (200 MB LRU, §6.3).

**Workforce advanced (spec 21 §21.2):** shift optimization · productivity analytics.

**Safety AI enhancement (spec 21 §21.2, 22 §22.7 SafetyVisionModel):** AI-based
compliance detection from site photos/video (PPE detection) layered on top of the
MVP deterministic compliance view — outputs are flags/predictions, advisory-only.

**Other deferred channels/tools:** SMS notification channel (spec 19 §19.2 — enum
exists, adapter post-MVP based on field adoption) · embedded BI / custom report builder
(Apache Superset evaluation, spec 09 §9.5) · AI translation (post-MVP Layer A,
spec 22 §22.2).

**`[MVP+]` Construction full-flow extensions (ADR-057..066 — designed post-MVP; execution in context/04):**
Design is authoritative in each ADR + spec (§11 schema / §14 API / §06 RBAC / §16 events / §20 UX). Screens:

- **Variation Order / Claims** `[MVP+]` — `/finance/contracts/{id}/variations`, `/finance/claims`; VO
  submit → approve (AR chain) surfaces auto-adjust to `contract_value` + budget + BOQ delta; claim → VO
  (ADR-059).
- **Inventory / Warehouse (WMS)** `[MVP+]` — `/procurement/{warehouses,inventory,grn}` + stock-movement
  ledger; GRN from a delivery; low-stock (reorder) view; moving-average value (ADR-060).
- **ราคากลาง central pricing** `[MVP+]` — `/admin/central-prices` (SYSTEM_ADMIN import + API-sync status);
  BOQ editor shows `reference_price` + variance + auto-populate; project BOQ-vs-ราคากลาง view (ADR-061).
- **e-GP tender / bid** `[MVP+]` — extends the Preconstruction nav above: e-GP tender feed (sync/manual),
  BOQ-priced bid prep (ราคากลาง), award import → `main_contract` (ADR-062).
- **Bank guarantees / bonds** `[MVP+]` — `/finance/bonds`; bond register (type / bank / amount / expiry /
  status) with expiry alerts (ADR-063).
- **Building permit & licence** `[MVP+]` — `/compliance/permits`; building permit (อ.1/อ.6) + company
  licence share the Permit register (§9.1 enum extended) + expiry alerts (ADR-064).
- **Project risk register** `[MVP+]` — `/projects/{id}/risks`; likelihood×impact heat map;
  raise / mitigate / close; AI-suggested triage (ADR-065).
- **Site instruction / minutes / correspondence** `[MVP+]` — `/projects/{id}/communications`; unified
  record by type + action-item tracker (ADR-066).

### 15.4 Layer B — Analytical AI screens (spec 22 §22.2, §22.4, §22.7; 21 §21.4)

Activates for Mid-market package when Layer B releases (spec 13 §13.2).

- **Delay prediction** — inputs: weather, workforce, procurement delays, historical
  productivity; outputs to visualize: **delay probability, critical-path risk,
  mitigation recommendation** (spec 22 §22.4). Delay severity chips reuse the event
  thresholds: LOW 1–2 days / MEDIUM 3–6 / HIGH 7–13 / CRITICAL 14+ (spec 32 §32.4 #8).
- **Cost anomaly detection** — surfaces: material cost spikes, fraud patterns,
  procurement inefficiency, abnormal labor productivity (spec 22 §22.4).
- **Budget overrun prediction · procurement forecasting · workforce optimization**
  (spec 22 §22.2).
- **Risk classification** — `RiskClassifier` outputs LOW/MEDIUM/HIGH/CRITICAL project
  risk scores (spec 22 §22.7 ML Models); every prediction carries `confidence` +
  `model_version` (spec 32 §32.4 #15) — **always display confidence and data sources**
  (COORD-001 audit rule) and show transparent accuracy metrics to users
  (spec 27 §27.7 mitigation).
- **Where they render:** `AI risk predictions` module is readable by Executive, PM,
  Site Engineer, Procurement, Finance, Safety (spec 06 §6.4 Intelligence Layer);
  `Forecasting reports` by Exec/PM/Procurement/Finance; `Knowledge graph (read)` by
  Exec/PM. Executive `/alerts` and the AI risk report (spec 09 §9.5) are the primary
  surfaces; acknowledge affordance required (unacknowledged 24 h → escalate to PM,
  spec 19 §19.3).

**Knowledge-graph read view (spec 12 — what the screen must answer):**

The view is not a graph for its own sake; spec 12 §12.4 states the four questions it exists to
answer, and those are the design brief:

1. **Risk propagation** — _"If supplier A delays cement delivery, which tasks/projects become
   affected?"_ Design the traversal from a cause to everything downstream, not a node explorer.
2. **Root cause analysis** — surface recurring failure patterns.
3. **AI context retrieval** — the same graph backs the Copilot's reasoning (§11.1); an answer
   should be able to cite the path it came from.
4. **Cross-project learning** — carry lessons between projects.

Nodes (spec 12 §12.2): Project · Building · Floor · Room · Structure · Task · Worker · Material ·
Equipment · Procurement · Contract · Inspection · Incident · Invoice · Delay. Three are conceptual
and resolve at query time — `Worker` → Employee via Workforce attendance, `Procurement` → the
stage-specific record (PR/RFQ/PO/Delivery/Vendor Invoice), `Invoice` → the AR Billing record — so
labels must show the resolved record, never the abstract node name.

Relationships to visualize (spec 12 §12.3): `DEPENDS_ON` · `USES` · `LOCATED_IN` · `PART_OF` ·
`DELIVERED_BY` · `FULFILLED_BY` · `VALIDATES` · `IMPACTS` · `BELONGS_TO`. Physical containment
(Room → Floor → Building) and dependency (`Task DEPENDS_ON Task`) are the two structures the layout
must make legible. Entity vocabulary and key properties: spec 10 §10.2.

- **Vendor/contractor trust scoring (ECO-004, spec 22 §22.7):** score 0.0–1.0 shown on
  vendor and contractor profiles, updated weekly; W3C Verifiable Credential adds +0.1.

### 15.5 Layer C — Autonomous AI screens (spec 22 §22.2, §22.7; 23 §23.5)

Capabilities: **auto-create RFQs · auto-detect risks · auto-generate schedules ·
auto-route approvals**. Design as supervised-automation surfaces, never silent actions:

- **Autonomy ladder UI (COORD-001):** < THB 50,000 executes autonomously (logged);
  50,001–500,000 renders as a _recommendation_ awaiting PM/Finance approval;
  500,001–5,000,000 _flag & pause_ (Finance + Executive); > 5,000,000 _blocked_
  (Executive + Board review). Each tier needs a distinct visual state.
- **Whitelist of autonomous actions (spec 22 §22.7):** send notification, generate
  report draft (PM reviews), flag risk/delay. AI never approves PO/invoice, never
  adjusts budget, never modifies workflow state, never signs off safety permits or
  structural changes (CIV-002) — never render an AI-actor approve button.
- **Override & audit:** every AI recommendation shows confidence + data sources; any
  human may override with a **required reason field**; all overrides recorded
  (COORD-001).
- **HITL / HOTL distinction (spec 23 §23.5):** high-consequence actions show
  approve-before-execute (human-in-the-loop); routine advisory output shows
  monitor-after with sampling review + one-click override (human-on-the-loop).
- **Framework note (LAYER-C-001):** Temporal.io is **provisionally pre-selected**
  (product owner decision 2026-07-10, recorded in spec 22 §22.3); final commitment is
  still gated by the §22.6 Thai benchmark when the Layer B trigger fires. No UI
  dependency — the governance surfaces above are framework-agnostic.

### 15.6 `[P2]` External Collaboration portals (spec 28 §28.2 Phase 2)

Same minimal external-shell pattern as the Vendor Portal (§8 — no internal nav).

- **Contractor portal** (subcontractors): track assigned tasks · submit progress
  updates · upload daily reports.
- **Customer portal** (clients — developers/building owners): view project progress ·
  milestone billing status · QC inspection results · handover documentation.
- Adoption target context: ≥ 30% of tenants with ≥ 1 client on the portal by end of
  Year 2 (spec 28 §28.4) — onboarding/invite flows matter as much as the screens.

### 15.7 `[P3]` Marketplace Economy (spec 28 §28.2 Phase 3, §28.7)

- **Material marketplace** — source materials from platform-verified vendors; price
  benchmarking from aggregated procurement data; bulk purchasing negotiation.
- **Workforce marketplace** — daily labor sourcing; subcontractor discovery;
  skill-based matching; compliance verification (work permits, insurance).
- **Equipment marketplace** — rental matching; cross-project equipment sharing;
  utilization optimization.
- **Vendor verification states (ECO-005):** eligibility = ≥ 3 verified projects +
  trust score ≥ 70 + avg RFQ response < 48 h; then a **90-day probation**; score < 60
  → suspension + human review; re-qualification after 60 days. Design badge/status
  progression (eligible → probation → active → suspended).
- **Transparent take rate (ECO-002):** 2–5% commission disclosed in platform terms
  before vendor onboarding — pricing disclosure UI is mandatory.

### 15.8 `[P4]` Financial Infrastructure (spec 28 §28.2 Phase 4, 13 §13.5)

- **Invoice factoring** — tenant submits approved/outstanding invoices to a fintech
  partner and receives advance payment (flow: select invoice → submit application →
  financing reference returned).
- **Construction financing** — project-milestone-linked draw-down loans, underwritten
  from platform data.
- **Insurance underwriting** — construction all-risk / liability priced from platform
  risk scores.
- **Risk scoring as a service** — AI project risk score sold as an API product
  (tenant-facing consent/subscription surfaces; revenue shared 60/30/10 and
  **distributed quarterly via the tenant portal** — spec 22 §22.7 CIV-004).
- **Payments (COORD-005):** PromptPay / Thai QR as an opt-in per-tenant channel —
  QR generated at checkout, B2B ≤ THB 2,000,000, settlement T+1.
- **Partner status:** fintech partner deferred per the spec trigger (PO confirmed
  2026-07-10) — design all financing flows **partner-agnostic** (Strategy-pattern
  per-partner adapters, spec 13 §13.5); candidates for TH remain SCB API / Kasikorn
  Business API via BoT Sandbox (INT-005).

### 15.9 `[P5]` IoT & Digital Twin — Phase 24 (spec 33)

- **Twin state view** — current project twin snapshot (`GET /twin/{projectId}/state`,
  5-min cache); entity types: STRUCTURE / EQUIPMENT / MATERIAL_STOCK / WORKFORCE_ZONE /
  INSPECTION_ZONE. **Every state shows a confidence score**: 1.0 = live IoT (≤ 60 s),
  0.7–0.9 = recent telemetry, < 0.7 = AI-inferred (spec 33 §33.3) — visualize the
  confidence tier, not just the value.
- **Divergence report** (actual vs BIM-planned; Exec/PM/SE): severity LOW gap < 0.15 /
  MEDIUM 0.15–0.40 / HIGH ≥ 0.40; divergence events route to notifications
  (spec 33 §33.5).
- **Entity registration** (device provisioning / BIM import) + **entity state history**
  with point-in-time query (`?asOf=` timestamp) (spec 33 §33.6).
- **Carbon analytics** — per-project carbon footprint from CarbonRecords
  (kgCO₂e per material consumption), reported by GHG Protocol Scope 1/2/3; per-tenant
  **carbon factor library** management (factor + mandatory `carbon_factor_source`)
  (spec 33 §33.4).
- **Smart city integration** — outbound data feeds to municipal systems (future;
  municipal partnership required, spec 33 §33.7).
- Commercial states: IoT per-device subscription, digital-twin premium add-on per
  project, carbon report per-fee (spec 33 §33.9) — design enabled/disabled add-on
  states per project.
- **Metric definitions decided (PO 2026-07-10, spec 33 §33.10):** twin/IoT dashboards
  must render — connected device count · % devices disconnected + disconnect reasons ·
  data freshness (device-vs-cloud timestamp mapped to confidence tiers) · confidence
  distribution per tier · divergence detection latency · BIM `digital_ref` coverage % ·
  carbon report adoption (% tenants/month). AWS IoT Lens measurement pattern; numeric
  targets arrive from the 90-day baseline — design target-line/threshold slots as
  configurable, not hardcoded.
- **Sizing envelope decided (PO 2026-07-10, spec 33 §33.8):** TimescaleDB chunk policy =
  7-day start + Timescale 25%-memory rule; IoT throughput budget =
  Σ(devices × sampling rate) ≤ 25K msg/s QoS1 per EMQX 4vCPU node (bridging figure) —
  device-count scale per project informs twin entity-list/map density design.

### 15.10 Asset Management module (spec 06 §6.4, 13 §13.1 Layer 2, 11 §11.2)

**IA decided (product owner, 2026-07-10): Hybrid** — tenant-level asset registry plus a
project-scoped handover entry point (registry follows the Yardi Voyager / MRI standalone
pattern, aligned with the V3 direction spec 28 §28.9 already uses; handover follows the
Procore / Autodesk Construction Cloud project-closeout pattern). Recorded in
spec 20 §20.7.12b. The registry serves Phase F of the end-to-end lifecycle —
handover → warranty → maintenance (spec 02 §2.1).

- `/assets/units` — **Unit inventory**: Unit entity (unit_number, unit_type, status);
  Exec R / PM RW / SE R / Finance R / CRM R.
- `/projects/{id}` **Handover tab** — handover_date; emits `AssetHandedOver`;
  PM/SE/CRM RW; a handover writes into the tenant-level asset registry.
- `/assets/warranty` — warranty_expiry tracking (`WarrantyActivated`); read-mostly.
- `/assets/maintenance` — maintenance_status (`MaintenanceScheduled`); PM RW.

### 15.11 `[V2]` Infrastructure vertical (spec 28 §28.8 — screen-level UX is specified)

UX paradigm shift: **map-first** (GIS primary pane), Linear Referencing System
(km marker/offset/lane), core object = Asset (road segment, bridge span, pipe section),
asset-lifecycle time horizon, users = inspector / maintenance crew / capital planner.

GIS engine intentionally undecided (PO confirmed 2026-07-10: decide at V2-1 entry per
spec 28 §28.8 — Esri / Mapbox / OpenLayers) — design every V2 map screen
**engine-agnostic**.

Five screens are fully specified in spec 28 §28.8 (Screen-Level UX Spec):

- **Map view (home)** — GIS map with asset layers (roads as polylines, bridges as
  points, utilities as polylines); **condition colour code: green ≥ 70 · amber 40–69 ·
  red < 40**. Click asset → info panel (type, condition score, last inspection date,
  last WO) with "Inspect" and "Create WO" CTAs.
- **Asset detail** — tabs: Attributes · Inspection history · Work-order history ·
  IFC 3D viewer (when an IFC file is present). Edit attributes; open inspection/WO
  records; download IFC; "Create inspection" CTA.
- **Mobile inspection form** — asset auto-populated from map tap; condition rating
  dropdown **0–9 (NBI scale)** with per-value criteria text; defect
  type/class/severity dropdowns; photo; GPS auto-set. **Offline-first** (buffered on
  device, syncs on reconnect); submit emits `asset.inspection.submitted.v1`.
- **Work order form** — asset linked; work type PREVENTIVE/CORRECTIVE; trade code;
  crew assignment; scheduled date; cost estimate. Submit emits
  `asset.workorder.created.v1`; crew notified via the notification service.
- **Capital planning dashboard** — condition distribution histogram (0–100);
  maintenance backlog table sorted by condition score ascending; budget vs forecast
  bar chart by year. Filter by asset_type / country_code; export PDF/Excel.

Work-order statuses: DRAFT / SCHEDULED / IN_PROGRESS / COMPLETE / CANCELLED; asset
statuses: ACTIVE / UNDER_MAINTENANCE / DECOMMISSIONED (spec 28 §28.8 resources).

### 15.12 `[V3]` Real Estate vertical (spec 28 §28.9 — screen-level UX is specified)

UX paradigm shift: **portfolio-first** — occupancy %, NOI, lease expiry; core objects =
Property, Unit, Lease, Tenant; users = leasing agent / property manager / investor.

Five screens are fully specified in spec 28 §28.9 (Screen-Level UX Spec):

- **Portfolio dashboard** — KPI tiles: Occupancy %, NOI vs Budget, Delinquency %;
  **lease expiry bar chart** (sqm/units expiring by month, next 24 months); property
  list with per-property occupancy %. Tiles drill to underlying records; clicking an
  expiry bar opens the lease list for that month; property → property detail.
- **Property detail** — **unit stacking plan** (floor grid: green = LEASED · amber =
  RESERVED · white = AVAILABLE · grey = SOLD); occupancy % per floor; open maintenance
  count. Click unit → panel with lease history; "Add lease" CTA from the unit panel.
- **Lease wizard** — **5 steps:** (1) Unit select → (2) Tenant info → (3) Lease terms
  (dates / rent / escalation %) → (4) Approval → (5) Activate. Status DRAFT on create,
  ACTIVE on step 5; emits `lease.activated.v1`; unit status auto-sets to LEASED.
- **Presales CRM** — **unit matrix** (rows = floors, columns = unit positions),
  coloured AVAILABLE / RESERVED / SOLD; reservation queue sorted by `reserved_until`;
  deposit + contract status. Reserve → RESERVED with expiry; cancel → back to
  AVAILABLE; deposit confirmed → contract generated; handover → SOLD.
- **Rent roll** — table: property / floor / unit / tenant / lease start–end / monthly
  rent / escalation / status; sortable by any column; subtotal per property. Filter by
  property, status, expiry range; export PDF/Excel; bulk rent review trigger.

Lease statuses: DRAFT / ACTIVE / RENEWAL / AMENDMENT / TERMINATED; unit statuses:
AVAILABLE / RESERVED / LEASED / SOLD (spec 28 §28.9 resources).

### 15.13 Enterprise / ecosystem opt-in surfaces

- **DID / Verifiable Credentials module (spec 05 §5.3 BG-001)** — opt-in Enterprise:
  tenant admins issue VCs to workers (contractor licence, equipment certification,
  safety-training records); third parties verify cryptographically.
- **Industry data-sharing opt-in (spec 09 §9.6 INT-002)** — explicit consent flow:
  Tier 1 contribute aggregate metrics → unlock industry benchmark reports; Tier 2
  contribute detailed data → unlock AI premium scoring; withdrawal any time (past
  anonymised aggregates retained — state this in the consent copy).
- **API monetization & quota (spec 13 §13.5)** — monthly external-API quotas per tier
  (SMB 50k / Mid-market 100k / Enterprise 1M default); overage → block + notify
  TENANT_ADMIN; per-key cap ≤ 20% of tenant quota — design quota usage + overage
  notification states alongside the AI-token dashboard (§9.4).
- **Module subscription (spec 22 §22.7 GLOB-004)** — tenants subscribe to intelligence
  modules (Construction Core / Infrastructure / Real Estate) — subscription management
  surface, no module lock-in.

---

## 16. Cross-Cutting UI Conventions

1. **Error format (context QM-10):** every API error carries `code` (`COS-{DOMAIN}-{NNN}`),
   human message, i18n `messageKey`, `traceId`. Error UI: 400 field-level validation
   messages · 401 re-auth · 403 show required permission · 404 not found · 409 conflict
   (optimistic lock/duplicate) · 422 business-rule violation (human-readable) · 429 rate
   limited with `Retry-After` countdown · 500/503 generic failure (never stack traces).
2. **Standard list envelope (spec 14 §14.3):** pagination = `limit / offset / page / total`
   — design consistent pagination + filter bars (status, project, date are the recurring
   filters).
3. **Soft delete (spec 11 §11.4):** deleted records vanish from normal views (deleted-at
   filter); admin/audit views may show `[ERASED]` placeholders for PII-erased records.
4. **Audit visibility (spec 06 §6.4):** audit-log screens for Executive/PM/Finance (read)
   and Tenant Admin (full); every SYSTEM_ADMIN action requires a justification string —
   design the justification input.
5. **Files (spec 09 §9.2, 14 §14.3):** photos, videos ≤ 1 GB, voice notes ≤ 25 MB,
   drawings/PDFs; upload progress, MIME/type errors, quarantine state (infected files),
   signed short-lived download URLs; project file lists filterable by type/uploader.
6. **API-first rule (spec 13 §13.5 BG-002):** every capability is a versioned REST API —
   no UI-only features; deprecated API versions surface an **in-app banner** ≥ 90 days
   before sunset (spec 14 §14.4).
7. **Feature flags (context QM-15):** every new screen ships behind a flag
   (`{stage}.{domain}.{feature}`) — design must tolerate a module being off per tenant.
8. **Status page / maintenance:** planned maintenance windows per tier exist; safety
   alert delivery is never suspended (spec 08 §8.2).

---

## 17. Screen Inventory Checklist (consolidated deliverable list — full platform)

Untagged items = `[MVP]`. Post-MVP items carry their §15.1 phase tag.

**Auth:** login (Path B) · OTP login (Path A: phone → code → verify) · MFA challenge ·
MFA enrollment (QR) · session expiry · logout.

**Shell:** web sidebar+topbar shell · notification inbox/bell · offline/sync indicator ·
language switcher · mobile bottom-nav shell.

**Executive:** portfolio home · portfolio list · risk alerts · AI executive reports.

**PM:** projects list/create · project detail (status, members, docs, BOQ summary) ·
project procurement · project budget variance · project site summary · PM analytics
dashboard.

**Procurement:** PRs · RFQs (+award/cancel) · quotation comparison · POs (+approval chain,
delivery timeline) · deliveries · vendors (+scoring).

**Finance:** payments approval queue · project budget + lines · invoices
(verify/approve/dispute) · variance report · billing (AR) + receipts · contracts ·
customers · 13-week cash-flow forecast · contract signing (e-sign, ADR-058).

**Site (SE/SW):** daily report create/review · task list + progress update · issues
(+quick create with photo) · inspections (+approve/re-inspect) · conflict resolution ·
material consumption logging · check-in/out + timesheets.

**Safety:** incidents (report/acknowledge/track) · checklists · permits (approve/reject) ·
compliance view.

**CRM:** leads · opportunities (+convert) · customers · `[post-MVP]` lead pipeline
kanban · opportunity dashboards · proposal generation · contract management · CRM
mobile screens · pre-construction (feasibility study, land acquisition, tender
management, contractor bidding).

**Tenant Admin:** user management (create Path A/B, role change, deactivate) · tenant
settings (variance %, retention %, LINE token, notifications) · notification preferences ·
failed-sync review queue · usage/AI-token dashboard.

**SYSTEM_ADMIN `/admin`:** tenant list · create tenant · assign dedicated DB ·
mark-contracted (+approval human gate) · deactivate tenant.

**Vendor `/vendor`:** magic-link RFQ response · vendor dashboard · quotations · PO status ·
invoice submission.

**Mobile-specific:** offline banner · sync queue view · photo capture/annotate · voice
note record · AI report draft review · incidents tab (Safety) · reports+material (SE).

**`[post-MVP]` Core-module extensions (§15.3):** document version management · format
conversion · drawing viewer · workforce shift optimization · productivity analytics ·
AI safety-vision compliance detection · SMS channel preference · custom report builder
(embedded BI) · AI translation.

**`[MVP+]` Construction full-flow extensions (§15.3, ADR-057..066):** variation orders / claims
(`/finance/contracts/{id}/variations`, `/finance/claims`) · bonds register (`/finance/bonds`) ·
warehouses / inventory / GRN + stock-movement ledger (`/procurement/*`) · ราคากลาง central prices
(`/admin/central-prices` + BOQ variance) · e-GP tender / bid (`/preconstruction/*`) · building permit &
licence (`/compliance/permits`) · project risk register (`/projects/{id}/risks`) · communications /
doc-control (`/projects/{id}/communications`).

**`[post-MVP]` Layer B AI (§15.4):** delay prediction view (probability, critical-path
risk, mitigation) · cost anomaly detection · budget overrun prediction · procurement
forecasting · workforce optimization · project risk classification (LOW→CRITICAL +
confidence) · forecasting reports · knowledge-graph read views · vendor/contractor
trust-score display.

**`[post-MVP]` Layer C AI (§15.5):** autonomous action feed (whitelisted actions log) ·
recommendation approve/override surfaces per COORD-001 tier · override-reason capture ·
HITL approval gates · HOTL sampling review.

**`[P2]` Portals (§15.6):** contractor portal (tasks, progress updates, daily reports) ·
customer portal (progress, milestone billing, QC results, handover docs) · portal
invite/onboarding flows.

**`[P3]` Marketplace (§15.7):** material marketplace (browse verified vendors, price
benchmarks, bulk negotiation) · workforce marketplace (labor sourcing, skill matching,
compliance verification) · equipment marketplace (rental matching, sharing,
utilization) · vendor verification/probation states · take-rate disclosure.

**`[P4]` Financial (§15.8):** invoice factoring application + tracking · milestone
draw-down loan views · insurance underwriting views · risk-score API subscription ·
quarterly revenue-share view · PromptPay/Thai QR checkout (opt-in).

**`[P5]` IoT / Digital Twin (§15.9):** twin state snapshot (+confidence tiers) ·
divergence report (LOW/MEDIUM/HIGH) · entity registration · state history +
point-in-time · carbon analytics dashboard (GHG Scope 1/2/3) · carbon factor library ·
add-on subscription states.

**Asset Management (§15.10 — routes design-derived):** unit inventory · asset handover ·
warranty · maintenance.

**`[V2]` Infrastructure (§15.11):** map view home · asset detail (+IFC viewer) · mobile
inspection form (NBI 0–9, offline-first) · work order form · capital planning dashboard.

**`[V3]` Real Estate (§15.12):** portfolio dashboard · property detail (stacking plan) ·
lease wizard (5 steps) · presales CRM (unit matrix) · rent roll.

**Enterprise / ecosystem opt-ins (§15.13):** DID/VC issuance + verification · data-sharing
consent (tiers + withdrawal) · API quota usage + overage states · intelligence-module
subscription management.

---

## 18. Source Map (traceability)

| Topic                                             | Authoritative spec                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| Brand, tokens, components, touch targets          | `32-implementation-specifications.md` §32.7                            |
| UX philosophy, pages per role, /admin, a11y, i18n | `20-ux-flow.md`                                                        |
| Roles & permission matrix                         | `06-rbac-permission-matrix.md`                                         |
| MVP boundary & post-MVP exclusions                | `21-mvp-scope.md`                                                      |
| Product layers, packaging, integrations           | `13-product-architecture.md`                                           |
| Offline sync UX                                   | `17-offline-mobile-sync.md`                                            |
| Notifications                                     | `19-notification-architecture.md`                                      |
| Approval chains & escalation                      | `15-event-driven-workflow.md` §15.5                                    |
| Workflow state machines (RFQ/PO)                  | `32-implementation-specifications.md` §32.6                            |
| Entity fields & statuses, task gates              | `11-database-schema.md`                                                |
| API surface / endpoints / envelope                | `14-api-architecture.md`                                               |
| Auth flows (OTP, OIDC, MFA, vendor magic-link)    | `05-security-compliance.md` §5.4                                       |
| AI features, Layer B/C, governance & guardrails   | `22-ai-architecture.md`, `23-ai-native-operating-model.md`             |
| Reports & dashboards                              | `09-data-architecture.md` §9.5                                         |
| Performance budgets (CWV, latency)                | `30-testing-strategy.md` §30.9, `31-monitoring-observability.md` §31.6 |
| Business context, personas, market                | `00/01/25/26/27/28/29` series                                          |
| Vendor portal & ecosystem                         | `28-ecosystem-expansion.md`, `05 §5.4.3`, `06 §6.8b`                   |
| Expansion phases (P2–P5), marketplace, financial  | `28-ecosystem-expansion.md` §28.2, §28.7                               |
| IoT / Digital Twin / carbon (Phase 24)            | `33-digital-twin-iot.md`                                               |
| V2 Infrastructure / V3 Real Estate screen specs   | `28-ecosystem-expansion.md` §28.8–28.9                                 |
| Data-sharing opt-in, benchmark ownership          | `09-data-architecture.md` §9.6                                         |
| DID / Verifiable Credentials module               | `05-security-compliance.md` §5.3 (BG-001)                              |
| `[MVP]` contract signing (e-sign)                 | ADR-058 + `11/14/06/16/20`                                             |
| `[MVP+]` construction full-flow extensions        | ADR-057..066 + `docs/specifications/` + `context/04` (Ph 2/5)         |
