// Figures the EXECUTIVE screens print that this platform cannot compute (ADR-099).
//
// READ ADR-099 BEFORE CHANGING ANYTHING HERE. Every value below is copied from
// `mockup/mobile/08_executive/` and produced by no query. The repository's standing treatment for a
// drawn figure with no source is ADR-085 plus the 2026-08-13 ruling — draw the zone, say it is not
// available, never print an invented number — and the product owner decided otherwise for these ten
// on 2026-09-04, on the condition that they live in ONE module.
//
// EXTENDED 2026-09-07 (PO decision, "ขยาย ADR-099 วาดทั้งหมด") to the two screens the replacement
// mockup set added — Portfolio and Report. The register grew from ten entries to twenty-one. The
// condition is unchanged and is the reason the count is worth stating: every one of them is here,
// and the register is the only place a reader has to look.
//
// EXTENDED AGAIN 2026-09-08 for the FINANCE set (`mockup/mobile/09_finance/`), under the standing
// rule the product owner gave that day: draw what the mockup draws, mark it COMING SOON in a code
// comment and never on screen, and put a "coming soon" dialog behind an action that has no process.
// Eight entries — APPROVALS_TREND, FINANCE_BURN_RATE, PAYMENT_DETAIL_EXTRAS, BUDGET_CATEGORY_CODE,
// THREE_WAY_MATCH, DELIVERY_GRN, INVOICE_DISCREPANCY, PROFILE_JOB_TITLE — taking the register to
// twenty-nine. PROFILE_JOB_TITLE was DELETED on 2026-09-08, four days later, when
// `platform.users.position` was added and `GET /users/me` began returning it (ADR-101): the first
// entry this register has lost to real data rather than to a cancelled screen. The file is no longer executive-only; the heading above says EXECUTIVE because that
// is where it started.
//
// THE FINANCE SET PUT MORE BACK THAN IT ADDED. Four figures were about to be drawn and turned out
// to be columns: the invoice screen's PO reference, its "partly delivered" and its "Over PO +5.2%"
// (`procurement.purchase_orders`), and the drawer's employee id (`workforce.workers.employee_code`,
// returned by `GET /users/me`). Reading the migration before writing the entry is the whole
// procedure.
//
// That condition is the point of this file:
//   · grep `mockupFigures` and you have the complete set, with nothing scattered across screens
//   · deleting this module and fixing the type errors is how the decision is reversed
//   · each entry names what has to exist before it can go
//
// WHAT MAY NEVER HAPPEN HERE — AMENDED 2026-09-08, AND THE AMENDMENT IS THE POINT. This note used
// to say that no value in this file may be presented as a model output, with `HOME_KPI_CONFIDENCE`
// as the one confidence-shaped exception because its card makes no AI claim. `FORECAST_CONFIDENCE`
// breaks that: it sits under an `insights` glyph on a card reading a DETERMINISTIC forecast. It is
// here on the product owner's explicit instruction of 2026-09-08, under the standing rule that the
// mockups are built as drawn, and ADR-099's fourth amendment records the reversal.
//
// WHAT STILL HOLDS: a fabricated confidence may never stand BESIDE a real one. Where a screen calls
// a real endpoint the model's own text and its own confidence are what it prints — the executive
// AI panels, and the risk feed whose drawn cards are displaced entirely the moment a report
// arrives.
//
// The REAL halves of these screens are not here and must not be moved here: the portfolio budget and
// per-project variance (`GET /analytics/executive`), active incidents (`GET /safety/incidents`), the
// task counts (`GET /tasks/portfolio-summary`) and the critical path
// (`GET /projects/{id}/critical-path`) are all live data.

/** What must exist before a figure can be deleted. Written for the person doing the deleting. */
export interface MockupFigure<T> {
  readonly value: T;
  /** The thing this platform would have to gain. */
  readonly needs: string;
}

const figure = <T>(value: T, needs: string): MockupFigure<T> => ({ value, needs });

// ── Home (01_home/01_ex_dashboard) ───────────────────────────────────────────

/** "+2 this month" under the Active Projects tile. */
export const ACTIVE_PROJECTS_DELTA = figure(
  '+2',
  'a historical series of project counts — nothing records what the count was last month',
);

/** "CONF: 94%" drawn on a KPI card. NOT an AI output — see the note at the top of this file. */
export const HOME_KPI_CONFIDENCE = figure(
  94,
  'nothing: this card is not a model output, so the number has no meaning to acquire',
);

/** The per-project sync chip on the project list — Synced / Syncing / Offline. */
export const PROJECT_SYNC_STATE = figure(
  ['synced', 'syncing', 'offline'] as const,
  'per-project sync state; the sync queue tracks a device and a queue, never a project',
);

/** The "Project Locations" panel and its region caption. */
export const ACTIVE_REGION = figure(
  'Southeast Asia Sector',
  'latitude/longitude on a project (schema.prisma has none) and a maps library (apps/mobile has ' +
    'react-native-svg only)',
);

// ── Safety (03_safety/01_ex_safety) ──────────────────────────────────────────

/**
 * "92% Compliance", grade "A", "+2.4% vs last month".
 *
 * `GET /safety/compliance` returns FOUR COUNTS and no percentage — open incidents, high/critical
 * incidents, expired permits, revoked permits. There is no compliance score in this product.
 */
export const COMPLIANCE = figure(
  { percent: 92, grade: 'A', deltaLabel: '+2.4%' },
  'a compliance score. `ComplianceSummary` is four counts; no formula for a percentage is specified',
);

/**
 * "Safe Man-Hours 1.2 M", YTD.
 *
 * SPACED, where the drawing writes `1.2M` closed up. That is the project's own standard for a figure
 * beside its magnitude letter — `฿ 805 M`, not `฿805M` (PO decision 2026-08-10, recorded on
 * `lib/compactMoney.ts`): digits and a magnitude letter jammed together read as one token, and
 * spaced the eye takes the amount in one jump. Applied here on 2026-09-07 so the two magnitudes on
 * this role's screens are written the same way.
 */
export const SAFE_MAN_HOURS = figure(
  '1.2 M',
  'hours since the last lost-time injury — attendance has hours_worked, but no column marks an LTI',
);

/**
 * The six-month compliance trend, as bar heights in percent. Follows the missing score above.
 *
 * ONLY THE HEIGHTS ARE DRAWN. The month axis beneath them on the Safety screen is computed from the
 * current date through `Intl` (`i18n/translate.ts` `shortMonthLabels`), because the drawing's own
 * labels read Jun–Nov and would be visibly wrong beside any other clock. That split is deliberate
 * and is stated on the screen's own comment too: a fabricated axis is harder to spot than a
 * fabricated bar, because it looks like a date.
 */
export const COMPLIANCE_TREND = figure(
  [85, 70, 65, 80, 88, 92],
  'the compliance score above, kept as a monthly series',
);

/** Per-project safety score out of 100, and the SECURE / MONITOR badge derived from it. */
export const PROJECT_SAFETY_SCORES = figure(
  [96, 94, 78],
  'a per-project safety score — the same missing formula as COMPLIANCE, at project scope',
);

// ── Portfolio (03_portfolio/01_ex_portfolio) ─────────────────────────────────
//
// ADDED 2026-09-07 with the screen. Everything on that drawing that IS computable stayed out of this
// file and is listed on the screen's own header: the portfolio value and every project's budget
// utilisation and variance (`GET /analytics/executive`), the four filter counts and the risk sort
// (derived from those rows by `executiveSeverityOf`, the mapping `alerts.tsx` documents), the
// project names and their progress (`GET /projects/mine`, §32.12).

/** "สุขภาพพอร์ต 91.4% · Stable" in the summary strip. */
export const PORTFOLIO_HEALTH = figure(
  91.4,
  'a portfolio health score. Nothing in this product defines one — `/analytics/executive` returns ' +
    'budget, utilisation and an at-risk flag per project, and no formula combines them into a grade',
);

/**
 * "Contract #CT-8832" on each project card.
 *
 * A CONTRACT NUMBER IS NOT A SAFETY-CRITICAL FIGURE, BUT IT IS THE MOST QUOTABLE THING ON THIS
 * SCREEN — someone reads it into an email. It is drawn under the same product-owner decision as
 * every other entry here (2026-09-07: extend ADR-099, draw them all) and is flagged in the ADR as
 * the entry most worth removing first.
 */
export const PROJECT_CONTRACT_CODES = figure(
  ['CT-8832', 'OF-1102', 'EX-4019', 'SB-2041'],
  '`finance.contracts` has no contract-number column, and no mobile endpoint reads that table at all',
);

/** "Bangkok CBD" beside the contract number. */
export const PROJECT_LOCATIONS = figure(
  ['Bangkok CBD', 'Eastern Hub', 'Section West', 'Chonburi'],
  'a location on a project — `projects.projects` has no address and no coordinates (see ACTIVE_REGION)',
);

/**
 * The SCHEDULE pillar of each card's four-tile health matrix — one of three drawn pillars.
 *
 * The fourth, BUDGET, is REAL and is deliberately not here: it is `utilizationPct` off the analytics
 * row, printed as the drawing prints it.
 *
 * Structured rather than copied as a string, because the drawing writes these in Thai and one
 * hardcoded Thai sentence would print unchanged on an English device (QM-3). `state` selects the
 * i18n key, `days` fills it.
 */
export const PROJECT_SCHEDULE_PILLAR = figure(
  [
    { state: 'onTime', days: 2 },
    { state: 'late', days: 8 },
    { state: 'atRisk', days: 3 },
    { state: 'ahead', days: 4 },
  ] as const,
  'schedule variance per project. ADR-097 built a critical path per project, which gives float on ' +
    'the path but not a project-level days-ahead/days-behind figure',
);

/** The SAFETY pillar — incidents, and the window they are counted over where the drawing gives one. */
export const PROJECT_SAFETY_INCIDENTS = figure(
  [
    { incidents: 0, days: 120 },
    { incidents: 1, days: null },
    { incidents: 0, days: null },
    { incidents: 0, days: null },
  ] as const,
  '`GET /safety/incidents` is per project and this list is a portfolio — a count per card is one ' +
    'request per project, the fan-out `GET /tasks/portfolio-summary` exists to avoid',
);

/** The QUALITY pillar — "99.1% ผ่านเกณฑ์". */
export const PROJECT_QUALITY_PASS = figure(
  [99.1, 88.4, 94.2, 98.6],
  'a QC pass rate. Inspections record PASS/FAIL per item; no endpoint aggregates them per project',
);

/** "Index: 96/100" in each card footer. */
export const PROJECT_HEALTH_INDEX = figure(
  [96, 58, 74, 94],
  'the same missing score as PORTFOLIO_HEALTH, at project scope',
);

// ── Report (04_report/01_ex_report) ──────────────────────────────────────────
//
// This screen came out with FEWER drawn figures than the plan expected, because two of the things
// the drawing invents turned out to be real fields on the report it already calls:
//   · "Strategic Recommendations" is `recommendations` on EXECUTIVE_SUMMARY — the model's own advice
//   · the CRITICAL row's "AI Flag" is `risk_flags` on the same report
// Both are rendered from the report and are NOT here. They appear only on the project the report was
// generated for, because that is the only project they are about.

/** The three tiles under the AI Strategic Brief — cumulative saving, delivery forecast, safety index. */
export const REPORT_STRATEGIC_METRICS = figure(
  { saving: '฿ 14.2 M', deliveryForecast: 96.4, safetyIndex: 98 },
  'a cost-saving ledger, a delivery-date forecast and a safety index — this product records none ' +
    'of the three. Budgets are a snapshot, not a saving; §32.12 progress is completion, not a ' +
    'forecast; and the safety index is the same missing score as COMPLIANCE',
);

/** "Export Portfolio PDF". Drawn, and says so on tap. */
export const REPORT_PDF_EXPORT = figure(
  true,
  'a report renderer. `lib/dataExport.ts` offers JSON and CSV for the PDPA subject-access export ' +
    'and nothing renders a portfolio document at all',
);

// ── Alerts (02_alerts/02_ex_alerts) ──────────────────────────────────────────

/**
 * The CATEGORY chip on each risk-alert card — the drawing's "BIM + Site Logs" and "Supply Chain".
 *
 * READ THE AMENDMENT TO ADR-099 BEFORE TOUCHING THIS. It is the FIRST entry in this file that sits
 * inside a card whose other text is a real model output, which the header above forbids in as many
 * words. The product owner decided it on 2026-09-07 with that conflict named; the carve-out is
 * narrow and it is written down: a drawn LABEL beside a model's finding, never a drawn CONFIDENCE
 * and never a drawn FINDING. The confidence on those cards is the report's own number.
 *
 * The drawing's first value names systems rather than a category — "BIM + Site Logs" — and it is not
 * used: a claim about WHICH SYSTEMS produced a report is the one thing ADR-098's second amendment
 * keeps off these screens, because it changes how much of the card a reader believes. These are
 * subject labels, taken from the drawing's second card, which is a category.
 */
export const RISK_ALERT_CATEGORIES = figure(
  ['Supply Chain', 'Weather', 'Manpower', 'Logistics'] as const,
  'a category on a risk factor. `DelayRiskOutput.risk_factors` is a list of bare strings — there ' +
    'is no field to carry one, and inferring it from the text would be this screen classifying a ' +
    'finding the model did not classify',
);

/**
 * THE DRAWING'S OWN TWO RISK CARDS, shown when the gateway returns no report.
 *
 * COMING SOON, and this is the entry that most needs the label: these are FINDINGS, and a finding is
 * the thing the amendment above says may not be drawn. The product owner directed it anyway on
 * 2026-09-07, after seeing the screen render an empty state where the drawing shows a full feed:
 * "draw the cards always; use the mockup content when there is no report."
 *
 * IT IS A FALLBACK, NOT A SOURCE. The moment `POST /ai/reports/delay-risk` answers, every card comes
 * from the model and none of this is read — the two paths are exclusive and the component says which
 * one it is on. What the gateway needs before this can be deleted is nothing at all: it is already
 * built. It needs to be REACHABLE, which on a developer machine means the ai-gateway container
 * resolving Keycloak by its in-network name.
 *
 * `level` and `confidence` are the drawing's per-card values. They exist here and NOT on the real
 * path, where the report carries one level and one confidence for the whole thing — which is the
 * asymmetry the section note explains whenever a real report produces more than one card.
 *
 * The text lives in `i18n` (QM-3), not here: the drawing writes it in Thai, and a hardcoded Thai
 * sentence would print unchanged on an English device. This holds the shape; the words are keyed.
 */
export const RISK_ALERT_FALLBACK = figure(
  [
    { key: 'concretePour', level: 'CRITICAL', confidence: 94 },
    { key: 'rebarSupply', level: 'MEDIUM', confidence: 82 },
  ] as const,
  'nothing to build — `POST /ai/reports/delay-risk` already produces these cards. It has to be ' +
    'REACHABLE: the ai-gateway container verifies bearer tokens against KEYCLOAK_URL, and a ' +
    'developer machine that leaves it at the host value rejects every one of them',
);

// ── FINANCE Home (09_finance/01_home/01_fn_dashboard) ────────────────────────
//
// ADDED 2026-09-08. Everything else on that screen is computed: the pending-approval total is a sum
// over `GET /finance/payments?status=PENDING`, and the cash position, its risk word and the
// forecast card all read `GET /finance/cashflow-forecast/:projectId` through the same
// `gradeCashflowRisk` / `projectedShortfall` the nightly alert sweep grades with.

/** "+12% vs last week" under the pending-approvals figure. */
export const APPROVALS_TREND = figure(
  '+12%',
  'a historical series of pending-approval totals — the queue is a snapshot and nothing records ' +
    'what it was worth last week',
);

/**
 * "Burn Rate / MO ฿1.2 M".
 *
 * SPACED, like every other figure beside its magnitude letter in this product (PO 2026-08-10).
 * The forecast carries a weekly `outflow` and a monthly burn rate could be derived from it several
 * defensible ways — 4 weeks, 52/12 weeks, trailing vs projected — and master §Never forbids
 * inventing business logic that is not specified. Drawn until a formula is.
 */
export const FINANCE_BURN_RATE = figure(
  { text: '฿ 1.2 M', percent: 65 },
  'a specified formula for monthly burn. The 13-week forecast has the weekly outflows; what it ' +
    "does not have is a decision about which of them a month is. `percent` is the drawing's own " +
    'bar fill and needs the same formula plus a ceiling to measure against',
);

/**
 * "CONFIDENCE: 92%" on the Home forecast card, and "Conf: 94%" on the payment queue's analysis
 * module and on the budget screen's — the same card three times, drawn with two different numbers.
 *
 * THIS IS THE ENTRY THIS FILE IS LEAST COMFORTABLE WITH, and the note at the top of the file used
 * to forbid it outright: the card reads `GET /finance/cashflow-forecast/:projectId`, which is a
 * deterministic sum of scheduled inflows and outflows, so a confidence claims a model that never
 * ran. It was left off on 2026-09-07 for exactly that reason and drawn on 2026-09-08 on the product
 * owner's explicit instruction, under the standing rule that the mockups are built as drawn.
 *
 * `HOME_KPI_CONFIDENCE` above is the older confidence-shaped value and is NOT the same case: that
 * card makes no AI claim at all. This one sits under an `insights` glyph. See ADR-099's fourth
 * amendment, which records the reversal rather than quietly rewriting the rule.
 */
export const FORECAST_CONFIDENCE = figure(
  // Two drawings, two numbers, one fabrication — keyed by screen so neither invents the other's.
  { home: 92, payments: 94, budget: 94 },
  'a model behind these cards. The forecast is arithmetic; a confidence would need a prediction ' +
    'with an error distribution, which is a different endpoint that does not exist',
);

// ── FINANCE Payments (09_finance/02_payments/01_fn_payment) ──────────────────

/**
 * Two fields the payout detail draws that no table carries: the service period the payment covers,
 * and the vendor's "Verified Subcontractor" status.
 *
 * `finance.payments` is payment_id / invoice_id / project_id / amount / currency_code /
 * payment_date / payment_reference / status, and `procurement.vendors` carries a code, a name and
 * scoring weights — no verification flag. Both were read from the migrations, not assumed.
 *
 * The verified CHIP takes no value here because it is drawn unconditionally: a boolean whose only
 * value is true is not worth a register entry, and the screen's own comment marks it. What is
 * registered is the string a reader could quote.
 */
export const PAYMENT_DETAIL_EXTRAS = figure(
  { servicePeriod: 'Oct 01 – Oct 31' },
  'a service period on a payment, and a verification status on a vendor. Neither column exists',
);

// ── FINANCE Budget (09_finance/03_budget/01_fn_budget) ───────────────────────
//
// ADDED 2026-09-08. Only the category CODE is drawn. Everything else on that screen is computed:
// the three KPI figures come straight from `GET /finance/budget/:projectId`, each category's
// allocation is its budget line's, and its spend is `GET /finance/cost-transactions` summed by
// `budget_line_id` — walked to the end of the list, because a sum over page one is a sum over
// page one.

/**
 * "Code: 02-100" under a category name.
 *
 * `budget_lines.boq_category_id` is a UUID foreign key, read from the migration and not assumed;
 * printing it would put a 36-character identifier where the drawing puts a five-character code.
 * There is no CSI/MasterFormat-style code column anywhere in the schema, and deriving one from a
 * line's NAME would be inventing a classification standard on a budget screen.
 *
 * Drawn per category rather than as one string: the drawing gives each card its own code, and one
 * repeated value would read as a bug rather than as a placeholder.
 */
export const BUDGET_CATEGORY_CODE = figure(
  ['02-100', '09-000', '15-400', '03-300', '26-000'] as const,
  'a code column on the BOQ category, or a coding standard to derive one from — the schema has ' +
    'neither, only a UUID',
);

/**
 * One glyph per budget category, cycled by position.
 *
 * The drawing gives each card its own — `foundation`, `electrical_services`, `format_paint` — and
 * this schema gives a category a NAME and a UUID. Reading a glyph off the name would be inventing a
 * classification standard on a budget screen, and getting it wrong would put an electrical icon on
 * a concrete pour. So the icons are drawn and cycled, the same treatment `BUDGET_CATEGORY_CODE`
 * gets, on the product owner's instruction of 2026-09-08.
 *
 * Names are `MaterialIcons`, which is what the app renders; the drawing's Material Symbols names
 * differ slightly (`format_paint` is `format-paint` here).
 */
export const BUDGET_CATEGORY_GLYPHS = figure(
  ['foundation', 'construction', 'architecture', 'electrical-services', 'format-paint'] as const,
  'a category taxonomy. `budget_lines` has a free-text name and a UUID, and nothing maps either to ' +
    'a trade or a discipline',
);

// ── FINANCE Invoices (09_finance/04_invoices/01_fn_invoice) ──────────────────
//
// ADDED 2026-09-08. THREE-WAY MATCHING DOES NOT EXIST IN `backend/src`. Grepped, not assumed:
// nothing reconciles a purchase order against a delivery against an invoice, and no endpoint
// returns a match score. The drawing builds a whole advisory banner and a per-card telemetry strip
// on top of it, so both are here.
//
// WHAT IS NOT HERE, because it turned out to be real: the PO reference ("#PO-2026-882"), the PO's
// delivery state ("ส่งมอบบางส่วน") and the amount over the PO ("Over PO +5.2%"). Those are
// `po_number`, `status` and `total_amount` on `procurement.purchase_orders`, reached through
// `poIndex()` — the first draft of this screen was going to draw all three.
//
// AND NO CONFIDENCE. The drawing puts "CONFIDENCE: 96%" on the banner and calls it CORE_AI. There
// is no model here at all — not a deterministic calculation dressed as one, as on the cash-flow
// cards, but nothing whatsoever — so a confidence would be the exact case spec §22.3 forbids. The
// banner is drawn without it, as the three cash-flow modules are.

/**
 * The 3-Way Matching advisory banner, and the per-card match percentages beneath it.
 *
 * `percentages` are indexed positionally across the cards, the way `BUDGET_CATEGORY_CODE` is: the
 * drawing gives each card its own score and one repeated number would read as a bug rather than as
 * a placeholder.
 */
export const THREE_WAY_MATCH = figure(
  {
    /**
     * The banner's own sentence, with the drawing's own figures inside it.
     *
     * The words PO and GRN were dropped from in front of the references on 2026-09-08 (PO): the
     * numbers already carry them, and "PO #PO-2026-882" says it twice.
     */
    summary: '#PO-2026-882 and #GRN-401 agree to 98% — 3 invoices are ready to approve.',
    /** "CONFIDENCE: 96%" in the banner's header. */
    confidence: 96,
    percentages: [99, 92, 87, 96, 94] as const,
  },
  'a three-way matching process. Nothing in backend/src reconciles a purchase order against a ' +
    'delivery against an invoice, and no endpoint returns a match score',
);

/**
 * "#GRN-1049" in a card's telemetry strip.
 *
 * `procurement.deliveries` carries `delivery_note` — free text a driver hands over — and no goods
 * received note NUMBER. Read from the migration. The drawing prints a formatted GRN reference,
 * which is a document this platform does not issue.
 */
export const DELIVERY_GRN = figure(
  ['GRN-1049', 'GRN-401', 'GRN-1152', 'GRN-882', 'GRN-2041'] as const,
  'a goods-received note with a number. `deliveries` has a free-text delivery_note and no GRN',
);

/**
 * The discrepancy box on a disputed invoice — what the mismatch WAS, in words.
 *
 * Downstream of the same missing process as `THREE_WAY_MATCH`: naming which line item differs and
 * by how much needs the comparison that produces the score.
 */
export const INVOICE_DISCREPANCY = figure(
  'The invoiced quantity exceeds what was delivered. Hold payment pending review.',
  'the same three-way matching process — a discrepancy is its output, not a separate feature',
);

// ── FINANCE profile (09_finance/05_profile/01_fn_navigation_drawer) ──────────
//
// PROFILE_JOB_TITLE WAS HERE, AND IT WAS DELETED ON 2026-09-08 BECAUSE THE COLUMN ARRIVED. It held
// "Lead Controller" and the drawer rendered it for every role, because nothing in the schema carried
// a job title. `platform.users.position` now does (migration `20260908000001`, ADR-101), it comes
// back on `GET /users/me`, and `NavigationDrawer` reads it — drawing nothing where it is null.
//
// This is the FIRST ENTRY THIS REGISTER HAS EVER LOST TO REAL DATA rather than to a cancelled
// screen, and it is the outcome the register exists to reach: every entry is a debt, and this one
// was paid. Left as a comment rather than removed silently so the next reader of ADR-099's amendment
// 4 — which named this column as the thing that would end it — can see that it did.

// ── Shared ───────────────────────────────────────────────────────────────────

/** The project-list "Filter" control. Drawn, and opens nothing. */
export const PROJECT_LIST_FILTER = figure(
  true,
  'a specification of what it filters by — the drawing names no criteria',
);

/**
 * More tiles with no screen behind them: strategic BIM, carbon accounting, global site map.
 *
 * BIM is a Type A stub (spec §32.9). Carbon has a ClickHouse table but
 * `carbon-calculation.stub.ts` throws `NotImplementedException` and no controller exposes it. The
 * map is the coordinate problem in ACTIVE_REGION.
 */
export const UNBUILT_MORE_TILES = figure(
  ['strategicBim', 'carbon', 'globalMap'] as const,
  'the BIM integration, a carbon endpoint, and project coordinates — one per tile',
);

// ── PROCUREMENT_OFFICER (10_proc_officer) ────────────────────────────────────
//
// EXTENDED 2026-09-08 for `mockup/mobile/10_proc_officer/`, under the same standing rule: draw what
// the mockup draws, mark it COMING SOON in a code comment and never on screen.
//
// THIS SET PUT MORE BACK THAN IT ADDED, harder than the FINANCE one did. Six figures were about to
// be drawn and turned out to be reachable:
//   · the quotation count per RFQ      `GET /procurement/rfqs/:rfqId/quotations`
//   · every vendor name on an order    `GET /procurement/vendors/directory`, indexed client-side
//   · delivery progress per PO         `delivery_items.quantity_received` / `po_line_items.quantity`
//   · the RFQ countdown                `procurement.rfqs.deadline` is a real column
//   · a PO's ETA                       `procurement.purchase_orders.delivery_date`
//   · requests awaiting approval       real once the seed grew `SUBMITTED` rows (PO 2026-09-08)
// What is below is what remains after those.

/**
 * The home activity feed — "ปูนซีเมนต์ถึงไซต์ A แล้ว · 10 นาทีที่แล้ว · ทะเบียนรถ TRK-842".
 *
 * There is no activity or audit feed for this role. `platform.audit_logs` exists and is a
 * TENANT_ADMIN surface — it records who changed what, not "a delivery arrived" — and nothing
 * aggregates procurement events into a reverse-chronological list.
 */
export const PROC_ACTIVITY_FEED = figure(
  [
    { icon: 'where-to-vote', title: 'Cement delivered to Site A', meta: '10 min ago · TRK-842' },
    { icon: 'fact-check', title: 'PO-2024-001 approved', meta: '45 min ago · Regional Director' },
  ] as const,
  'an activity endpoint for this role — audit_logs records field changes, not procurement events',
);

/**
 * The material and quantity on an RFQ card — "เหล็กเส้นข้ออ้อย SD40 DB25 · 120 ตัน".
 *
 * `procurement.rfqs` carries `rfq_number`, `status`, `deadline` and `pr_id` — NO description and no
 * quantity. The words exist one table away in `pr_line_items.description`, seeded since 2026-09-08,
 * and no endpoint reaches them from an RFQ: `GET /procurement/purchase-requests` returns the request
 * rows alone. THIS ONE IS CHEAP TO DELETE — a line-items join on that endpoint, or `pr_id` resolved
 * on the RFQ list, and the register loses an entry.
 */
export const RFQ_MATERIAL = figure(
  [
    { title: 'Deformed Steel Bar SD40 DB25', qty: '120 TON' },
    { title: 'Ready-Mixed Concrete C35/45', qty: '850 M3' },
    { title: 'HDPE Conduit and Fittings', qty: 'Class 1 set' },
    { title: 'Film-Faced Plywood Formwork 15mm', qty: '640 M2' },
    { title: 'Portland Cement Type 1', qty: '2,400 BAG' },
  ] as const,
  'the RFQ list to carry its request line items — the words are in pr_line_items already',
);

/**
 * The lowest quoted price on an open RFQ and how far under the estimate it sits.
 *
 * The quotations are REAL and their `total_amount` is real, so the lowest of them is computable —
 * but "−4.2%" is against a BASELINE ESTIMATE, and no table holds one. `boq.boq_items` carries rates
 * for the bill of quantities, not a procurement estimate per RFQ.
 */
export const RFQ_PRICE_DELTA = figure(
  ['-4.2%', '-1.8%', '-6.0%'] as const,
  'an estimate per RFQ to compare the quotes against — the BOQ rate is not one',
);

/**
 * "แนะนำ: บจก. ซีแพค · ความน่าเชื่อถือ 94/100 · ส่งมอบตรงเวลา 98%".
 *
 * A REAL SCORE EXISTS and is deliberately not used here: `GET /procurement/vendors/:vendorId/score`
 * computes from delivery, dispute and quotation history. What has no source is the RECOMMENDATION —
 * nothing ranks vendors against one RFQ's requirement — and the on-time percentage, which the
 * scorecard folds into one grade rather than reporting on its own.
 */
export const RFQ_RECOMMENDATION = figure(
  { onTimePercent: 98, reliability: 94 },
  'a per-RFQ vendor ranking, and an on-time rate the scorecard does not report separately',
);

/** "เป้าหมายประหยัดงบ · เดือนมีนาคม ประหยัดได้ ฿412,000 (เฉลี่ย 3.8%) · +12% MoM". */
export const PROC_SAVINGS = figure(
  { amount: '412,000', percent: '3.8%', delta: '+12% MoM' },
  'a savings target and a monthly series to measure it — neither is recorded anywhere',
);

/**
 * The Orders screen's delay alert — "3 POs are at risk of 72-hour delay due to logistical
 * congestion at Port of Rayong".
 *
 * No model produces this, and nothing in the platform knows about a port. `/ai/reports/*` has a
 * procurement summary and it is a text summary of spend, not a logistics risk feed.
 */
export const PO_DELAY_ALERT = figure(
  { count: 3, hours: 72, place: 'Port of Rayong' },
  'a logistics risk model with carrier or port telemetry behind it',
);

/**
 * EVERY DELIVERY STATUS ON THE DELIVERIES SCREEN — TRANSIT · INSPECTION · COMPLETED — and the three
 * telemetry tiles above them.
 *
 * `procurement.deliveries` is `delivery_id, po_id, tenant_id, delivery_note, delivered_at,
 * received_by, notes`. THERE IS NO STATUS COLUMN AT ALL. A row exists once someone records the
 * delivery, so the table can say "this arrived" and cannot say "this is on its way" — which makes
 * every pill on that screen, and the in-transit and due tiles, one drawn set rather than several.
 * The on-time percentage goes with them: nothing records a promised arrival to measure against.
 */
export const DELIVERY_STATUS = figure(
  {
    pills: ['TRANSIT', 'INSPECTION', 'COMPLETED'] as const,
    inTransit: 6,
    due: 3,
    onTimePercent: '98.2%',
  },
  'a status column on procurement.deliveries, and a promised arrival time to measure against',
);

/** The GRN number printed on a completed delivery — "#GRN-2026-0412". */
export const DELIVERY_GRN_NUMBER = figure(
  ['GRN-2026-0412', 'GRN-2026-0408', 'GRN-2026-0399'] as const,
  'goods-receipt notes — §20.7.3 defines /procurement/grn and no table backs it yet',
);

/**
 * The live logistics block on a delivery card: road position, remaining distance, driver and plate,
 * and the average speed in the alert above it.
 */
export const DELIVERY_TELEMETRY = figure(
  {
    place: 'Sirat Expressway (km 14)',
    remainingKm: '8.4',
    driver: 'Somchai W.',
    plate: '70-4921',
    fleet: 'SCG Logistics Fleet #04',
    avgSpeed: '18 km/h',
    delayMinutes: 45,
  },
  'vehicle telemetry — no GPS feed, no driver record and no fleet integration exists',
);

/** "ตรวจรับโดย: วิศวกรเอกชัย ภ. (เซ็นกำกับแล้ว) · ครบ 60/60 ท่อน" on a completed delivery. */
export const DELIVERY_SIGNOFF = figure(
  { inspector: 'Ekachai P.', signed: true, counted: '60/60' },
  'a signature record on a delivery — received_by holds a user id and nothing about a signature',
);

// ── PROC_MANAGER (11_proc_manager) ───────────────────────────────────────────
//
// EXTENDED 2026-09-09. The manager's set overlaps the officer's more than any pair before it — same
// four tab names, same tables underneath — so most of what it draws was already registered by the
// 10_proc_officer round. What is below is only what this role's drawings ADD.

/**
 * "+5.2%" beside Total Committed Spend, and the "FY2024 Q3" under it.
 *
 * The SPEND is real and summed in decimal.js. The comparison is not: nothing records what committed
 * spend was in a previous period. `finance.cost_transactions` carries a `transaction_date` and could
 * answer it for cost, but committed spend is the sum of open PURCHASE ORDERS, and a purchase order
 * has one `created_at` — there is no series of totals to difference. The fiscal-period label has no
 * source either; this platform has no fiscal calendar.
 */
export const PROC_SPEND_TREND = figure(
  { delta: '+5.2%', period: 'FY2026 Q3' },
  'a series of committed-spend totals over time, and a fiscal calendar to label them with',
);

/**
 * "฿ 1.4 M" on the Savings Realized tile.
 *
 * THE SAME GAP THAT STOPPED THE OFFICER'S RFQ PRICE DELTA, one screen up: a saving is a difference
 * between what was estimated and what was paid, and no table holds a procurement estimate.
 * `boq.boq_items` carries rates for the bill of quantities, which is a different number about a
 * different thing.
 */
export const PROC_SAVINGS_REALIZED = figure(
  '฿ 1.4 M',
  'a baseline estimate per order to measure the saving against — the BOQ rate is not one',
);

/**
 * The countdown on an approval row — "4h remaining".
 *
 * `procurement.rfqs` has a `deadline` and the officer's screen measures against it. A PURCHASE
 * ORDER has none: `purchase_orders` is `po_id, rfq_id, vendor_id, project_id, tenant_id, po_number,
 * status, total_amount, currency_code, delivery_date, temporal_workflow_id, created_by, created_at,
 * updated_at`. `delivery_date` is when goods are due, not when a signature is.
 */
// APPROVAL_COUNTDOWN WAS DELETED ON 2026-09-09 — the second entry this register has lost to real
// data rather than to a cancelled screen (ADR-101 removed PROFILE_JOB_TITLE, the first). It drew
// "4h remaining" on every approval row. `procurement.rfqs.deadline` is a real column and `RfqRow`
// already returned it, so an RFQ's countdown is now measured in `lib/approvalDeadline.ts`. A
// PURCHASE ORDER GETS NO CHIP AT ALL: it has no decision deadline, and that was the entry's own
// stated reason for existing.

/**
 * The vendor card's ON-TIME RATE, QC PASS RATE and COMPLIANCE line.
 *
 * A REAL SCORE EXISTS and is used: `GET /procurement/vendors/:vendorId/score` weights delivery,
 * dispute and quotation history into one number. What has no source is the BREAKDOWN as the drawing
 * words it — an on-time percentage, a QC pass rate and an insurance-document state are three
 * separate measures the scorecard folds into one and never reports apart.
 */
export const VENDOR_PERFORMANCE = figure(
  { onTimeRate: '98.5%', qcPassRate: '99.2%', compliance: 'Insurance renewal pending' },
  'the scorecard to report its components separately, and a document register for compliance',
);

/**
 * The manager's approval limit — "วงเงินอนุมัติ ฿5.0M" under the name in the drawer.
 *
 * NOT ADDED TO THE SHARED PROFILE BLOCK, whose five lines spec §32.7 fixes for every role. There is
 * no approval-limit column on `platform.users` or anywhere else; the ladder in
 * `po.workflow.ts::buildApprovalTiers` is per ORDER AMOUNT and per TIER, not per person, and its
 * thresholds are workflow parameters rather than a property of whoever signs.
 */
export const APPROVAL_LIMIT = figure(
  '฿5.0M',
  'a per-user approval limit — the workflow ladder is per amount and per tier, not per person',
);

/**
 * The deliveries screen's warehouse-capacity bar — "ลานกองเหล็ก Sector SD40 · 78% · ~2 คันรถ".
 *
 * §20.7.3 defines `/procurement/warehouses` and `/procurement/inventory`, and NOTHING BACKS EITHER:
 * of the 24 schemas in this database not one holds a warehouse, a bin, a stock level or a quota.
 */
export const WAREHOUSE_CAPACITY = figure(
  { name: 'Steel yard — Sector SD40', percent: 78, remaining: '~2 truckloads (36 t left)' },
  'the warehouse and inventory tables ADR-060 specifies and nothing has built',
);

/**
 * The disputes tile and the held amount — "ข้อพิพาท 1 เคส · กัก ฿140 K".
 *
 * A vendor invoice can be DISPUTED (`POST /procurement/vendor-invoices/:id/dispute`), and that is a
 * status on an invoice rather than a case with an amount held against it. No dispute table exists in
 * any schema, and nothing withholds money.
 */
export const DELIVERY_DISPUTES = figure(
  { cases: 1, held: '฿ 140 K' },
  'a dispute record with an amount held — an invoice status is not a case and holds nothing',
);

/**
 * The weighbridge reading, the credit note and the inspector on a delivery card.
 *
 * `procurement.delivery_items` holds `quantity_received` and nothing else about how it was measured.
 * There is no scale integration, no shortfall document and no signature record — `deliveries` has a
 * `received_by` user id and says nothing about a sign-off.
 */
export const DELIVERY_INSPECTION = figure(
  {
    weighed: '18,040 kg (+0.22%)',
    verdict: 'Within tolerance',
    shortfall: '70 bags short (430 of 500)',
    creditNote: '฿ -14,350',
    inspector: 'Nattapon',
  },
  'a weighbridge feed, a credit-note document and a sign-off record on a delivery',
);

/** "CONFIDENCE: 96%" on the deliveries screen's logistics advisor (11_proc_manager/04_deliveries). */
export const LOGISTICS_CONFIDENCE = figure(
  96,
  'a logistics model with carrier or traffic telemetry behind it — none runs',
);

/** "CONFIDENCE: 95%" on the vendor directory's insight banner (11_proc_manager/03_orders). */
export const VENDOR_INSIGHT_CONFIDENCE = figure(
  95,
  'a model that ranks suppliers against a negotiating opportunity — none runs',
);

// ── The deliveries screen's four card shapes (11_proc_manager/04_deliveries) ──
//
// EXTENDED 2026-09-09, product owner's answer to escalation E2 in
// `.claude/impl-completed-2026-09-09-proc-manager-round1.md`'s successor plan: "เหมือนแบบทุกตัวเลข".
// The drawing gives the delivery list FOUR distinct card shapes — awaiting GRN, in dispute, in
// transit, fully received — and each carries detail no column on `procurement.deliveries` holds. The
// register already covered the weighbridge reading, the shortfall, the credit note, the inspector,
// the truck telemetry, the yard and the GRN numbers; what follows is only what was still missing.
//
// HOW THESE REACH A ROW. The rows themselves are REAL — `GET /procurement/deliveries` — as are the
// delivery note, the date, the joined purchase order, its vendor and its value. The card SHAPE and
// its drawn detail are assigned by position in the list, so a real delivery is dressed in one of the
// drawing's four states. Nothing here invents a delivery that the server did not return, and
// deleting this block leaves the real half standing.

/**
 * Which of the drawing's four card shapes a row takes, and the drawn detail for each.
 *
 * `procurement.deliveries` is `delivery_id, po_id, tenant_id, delivery_note, delivered_at,
 * received_by, notes`. It records THAT something arrived. There is no status, so nothing can be
 * awaiting a signature, in dispute or on the road; and no line-level material name, so no card can
 * name what was delivered.
 */
export const DELIVERY_CARD_KIND = figure(
  [
    {
      kind: 'AWAITING_GRN' as const,
      material: 'Deformed bar SD40',
      detail: 'Quantity: 18 t',
      trailing: 'PO-7721-MAIN',
    },
    {
      kind: 'DISPUTED' as const,
      material: 'Portland cement',
      detail: '70 bags short (430 of 500 delivered)',
      trailing: 'Credit note',
    },
    {
      kind: 'IN_TRANSIT' as const,
      material: 'Ready-mix concrete 320 ksc',
      detail: 'SCG Concrete (CPAC) • 40 m³ (8 trucks)',
      trailing: 'ETA 13:40',
    },
    {
      kind: 'RECEIVED' as const,
      material: 'AAC block Q-CON G4',
      detail: '6,400 blocks • Warehouse Sector B',
      trailing: 'Passed to AP',
    },
  ] as const,
  'a status column and a delivery-line material name on procurement.deliveries — neither exists',
);

/** "Trust Score 98%" beside the supplier on a delivery card. */
export const DELIVERY_VENDOR_TRUST = figure(
  '98%',
  'a vendor score computed AT THE MOMENT OF DELIVERY — /procurement/vendors/:id/score is current, not historical, and nothing snapshots it against a receipt',
);

/** The in-transit card's fleet bar — "3/8 trucks arrived · 4.2 km away" and its two legend labels. */
export const DELIVERY_TRANSIT = figure(
  {
    arrived: 3,
    sent: 8,
    distanceKm: '4.2',
    legendDone: 'Trucks 1–3 (poured)',
    legendMoving: 'Trucks 4–5 (on the expressway)',
  },
  'per-vehicle dispatch records and a GPS feed — a delivery is one row, not a fleet of them',
);

/** "Shelf R-04 | received by Nattapon · 10:45" on a completed card. */
export const DELIVERY_STORAGE = figure(
  { shelf: 'R-04', time: '10:45' },
  'the warehouse bin and put-away records ADR-060 specifies and nothing has built',
);

/** The trailing map row — "tracking 4 trucks heading for the site". */
export const DELIVERY_RADAR = figure(
  4,
  'a live vehicle count, which needs the same GPS feed DELIVERY_TELEMETRY names',
);

/** "+45 min (ETA 14:15)" on the logistics advisor, beside DELIVERY_TELEMETRY's delay. */
export const LOGISTICS_ETA = figure(
  '14:15',
  'a projected arrival time — no carrier or traffic feed produces one',
);

/** The dispute card's explanation paragraph. */
export const DELIVERY_DISPUTE_REASON = figure(
  'Site staff counted pallet 4: 12 bags broken and 58 short. A credit note was withheld against the invoice automatically.',
  'a dispute record with an inspection narrative — no dispute table exists in any of the 24 schemas',
);

// ── The CRM manager's home dashboard (mockup/mobile/12_crm_manager/01_home/01_dashboard) ──
//
// ADDED 2026-09-09, product owner's answer (c) to that screen's escalation: build the dashboard and
// amend §20.7.10, which had deferred "Advanced CRM UI (pipeline kanban, dashboards, proposal
// generation)" to post-MVP.
//
// MOST OF THIS SCREEN IS REAL and deliberately is not here. `crm.opportunities` carries `value` and
// `status`, and `crm.leads` carries `status`, so the pipeline total, the active-lead count, the win
// rate and all three snapshot counts are measured. What follows is only what no column can answer.

/** "+12.5% vs Last Month" under the pipeline total, and "↑3%" under the win rate. */
export const CRM_TREND = figure(
  { pipeline: '+12.5%', winRate: '3%' },
  'a historical series of pipeline value and win rate — nothing records what either was last month',
);

/**
 * The CRM Intelligence card: its confidence, its sentence, its action and its source line.
 *
 * There is NO CRM or sales report anywhere in `backend/src/modules/ai/` — checked by grep on
 * 2026-09-09, which returned nothing. Every other AI card on this platform renders a real endpoint's
 * output; this one has none to render.
 */
export const CRM_INTELLIGENCE = figure(
  {
    confidence: 92,
    body: 'The "Skyline Tower A" opportunity is likely to close this week. Send the final BOQ.',
    action: 'Send the final BOQ',
  },
  'a sales model reading lead velocity and email sentiment — neither the endpoint nor the email integration exists',
);

/**
 * The two "Action Required" rows.
 *
 * "Stalled" is the word that cannot be measured. `Opportunity` is `opportunity_id, lead_id, title,
 * value, status, expected_close_date, assigned_to, created_at` — there is no last-activity or
 * last-contacted date, so nothing can say a deal has gone quiet. `created_at` says when it opened,
 * which is a different fact.
 */
export const CRM_ACTION_REQUIRED = figure(
  [
    {
      kind: 'HIGH_PRIORITY' as const,
      title: 'Stalled Opportunity: Skyline Tower A',
      when: '2h ago',
    },
    { kind: 'FOLLOW_UP' as const, title: 'Follow-up Needed: Siam Materials', when: 'Yesterday' },
  ] as const,
  'a last-activity timestamp on an opportunity, and a rule for how long is too long',
);

// ── The CRM manager's four remaining screens (12_crm_manager, 2026-09-10) ──
//
// The leads, opportunities, customers, drawer and settings drawings, built under the plan the
// product owner approved on 2026-09-10. The CRM tables are small — `crm.leads` is seven columns,
// `crm.opportunities` eight, `finance.customers` six — so these screens carry more drawn detail
// than the procurement ones did. Each entry below names the column that would delete it.

/** The "AI Score" box on every lead card — 98, 82, 75 in the drawing. */
export const LEAD_AI_SCORE = figure(
  [98, 82, 75] as const,
  'a lead scoring model, and a score column on crm.leads — the table has no numeric field at all',
);

/** The leads insight card: how many leads it calls high-potential, and its confidence. */
export const LEAD_INSIGHT = figure(
  { highPotential: 3, confidence: 95 },
  'the same scoring model — nothing ranks a lead, so nothing can call three of them high-potential',
);

/**
 * The opportunity cards' win rate, document state and urgency line.
 *
 * `crm.opportunities` is `opportunity_id, lead_id, title, value, status, expected_close_date,
 * assigned_to, created_at`. `status` is OPEN | WON | LOST — a three-state flag, not a probability —
 * and there is no document, audit or signature record anywhere in the CRM schema.
 */
export const OPPORTUNITY_DETAIL = figure(
  [
    { winRate: 85, docState: 'Special award contract', urgency: null },
    { winRate: 64, docState: 'State concession', urgency: 'Final round of negotiation' },
    { winRate: 94, docState: 'Ready to sign', urgency: null },
  ] as const,
  'a win probability and a contract-document state on an opportunity — neither column exists',
);

/** The opportunities forecast card: portfolio average, its delta, and the forecast total. */
export const OPPORTUNITY_FORECAST = figure(
  { average: '78%', delta: '+4.2%', confidence: 92, forecast: '฿ 194.2 M' },
  'a historical series of win rates and a forecasting model — the CRM records neither',
);

/**
 * The site photographs on the opportunity cards.
 *
 * INCLUDED BY PRODUCT-OWNER DECISION 2026-09-10, over the recommendation to omit them: a stock
 * image on a deal card is the drawn element a reader is most likely to take for that deal's own
 * site. They are BUNDLED under `assets/crm/` rather than loaded from the drawing's
 * `lh3.googleusercontent.com` URLs — this app must work offline (§17), and those URLs are Stitch's
 * own CDN, which was measured expiring within the hour on the day this was written.
 *
 * The filenames say what the pictures are, not which deal they sit on.
 */
export const OPPORTUNITY_PHOTO = figure(
  ['construction-site-1.jpg', 'construction-site-2.jpg', 'construction-site-3.jpg'] as const,
  'a photo or attachment column on crm.opportunities, and real site photography per deal',
);

/** The customers screen's relationship card: trust index and repeat rate. */
export const CUSTOMER_RELATIONSHIP = figure(
  { trustIndex: 89, repeatRate: '94%', repeatProjects: 18 },
  'a customer scoring model and a history of repeat engagements — finance.customers holds neither',
);

/**
 * Everything a customer card shows beyond company name, type and status.
 *
 * `finance.customers` is `customer_id, opportunity_id, company_name, customer_type, status,
 * created_at`. No tier, no credit terms, no contact people, no project counts.
 */
export const CUSTOMER_DETAIL = figure(
  [
    {
      tier: 'AAA',
      projects: 3,
      value: '฿ 320 M',
      terms: '60-day credit',
      contact: 'Chief Development Officer',
    },
    {
      tier: 'AA+',
      projects: 1,
      value: '฿ 128 M',
      terms: 'e-GP disbursement',
      contact: 'Deputy Director of Engineering',
    },
    {
      tier: 'A',
      projects: 2,
      value: '฿ 145 M',
      terms: 'Awaiting 4th-instalment approval',
      contact: 'Project Director',
    },
  ] as const,
  'a tier, credit terms, contact people and per-customer project counts — none is a column',
);

/** The drawer's row counts — "24 ใหม่" on leads, "14 ดีล" on the pipeline. */
export const CRM_DRAWER_COUNTS = figure(
  { newLeads: 24, deals: 14, closingTenders: 3 },
  'nothing — these ARE countable from the three list endpoints, and are drawn only where a row has no endpoint behind it (tenders)',
);

// ── Get Help — mockup/mobile/01_authen/05_get_help ───────────────────────────────────────────────
//
// The tables for all of this exist: migration `20260818000001_support_desk_and_help_chat` created
// `platform.support_desk_default` and `platform.tenant_support_desks` with columns for every figure
// below, plus `platform.support_tickets` and `platform.support_messages`. What does not exist is
// `GET /api/v1/support/desk` and the ticket endpoints — no `backend/src/modules/support/`, and none
// of the 25 controller prefixes in the backend is support, chat or ticket (measured 2026-09-10). So
// the columns each entry names are real columns, waiting on an endpoint to read them.

/**
 * The hotline number the drawing prints.
 *
 * ONLY A FALLBACK. `EXPO_PUBLIC_SUPPORT_IT_HOTLINE` wins wherever a deployment sets one — the
 * Support Centre has read that variable since 2026-08-09 and the hotline screen reads the same one,
 * so `CALL NOW` places a real call there. This is what it prints when nothing is configured.
 */
export const HOTLINE_NUMBER = figure(
  '(+66) 063-416-5325',
  'support_desk_default.it_hotline_phone, overridden by tenant_support_desks.it_hotline_phone',
);

/** The two operating-hour rows. */
export const HOTLINE_HOURS = figure(
  { critical: '24/7 Available', general: '08:00 - 18:00' },
  'support_desk_default.operating_hours (JSONB), overridden per tenant',
);

/** The regional desks under the hours. Each row's call button dials the number beside it. */
export const HOTLINE_REGIONS = figure(
  [
    { name: 'Bangkok HQ', number: '(+66) 02-555-0100' },
    { name: 'Eastern Seaboard', number: '(+66) 038-555-0101' },
  ] as const,
  'support_desk_default.regional_hotlines (JSONB), overridden per tenant',
);

/**
 * The ticket number in the chat's secure-session line.
 *
 * `platform.support_tickets` has a `reference` column for exactly this — the human-quotable handle,
 * never an authenticator (ADR-093 §2). Until a ticket can be opened there is no reference to print.
 */
export const HELP_CHAT_TICKET = figure(
  '8824',
  'support_tickets.reference, minted when a ticket is opened',
);

/**
 * The seeded conversation.
 *
 * ADR-093 §3 puts every AI turn through `LLMProvider` and the Phase 12 `HallucinationGuard`, and
 * stores the verdict on the message. These four turns are the drawing's own copy, standing in for
 * that thread. The error code `E-4099` is the drawing's too — this product mints
 * `COS-{DOMAIN}-{NNN}` codes (QM-10), not `E-`-prefixed ones.
 */
export const HELP_CHAT_THREAD = figure(
  { day: 'TODAY, 14:02 EST', opening: '14:02', question: '14:04', reply: '14:05' },
  'support_messages rows — body, sender_type, created_at, and the guard verdict on each AI turn',
);

// ── VIEWER (mockup/mobile/role_viewer/) ──────────────────────────────────────
//
// ADDED 2026-09-10 for the five Stitch screens the product owner asked for — Home, Projects, Map,
// Insights and Account Settings. Same standing rule as the FINANCE and Get Help rounds: the drawing
// is built as drawn, an unbuilt control says so on a press and never on the page, and every value
// with no source is registered here.
//
// WHAT IS REAL ON THESE SCREENS AND IS DELIBERATELY NOT HERE: the project rows themselves. Home's
// Active Projects count, its project cards' names and codes, and the whole Projects list read
// `local_projects` (§17.4 stale-while-revalidate), and Home's Open Issues count reads
// `local_issues`. The cache holds five columns — id, project_id, project_code, project_name,
// status — so the code and the name are printed from it and everything else on a card is below.

// `VIEWER_OPEN_ISSUES` LIVED HERE FOR ONE DAY. The Home dashboard's open-issue tile drew 47 because
// `GET /site/issues` answered 403 for this role while §6.8 granted it `Issues R` — missing AUTHORITY
// rather than missing data, the second entry of that kind after the PROC_MANAGER approve button.
// The route was opened on 2026-09-11 (ADR-103) and the tile reads it again, so the entry is gone.
// Recorded rather than deleted silently: this register is meant to shrink, and it is worth knowing
// which entries left because the data arrived and which left because a screen was cancelled.

/**
 * Home's full-width budget tile — the amount and the year-to-date delta beside it.
 *
 * AN AMOUNT, NOT A STRING. The 2026-09-10 drawing wrote `$142.5M` and this held that literal; the
 * 2026-09-11 redraw writes **`฿ 142.5 M`**, which is this project's own compact-money format
 * (`compactMoneyLabel`, PO 2026-08-10) rather than a new one. So the register holds the number and
 * the screen formats it — a hardcoded `฿` would print baht to a reader whose locale is not Thai,
 * and the currency symbol is exactly the part `@cos/financial` exists to decide.
 */
export const VIEWER_PORTFOLIO_BUDGET = figure(
  { amount: 142_500_000, currency: 'THB', deltaPct: 2.4 },
  'a portfolio budget roll-up for a VIEWER. `GET /analytics/executive` returns one, but it is ' +
    "scoped to the EXECUTIVE's whole tenant rather than to this role's `project_membership` rows, " +
    'and no endpoint sums budgets across the projects one viewer is assigned to',
);

/** Home's System Insight card. */
export const VIEWER_SYSTEM_INSIGHT = figure(
  {
    body:
      "Weather delays predicted for 'Sector 7G' tomorrow. Concrete pours may need rescheduling. " +
      'Schedule variance currently at +2 days.',
  },
  'a weather-and-schedule prediction. `backend/src/modules/ai/` has no such report: the Phase 12 ' +
    'pipeline produces site summaries, delay forecasts per project and risk classifications, none ' +
    'of which reads a weather feed. §22.6 names no weather provider at any status',
);

/**
 * Home's two project cards, in the order the cache returns them.
 *
 * Structured rather than copied as sentences, because the drawing writes the labels in English and
 * a hardcoded string would print unchanged on a Thai device (QM-3). The card's name and code are
 * NOT here — they are the cached row's.
 */
export const VIEWER_HOME_PROJECT_CARDS = figure(
  [
    { category: 'commercial', completion: 68, crew: 124, issues: 3 },
    { category: 'infrastructure', completion: 42, crew: 89, issues: 12 },
  ] as const,
  'a completion percentage, a head-count and an issue count per project. §32.12 computes ' +
    'completion per project but no mobile endpoint returns it for a list; the head-count would ' +
    'come from `workforce` attendance, which has no per-project roll-up; the issue count is one ' +
    'request per project, the fan-out `GET /tasks/portfolio-summary` exists to avoid',
);

/**
 * Home's Site Activity timeline.
 *
 * `tone` picks the dot colour, `key` the sentence, and the two `at`/`where` strings are the
 * drawing's own. A real feed would order these by timestamp and name the project from its row.
 */
export const VIEWER_SITE_ACTIVITY = figure(
  [
    { tone: 'accent', at: '10:42 AM', where: 'Alpha Towers', key: 'report', who: 'J. Smith' },
    {
      tone: 'danger',
      at: '09:15 AM',
      where: 'Metro Expansion',
      key: 'defect',
      quote: 'Rebar spacing fails spec in Section 4.',
    },
    { tone: 'success', at: '08:00 AM', where: 'System', key: 'sync' },
  ] as const,
  'a portfolio activity feed. Site reports, issues and sync runs are three separate tables with ' +
    'no combined endpoint, and nothing records a completed sync as an event a screen can read',
);

/** The Projects list's three cards — the same shape as Home's, with that drawing's own numbers. */
export const VIEWER_PROJECT_CARDS = figure(
  [
    { category: 'commercial', completion: 68, crew: 124, issues: 3 },
    { category: 'infrastructure', completion: 42, crew: 450, issues: 12 },
    { category: 'commercial', completion: 89, crew: 85, issues: 1 },
  ] as const,
  'the same three missing figures as VIEWER_HOME_PROJECT_CARDS. The two drawings disagree on the ' +
    "second card's head-count (89 on Home, 450 here), so they are registered separately rather " +
    'than one being quietly preferred over the other',
);

/** The Projects list's category filter chips. */
export const VIEWER_PROJECT_FILTERS = figure(
  ['commercial', 'infrastructure', 'residential'] as const,
  '`projects.projects` has no category, sector or type column — the filter has nothing to filter on',
);

/**
 * The Map screen's pins, as fractions of the canvas.
 *
 * POSITIONS, NOT COORDINATES. `projects.projects` holds no latitude or longitude (the geo columns
 * added by `20260705000001_geo_coordinates` are on site reports, issues, photos and check-ins, not
 * on the project), and the GIS engine that would place a real pin is listed in §28 as
 * "Esri / Mapbox / OpenLayers — decide at V2-1 entry". These are where the drawing put them.
 */
export const VIEWER_MAP_PINS = figure(
  [
    { top: 0.25, left: 0.35, label: 'Site Alpha', tone: 'success', size: 'large' },
    { top: 0.45, left: 0.7, label: 'Metro Exp.', tone: 'warning', size: 'large' },
    { top: 0.55, left: 0.25, label: null, tone: 'success', size: 'small' },
  ] as const,
  'a coordinate on a project, and a decision on the GIS engine (§28, V2-1 entry)',
);

/** The Map screen's bottom sheet — the visible count and the two site rows. */
export const VIEWER_MAP_SITES = figure(
  {
    visible: 3,
    rows: [
      {
        name: 'Site Alpha Complex',
        ref: '#SA-2044',
        category: 'commercial',
        completion: 42,
        issues: 3,
        tone: 'success',
      },
      {
        name: 'Metro Line Expansion',
        ref: '#ME-1092',
        category: 'infrastructure',
        completion: 15,
        issues: 12,
        tone: 'warning',
      },
    ],
  },
  'the same missing completion and issue counts as the project cards, plus a map viewport to ' +
    'count what is visible within',
);

/** The Insights S-curve — planned and actual, as the drawing's own control points. */
export const VIEWER_PROGRESS_CURVE = figure(
  {
    planned: 'M0,90 Q30,85 50,50 T100,10',
    actual: 'M0,95 Q25,90 45,60 T90,20',
  },
  'a planned-vs-actual progress series. §32.12 computes completion at a point in time; nothing ' +
    'stores the baseline S-curve a plan is measured against, and no endpoint returns a series',
);

/** The Insights safety card. */
export const VIEWER_SAFETY_PERFORMANCE = figure(
  { safeHours: 42500, zeroIncidentDays: 128, status: 'optimal' },
  'safe man-hours and a zero-incident streak. `safety.incidents` records incidents, not the hours ' +
    'between them, and no worked-hours ledger is aggregated per portfolio (see SAFE_MAN_HOURS)',
);

/** The Insights risk card. */
export const VIEWER_RISK_FORECAST = figure(
  {
    body: 'High probability of material supply bottleneck in Phase 4 due to regional logistics trend.',
    confidence: 92,
  },
  'a supply-chain risk model. Phase 23 trains DelayForecastModel, SafetyVisionModel, GraphMLModel, ' +
    'RiskClassifier and DeviceTrustModel — none of them forecasts material logistics',
);

// NEITHER AI CARD PRINTS THE DRAWING'S SOURCE, and that is the one piece of drawn text this round
// does not reproduce. `01_dashboard` foots nothing and `01_analytics` foots its risk card with
// "Data: Logistics Hub" — a system this platform does not have. <AiCardFooter />'s contract is that
// `source` names something this REPOSITORY has, never a system it does not; it is the carve-out
// ADR-098's second amendment opened, ADR-099 has applied five times, and it exists because a
// provenance line is the one drawn string that changes how much of a card a reader believes.
// Both cards name the record set they are about instead — the viewer's assigned projects,
// `platform.project_membership` — through `insight.sourcePortfolio`.

/** The Insights issue-severity breakdown. */
export const VIEWER_ISSUE_SEVERITY = figure(
  { critical: 12, high: 34, medium: 87, low: 142 },
  'a portfolio-wide issue count by severity. `local_issues` holds the severities of the issues ' +
    'this device has cached for its own projects, which is not the same set and must not be ' +
    'printed as though it were',
);

// `ID: COS-8842-V` IS NOT REGISTERED, because it is already REAL. A draft of this block had it as
// VIEWER_MEMBER_ID; reading <ProfileBlock /> before writing the entry showed the id line is already
// there and already drawn from `workforce.workers.employee_code`, falling back to the short UUID.
// That is the second time this register has been spared an entry by reading the source first — the
// FINANCE round lost four the same way — and it is the whole procedure.

/**
 * Account Settings' System Permissions tiles.
 *
 * The MODULES are the drawing's, not §6.8's — the drawing names Financials, BIM Models and Site
 * Reports, and §6.8 grants this role ten modules as of the widening in the same commit as this
 * entry. What is NOT drawn is a claim that these three are the whole grant.
 */
export const VIEWER_PERMISSION_TILES = figure(
  [
    { key: 'financials', icon: 'account-balance' },
    { key: 'bim', icon: 'architecture' },
    { key: 'siteReports', icon: 'assignment' },
  ] as const,
  'a per-module grant readable from the client. `@cos/rbac` resolves permissions from the JWT ' +
    'role claim, and no endpoint returns the effective matrix for the signed-in user to render',
);

// ── VIEWER Procurement (mockup/mobile/role_viewer/06_procurement/01_procurement) ──────────────────
//
// ADDED 2026-09-11. Every figure on this screen is drawn, and the reason is the same one measured
// for `VIEWER_OPEN_ISSUES`: the data exists and this role cannot fetch it. Measured that day with a
// real VIEWER token minted through `POST /auth/otp/verify`:
//
//   GET /api/v1/procurement/purchase-orders   403
//   GET /api/v1/procurement/deliveries        403
//   GET /api/v1/procurement/rfqs              403
//   GET /api/v1/procurement/vendors           403
//
// §6.8 grants this role "Procurement (all) R". None of the 23 GET routes in the procurement and
// finance controllers lists VIEWER. The six these two screens need are being opened in the same
// commit (product-owner decision F3 = C); until that lands and the screens are rewired, the numbers
// below stand in, and each entry names the query that replaces it.

/** The four KPI tiles across the top. */
export const VIEWER_PROCUREMENT_KPIS = figure(
  {
    totalPos: { count: 48, value: 14_200_000, currency: 'THB', packages: 12 },
    inDelivery: { orders: 6, arrivingToday: 2 },
    pendingPm: { items: 3 },
    fulfillmentPct: 94.2,
  },
  'a count and a committed value over `procurement.purchase_orders`, a delivery count over ' +
    '`procurement.deliveries`, and a fulfilment rate between the two — all three queries exist for ' +
    'other roles; this one is refused by `@Roles`',
);

/** The Delivery Predictor card — its sentence, its confidence and its two state chips. */
export const VIEWER_DELIVERY_PREDICTOR = figure(
  {
    body:
      'Concrete shipments on schedule with zero transit choke. Rebar batch variance estimated ' +
      'within +0.5 days under prevailing port clearance patterns.',
    confidence: 94,
    variance: '+0.5 days',
  },
  'a delivery-time model. Phase 23 trains DelayForecastModel, SafetyVisionModel, GraphMLModel, ' +
    'RiskClassifier and DeviceTrustModel — none of them forecasts shipment arrival',
);

/**
 * The two state chips under that card — "Sensor Feeds Active" and "Live Predictive Sync".
 *
 * REGISTERED SEPARATELY FROM THE CARD because they are claims about INFRASTRUCTURE rather than
 * about a project. Phase 21 does build an IoT path (EMQX → ingestion worker → Kafka →
 * TimescaleDB, ADR per §33.8), so the feeds are not fictional — what is missing is any endpoint
 * that reports their health, so nothing on a device can know whether they are active.
 */
export const VIEWER_PREDICTOR_FEEDS = figure(
  ['sensorFeeds', 'predictiveSync'] as const,
  'a health endpoint for the Phase 21 IoT pipeline and the Phase 12 inference path — the pipelines ' +
    'exist, a readiness signal a client can read does not',
);

/** The Active Route Inspection tracker — the shipment it names and its four steps. */
export const VIEWER_ROUTE_INSPECTION = figure(
  {
    poNumber: 'PO-2024-095',
    vendor: 'Thai Metal Tech',
    steps: [
      { key: 'dispatched', state: 'done', at: '06:30' },
      { key: 'transit', state: 'current', at: 'Gate 4 ETA' },
      { key: 'weighIn', state: 'pending', at: null },
      { key: 'staging', state: 'pending', at: 'Zone C' },
    ],
  } as const,
  'a per-delivery status timeline. `procurement.deliveries` records that a delivery happened and ' +
    'when; it has no leg-by-leg tracking, and no GPS or weighbridge feed is ingested',
);

/** The four monitored purchase-order lines. */
export const VIEWER_PROCUREMENT_LINES = figure(
  [
    {
      po: '#PO-2024-089',
      title: 'Rebar 16mm & 20mm (Grade SD40)',
      vendor: 'Siam Steel Co., Ltd.',
      state: 'partial',
      statePct: 75,
      metric: '150 / 200 Metric Tons',
      note: 'Batch 3 of 4 on site',
      icon: 'inventory-2',
    },
    {
      po: '#PO-2024-092',
      title: 'Ready-mix Concrete C30/37',
      vendor: 'CPAC Concrete Prod...',
      state: 'delivered',
      statePct: 100,
      metric: '420 / 420 m³ Received',
      note: 'Pouring verified',
      icon: 'scale',
    },
    {
      po: '#PO-2024-095',
      title: 'Structural Steel Beams (H-Beams)',
      vendor: 'Thai Metal Tech Plc.',
      state: 'transit',
      statePct: null,
      metric: 'Convoy 2 of 3 En Route',
      note: 'GPS Tracked #TH-882',
      icon: 'local-shipping',
    },
    {
      po: '#PO-2024-101',
      title: 'MEP Ductwork & Fittings Level 4-8',
      vendor: 'Siam Air Flow...',
      state: 'pendingApproval',
      statePct: null,
      metric: 'Viewer: Action Disabled',
      note: 'Under Technical Review',
      icon: 'visibility-off',
    },
  ] as const,
  '`GET /procurement/purchase-orders` and `GET /procurement/purchase-orders/{id}/deliveries` — ' +
    'both refuse this role today. The received-quantity metrics also need a per-line delivery ' +
    'roll-up that no endpoint returns',
);

/** The active project the banner names, and its LOCKED state. */
export const VIEWER_PROCUREMENT_CONTEXT = figure(
  { project: 'Skyline Tower A (Bangkok CBD)' },
  'a project NAME is real (`local_projects`) — what is drawn here is a project this seed does not ' +
    'have, and the LOCKED chip beside it, which is a scope lock this product does not model',
);

// ── VIEWER Budget (mockup/mobile/role_viewer/07_budget/01_budget) ─────────────────────────────────
//
// ADDED 2026-09-11, and MISSING AUTHORITY for the same reason as the procurement screen beside it.
// Measured that day with a real VIEWER token:
//
//   GET /api/v1/finance/budget/{projectId}            403
//   GET /api/v1/finance/cost-transactions             403
//   GET /api/v1/finance/cashflow-forecast/{projectId} 403
//
// §6.8 grants this role "Finance (all) R". Every one of those queries is written and answers for
// FINANCE, PROJECT_MANAGER and EXECUTIVE today — `budget.tsx` reads all three. The three routes are
// being opened in this same round (F3 = C); until this screen is rewired onto them, the figures
// below stand in.
//
// AMOUNTS ARE NUMBERS. The drawing prints `฿ 124.5 M` on the summary cards and
// `฿ 45,000,000.00` on the BOQ rows — the compact and the exact forms of this project's own money
// formatting (`compactMoneyLabel` and `formatMoney`). Storing either as a string would hardcode
// both the symbol and the separator, which are the reader's locale's to choose.

/** The three summary cards at the top. */
export const VIEWER_BUDGET_SUMMARY = figure(
  {
    currency: 'THB',
    total: 124_500_000,
    reserved: 6_225_000,
    allocatedPct: 100,
    committed: 84_210_000,
    committedPctOfCap: 67.6,
    actual: 62_450_000,
    burnedPct: 50.1,
    variancePct: -2.4,
  },
  '`GET /finance/budget/{projectId}` returns `total_budget_amount` and `actual_amount`; the ' +
    'COMMITTED figure is the sum of purchase orders against the budget and the RESERVED figure a ' +
    'contingency this product does not model at all',
);

/**
 * The Absorption bar and its legend.
 *
 * `pct` drives the segment width and `amount` the legend's money. The two are the drawing's and
 * agree with each other: 32.4 + 24.1 + 11.2 + 4.5 = 72.2 M against a 124.5 M total, which is the
 * 26 / 19.3 / 9 / 3.6 the drawing prints.
 */
export const VIEWER_BUDGET_ABSORPTION = figure(
  [
    { key: 'structural', pct: 26, amount: 32_400_000 },
    { key: 'steel', pct: 19.3, amount: 24_100_000 },
    { key: 'mep', pct: 9, amount: 11_200_000 },
    { key: 'finishes', pct: 3.6, amount: 4_500_000 },
  ] as const,
  'a spend breakdown per work category. `budget_lines` carries what was ALLOCATED and no actual ' +
    'column; the spend comes from `GET /finance/cost-transactions` summed by `budget_line_id`, ' +
    'which is exactly the query this role is refused',
);

/** The Audit & Forecast card. */
export const VIEWER_BUDGET_FORECAST = figure(
  {
    body:
      'Cost integrity verified across 412 ledgers. Zero anomalous rate-spikes detected in active ' +
      'procurement. Projected margin at completion tracks solidly at 14.80% ' +
      '(Target benchmark: 14.00%).',
    confidence: 96,
    burnVelocity: 1_820_000,
    eacTarget: 121_200_000,
    riskIndex: 0.12,
    riskBand: 'low',
  },
  'a ledger-anomaly audit and an estimate at completion. `GET /finance/cashflow-forecast/{id}` ' +
    'projects a shortfall, not an EAC or a margin, and no model scores ledger integrity',
);

/** The four BOQ work categories. */
export const VIEWER_BOQ_CATEGORIES = figure(
  [
    {
      key: 'structural',
      division: 'DIV-03 • SUBSTRUCTURE',
      budget: 45_000_000,
      disbursed: 32_400_000,
      pct: 72.0,
      state: 'onTrack',
    },
    {
      key: 'steel',
      division: 'DIV-05 • METALS',
      budget: 28_500_000,
      disbursed: 24_100_000,
      pct: 84.5,
      state: 'allocated',
    },
    {
      key: 'mep',
      division: 'DIV-22/26 • SERVICES',
      budget: 22_000_000,
      disbursed: 11_200_000,
      pct: 50.9,
      state: 'onTrack',
    },
    {
      key: 'finishes',
      division: 'DIV-08/09 • ENVELOPE',
      budget: 18_000_000,
      disbursed: 4_500_000,
      pct: 25.0,
      state: 'notStarted',
    },
  ] as const,
  'BOQ divisions with a disbursed figure per division. `boq.boq_items` has no CSI division code ' +
    'and no disbursement column, and the per-line spend is the refused cost-transactions query',
);

/**
 * The On-Site Progress Validation block.
 *
 * The FILE is bundled and real; what is drawn is the claim that this photograph shows this
 * project's level 18. Same treatment as `OPPORTUNITY_PHOTO` (2026-09-10) — a stock frame, bundled
 * so it renders with no network, and said to be stock in the screen's own comment.
 */
export const VIEWER_BUDGET_PROGRESS_PHOTO = figure(
  {
    file: 'construction-site-1.jpg',
    caption: 'Level 18 Pour Complete • QA Verified',
    milestone: 'Milestone M-04 Inspection',
  },
  'a progress photo attached to a milestone. Photos exist (`local_photos`, the site-report flow) ' +
    'and none is linked to a budget milestone, because no milestone entity carries one',
);

/** The VERIFIED LOG's three entries. */
export const VIEWER_BUDGET_LOG = figure(
  [
    {
      key: 'disbursement',
      icon: 'verified',
      tone: 'success',
      party: 'Siam Cement Group • Grad...',
      certifier: '08:30 AM',
      amount: 3_850_000,
      state: 'executed',
    },
    {
      key: 'retention',
      icon: 'lock',
      tone: 'accent',
      party: 'Apex Steelworks Ltd. • Anc...',
      certifier: 'Yesterday',
      amount: 1_200_000,
      state: 'released',
    },
    {
      key: 'advance',
      icon: 'draw',
      tone: 'primary',
      party: 'Bangkok HVAC Systems • Chi...',
      certifier: 'Bank Auditor • 22 Oct',
      amount: 2_400_000,
      state: 'verified',
    },
  ] as const,
  'an audited financial event log. `finance.payments` records payments and `procurement.invoices` ' +
    'invoices; neither carries a certifier, and no endpoint returns the two as one trail',
);

/** The project the context row names, and the phase beside it. */
export const VIEWER_BUDGET_CONTEXT = figure(
  { project: 'Skyline Tower A • Phase II' },
  'the same missing project as VIEWER_PROCUREMENT_CONTEXT, plus a PHASE — `projects.projects` ' +
    'has no phase column, and §32.12 computes progress rather than naming a phase',
);

// ── SUPPORT CENTRE, 2026-09-11 ──────────────────────────────────────────────────────────────────
//
// `mockup/mobile/support_center/01_dashboard` was REDRAWN by Stitch and the product owner named it
// ("ศูนย์ช่วยเหลือและสนับสนุน - Construction OS (Support Center)"). The three entries below are the
// sections the redraw adds, and all three are the same category: MISSING A CORPUS, not missing a
// query. Measured 2026-09-11 — there is no `help_article`, `faq` or `article` model in
// `schema.prisma`, no `backend/src/modules/support/`, and none of the backend's controller prefixes
// is support, chat, ticket, help or faq. The four support TABLES that do exist
// (`SupportDeskDefault`, `TenantSupportDesk`, `SupportTicket`, `SupportMessage`) are about the desk
// and about tickets; none of them holds an article or an FAQ.
//
// The drawing's SEARCH BAR is deliberately NOT registered. A drawn figure is a value with no source;
// a search box is a CONTROL with no corpus, and this repository has answered that three times over —
// it renders disabled (PO 2026-08-09, re-affirmed 2026-08-17 and 2026-08-18, and again today when a
// fourth drawing asked for it). Registering it would misfile a decision as a datum.

/**
 * The eight Quick Help tiles, in the drawing's own order.
 *
 * `role` is the drawing's English hint and `icon`/`tone` its own glyph and accent. These are NOT
 * `drawerLinksFor(role)` — that list is real, is filtered to the signed-in role, and does not exist
 * at all before sign-in, which is half of where this screen lives.
 */
export const SUPPORT_HELP_CATEGORIES = figure(
  [
    { key: 'siteReporting', icon: 'description', tone: 'primary', role: 'Site Eng / Worker' },
    { key: 'safety', icon: 'health-and-safety', tone: 'danger', role: 'Safety Officer' },
    { key: 'finance', icon: 'payments', tone: 'success', role: 'Finance / PM' },
    { key: 'procurement', icon: 'inventory-2', tone: 'warning', role: 'Procurement' },
    { key: 'tasks', icon: 'task-alt', tone: 'primary', role: 'All Field Roles' },
    { key: 'bim', icon: 'view-in-ar', tone: 'accent', role: 'Site / PM / Exec' },
    { key: 'crm', icon: 'groups', tone: 'accent', role: 'CRM Manager' },
    { key: 'admin', icon: 'manage-accounts', tone: 'muted', role: 'Tenant Admin' },
  ] as const,
  'a help TAXONOMY — a set of article categories and a body of articles filed under each. No ' +
    '`help_article` table, no category column and no endpoint returns either',
);

/** The four Top FAQ rows. Their ANSWERS are drawn too — see the i18n keys they read. */
export const SUPPORT_TOP_FAQS = figure(
  ['exportDailyLogs', 'addFieldMembers', 'progressBilling', 'cloudSync'] as const,
  'a ranked FAQ list. Ranking needs a question corpus and a hit count; this product stores ' +
    'neither, and the four questions themselves have no table to come from',
);

/**
 * The featured tutorial card.
 *
 * `image` names a file this repository already bundles rather than the drawing's remote URL: the
 * drawing loads it from `lh3.googleusercontent.com`, which is not shippable here, and the same
 * treatment was given to the VIEWER budget screen's progress photo.
 *
 * IT WAS `digital_archectural_blueprint.jpg` FOR ONE BUILD, chosen off its FILENAME and never
 * opened. The first capture showed what it actually is: a rendered mockup of a Tenant Admin screen,
 * Thai menu labels and a nav sidebar included — another product screen sitting behind an article
 * title. Corrected 2026-09-11 to a genuine photograph. Open the asset before naming it.
 */
export const SUPPORT_FEATURED_ARTICLE = figure(
  {
    tag: 'NEW TUTORIAL',
    title: 'Mastering AI Site Estimation',
    readMinutes: 5,
    byline: 'Product Team',
    image: 'construction-site-2.jpg',
  },
  'an editorial article with a reading time and an author. Nothing in this product authors, ' +
    'stores or serves one — there is no article table and no CMS behind it',
);
