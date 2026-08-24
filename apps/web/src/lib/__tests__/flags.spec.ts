import {
  FLAGS_REFETCH_MS,
  FLAG_FALLBACKS,
  FLAG_WEB_CLIENT_VALIDATION,
  isFlagEnabled,
  parseFlagsResponse,
} from '../flags';

describe('parseFlagsResponse', () => {
  it('reads a well-formed flag map', () => {
    expect(parseFlagsResponse({ flags: { 'a.b.c': true, 'd.e.f': false } })).toEqual({
      'a.b.c': true,
      'd.e.f': false,
    });
  });

  it('returns an empty map for an empty flags object', () => {
    expect(parseFlagsResponse({ flags: {} })).toEqual({});
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'flags'],
    ['a number', 42],
    ['an array', ['a.b.c']],
  ])('returns an empty map for %s', (_label, payload) => {
    expect(parseFlagsResponse(payload)).toEqual({});
  });

  it.each([
    ['a missing flags key', { other: 1 }],
    ['a null flags key', { flags: null }],
    ['a non-object flags key', { flags: 'on' }],
  ])('returns an empty map for %s', (_label, payload) => {
    expect(parseFlagsResponse(payload)).toEqual({});
  });

  it('drops non-boolean entries but keeps the ones that parsed', () => {
    expect(
      parseFlagsResponse({ flags: { good: true, stringy: 'true', nully: null, numeric: 1 } }),
    ).toEqual({ good: true });
  });

  it('accepts an array as the outer payload only to reject its flags key', () => {
    // typeof [] === 'object', so the outer guard passes — the flags guard must still reject it.
    expect(parseFlagsResponse([])).toEqual({});
  });
});

describe('isFlagEnabled', () => {
  it('returns the value present in the map', () => {
    expect(isFlagEnabled({ [FLAG_WEB_CLIENT_VALIDATION]: true }, FLAG_WEB_CLIENT_VALIDATION)).toBe(
      true,
    );
  });

  it('returns false when the map explicitly disables the flag', () => {
    expect(isFlagEnabled({ [FLAG_WEB_CLIENT_VALIDATION]: false }, FLAG_WEB_CLIENT_VALIDATION)).toBe(
      false,
    );
  });

  it('falls back when the map has no entry for the flag', () => {
    expect(isFlagEnabled({}, FLAG_WEB_CLIENT_VALIDATION)).toBe(false);
  });

  it('falls back when the map is undefined — the pre-first-fetch state', () => {
    expect(isFlagEnabled(undefined, FLAG_WEB_CLIENT_VALIDATION)).toBe(false);
  });

  it('returns false for a flag in neither the map nor the fallbacks', () => {
    expect(isFlagEnabled({}, 's1.nowhere.unknown')).toBe(false);
  });

  it('prefers the server value over the fallback', () => {
    // The fallback is false; the server saying true must win, or rollout could never begin.
    expect(FLAG_FALLBACKS[FLAG_WEB_CLIENT_VALIDATION]).toBe(false);
    expect(isFlagEnabled({ [FLAG_WEB_CLIENT_VALIDATION]: true }, FLAG_WEB_CLIENT_VALIDATION)).toBe(
      true,
    );
  });
});

describe('kill-switch budget (QM-15)', () => {
  it('leaves the 60s bound intact alongside the backend 15s Unleash poll', () => {
    const BACKEND_UNLEASH_POLL_MS = 15_000; // REFRESH_INTERVAL_MS in feature-flag.service.ts
    expect(FLAGS_REFETCH_MS + BACKEND_UNLEASH_POLL_MS).toBeLessThanOrEqual(60_000);
  });
});
