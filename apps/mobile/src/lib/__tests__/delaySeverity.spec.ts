import { delaySeverity, SEVERITY_DAYS } from '../delaySeverity';

const NOW = new Date('2026-08-11T09:00:00Z');
/** A planned-end date `daysAgo` days before NOW, as the DATE string the API returns. */
const due = (daysAgo: number): string =>
  new Date(Date.UTC(2026, 7, 11) - daysAgo * 86_400_000).toISOString().slice(0, 10);

describe('delaySeverity', () => {
  it('uses DESIGN.md §15.4’s bands, which are the platform’s own', () => {
    // "LOW 1–2 days / MEDIUM 3–6 / HIGH 7–13 / CRITICAL 14+" — shared with the §9.1 event
    // severities, so one word means one thing across issues, incidents and schedule slippage.
    expect(SEVERITY_DAYS).toEqual({ LOW: 1, MEDIUM: 3, HIGH: 7, CRITICAL: 14 });
  });

  it('bands a late task by how many days late it is', () => {
    expect(delaySeverity(due(1), 'IN_PROGRESS', NOW)).toBe('LOW');
    expect(delaySeverity(due(2), 'IN_PROGRESS', NOW)).toBe('LOW');
    expect(delaySeverity(due(3), 'IN_PROGRESS', NOW)).toBe('MEDIUM');
    expect(delaySeverity(due(6), 'IN_PROGRESS', NOW)).toBe('MEDIUM');
    expect(delaySeverity(due(7), 'IN_PROGRESS', NOW)).toBe('HIGH');
    expect(delaySeverity(due(13), 'IN_PROGRESS', NOW)).toBe('HIGH');
    expect(delaySeverity(due(14), 'IN_PROGRESS', NOW)).toBe('CRITICAL');
    expect(delaySeverity(due(400), 'IN_PROGRESS', NOW)).toBe('CRITICAL');
  });

  it('is `none` for a task that is not late', () => {
    expect(delaySeverity(due(0), 'IN_PROGRESS', NOW)).toBe('none'); // due today
    expect(delaySeverity(due(-5), 'IN_PROGRESS', NOW)).toBe('none'); // due next week
  });

  it('never calls finished work late, however long it overran', () => {
    // The chip answers "what needs attention today", and finished work needs none.
    expect(delaySeverity(due(90), 'COMPLETED', NOW)).toBe('none');
    expect(delaySeverity(due(90), 'DONE', NOW)).toBe('none');
  });

  it('is `none` when there is no deadline to be late against', () => {
    expect(delaySeverity(null, 'IN_PROGRESS', NOW)).toBe('none');
    expect(delaySeverity(undefined, 'IN_PROGRESS', NOW)).toBe('none');
    expect(delaySeverity('', 'IN_PROGRESS', NOW)).toBe('none');
    expect(delaySeverity('not-a-date', 'IN_PROGRESS', NOW)).toBe('none');
  });

  it('does not depend on the time of day the screen was opened', () => {
    // `planned_end` is a DATE; comparing it against a live instant would move the band at midnight.
    const early = delaySeverity(due(7), 'IN_PROGRESS', new Date('2026-08-11T00:00:00Z'));
    const late = delaySeverity(due(7), 'IN_PROGRESS', new Date('2026-08-11T23:59:59Z'));
    expect(early).toBe('HIGH');
    expect(late).toBe('HIGH');
  });

  // "Today" is the LOCAL day (jest pins TZ=Asia/Bangkok). 2026-08-11T20:00Z is 03:00 on 12 Aug there;
  // the UTC day is still the 11th, which read every task a day less late before 07:00.
  it('counts days late from the local day, also before 07:00 in Bangkok', () => {
    const early = new Date('2026-08-11T20:00:00Z');
    expect(delaySeverity('2026-08-11', 'IN_PROGRESS', early)).toBe('LOW'); // 1 day late locally
    expect(delaySeverity('2026-08-09', 'IN_PROGRESS', early)).toBe('MEDIUM'); // 3 days
    expect(delaySeverity('2026-08-05', 'IN_PROGRESS', early)).toBe('HIGH'); // 7 days (UTC day: 6, MEDIUM)
  });
});
