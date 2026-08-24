// How long a row has been sitting where it is.
//
// In `src/lib/` so it is unit-testable and inside the 100%-coverage scope, like the other pure
// display rules (`approvalUrgency.ts`, `vendorBadge.ts`).
//
// WHAT IT MEASURES, AND WHAT IT DOES NOT. The mockup's approval cards print "2h ago" beside a clock.
// The only timestamp a purchase order carries is `updated_at`, the row's LAST WRITE — which for an
// order sitting in PENDING_APPROVAL is when it entered that state, because nothing else writes to it
// while it waits. That makes this an honest age, and it is deliberately phrased as "waiting Nh"
// rather than "submitted Nh ago": if some other write ever does touch a pending row, the number
// still tells the truth about how long the row has been unchanged, which is the thing a manager is
// judging. It is NOT a deadline and NOT a countdown — a purchase order has neither
// (see `approvalUrgency.ts`).

/** Age buckets, coarse on purpose: an approval queue is read at a glance, not to the minute. */
export type WaitingAge =
  { unit: 'now' } | { unit: 'hours'; value: number } | { unit: 'days'; value: number };

/**
 * Age of `since` as of `now`.
 *
 * Under an hour reads as "just now" rather than a minute count — the difference between 14 and 38
 * minutes changes no decision, and a minute-precise figure invites a precision the timestamp does
 * not have. A future timestamp (clock skew between device and server) also reads as "just now"
 * instead of a negative age.
 */
export function waitingAge(since: string | null | undefined, now: Date): WaitingAge | null {
  if (since == null || since === '') return null;
  const at = new Date(since).getTime();
  if (Number.isNaN(at)) return null;
  const hours = Math.floor((now.getTime() - at) / 3_600_000);
  if (hours < 1) return { unit: 'now' };
  if (hours < 24) return { unit: 'hours', value: hours };
  return { unit: 'days', value: Math.floor(hours / 24) };
}
