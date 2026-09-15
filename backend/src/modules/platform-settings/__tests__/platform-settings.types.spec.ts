// The defaults are a claim about the platform, so they are pinned: every value "not set", no invented
// figure, and a fresh object per call so no caller can mutate what the next one receives (ADR-108).

import { defaultPlatformSettings, PLAN_TIERS } from '../platform-settings.types';

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
