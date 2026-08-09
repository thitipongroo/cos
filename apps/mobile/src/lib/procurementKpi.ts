// The two figures the manager dashboard puts at the top (mockup 06_project_manager/01_home).
//
// In `src/lib/` so they are unit-testable and inside the 100%-coverage scope — the same reason
// `approvalUrgency.ts` and `shiftHours.ts` live here rather than in their screens.
//
// MONEY IS SUMMED WITH decimal.js, NEVER WITH `+` ON NUMBERS. Totals arrive as DECIMAL(19,4) strings
// and the platform rule is absolute: monetary calculations use decimal.js (context.md § Always). A
// float sum of a few dozen purchase orders is already wrong in the satang column, and this figure is
// the one a manager quotes.

import { Decimal, sumDecimals, toDecimal } from '@cos/financial';
import { isUrgent } from './approvalUrgency';

/**
 * Purchase-order statuses that are NOT a spend commitment yet.
 *
 * DRAFT is not submitted and PENDING_APPROVAL is not decided — the money is not owed in either case.
 * Everything else is, INCLUDING PAID: "total committed spend" is what the tenant has committed to
 * pay, and having already paid it does not un-commit it. DISPUTED counts too — a disputed invoice is
 * an argument about a commitment, not the absence of one.
 */
const UNCOMMITTED = new Set(['DRAFT', 'PENDING_APPROVAL']);

/** The minimum a caller must expose for these to work — deliberately narrower than the API row. */
export interface SpendRow {
  status: string;
  total_amount: string;
}

export interface DeadlineRow {
  status: string;
  deadline: string;
}

/**
 * Total committed spend across the given purchase orders.
 *
 * Returns a Decimal so the caller formats it once with `formatMoney` rather than passing a number
 * through a second rounding. An empty list is 0 — not null: "nothing committed" is a real answer, and
 * a dash there would read as "we could not find out".
 */
export function committedSpend(rows: readonly SpendRow[]): Decimal {
  return sumDecimals(
    rows.filter((r) => !UNCOMMITTED.has(r.status)).map((r) => toDecimal(r.total_amount)),
  );
}

/** RFQs still out to vendors — `PUBLISHED` is the state where bids can still arrive. */
export function openRfqCount(rows: readonly { status: string }[]): number {
  return rows.filter((r) => r.status === 'PUBLISHED').length;
}

/**
 * Open RFQs whose deadline is inside the urgency window (or already past).
 *
 * Only PUBLISHED ones count: a closed or awarded RFQ has no deadline left to miss, and counting it
 * would keep the "urgent" figure high after the work was done.
 */
export function urgentRfqCount(rows: readonly DeadlineRow[], now: Date): number {
  return rows.filter((r) => r.status === 'PUBLISHED' && isUrgent(r.deadline, now)).length;
}
