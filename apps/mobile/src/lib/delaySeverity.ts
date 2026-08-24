// How late a task is, banded — the HIGH / MEDIUM chip the Site Worker's task cards draw
// (mockup 05_site_worker/02_tasks/01_sw_daily_tasks).
//
// I TOLD THE PRODUCT OWNER THIS COULD NOT BE COMPUTED, AND THAT WAS WRONG. The claim was that
// `projects.tasks` has no `priority` column, which is true and beside the point: the chip is not a
// stored priority, it is a DERIVED severity, and DESIGN.md §15.4 defines the derivation —
//
//   "Delay severity chips reuse the event thresholds:
//    LOW 1–2 days / MEDIUM 3–6 / HIGH 7–13 / CRITICAL 14+ (spec 32 §32.4 #8)"
//
// — against data every task already carries. `planned_end` is a real DATE column, cached since DDL
// v4, and "days late" is today minus that date. Nothing here is invented; the thresholds are the
// platform's own and are shared with the event severities in §9.1 (low / medium / high / critical),
// so one word means one thing across issues, incidents and schedule slippage.

/** §15.4's four bands, plus `none` for a task that is not late. */
export type DelaySeverity = 'none' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** The band edges, in days late. DESIGN.md §15.4 / spec 32 §32.4 #8 — not chosen here. */
export const SEVERITY_DAYS = { LOW: 1, MEDIUM: 3, HIGH: 7, CRITICAL: 14 } as const;

const DAY_MS = 86_400_000;

/**
 * Whole days between two dates, by calendar day.
 *
 * `planned_end` is a DATE, so both sides are floored to midnight UTC before subtracting — comparing
 * a date against a live instant makes the answer depend on the time of day the screen was opened,
 * which is the same trap `spendTrend` fell into.
 */
function daysLate(plannedEnd: string, now: Date): number | null {
  const due = Date.parse(plannedEnd);
  if (Number.isNaN(due)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - due) / DAY_MS);
}

/**
 * The severity band for a task, or `none` when it is not late.
 *
 * A task that is DONE is never late, however far past its date it was finished: the chip answers
 * "what needs attention today", and finished work needs none. A task with no planned end has no
 * deadline to be late against — `none`, not a guess.
 */
export function delaySeverity(
  plannedEnd: string | null | undefined,
  status: string,
  now: Date,
): DelaySeverity {
  if (status === 'COMPLETED' || status === 'DONE') return 'none';
  if (plannedEnd == null || plannedEnd === '') return 'none';
  const late = daysLate(plannedEnd, now);
  if (late === null || late < SEVERITY_DAYS.LOW) return 'none';
  if (late >= SEVERITY_DAYS.CRITICAL) return 'CRITICAL';
  if (late >= SEVERITY_DAYS.HIGH) return 'HIGH';
  if (late >= SEVERITY_DAYS.MEDIUM) return 'MEDIUM';
  return 'LOW';
}
