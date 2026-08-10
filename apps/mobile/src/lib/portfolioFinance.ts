// The Finance dashboard's top three figures — Total Budget, Commit Costs, Actual Spent — summed
// across the projects the signed-in manager is a member of (mockup 06_project_manager/03_finance).
//
// WHY THE CLIENT ADDS THESE UP. There IS a server-side portfolio roll-up, `GET /finance/reports/
// variance`, and a PROJECT_MANAGER may not call it: its @Roles are FINANCE, EXECUTIVE, TENANT_ADMIN.
// `GET /analytics/executive` does admit a PM (and scopes them to their own projects via §6.5 ABAC),
// but it reads ClickHouse `analytics.project_cost_daily`, which is fed by the analytics pipeline
// rather than by the transactional tables. So the figures this screen must show come from the one
// source the role can read directly and that the operational data actually populates:
// `GET /finance/budget/:projectId`, once per project in `GET /projects/mine`.
//
// EVERY ADDITION GOES THROUGH decimal.js. QM-3 forbids native float for money, and these are the
// largest numbers in the product — hundreds of millions of baht, where a float's 2⁻⁵³ relative error
// is no longer invisible.
//
// CURRENCIES ARE NOT MIXED, AND NOT CONVERTED. Adding ฿ to $ produces a number that is true in no
// currency. The server has an exchange-rate service, but it exposes no client endpoint, so a rate
// applied here would be a rate this app invented. Instead the totals cover the currency most of the
// projects are budgeted in and report how many projects were left out, which the screen states.

import { Decimal, sumDecimals, toDecimal } from '@cos/financial';

/** One project's budget line as the Finance screen holds it. */
export interface ProjectFinance {
  projectId: string;
  projectName: string;
  projectCode: string;
  /** ISO 4217 from `total_budget_currency`. */
  currency: string;
  /** DECIMAL strings, exactly as the API returned them. */
  totalBudget: string;
  committed: string;
  actual: string;
}

export interface PortfolioTotals {
  /** The currency the totals are in; null when there was nothing to total. */
  currency: string | null;
  totalBudget: Decimal;
  committed: Decimal;
  actual: Decimal;
  /** Projects counted in the totals. */
  included: number;
  /** Projects left out because they are budgeted in a different currency. */
  excluded: number;
}

const ZERO = new Decimal(0);

/** The currency held by the most projects; a tie goes to whichever was seen first. */
function dominantCurrency(rows: ProjectFinance[]): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const code = row.currency.toUpperCase();
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let winner: string | null = null;
  let best = 0;
  // Map iterates in insertion order, so `>` (not `>=`) leaves a tie with the first-seen currency.
  for (const [code, count] of counts) {
    if (count > best) {
      winner = code;
      best = count;
    }
  }
  return winner;
}

/**
 * Portfolio totals over one currency's worth of projects.
 *
 * An empty list returns zeros with a null currency rather than throwing — a manager assigned to no
 * budgeted project sees a portfolio worth nothing, which is the truth, not an error.
 */
export function portfolioTotals(rows: ProjectFinance[]): PortfolioTotals {
  const currency = dominantCurrency(rows);
  if (currency === null) {
    return {
      currency: null,
      totalBudget: ZERO,
      committed: ZERO,
      actual: ZERO,
      included: 0,
      excluded: 0,
    };
  }

  const counted = rows.filter((row) => row.currency.toUpperCase() === currency);
  return {
    currency,
    totalBudget: sumDecimals(counted.map((row) => toDecimal(row.totalBudget))),
    committed: sumDecimals(counted.map((row) => toDecimal(row.committed))),
    actual: sumDecimals(counted.map((row) => toDecimal(row.actual))),
    included: counted.length,
    excluded: rows.length - counted.length,
  };
}

/**
 * `part` as a whole percentage of `budget`, or null when there is no budget to divide by.
 *
 * THIS IS WHAT SITS WHERE THE MOCKUP DRAWS A TREND ARROW. The drawing puts "▲ 4.2%" beside Commit
 * Costs and "▼ 1.1%" beside Actual Spent — a change against a previous period. No endpoint in this
 * product returns a previous period's budget figures: `project_budgets` holds current aggregates and
 * carries no history, so a trend rendered here would be a direction this app made up. The share of
 * budget is the same shape of number, is derived from data that is actually present, and answers the
 * question the tile is asked at a glance: how much of the money is spoken for.
 */
export function shareOfBudget(
  part: Decimal | string | number,
  budget: Decimal | string | number,
): number | null {
  const numerator = part instanceof Decimal ? part : toDecimal(part);
  const denominator = budget instanceof Decimal ? budget : toDecimal(budget);
  if (!denominator.isFinite() || denominator.lessThanOrEqualTo(0)) return null;
  if (!numerator.isFinite()) return null;
  return numerator.dividedBy(denominator).times(100).toDecimalPlaces(0).toNumber();
}
