// Period-over-period change in spend — the arrow the Finance tiles carry
// (mockup 06_project_manager/03_finance: "▲ 4.2%" beside Commit Costs, "▼ 1.1%" beside Actual Spent).
//
// THIS WAS BUILT AFTER A WRONG CALL, and the reasoning matters. The first version of that screen put
// a share-of-budget figure in this slot with the note that a trend "is not computable — project
// budgets hold current aggregates and no history". That was true of `finance.project_budgets` and
// false of the product: `finance.cost_transactions` carries `transaction_date` on every row and
// `source_type` telling PURCHASE_ORDER commitments apart from INVOICE spend, and §14 grants
// PROJECT_MANAGER read on `GET /finance/cost-transactions`. The comparison was always there; it had
// not been looked for in the right table (PO correction, 2026-08-10).
//
// SO THE ARROW IS THE DRAWING'S, and it points at something measured: money recorded in the last
// `windowDays` against money recorded in the `windowDays` before that.

import { Decimal, sumDecimals, toDecimal } from '@cos/financial';

/** A row of `GET /finance/cost-transactions` — only the fields a trend needs. */
export interface CostTransaction {
  source_type: string;
  amount: string;
  /** DATE, `YYYY-MM-DD`. */
  transaction_date: string;
}

export type TrendDirection = 'up' | 'down' | 'flat';

export interface SpendTrend {
  /** Change against the previous window, in percent, one decimal. */
  percent: number;
  direction: TrendDirection;
}

/** The default comparison window. A month is how construction money is claimed and invoiced. */
export const TREND_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * Whole days, both ends inclusive.
 *
 * `transaction_date` is a DATE, so every row parses to midnight UTC. Comparing those against a live
 * instant made the answer depend on the time of day the screen was opened — a transaction dated
 * today counted or did not depending on whether "now" had passed midnight by a millisecond. Windows
 * are therefore whole days anchored on today's date, which is also how a month of claims is read.
 */
function windowTotal(
  rows: readonly CostTransaction[],
  sourceTypes: readonly string[],
  fromDay: number,
  toDay: number,
): Decimal {
  const amounts: Decimal[] = [];
  for (const row of rows) {
    if (!sourceTypes.includes(row.source_type)) continue;
    const at = Date.parse(row.transaction_date);
    if (Number.isNaN(at) || at < fromDay || at > toDay) continue;
    amounts.push(toDecimal(row.amount));
  }
  return sumDecimals(amounts);
}

/**
 * How this window's spend compares with the one before it, or null when there is nothing to compare.
 *
 * NULL, NOT ZERO, WHEN THE BASELINE IS EMPTY. A percentage change against nothing is undefined —
 * every first month would otherwise read "+100%", which is a number about the arithmetic rather than
 * about the project. The tile shows a placeholder instead of an arrow.
 *
 * The windows are whole days and adjacent: today back `windowDays` days is the current one, the
 * `windowDays` days before that is the baseline. No day belongs to both, and none is skipped.
 */
export function spendTrend(
  rows: readonly CostTransaction[],
  sourceTypes: readonly string[],
  now: Date,
  windowDays: number = TREND_WINDOW_DAYS,
): SpendTrend | null {
  // Today, floored to the UTC midnight the DATE values are parsed to.
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const span = windowDays * DAY_MS;
  const current = windowTotal(rows, sourceTypes, today - span + DAY_MS, today);
  const previous = windowTotal(rows, sourceTypes, today - 2 * span + DAY_MS, today - span);

  if (previous.lessThanOrEqualTo(0)) return null;

  const change = current.minus(previous).dividedBy(previous).times(100).toDecimalPlaces(1);
  const percent = change.toNumber();
  return {
    percent,
    direction: percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat',
  };
}
