// How soon a payment is due — the one reading the FINANCE Home queue and the Payments list share.
//
// Compared as `YYYY-MM-DD` strings on the LOCAL calendar. `payment_date` is a Postgres DATE and
// arrives without a time; parsing it into a `Date` would place it at midnight UTC, and taking
// "today" from `toISOString()` reads the UTC date — both shift a Bangkok reader's day by seven
// hours, so a payment due today would read as due tomorrow (or as overdue) for part of the working
// day. `toIsoDate` reads the local calendar (lib/isoDate.ts).
//
// The drawings print four urgencies: overdue, today, tomorrow and a later date. They also print
// "Due 2h" on the Payments list; a DATE column has no hour in it, so that one is not computable and
// today is the finest this can say.

import { toIsoDate } from './isoDate';

export type DueState = 'overdue' | 'today' | 'tomorrow' | 'later';

/** The urgency of `paymentDate` (`YYYY-MM-DD…`) as seen on `now`'s local calendar day. */
export function paymentDueState(paymentDate: string, now: Date): DueState {
  const due = paymentDate.slice(0, 10);
  const today = toIsoDate(now);
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  const tomorrow = toIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  return due === tomorrow ? 'tomorrow' : 'later';
}
