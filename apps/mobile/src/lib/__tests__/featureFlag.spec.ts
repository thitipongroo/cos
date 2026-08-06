// Telling a kill switch apart from an outage (QM-15 / ADR-049).

import { FEATURE_DISABLED_CODE, isFeatureDisabled } from '../featureFlag';

// QM-10 envelope: `{ error: { code } }`, which is what the server actually sends. The fixture used
// to be flat, which is why nothing caught that `isFeatureDisabled` read `data.code` and could never
// return true (fixed 2026-08-06 against the live endpoint).
const flagOff = { response: { status: 503, data: { error: { code: FEATURE_DISABLED_CODE } } } };

describe('isFeatureDisabled', () => {
  it('recognises the guard’s own 503', () => {
    expect(isFeatureDisabled(flagOff)).toBe(true);
  });

  it('does NOT match a bare 503', () => {
    // An unhealthy backend is a real failure the user should be told about. Matching on the status
    // alone would silently relabel every outage as "not switched on yet".
    expect(isFeatureDisabled({ response: { status: 503, data: {} } })).toBe(false);
    expect(isFeatureDisabled({ response: { status: 503 } })).toBe(false);
  });

  it('does NOT match the code on another status', () => {
    // Requiring both means this can only ever match FeatureFlagGuard, even if an error envelope is
    // reshaped elsewhere in the platform.
    expect(
      isFeatureDisabled({
        response: { status: 500, data: { error: { code: FEATURE_DISABLED_CODE } } },
      }),
    ).toBe(false);
  });

  it('survives the shapes a failed request can actually take', () => {
    // A network error has no `response` at all; a thrown string has no properties. Neither may
    // crash the handler that is deciding what to tell the user.
    expect(isFeatureDisabled(new Error('Network Error'))).toBe(false);
    expect(isFeatureDisabled('boom')).toBe(false);
    expect(isFeatureDisabled(null)).toBe(false);
    expect(isFeatureDisabled(undefined)).toBe(false);
    expect(isFeatureDisabled({})).toBe(false);
  });
});
