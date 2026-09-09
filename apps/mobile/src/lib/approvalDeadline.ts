// How long is left to decide an RFQ.
//
// THIS EXISTS BECAUSE THE COUNTDOWN STOPPED BEING DRAWN. The approvals queue printed
// `APPROVAL_COUNTDOWN` — "4h remaining", "2d remaining", "6h remaining" — on every row, because a
// purchase order carries no decision deadline: `delivery_date` is when goods are due, not when a
// signature is. An RFQ is different. `procurement.rfqs.deadline` is a real column and `RfqRow`
// already returns it, so an RFQ's countdown is a measurement rather than a picture.
//
// So the register entry was DELETED on 2026-09-09 and this took its place — the second figure this
// project has lost to real data rather than to a cancelled screen (ADR-101 removed the first).
//
// A PURCHASE ORDER STILL GETS NOTHING. Not a dash, not a drawn interval, not "no deadline": the row
// simply has no countdown chip. Inventing one for the rows that have no deadline is exactly what
// this function was written to stop.
//
// URGENT IS UNDER 24 HOURS. That threshold is a product choice, not a specification — nothing in
// `docs/specifications/` sets one — and it is here so the drawing's "Urgent" chip counts against a
// stated rule instead of a feeling. One day is the span in which a buyer can still act before the
// deadline passes during a night or a weekend.

/** Under this many milliseconds left, a decision is urgent. 24 hours. */
export const URGENT_MS = 24 * 60 * 60 * 1000;

export type Countdown =
  /** The deadline has passed. */
  | { state: 'OVERDUE'; urgent: true }
  /** Less than a day left — the drawing's "4h remaining". */
  | { state: 'HOURS'; hours: number; urgent: true }
  /** A day or more — the drawing's "2d remaining". */
  | { state: 'DAYS'; days: number; urgent: false };

/**
 * What is left of `deadline` at `now`, or `null` when there is no usable deadline.
 *
 * `null` covers all three of: no deadline column on this kind of row, an empty string, and a value
 * the platform cannot parse. Every one of them means the same thing to the caller — draw no chip —
 * and distinguishing them on screen would be inventing a state the data does not have.
 */
export function deadlineCountdown(
  deadline: string | null | undefined,
  now: Date,
): Countdown | null {
  if (deadline === null || deadline === undefined || deadline === '') return null;
  const at = new Date(deadline).getTime();
  if (Number.isNaN(at)) return null;

  const left = at - now.getTime();
  if (left <= 0) return { state: 'OVERDUE', urgent: true };
  if (left < URGENT_MS) {
    // Rounded UP: 30 minutes left is "1h", never "0h". A zero would read as no time at all, which
    // is the OVERDUE case and a different claim.
    return { state: 'HOURS', hours: Math.ceil(left / (60 * 60 * 1000)), urgent: true };
  }
  // Rounded DOWN: 47 hours left is "1d", not "2d". Over-reporting the time left is the direction
  // that makes someone miss a deadline.
  return { state: 'DAYS', days: Math.floor(left / URGENT_MS), urgent: false };
}
