import {
  TRIAL_CONTACT,
  TRIAL_READ_ONLY_CODE,
  TRIAL_URGENT_DAYS,
  trialBanner,
  trialContactMailto,
} from '../trial';

const NOW = new Date('2026-11-20T03:00:00Z');
const tenant = (status: string, endsAt: string | null = null, until: string | null = null) => ({
  subscription_status: status,
  trial_ends_at: endsAt,
  read_only_until: until,
});

describe('trialBanner (§7.10)', () => {
  it('shows nothing without a tenant, or for a paying one', () => {
    expect(trialBanner(null, NOW)).toBeNull();
    expect(trialBanner(undefined, NOW)).toBeNull();
    expect(trialBanner(tenant('ACTIVE'), NOW)).toBeNull();
  });

  it('shows nothing for a status this build does not know', () => {
    expect(trialBanner(tenant('SUSPENDED'), NOW)).toBeNull();
  });

  it('counts the days left of a running trial, rounding a part day up', () => {
    expect(trialBanner(tenant('TRIAL', '2026-12-01T00:00:00Z'), NOW)).toEqual({
      kind: 'trial',
      daysLeft: 11,
      endsAt: '2026-12-01T00:00:00Z',
      urgent: false,
    });
  });

  it.each([
    ['2026-11-27T03:00:00Z', 7, true],
    ['2026-11-27T03:00:01Z', 8, false],
    ['2026-11-20T03:00:00Z', 0, true],
    ['2026-11-19T00:00:00Z', 0, true], // past due, the job has not run yet: never negative
  ])('ending %s → %i days left, urgent %s', (endsAt, daysLeft, urgent) => {
    expect(trialBanner(tenant('TRIAL', endsAt), NOW)).toMatchObject({ daysLeft, urgent });
  });

  it('says nothing for a TRIAL with no end date rather than invent one', () => {
    expect(trialBanner(tenant('TRIAL', null), NOW)).toBeNull();
  });

  it('shows read-only, with its end, once the trial has ended', () => {
    expect(
      trialBanner(tenant('EXPIRED', '2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z'), NOW),
    ).toEqual({
      kind: 'readOnly',
      until: '2026-12-01T00:00:00Z',
    });
  });

  it('shows deletion pending after the read-only month', () => {
    expect(trialBanner(tenant('PENDING_DELETION', '2026-10-01T00:00:00Z'), NOW)).toEqual({
      kind: 'deletionPending',
    });
  });

  it('pins the shared constants', () => {
    expect(TRIAL_URGENT_DAYS).toBe(7);
    expect(TRIAL_READ_ONLY_CODE).toBe('COS-PLAN-003');
  });
});

describe('trial contact (no in-app checkout)', () => {
  it('points at the published price list and the sales mailbox', () => {
    expect(TRIAL_CONTACT).toEqual({
      pricingUrl: 'https://construction-os.io/#pricing',
      email: 'info@construction-os.io',
    });
  });

  it('builds a mailto naming the tenant, with spaces as %20', () => {
    expect(trialContactMailto('somchai_build', 'Choose a plan')).toBe(
      'mailto:info@construction-os.io?subject=Choose%20a%20plan%20%E2%80%94%20somchai_build',
    );
  });

  it('encodes Thai and reserved characters', () => {
    const url = trialContactMailto('a&b', 'เลือกแพ็กเกจ');
    expect(url.startsWith('mailto:info@construction-os.io?subject=')).toBe(true);
    expect(decodeURIComponent(url.split('subject=')[1]!)).toBe('เลือกแพ็กเกจ — a&b');
  });
});
