import { interpolate, trialBannerCopy } from '../trial';

const fmt = (iso: string | null) => (iso ? `D(${iso})` : '—');

describe('trialBannerCopy (§7.10)', () => {
  it('says nothing when there is no banner', () => {
    expect(trialBannerCopy(null, fmt)).toBeNull();
  });

  it('counts down a running trial, calmly until the last week', () => {
    expect(
      trialBannerCopy({ kind: 'trial', daysLeft: 12, endsAt: '2026-12-01', urgent: false }, fmt),
    ).toEqual({
      key: 'trial.banner.running',
      values: { days: 12, date: 'D(2026-12-01)' },
      tone: 'info',
    });
    expect(
      trialBannerCopy({ kind: 'trial', daysLeft: 3, endsAt: '2026-12-01', urgent: true }, fmt),
    ).toMatchObject({ key: 'trial.banner.running', tone: 'warning' });
  });

  it('says "ends today" on the last day', () => {
    expect(
      trialBannerCopy({ kind: 'trial', daysLeft: 0, endsAt: '2026-12-01', urgent: true }, fmt),
    ).toMatchObject({ key: 'trial.banner.endsToday' });
  });

  it('explains read-only, with its end date', () => {
    expect(trialBannerCopy({ kind: 'readOnly', until: '2026-12-31' }, fmt)).toEqual({
      key: 'trial.banner.readOnly',
      values: { date: 'D(2026-12-31)' },
      tone: 'danger',
    });
  });

  it('warns that deletion is pending', () => {
    expect(trialBannerCopy({ kind: 'deletionPending' }, fmt)).toEqual({
      key: 'trial.banner.deletionPending',
      values: {},
      tone: 'danger',
    });
  });
});

describe('interpolate', () => {
  it('fills known placeholders, every occurrence', () => {
    expect(interpolate('{days} days — ends {date}; {days}', { days: 3, date: '1 Dec' })).toBe(
      '3 days — ends 1 Dec; 3',
    );
  });

  it('leaves an unknown placeholder, and never reads inherited members', () => {
    expect(interpolate('{days} {toString}', { days: 1 })).toBe('1 {toString}');
  });
});
