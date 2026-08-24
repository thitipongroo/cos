// Converting between a JS `Date` and the `YYYY-MM-DD` string a Postgres DATE column takes.
//
// Written for <DateField /> (the permit request form's validity window → site_ops.permits
// valid_from / valid_until), and kept here rather than inside the component so it is inside the
// 100 %-line/branch coverage scope — `src/components/**` is excluded from `collectCoverageFrom`,
// `src/lib/**` is not.
//
// WHY NOT `date.toISOString().slice(0, 10)`, the obvious one-liner: `toISOString` converts to UTC
// first. In Bangkok (UTC+7) a date picked at 00:30 on the 13th becomes 17:30 on the 12th in UTC, and
// the field would silently submit the day before the one the user tapped. Every part below is read
// from the LOCAL calendar, which is the calendar the picker showed.
//
// Formatting a date for DISPLAY is a different job and is not duplicated here — that is
// `formatDdMonYyyy()` in siteEngineerHome.ts ("01 Jun 2026"). This module only speaks the wire
// format.

/** Zero-padded to the width Postgres expects; `10` is already two digits, `1` is not. */
function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * A `Date` → `"YYYY-MM-DD"`, read from the local calendar (see the header).
 *
 * `getMonth()` is 0-based, hence the +1.
 */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * `"YYYY-MM-DD"` → a local-midnight `Date`, or `null` if the string is not one.
 *
 * Constructed from the three numbers rather than `new Date(value)`: the string form of an ISO date
 * is parsed as UTC midnight by the spec, which lands on the previous day for any timezone west of
 * Greenwich and would make the picker open on the wrong date.
 *
 * REAL CALENDAR DAYS ONLY. The regex accepts month 01–12 and day 01–31, which still admits
 * "2026-02-31"; `Date` would roll that forward to 3 March and the picker would open somewhere the
 * user never chose. The round-trip check rejects anything that rolled.
 */
export function parseIsoDate(value: string): Date | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(value);
  if (m === null) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(year, month - 1, day);
  return date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}
