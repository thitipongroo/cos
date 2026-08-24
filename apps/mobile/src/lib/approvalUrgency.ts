// How long is left on an approval, and is that urgent.
//
// In `src/lib/` rather than in the Approvals screen for the reason `shiftHours.ts` and `roleTabs.ts`
// are: importing a screen drags in expo-router, which is ESM and dies under this CommonJS jest setup.
// That is also what puts this inside the 100%-coverage scope (jest.config.ts `collectCoverageFrom`),
// where a screen is not.
//
// ONLY AN RFQ HAS A DEADLINE. `procurement.rfqs.deadline` is a real column, so "4h remaining" on an
// RFQ is a fact. A purchase order has NO approval deadline on the row — the 48-hour per-approver
// escalation clock (spec §15.5) lives inside the Temporal workflow and is not exposed on the PO — so
// this module never invents one for a PO. The screen shows POs without a countdown; anything else
// would be a number derived from `updated_at`, which any other write to the row resets.

/** Anything at or inside this many hours is urgent. One working day: past it, a decision cannot wait. */
export const URGENT_WITHIN_HOURS = 24;

/**
 * Whole hours from `now` until `deadline`. Negative once the deadline has passed, which the caller
 * renders as overdue rather than clamping — an approval nobody made is not suddenly on time.
 *
 * Returns null when there is no deadline to measure, which is every purchase order.
 */
export function hoursRemaining(deadline: string | null | undefined, now: Date): number | null {
  if (deadline == null || deadline === '') return null;
  const at = new Date(deadline).getTime();
  // An unparseable string is not a deadline. Reporting NaN hours downstream would render as "NaNh".
  if (Number.isNaN(at)) return null;
  return Math.floor((at - now.getTime()) / 3_600_000);
}

/**
 * Whether an item needs attention now.
 *
 * Overdue counts as urgent — the point of the chip is "look at these", and something already past its
 * deadline is the strongest case for that.
 */
export function isUrgent(deadline: string | null | undefined, now: Date): boolean {
  const hours = hoursRemaining(deadline, now);
  return hours !== null && hours <= URGENT_WITHIN_HOURS;
}
