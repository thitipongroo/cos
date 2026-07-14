# Competitive Analysis — KANNA (Aldagram Inc.) vs Construction OS

> **Status:** research document — NOT an architecture spec; nothing here overrides `docs/specifications/`.
> **Date of research:** 2026-07-13 (all vendor pages live-fetched on this date)
> **Method:** multi-agent deep-research run (19 sources → 94 extracted claims → 25 adversarially
> verified: 15 confirmed / 2 refuted / 8 unverified due to verifier quota exhaustion), followed by
> direct primary-source fetches (vendor feature/pricing/news pages, Capterra, App Store, Google Play).
>
> **Evidence legend:**
>
> - 🔬 **OBSERVED IN-PRODUCT** — seen directly by driving a logged-in KANNA trial account with a real
>   browser (Playwright) on 2026-07-13; screenshots + DOM captured. Highest-confidence tier here.
> - ✅ **VERIFIED** — survived 3-vote adversarial verification (or 2-1 with high-quality evidence)
> - 🔶 **PRIMARY** — read directly from a primary source (vendor page / store listing) in a single
>   fetch, not adversarially cross-verified
> - ⚠️ **UNVERIFIED** — reported by a source but could not be confirmed; do not rely on it
> - ❌ **REFUTED** — actively disproven; do not repeat

---

## 0. In-product deep audit — trial account, 2026-07-13 🔬

> Driven with a real logged-in browser session (Thai-locale tenant, "TP NOTT", KANNA Project = Trial
> plan, KANNA Report = under contract). Read-only navigation; no data created/modified. **This section
> supersedes earlier marketing-page inferences where they conflict** — three material corrections are
> flagged ⬇️ **CORRECTION**.

### 0.1 What KANNA actually is, seen from the inside

A **project + site-management workspace** organized around projects. Global left-nav: Projects,
Project Board, Project Calendar, **Company Dashboard**, Client list, Import, Export, Settings, Member
management, Change Plan. Global header: **Approval inbox** (`/approval-requests`), global Tasks,
KANNA Calendar, project Chat, Notifications, Help, and **KANNA AI**.

**Per-project surface = 12 tabs** (🔬 observed on the sample "CONSTRUCTION" project):
Overview · **Executive Summary** (`/financial-indicator`) · **Dashboard** (EVM) · Related Projects ·
Gantt (`/gantt-chart`) · **Task Assignment** (`/tasks`) · **Reporting** (`/work-reports`) · Photos
(`/images`) · Documents · **Forms** (`/gembadocs` — the KANNA Report custom forms) · Photo Reports
(`/reports`) · Members. Plus per-project chat, CSV export, and "generate QR-code app" for field entry.
Project status has **only 3 states**: ก่อนปฏิบัติงาน (pre-work) → กำลังปฏิบัติงาน (in-progress) → แล้วเสร็จ (done).

### 0.2 ⬇️ CORRECTION #1 — KANNA DOES have cost/value + billing tracking (earlier doc was wrong)

Earlier this doc said KANNA has "no cost/budget module, no finance/AR-AP." **In-product that is too
strong.** KANNA ships a lightweight, **manual-entry, project-level financial layer**:

- **Executive Summary tab = Financial Overview** 🔬: a donut of Project Value / Billed (%) / Collected
  (%), a **Project Value** field (with input date), and **Billed and Collected** — `Total Billed −
Total Collected = Balance` — with an "+ Add" to enter billing/collection records manually. This is a
  lightweight **AR/billing-and-collection tracker** per project.
- **Project Dashboard tab = EVM** 🔬: Planned vs Actual start/end, days elapsed/remaining, overall
  progress (planned % / actual % / variance %), and a **Cost & Value Overview**: Planned Cost, Actual
  Cost, plan-vs-actual cost delta, **Planned Value (PV), Earned Value (EV), Schedule Variance, Cost
  Variance**, plus cost-per-task (plan vs actual). This is genuine **Earned Value Management**.
- **Company Dashboard** 🔬: portfolio rollup — total/on-schedule/behind/completed projects, Target
  Achievement, a **Cost (ต้นทุน)** widget, Project Pipeline, project list, history (all empty in trial).
- Settings expose a **Currency** setting and **Approval Route** config 🔬.

**But the ceiling is real:** all cost/value/billing figures are **hand-entered at the project (and
per-task) level**. There is **no transaction-derived cost** — cost does not flow from purchase orders,
deliveries, or invoices, because those objects do not exist in the product (see 0.4).

### 0.3 ⬇️ CORRECTION #2 — pricing lineup + two separately-licensed products

In-app **Change Plan** page 🔬 shows KANNA is **two independently-licensed products**:
**KANNA Project** and **KANNA Report** (each member consumes a KANNA Project seat and/or a KANNA
Report seat; the trial shows 1/10 of each). The **KANNA Project** ladder (Thai tenant, current) is:

| Plan           | Company accounts | Storage | Price                                                                                                                  |
| -------------- | ---------------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Free (ฟรี)** | 0                | 0.5 GB  | ¥0 — "receive invitations from other companies + view project data" only; **trial auto-downgrades here** after 14 days |
| Trial          | 10               | 5 GB    | active now, 14 days left                                                                                               |
| **Light**      | 10+              | 200 GB  | quote (ใบเสนอราคา)                                                                                                     |
| **Pro**        | 15+              | 400 GB  | quote — "mid-size firms managing large sites, data-driven ops"                                                         |
| **ProPlus**    | quote            | quote   | quote — "all Pro features **+ KANNA Report — create & send reports even without internet**"                            |
| **Enterprise** | quote            | quote   | quote — security + support focus                                                                                       |

**KANNA Report** is priced separately by number of company user accounts (quote-only). This **corrects**
the earlier "Light / Basic / Enterprise" lineup (that was a stale JP-page reading) and confirms two
things: (a) there **is** a genuine ¥0 Free plan, but only for _external-invitee/viewer_ use; (b) **offline
report creation is a paid capability gated to ProPlus+** — not a base feature.

### 0.4 What is genuinely ABSENT — verified by exhaustive in-product walk 🔬

Walked every global nav item, all 12 project tabs, and all Settings sub-pages. **No surface anywhere for:**

- **Procurement** — no purchase request / RFQ / quotation / purchase order / delivery / goods-receipt
  object or workflow. No procurement state machine.
- **Vendors/suppliers** — the only counterparty entity is **Clients** (รายชื่อลูกค้า, customer-side).
  There is no vendor master and no vendor portal.
- **BOQ** — no bill-of-quantities line-item engine; no quantity × unit-rate estimating structure.
- **AP / invoicing documents** — no vendor-invoice object, no PO document, no double-entry ledger.
  ("Billed/Collected" is a manual AR _tracker_, not an invoicing/AP system.)
- **Dedicated inspection/checklist entity** — Forms (`/gembadocs`) are generic custom forms; there is
  no first-class inspection with pass/fail that auto-creates an issue/defect record.

### 0.5 KANNA AI, in-product 🔬 — ⬇️ CORRECTION #3 (scope)

The header **KANNA AI** button (`aria-label="สอบถาม KANNA AI"`) opens a slide-out chatbot whose own
greeting is: _"Hello! The AI will answer questions about **how to use KANNA**."_ with FAQ chips like
"How do I approve members from other companies?", "How do I add members?". So the **web** KANNA AI is a
**product-usage/help assistant**, **not** an operational AI that reads project data or generates site
reports. The marketing-advertised "AI Voice Reporting" and "AI Assistance/MCP" were **not observable in
the web trial** — they are likely mobile-app features; treat their operational depth as still unverified.

### 0.6 RBAC, as observed 🔬

Member management uses a coarse **company-authority** role (a dropdown; the owner shows "เจ้าของ" /
Owner) plus a hard **internal vs external** split: Company members · Support-team (external-company)
members · Partners, with per-project membership and separate KANNA Project / KANNA Report seat
assignment. This is **not** granular per-module RBAC — nothing resembling COS's role matrix
(SYSTEM_ADMIN / TENANT_ADMIN / PM / PROCUREMENT_OFFICER / FINANCE / SAFETY_OFFICER / SITE_ENGINEER …).
Security Management and an **Audit log** do exist under Settings.

### 0.7 Audit limitations (stated, not guessed)

Tested the **web app only** with a **single owner account**. Therefore NOT observed: the **mobile**
app (so mobile offline behavior and AI voice reporting are unverified in this audit); multi-role RBAC
enforcement depth; the Approval Route/Flow executing end-to-end; and any behavior behind paid
KANNA Report / ProPlus tiers. Everything in §0 is from static navigation of seeded-empty sample
projects — no records were created. **Session note:** KANNA web sessions are short-lived / re-auth
aggressively — the storage-state session expired mid-crawl and bounced to `/signin` even right after a
fresh login, which blocked two probes (see §0.9). Not hammered further, to avoid trial-account lockout.

### 0.8 Deeper read-only findings (2nd pass — settings, data model, create/add modals) 🔬

Second pass drove every Settings sub-page, the global pages (Board, Calendar, Approval inbox, Import,
Export, Audit log, Company profile, Partners), and opened create/add modals to read their fields
(cancelled without saving — no data created).

- **Data model is a closed, project-centric set** 🔬. Both **Import** (`/settings/import`) and **Export**
  (`/report_outputs/project`) offer exactly: **Project · Project members · Client · Property (物件) ·
  Reports · Forms** — and nothing else. There is **no vendor, no purchase order, no BOQ, no cost, no
  invoice** importable/exportable entity. Import is Excel-only, ≤500 rows/file. The Project import
  schema fields are: UUID, parent-project ID, management ID, name (req), detail, start/end date,
  status (pre-work/in-progress/done, req), note, group ID. Client fields include a Thai-localized
  address (อำเภอ/เขต/ตำบล, จังหวัด, รหัสไปรษณีย์) and business type (corporate/individual).
- **Create-Project modal** 🔬 (`/projects/quick-register/new`): template · management ID · title ·
  description · start/end date · status (3 radios) · note. **No budget or cost field at all** — a
  project has no financial attribute; cost/value is a _separate manual overlay_ added later on the
  Dashboard / Executive-Summary tabs.
- **A KANNA "task" is not a cost object — RESOLVED by a create→inspect→delete test** 🔬 (a throwaway
  task was created, inspected, then deleted; the account is back to 0 tasks). The task **create modal**,
  the task **detail editor**, AND the task **⋯ menu** (which offers only "view history" + "delete task")
  expose **no cost/budget field anywhere**. A task = name · assignee · due date · requester · content ·
  photo/doc attachments · mark-complete. After adding the task, the project Dashboard's EVM cost fields
  **stayed empty ("-")**, proving tasks do **not** feed cost. The Dashboard's "cost per item" is keyed to
  **sub-projects**, not tasks. So planned/actual cost is a **(sub-)project-level manual entry**, never
  per-task — and on this plan the sub-project financial-entry surface wasn't reachable (sub-projects
  lack the Dashboard/Executive-Summary tabs entirely; the parent's cost fields remain hand-entered/empty).
- **Billing entry modal** 🔬 (Executive Summary "+ Add"): type (radio **Billed / Collected**) · date
  (req) · amount (req) · note · registered-by. So the AR tracker is **plain manual line entries** —
  no invoice documents, no line items, no PO/delivery linkage. "Amount" is a bare text field.
- **Currency** 🔬 (`/settings/currency`): a **single company-wide currency, display-only on the Gantt
  chart** — explicitly "affects display for the whole company." This is **not** multi-currency
  transactions, per-tenant reporting currency, or FX — far shallower than COS's §32.5 financial
  precision (DECIMAL(19,4) + decimal.js + Open Exchange Rates).
- **Report templates** 🔬 (`/settings/customize/work-report`): custom daily-report templates "shown on
  web + smartphone app"; only a "standard template" seeded. **Custom Report / gembadocs**
  (`/settings/gembadocs/templates`): forms must be registered as templates, has a **Master Data**
  concept; "No report templates available." No pre-shipped **inspection / KY-activity** template was
  observed (the earlier BOXIL-sourced report-type list stays ⚠️ unverified).
- **Project customization** 🔬: projects support custom fields via templates (max 2 company templates;
  base template = project info + client info + 3 statuses). Gantt templates also savable.
- **Audit log** 🔬 (`/audit_logs`): records login / logout / project operations with timestamp, event,
  operator, and **IP address**; 30-day window; **Bulk Download**. Present but scoped to auth + project
  ops (not a full field-level change log across all entities as observed).
- **Approval** 🔬 (builder now captured, `/settings/approval-routes/new`): an approval route =
  a **name + one or more ordered stages**; each stage has an **approver list** ("add approver") and a
  per-stage **condition = "all approvers" OR "single-person approval"**, plus "add approval stage" for
  multi-stage, and an "editing-during-request" flag (not allowed / own-company only). **Confirmed: there
  is NO amount-threshold or value-conditional routing** (the field is `stages.N.approvalCondition` =
  all/single, never an amount). So KANNA approval is **person/stage-list based**, categorically unlike
  COS's _financial-amount-tiered_ chains (≤50k→PM, 50k–500k→+FINANCE, >500k→+EXECUTIVE, §15.5). The
  inbox (`/approval-requests`) carries requester · approver · request date · **approval deadline**.
- **Notification channels** 🔬 (`/settings/notifications`): per-user web channels are **Desktop
  (browser push) + Email only** (email requires verification first). Event toggles cover project
  membership, new report/photo/document, status change, task assigned/completed/due (morning+evening),
  company announcement, calendar, and a **"custom-report alert when a field value matches a condition"
  (project-admins only)** — i.e. KANNA Report forms support simple value-threshold alerts. Advance
  project start/end reminders (1/3/7/14 days) are **email-only**. **LINE is not on this per-user page**
  (it is a separate tenant-level integration per external research, not observed in-product here).
- **Security** 🔬: "Security Management" on `/settings` is a **non-clickable section header** (a `div`,
  `href=null`) whose **only child item is the Audit log**. No 2FA / SSO / IP-allowlist / device-
  restriction page is reachable on the trial (Light) context — the Enterprise-tier security controls
  advertised on the pricing page could not be confirmed in-product on this plan.
- **Board** 🔬 = project-level Kanban across the 3 statuses. **Calendar** = monthly project calendar.
  **Partners** = a network of connected external client-companies (populated when you add external
  members). **Company profile** = Thai-address-aware business registration.

### 0.9 Pending-item resolution (3rd pass — fresh-login probes)

A third pass (fresh in-process login — the earlier storage-state reuse was the session-expiry cause)
**resolved 3 of the 4** items previously listed as undetermined:

- ✅ **Approval-route builder** — resolved: multi-stage, approver-list, all/single condition, **no
  amount thresholds** (see §0.8 approval bullet).
- ✅ **Notification channels** — resolved: Desktop + Email per-user; LINE is tenant-level, not here
  (see §0.8 notification bullet).
- ✅ **Security Management** — resolved: section header → Audit log only; no 2FA/SSO/IP page on this
  plan (see §0.8 security bullet).
- ✅ **RESOLVED (4th pass, create→inspect→delete test) — a task carries no cost at all.** With
  product-owner approval, a throwaway task was created, its create modal + detail editor + ⋯ menu were
  inspected (no cost field anywhere; the ⋯ menu only offers view-history + delete-task), the project
  Dashboard EVM cost stayed empty after adding it, and the task was then **deleted and verified gone**
  (account back to 0 tasks). Conclusion: EVM planned/actual cost is **(sub-)project-level manual entry,
  not per-task** — see the §0.8 "task is not a cost object" bullet. The only remaining sliver
  (the exact sub-project cost-entry widget) is gated behind project templates/tiers not present on this
  trial; not pursued further.

**Genuinely still unresolved (out of scope for a web trial):** the **mobile app** — offline sync
conflict behavior and the advertised AI **voice reporting** — cannot be exercised via browser
automation; and **Enterprise-tier security** (2FA/SSO/IP-allowlist) is not reachable on this plan.

---

## 1. Company snapshot

| Fact                                                                                                                                       | Evidence                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aldagram Inc., Tokyo; KANNA launched July 2020                                                                                             | ✅ [aldagram.com/en/news/w2sote4ziq](https://aldagram.com/en/news/w2sote4ziq/)                                                                                    |
| Series A \~2B JPY (\~$20M), announced 2022-06-01, from MonotaRO, JAFCO, Full Commit Partners (no source names a lead investor)             | ✅ same press release                                                                                                                                             |
| Strategic investment from Panasonic, May 2023 (amount undisclosed)                                                                         | 🔶 [TechCrunch 2023-05-15](https://techcrunch.com/2023/05/15/japanese-construction-tech-aldagram-nails-down-backing-from-panasonic/) — not adversarially verified |
| Customer count: 5,000 (Jun 2022) → 30,000+ (Oct 2023) → 50,000+ (Sep 2024) → **70,000+ (Jul 2025, 5th anniversary)** — all vendor-reported | ✅ (to 30k) / 🔶 (50k, 70k from [aldagram.com/en/news/](https://aldagram.com/en/news/) listing)                                                                   |
| Target industries: construction, real estate, manufacturing                                                                                | ✅                                                                                                                                                                |

## 2. Thailand / SEA presence — KANNA is already in our market

| Fact                                                                                                                          | Evidence                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| First overseas office = **representative office in Thailand** (announced 2023-08-10)                                          | 🔶 [aldagram.com/en/news/](https://aldagram.com/en/news/) listing; corroborated by Thai press (mgronline, ryt9) in the verified run ✅ |
| iOS app localized in **Thai** (+ Vietnamese, Indonesian, Spanish, English, Japanese)                                          | ✅ App Store JP listing v19.5.0                                                                                                        |
| SEA named expansion target (2022 press release); TechCrunch reports users in TH/VN/PH/MY and a Thai-language release Nov 2022 | ✅                                                                                                                                     |
| Bahasa Indonesia version launched 2025-08-11 ("SEA's largest market")                                                         | 🔶 news listing                                                                                                                        |
| **KANNA Dashboard (Jan 2026) shipped with Thai on day one**                                                                   | 🔶 [aldagram.com/en/news/7c000qadv9](https://aldagram.com/en/news/7c000qadv9/)                                                         |
| Approval Flow (Mar 2025) launched JP/EN with Thai "to be added soon"                                                          | 🔶 [PR TIMES](https://prtimes.jp/main/html/rd/p/000000079.000058603.html)                                                              |

## 3. Verified feature inventory

| Feature                                                                                                                                                                                      | Status                                                                | Notes                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Consolidated site photo management + annotation                                                                                                                                              | ✅ standard                                                           |                                                                                                          |
| Electronic blackboard (電子小黒板) + tamper detection (J-COMSIA certified, CRYPTREC crypto)                                                                                                  | ✅ **paid option**, not base product                                  | Vendor's own page: "電子小黒板機能はKANNAのオプション機能となっています". JP-public-works oriented       |
| Gantt (工程表) with task dependencies                                                                                                                                                        | ✅ standard                                                           | Claim that Gantt is a paid option was ❌ REFUTED (1-2)                                                   |
| Per-site document sharing, site-linked chat, shared calendar                                                                                                                                 | ✅ standard                                                           |                                                                                                          |
| Daily/progress reports                                                                                                                                                                       | ✅ standard                                                           |                                                                                                          |
| KANNA Report — Excel-template → digital form (fields, formulas, e-signature, Excel/PDF export), Nov 2023                                                                                     | ✅                                                                    | Template conversion is **staff-assisted**, not self-serve                                                |
| **Approval Flow** (2025-03-31): submit/approve documents & reports, internal + external partners, multi-step, "all approvers"/"one-person" modes, comments, return-for-revision              | 🔶 PR + [feature page](https://lp.kanna4u.com/feature/approval-flow/) | Generic document/report approval — **no financial thresholds, no procurement chain** in the announcement |
| **KANNA Dashboard** (2026-01-29): portfolio profitability visualization — "aggregates sales, billing, and collection data against targets"; schedule-risk flags; drill-down; EN/JP/**TH**/ID | 🔶 press release                                                      | A **visualization layer**, not a budgeting/cost-management module (per release text)                     |
| Integrations advertised on the JP feature page                                                                                                                                               | ✅ Google Calendar only                                               |                                                                                                          |

### AI features — advertised, depth unverified ⚠️

The EN landing ([lp.kanna4u.com/en/features](https://lp.kanna4u.com/en/features)) advertises, verbatim (🔶):

1. **AI MCP** — "Kanna's MCP lets AI agents access project data, generate reports, manage tasks,
   and calculate securely for teams."
2. **AI Assistance** — "Leverage built-in AI to surface project insights, automate routine tasks…"
3. **AI Voice Reporting** — "Dictate site reports hands-free using AI-powered voice input…"

**However:** no launch press release was found on aldagram.com/en/news or PR TIMES; the JP App
Store description does not mention AI at all; no claim about AI survived adversarial verification.
Treat KANNA's AI as **marketing-advertised with unknown GA status/depth** until observed in a trial
account. The MCP claim, if real, is strategically notable (agent-accessible project data).

## 4. Offline — verified as LIMITED

✅ Offline exists (press release 2024-06-26 + ITmedia coverage) but scope is: **view pre-downloaded
project info + fill/edit forms created while online**. No documentation of sync behavior or
conflict handling anywhere. The JP App Store description doesn't mention offline.
🔶 The EN pricing page places offline report creation ("KANNA Report — … even without an internet
connection") in the **Pro Plus tier and above** — i.e., offline is a _paid_ capability.

**COS contrast (spec-sourced):** offline-first Drizzle/expo-sqlite, sync queue with priority order
(safety → attendance → inspections → task progress → reports → material → equipment → media),
delta sync + tombstones, and entity-specific conflict resolution (LWW / field-level merge /
server-wins / max-wins / no-auto-resolution for financial entities) — master doc §Phase 6/§Phase 10,
spec 17. This is the single largest verified technical gap in COS's favor.

## 5. Pricing

> ⬆️ **The authoritative, current lineup is in §0.3 (observed in-app): Free / Light / Pro / ProPlus /
> Enterprise, across two separately-licensed products (KANNA Project + KANNA Report).** The subsections
> below are retained as the earlier marketing-page reads; where they say "Light / Basic / Enterprise"
> they are stale — trust §0.3.

### Japan (lp.kanna4u.com/pricing — quote-only) ✅

- **No yen amounts published.** All three plans (Light / Basic / Enterprise) are quote-based
  ("見積もり依頼後、1営業日以内にご連絡"); setup + support fees free.
- Internal seat minimums 10/10/20; storage 200/400/1,000 GB; templates standard/10/100.
- **Unlimited external (subcontractor/partner) accounts on every tier** ("アカウント数無制限") —
  their headline differentiator. Third-party sources say these are free; the "free" wording is not
  on the pricing page itself.
- A ¥0 free _plan_ is reported by aggregators (imitsu, BOXIL) but ⚠️ UNVERIFIED — official pages
  show only a free **trial** ("無料ではじめる", no credit card).

### International (lp.kanna4u.com/en/pricing — published prices) 🔶

| Plan       | Price                     | Extra user  | Included                          | Notable                                                                                      |
| ---------- | ------------------------- | ----------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| Pro        | **$200/mo** (annual −20%) | $20/user/mo | 200 GB, 10 users, 5 templates     | base PM features                                                                             |
| Pro Plus   | **$250/mo**               | $25/user/mo | 200 GB, 10 users                  | + KANNA Report (incl. **offline** form entry), custom reporting, **approval workflows**      |
| Enterprise | **$600/mo**               | $40/user/mo | 1,000 GB, 15 users, 100 templates | security controls, IP allowlist, 2FA, device restrictions, company dashboard, volume pricing |

> Note the JP↔international divergence: JP = quote-only Light/Basic/Enterprise; international =
> published Pro/Pro Plus/Enterprise. The earlier deep-research conclusion "no price points published
> anywhere" was **JP-scoped and is corrected by this section**.

## 6. User reviews (previously an unanswered gap — now sourced) 🔶

| Platform                     | Rating   | Volume       | Signal                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | -------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capterra                     | **4.5★** | 15 reviews   | Pros: intuitive UI, docs-in-one-place, cheaper than Procore, strong support, offline access, customization. Cons: "limited or not fully customizable" advanced features; mobile app "needs improvement"; **missing S-Curve reports** ("industry-mandatory" per one construction reviewer); storage limits; one "waste of time and money / blank slate" review |
| App Store (JP)               | **4.3★** | 275 ratings  | Praise: unifies scattered info, replaces email/LINE. Complaint: account deletion requires PC login                                                                                                                                                                                                                                                            |
| Google Play (via applion.jp) | **4.0★** | ~100 ratings | 62×5★ / 13×4★ / 8×3★ / 1×2★ / **16×1★ (~16%)** — negative review texts not visible on the aggregator                                                                                                                                                                                                                                                          |
| ITreview (JP)                | 4.0★     | **1 review** | Thin JP public-review footprint (✅ from verified run)                                                                                                                                                                                                                                                                                                        |

Review volume is small everywhere relative to a claimed 70,000+ companies — public review
sentiment is a weak signal either way.

## 7. API / integrations ✅

- "KANNA Open API" exists (OAuth 2.0, read+write; projects, customers, properties, users, chat,
  per-project reports/photos/documents) **but** it is an optional add-on, fully sales-gated — even
  API documentation requires contacting a representative. No public developer portal.
- ❌ REFUTED (0-3): "the API surface excludes procurement/cost/BOQ endpoints" — we can only say the
  API is _gated_, not what its data model lacks.
- COS contrast: API-first, OpenAPI 3.1 per service, versioned `/api/v1/` from day one (QM-2).

## 8. Feature-by-feature vs Construction OS phases

> COS column cites the governing spec/phase; "—" = not present on KANNA's official feature surface
> as audited 2026-07-13 (raw-HTML keyword audit: zero hits for 発注/受発注/購買/原価/予算/請求;
> corroborated by third-party review aippearnet.com: "見積・請求・原価管理機能がありません") ✅.

| Capability                                                    | KANNA                                                                                                                                                                                                                    | Construction OS                                                                                                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Daily site reports + photos                                   | ✅ core strength                                                                                                                                                                                                         | Priority 1 / Phase 6 (site-ops) — parity required; target: report < 2 min                                                                                                     |
| Electronic blackboard + tamper-evident photos                 | ✅ (paid option; JP public works)                                                                                                                                                                                        | — not in spec (JP-market-specific; no Thai regulatory equivalent identified — decide only if Thai compliance demands it)                                                      |
| Gantt / schedule dependencies                                 | ✅ standard                                                                                                                                                                                                              | Task tracking + progress % + baseline variance (Priority 1, §11 tasks); a Gantt _UI_ is not named in the master doc                                                           |
| Custom form digitization (Excel → form)                       | 🔬 "Forms"/gembadocs — create form + folders + QR field entry (staff-assisted conversion)                                                                                                                                | Checklists/inspections are first-class entities (Phase 6), not generic form templates                                                                                         |
| Document approval workflow                                    | 🔬 multi-stage approver-list routes; per-stage all/single condition; **no amount thresholds**                                                                                                                            | Threshold-based financial approval chains (≤50k THB PM; 50k–500k +FINANCE; >500k +EXECUTIVE) + 48h escalation, Temporal-backed (§15.5, Phase 5) — far deeper, domain-specific |
| Procurement PR→RFQ→PO state machines, vendor mgmt, deliveries | **— absent** 🔬 (no procurement surface; only Clients, no vendor entity)                                                                                                                                                 | Phase 5 full state machines + events; Vendor Portal (ADR-030)                                                                                                                 |
| BOQ engine + financial precision                              | **— absent** 🔬                                                                                                                                                                                                          | Phase 4 (DECIMAL(19,4), decimal.js, versioning)                                                                                                                               |
| Cost/budget tracking                                          | 🔬 **present but manual & (sub-)project-level**: EVM (Planned/Actual Cost, PV, EV, Cost & Schedule Variance); hand-entered, **not** procurement-derived; **tasks carry no cost at all** (verified by create→delete test) | Priority 3 / Phase 7 (budget lines, cost transactions auto-fed from procurement events, variance alerts)                                                                      |
| Finance / billing                                             | 🔬 **lightweight manual AR only**: Project Value + Total Billed − Total Collected = Balance. No AP/vendor-invoice, no PO docs, no double-entry, no cash-flow forecast                                                    | Phase 7 (AR billing + receipts, AP from procurement, 13-week direct-method forecast, ADR-024)                                                                                 |
| Offline field operation                                       | Limited: pre-download + form entry; **paid tier (ProPlus+)** 🔬                                                                                                                                                          | Offline-first (core, all tiers), 3+ conflict strategies, sync priority, delta+tombstones (Phase 6/10, spec 17)                                                                |
| AI                                                            | 🔬 web KANNA AI = **usage-help chatbot** (not operational). Voice reporting/MCP advertised, ⚠️ not observable in web trial                                                                                               | Phase 11–12: RAG (pgvector+OpenSearch+RRF), HallucinationGuard, confidence scores, token caps — operational report generation                                                 |
| Analytics                                                     | 🔬 EVM/financial dashboards (project + company), manual-fed; Thai day-one                                                                                                                                                | Phase 14 ClickHouse (p95 < 1s SLO) + Phase 13 knowledge graph                                                                                                                 |
| Multi-tenant enterprise                                       | Enterprise tier: IP allowlist, 2FA, device restrictions; 🔬 coarse company-authority RBAC (not per-module)                                                                                                               | RLS-enforced shared DB + dedicated DB per enterprise tenant (Phase 25), Keycloak realms, 12-role matrix                                                                       |
| External collaborators                                        | **Unlimited free external accounts (headline differentiator)** ✅                                                                                                                                                        | Vendor Portal magic-link (ADR-030) — pricing/packaging for external users not yet defined in spec §26                                                                         |
| Thai localization                                             | Thai UI (app + Dashboard); Bangkok rep office                                                                                                                                                                            | th-TH default locale, Buddhist Era calendar, Thai WHT rules, PDPA compliance (QM-3/QM-5)                                                                                      |
| API openness                                                  | Sales-gated optional add-on                                                                                                                                                                                              | API-first, OpenAPI 3.1, versioned from day 1                                                                                                                                  |

## 9. Strategic read

1. **Head-on collision zone:** Priority 1 (site reporting) + mobile UX + **project cost/EVM
   visibility**. In-product KANNA is stronger than the earlier doc thought — it already has EVM
   (PV/EV/CV/SV), billing/collection tracking, Gantt, approval routing, and a Thai-localized company
   dashboard. KANNA is good here, funded, in Bangkok, and priced with unlimited free external users.
   COS must match or beat field-adoption friction (report < 2 min, voice-first, offline-always).
2. **Verified white space (COS moat), narrowed but real:** the moat is **not** "cost visibility"
   (KANNA has a manual version) — it is the **transactional layer that auto-populates cost**:
   procurement PR→RFQ→PO state machines, vendor master + Vendor Portal, BOQ line items, AP/vendor
   invoices, and cost that _flows from those events_ instead of being typed in. Plus true offline-first
   (KANNA's is paid + shallow), operational AI with guardrails (KANNA's web AI is only usage-help), and
   an open versioned API (KANNA's is sales-gated). COS's edge is **"the numbers are a by-product of the
   workflow," not "someone re-keys them into a dashboard."**
3. **White-space erosion is underway and faster than the marketing pages suggested:** in-product
   Approval Route + EVM + billing/collection dashboards (Thai day-one) show Aldagram already at the
   _cost-visibility_ layer — but still **not** the transactional layer (no PO/BOQ/vendor-invoice
   objects; cost is hand-keyed). That gap is the defensible line. Expect continued movement; re-audit
   semi-annually with a fresh trial account.
4. **Packaging lesson:** unlimited free subcontractor accounts is their wedge into networks of
   companies — directly analogous to COS Vendor Portal, but COS spec §26 does not yet define
   external-user pricing. Recommend a product-owner decision on external-collaborator packaging
   before GTM (spec §25/§26).
5. **Their offline being a paid tier** (Pro Plus+) while COS treats offline as a core architectural
   property is a positioning opportunity in the Thai field market.

## 9b. Action items — what COS must do NOT to lose to KANNA

> Each item is tagged by basis: 🔬/✅ = **forced by verified evidence** (a fact observed this session);
> 📋 = **strategic recommendation** (reasoned from COS's own spec + KANNA's verified position, not a
> fact). Nothing here is a market prediction. "COS spec says X" means read from `docs/specifications/`
> or `context/`; it does **not** assert X is built or production-ready (implementation completeness of
> the transactional phases was not audited — only that the backend has ~1,600 passing unit tests with
> 6 suites currently red).

### P0 — forced, do first

1. **Fix the currently-red build/coverage gate** 🔬. This session's `pnpm test:cov` run showed
   **6 backend suites failing** — a committed duplicate-identifier compile error in
   `backend/src/modules/safety/safety.service.ts` (`clsUserId` / `userId` declared twice) plus two
   `created_by:''` assertion failures (master-data, crm). COS's own QM-1 gate is **100% line + 100%
   branch**; it is red right now. **Nothing ships past a red gate** — this is the literal first blocker,
   independent of KANNA.
2. **Make the external-collaborator pricing decision (spec §26)** ✅📋. KANNA's single biggest
   go-to-market wedge is **unlimited free external/subcontractor accounts** (verified on every tier).
   COS's analogue is the Vendor Portal (ADR-030), but **spec §26 defines no external-user pricing** —
   a product-owner decision that gates GTM. Decide before launch, or concede KANNA's network wedge.

### P1 — win the field-adoption race (the head-on overlap)

1. **Ship and field-prove the mobile app + the "daily report < 2 min" target** (Priority 1 / Phase 10)
   📋. KANNA's real moat is **5 years of shipping field UX** on iOS/Android with 70k+ companies. COS
   has the spec (Drizzle/expo-sqlite, role screens) but no verified shipping app. Adoption is won or
   lost here — match or beat KANNA's low-friction capture, measured with real field users, not in
   office tests.
2. **Turn offline-first from spec into a demonstrable, tested capability** ✅📋. This is COS's **largest
   verified architectural edge** — KANNA's offline is shallow (pre-download + form entry) **and paywalled
   to ProPlus+** 🔬, with no observable conflict handling. COS specs offline-first for all tiers with 3+
   conflict strategies + sync-priority + delta/tombstones. It must **work on real devices and be shown**,
   or the edge stays theoretical.
3. **Ship the Thai-market table stakes COS already specs** 📋. KANNA is **already live in Thailand**
   (Bangkok office since 2023, Thai UI, Thai-format address, Thai day-one on new features) 🔬. COS spec
   has th-TH default, Buddhist Era, Thai WHT, PDPA (QM-3/QM-5) — parity here is required just to be in
   the game; specced ≠ shipped.

### P2 — build and _demonstrate_ the moat KANNA structurally lacks

1. **Make "cost/finance emerges from workflow" real end-to-end and demoable** ✅📋. The defensible
   differentiator: procurement (Phase 5, PR→RFQ→PO) → cost transactions (Phase 7) → EVM/variance,
   **auto-fed by events**. KANNA cannot easily copy this — its data model has **no vendor/PO/BOQ/invoice
   object at all** (verified via import/export + create modals), and its cost/EVM is **100% hand-keyed**
   🔬. The moat only counts if the chain exists and can be shown running, not just per-module.
2. **Keep the SMB/field entry path as low-friction as KANNA's** 📋. KANNA wins onboarding with 3
   project statuses + coarse RBAC 🔬. COS's 12-role RBAC + amount-tiered approval + full transactional
   depth are strengths for enterprise but an **adoption liability for small contractors** if they leak
   into the field path. Keep the wedge simple; hide the depth until needed (aligns with COS's own R-06
   over-engineering risk and Priority-1 adoption target).

### Sequencing (from COS's own spec — reinforced by the KANNA threat) 📋

COS's Priority order already mandates **adoption-first** (Priority 1 site reporting) before the AI /
intelligence layers, and warns against premature scaling (R-06, "no hyperscale before 10k DAU"). The
KANNA threat sharpens this: **do not let the transactional-ERP ambition delay winning the
field-reporting adoption race.** Ship the wedge (mobile daily report + offline) into the Thai market
first; layer the procurement→cost moat as the retention/expansion play.

### What NOT to chase (avoid wasted effort) ✅

- **Do not build the electronic blackboard** unless a Thai regulatory requirement is identified. KANNA's
  is J-COMSIA-certified for **Japanese public-works** photo rules 🔬; no Thai equivalent was found in
  this research, and it is absent from COS's spec by design. Spending here copies a JP-market-specific
  feature with no verified Thai demand.

## 10. Do NOT repeat (refuted) ❌

- "KANNA's Gantt chart is a paid option" — refuted 1-2; treat Gantt as standard.
- "KANNA's API demonstrably lacks procurement/cost/BOQ endpoints" — refuted 0-3; the API is gated,
  its data model is unknown.

## 11. Open questions

> Several earlier open questions were **answered by the §0 in-product audit** and are struck through.

1. ~~Where KANNA Dashboard's data comes from~~ → **Answered 🔬: manual entry** (Project Value / Billed /
   Collected have input fields; cost is typed per project/task, not transaction-derived).
2. ~~Whether a genuine ¥0 plan exists~~ → **Answered 🔬: yes**, but only for external-invitee/viewer use
   (0 company accounts, 0.5 GB); it's the auto-downgrade target after trial.
3. Web KANNA AI = usage-help chatbot (answered 🔬). **Still open:** depth/GA of the _mobile_ "AI Voice
   Reporting" and "AI MCP" — needs a mobile-device test (not doable from this web audit).
4. **Still open:** does KANNA's offline sync do conflict resolution, and how (needs the ProPlus+ tier +
   mobile app to test)? COS's offline conflict strategies have no observed KANNA counterpart.
5. **Still open:** Thai customer base / Bangkok operation size in 2025–2026; whether Thai localization
   extends to Thai-format documents, WHT, PDPA posture.
6. **Still open:** content of the 16 one-star Google Play reviews (aggregator hides texts).

## 12. Source register (fetched 2026-07-13)

Primary: lp.kanna4u.com/feature/, /pricing/, /en/features, /en/pricing, /feature/approval-flow/,
/feature/black-board/; aldagram.com/en/news/ (+ w2sote4ziq, 7c000qadv9); kanna4u.zendesk.com
(API FAQ, List of Optional Functions); App Store JP id1516962928; PR TIMES 000000079.000058603.
Secondary: TechCrunch 2023-05-15; Capterra p/10006844; applion.jp (Google Play data); ITreview;
BOXIL; digi-mado; imitsu; mgronline; ryt9; constructionthailand.net; aippearnet.com; ITmedia BUILT.
