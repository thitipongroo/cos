// Figures the EXECUTIVE screens print that this platform cannot compute (ADR-099).
//
// READ ADR-099 BEFORE CHANGING ANYTHING HERE. Every value below is copied from
// `mockup/mobile/08_executive/` and produced by no query. The repository's standing treatment for a
// drawn figure with no source is ADR-085 plus the 2026-08-13 ruling — draw the zone, say it is not
// available, never print an invented number — and the product owner decided otherwise for these ten
// on 2026-09-04, on the condition that they live in ONE module.
//
// That condition is the point of this file:
//   · grep `mockupFigures` and you have the complete set, with nothing scattered across screens
//   · deleting this module and fixing the type errors is how the decision is reversed
//   · each entry names what has to exist before it can go
//
// WHAT MAY NEVER HAPPEN HERE. No value in this file may be presented as a model output. The AI
// panels on these screens call the real endpoints and print the model's own text and its own
// confidence; a fabricated confidence standing beside a real one is the case spec §22.3 is most
// explicit about. `HOME_KPI_CONFIDENCE` below is the one confidence-shaped value, and it belongs to
// a KPI card that makes no AI claim at all.
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
