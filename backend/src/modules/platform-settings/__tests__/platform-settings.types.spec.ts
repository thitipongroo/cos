// The defaults are a claim about the platform, so they are pinned: every value "not set", no invented
// figure, and a fresh object per call so no caller can mutate what the next one receives (ADR-108).

import { defaultPlatformSettings, PLAN_TIERS, withEveryTier } from '../platform-settings.types';

/** Every leaf value in the document. */
function leaves(value: unknown): unknown[] {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.values(value).flatMap(leaves);
  }
  return [value];
}

describe('defaultPlatformSettings', () => {
  it('sets nothing: every leaf is null, and the only array — broadcast channels — is empty', () => {
    const d = defaultPlatformSettings();
    expect(d.broadcast.channels).toEqual([]);
    const rest = leaves({ ...d, broadcast: { lead_time_hours: d.broadcast.lead_time_hours } });
    expect(rest.length).toBeGreaterThan(0);
    expect(rest.every((v) => v === null)).toBe(true);
  });

  it('carries one row per plan tier', () => {
    expect(Object.keys(defaultPlatformSettings().tiers)).toEqual([...PLAN_TIERS]);
  });

  it('returns a fresh document on every call', () => {
    const a = defaultPlatformSettings();
    a.tiers.STARTER.storage_quota_gb = 10;
    a.broadcast.channels.push('EMAIL_DIGEST');
    const b = defaultPlatformSettings();
    expect(b.tiers.STARTER.storage_quota_gb).toBeNull();
    expect(b.broadcast.channels).toEqual([]);
  });
});

describe('withEveryTier', () => {
  it('reads a tier the stored document predates (LITE, ADR-109) as "nothing set"', () => {
    const stored = defaultPlatformSettings();
    stored.tiers.STARTER.storage_quota_gb = 20;
    delete (stored.tiers as Partial<typeof stored.tiers>).LITE;

    const read = withEveryTier(stored);
    expect(Object.keys(read.tiers).sort()).toEqual([...PLAN_TIERS].sort());
    expect(read.tiers.LITE).toEqual(defaultPlatformSettings().tiers.LITE);
    expect(read.tiers.STARTER.storage_quota_gb).toBe(20);
  });

  it('leaves a tier that is present untouched, and does not mutate its input', () => {
    const stored = defaultPlatformSettings();
    stored.tiers.LITE.storage_quota_gb = 5;
    const read = withEveryTier(stored);
    expect(read.tiers.LITE.storage_quota_gb).toBe(5);
    expect(read).not.toBe(stored);
    expect(read.tiers).not.toBe(stored.tiers);
  });
});
