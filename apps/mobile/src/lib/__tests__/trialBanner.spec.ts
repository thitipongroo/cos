import { trialBannerCopy } from '../trialBanner';

const fmt = (iso: string) => `D(${iso})`;

describe('trialBannerCopy (§7.10)', () => {
  it('says nothing without a banner', () => {
    expect(trialBannerCopy(null, fmt)).toBeNull();
  });

  it('counts down, calmly until the last week', () => {
    expect(
      trialBannerCopy({ kind: 'trial', daysLeft: 12, endsAt: '2026-12-01', urgent: false }, fmt),
    ).toEqual({
      key: 'trial.banner.running',
      values: { days: 12, date: 'D(2026-12-01)' },
      tone: 'primary',
    });
    expect(
      trialBannerCopy({ kind: 'trial', daysLeft: 2, endsAt: '2026-12-01', urgent: true }, fmt),
    ).toMatchObject({ tone: 'warning' });
  });

  it('says "ends today" on the last day', () => {
    expect(
      trialBannerCopy({ kind: 'trial', daysLeft: 0, endsAt: '2026-12-01', urgent: true }, fmt),
    ).toMatchObject({ key: 'trial.banner.endsToday' });
  });

  it('explains read-only, with or without its end date', () => {
    expect(trialBannerCopy({ kind: 'readOnly', until: '2026-12-31' }, fmt)).toEqual({
      key: 'trial.banner.readOnly',
      values: { date: 'D(2026-12-31)' },
      tone: 'danger',
    });
    expect(trialBannerCopy({ kind: 'readOnly', until: null }, fmt)).toEqual({
      key: 'trial.banner.readOnlyNoDate',
      values: {},
      tone: 'danger',
    });
  });

  it('warns that deletion is pending', () => {
    expect(trialBannerCopy({ kind: 'deletionPending' }, fmt)).toMatchObject({
      key: 'trial.banner.deletionPending',
      tone: 'danger',
    });
  });
});
