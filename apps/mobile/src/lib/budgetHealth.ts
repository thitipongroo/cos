// A project's budget health, as the Finance dashboard's badge (mockup 06_project_manager/03_finance
// draws Healthy / Warning / Overrun).
//
// THE TWO BOUNDARIES ARE THE PLATFORM'S OWN, NOT INVENTED HERE — this was the part of the drawing
// with no stated rule behind it, so both edges are borrowed from decisions the product already made:
//
//   - OVERRUN at 100% of budget. Spec §32.7's event table defines
//     `finance.budget.variance_detected.v1` with `threshold_exceeded` "the configured threshold that
//     was crossed; default 10%", i.e. the platform already treats crossing budget as the reportable
//     event. Spend at or past the allocation is that crossing.
//   - WARNING at 80%. Eighty percent is where this platform warns, repeatedly and deliberately: the
//     AI token quota raises its alert at ≥80% of the monthly allowance (§31.3) and the offline photo
//     queue warns the user at 80 of its 100 slots (§17.7). Using the same edge here keeps "we are
//     warning you" meaning one thing across the product.
//
// If the product owner would rather band on the CONFIGURED variance threshold from that event (10%
// by default, tenant-settable) than on consumption, this is the one function to change.
//
// In `src/lib/` so it is unit-testable and inside the 100%-coverage scope, like the other pure
// display rules.

export type BudgetHealth = 'HEALTHY' | 'WARNING' | 'OVERRUN' | 'UNKNOWN';

/** Where the warning band opens, as a fraction of the allocated budget. */
export const WARNING_AT = 0.8;

/**
 * Health from actual spend against allocated budget.
 *
 * Both figures arrive as DECIMAL strings. A budget of zero is UNKNOWN rather than an instant
 * overrun: a project with no allocation recorded has not overspent, it has not been budgeted, and
 * dividing by it would report the strongest possible alarm from missing data.
 */
export function budgetHealth(
  actual: string | number | null | undefined,
  budget: string | number | null | undefined,
): BudgetHealth {
  // null/undefined are checked BEFORE Number(), because `Number(null)` is 0 rather than NaN — a
  // missing actual would otherwise read as "nothing spent yet" and report HEALTHY.
  if (actual == null || budget == null) return 'UNKNOWN';
  const spent = Number(actual);
  const allocated = Number(budget);
  if (!Number.isFinite(spent) || !Number.isFinite(allocated) || allocated <= 0) return 'UNKNOWN';
  const ratio = spent / allocated;
  if (ratio >= 1) return 'OVERRUN';
  if (ratio >= WARNING_AT) return 'WARNING';
  return 'HEALTHY';
}

/**
 * How much of the bar to fill, 0..1.
 *
 * Clamped at 1 so an overrun does not draw past its track — the BADGE carries "this is over", and a
 * bar that ran off the card would say it twice while breaking the layout.
 */
export function budgetFraction(
  actual: string | number | null | undefined,
  budget: string | number | null | undefined,
): number {
  if (actual == null || budget == null) return 0;
  const spent = Number(actual);
  const allocated = Number(budget);
  if (!Number.isFinite(spent) || !Number.isFinite(allocated) || allocated <= 0) return 0;
  return Math.min(1, Math.max(0, spent / allocated));
}
