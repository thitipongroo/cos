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
