// `lib/isoDate.ts` — the wire format for a Postgres DATE column.
//
// The timezone case is the reason the module exists, so it is asserted first and explicitly.

import { toIsoDate, parseIsoDate } from '../isoDate';

describe('toIsoDate', () => {
  it('reads the LOCAL calendar, not UTC', () => {
    // 00:30 on 13 Aug local. `toISOString()` would render this as the 12th anywhere east of
    // Greenwich (Bangkok is UTC+7), which is the bug this module exists to avoid. The assertion
    // holds in every timezone: the date is built from local parts and read back from local parts.
    const justAfterMidnight = new Date(2026, 7, 13, 0, 30);
    expect(toIsoDate(justAfterMidnight)).toBe('2026-08-13');
  });

  it('zero-pads single-digit months and days', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('leaves two-digit months and days alone', () => {
    expect(toIsoDate(new Date(2026, 10, 30))).toBe('2026-11-30');
  });
});

describe('parseIsoDate', () => {
  it('returns a local-midnight Date for a valid string', () => {
    const parsed = parseIsoDate('2026-08-13');
    expect(parsed).not.toBeNull();
    expect(parsed!.getFullYear()).toBe(2026);
    expect(parsed!.getMonth()).toBe(7);
    expect(parsed!.getDate()).toBe(13);
    expect(parsed!.getHours()).toBe(0);
  });

  it('round-trips with toIsoDate', () => {
    expect(toIsoDate(parseIsoDate('2024-02-29')!)).toBe('2024-02-29');
    expect(toIsoDate(parseIsoDate('2026-12-31')!)).toBe('2026-12-31');
  });

  it.each([
    ['empty', ''],
    ['not a date', 'tomorrow'],
    ['slashes', '2026/08/13'],
    ['month 00', '2026-00-13'],
    ['month 13', '2026-13-01'],
    ['day 00', '2026-08-00'],
    ['day 32', '2026-08-32'],
    ['two-digit year', '26-08-13'],
    ['datetime', '2026-08-13T10:00:00Z'],
  ])('rejects %s', (_label, value) => {
    expect(parseIsoDate(value)).toBeNull();
  });

  it('rejects a day the month does not have rather than rolling it forward', () => {
    // `new Date(2026, 1, 31)` is 3 March. Without the round-trip check the picker would open on a
    // date the user never chose, silently.
    expect(parseIsoDate('2026-02-31')).toBeNull();
    expect(parseIsoDate('2025-02-29')).toBeNull(); // 2025 is not a leap year
    expect(parseIsoDate('2026-04-31')).toBeNull(); // April has 30
  });

  it('accepts 29 February in a real leap year', () => {
    expect(parseIsoDate('2024-02-29')).not.toBeNull();
  });
});
