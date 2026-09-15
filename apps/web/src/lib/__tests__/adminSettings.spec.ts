import {
  COUNT_FIELDS,
  SETTINGS_BOUNDS,
  applyCounts,
  countTexts,
  TIER_ORDER,
  capShare,
  emptySettings,
  parseCount,
  settingsChanged,
  textOrNull,
  withStored,
} from '../adminSettings';

describe('parseCount', () => {
  it('reads blank as not set', () => {
    expect(parseCount('  ', 10)).toEqual({ ok: true, value: null });
  });
  it('reads a whole number within the bound', () => {
    expect(parseCount(' 72 ', SETTINGS_BOUNDS.HOURS_MAX)).toEqual({ ok: true, value: 72 });
    expect(parseCount('0', 5)).toEqual({ ok: true, value: 0 });
    expect(parseCount('5', 5)).toEqual({ ok: true, value: 5 });
  });
  it('refuses a fraction, a sign, a word or a value past the bound', () => {
    expect(parseCount('1.5', 10)).toEqual({ ok: false });
    expect(parseCount('-1', 10)).toEqual({ ok: false });
    expect(parseCount('abc', 10)).toEqual({ ok: false });
    expect(parseCount('11', 10)).toEqual({ ok: false });
  });
  it('refuses a number past the safe-integer range', () => {
    expect(parseCount('9007199254740993', SETTINGS_BOUNDS.MONTHLY_QUOTA_MAX)).toEqual({
      ok: false,
    });
  });
});

describe('textOrNull', () => {
  it('trims, and blank is null', () => {
    expect(textOrNull('  ')).toBeNull();
    expect(textOrNull(' Daily ')).toBe('Daily');
  });
});

describe('capShare', () => {
  it('is null with no cap', () => {
    expect(capShare(3, null)).toBeNull();
  });
  it('is the rounded share, capped at 100', () => {
    expect(capShare(168, 250)).toBe(67);
    expect(capShare(300, 250)).toBe(100);
  });
  it('handles a zero cap', () => {
    expect(capShare(0, 0)).toBe(0);
    expect(capShare(1, 0)).toBe(100);
  });
});

describe('withStored', () => {
  it('keeps the options when nothing is stored or the stored value is one of them', () => {
    expect(withStored([72, 48], null)).toEqual([72, 48]);
    expect(withStored([72, 48], 48)).toEqual([72, 48]);
  });
  it('appends a stored value that is none of them', () => {
    expect(withStored(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });
});

describe('emptySettings / settingsChanged', () => {
  it('builds a fresh, fully unset document each call', () => {
    const a = emptySettings();
    const b = emptySettings();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.tiers.STARTER).not.toBe(b.tiers.STARTER);
    expect(a.broadcast.channels).toEqual([]);
    expect(settingsChanged(a, b)).toBe(false);
  });
  it('notices a changed field', () => {
    const b = emptySettings();
    b.limits.shared_tenant_cap = 250;
    expect(settingsChanged(emptySettings(), b)).toBe(true);
  });
  it('orders the tiers as the table draws them', () => {
    expect(TIER_ORDER).toEqual(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']);
  });
});

describe('countTexts / applyCounts', () => {
  it('lists four platform counts and three per tier', () => {
    expect(COUNT_FIELDS).toHaveLength(13);
  });
  it('starts every unset count blank and a set one as its number', () => {
    const s = emptySettings();
    s.tiers.ENTERPRISE.api_monthly_quota = 1000000;
    const texts = countTexts(s);
    expect(texts['limits.shared_tenant_cap']).toBe('');
    expect(texts['tiers.ENTERPRISE.api_monthly_quota']).toBe('1000000');
  });
  it('writes each valid text into a copy and leaves the input alone', () => {
    const s = emptySettings();
    const out = applyCounts(s, {
      'limits.shared_tenant_cap': '250',
      'tiers.STARTER.storage_quota_gb': ' ',
      'broadcast.lead_time_hours': '72',
    });
    expect(out.invalid).toEqual([]);
    expect(out.settings.limits.shared_tenant_cap).toBe(250);
    expect(out.settings.tiers.STARTER.storage_quota_gb).toBeNull();
    expect(out.settings.broadcast.lead_time_hours).toBe(72);
    expect(s.limits.shared_tenant_cap).toBeNull();
  });
  it('reports each invalid path and keeps its stored value', () => {
    const s = emptySettings();
    s.gateways.secondary.max_retries = 5;
    const out = applyCounts(s, {
      'gateways.secondary.max_retries': '101',
      'limits.default_max_pool_conns': 'x',
    });
    expect(out.invalid).toEqual([
      'gateways.secondary.max_retries',
      'limits.default_max_pool_conns',
    ]);
    expect(out.settings.gateways.secondary.max_retries).toBe(5);
  });
});
