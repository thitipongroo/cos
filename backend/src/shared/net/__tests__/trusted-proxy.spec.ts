// Unit tests — resolveTrustProxy (security review F3).
//
// The security property under test is asymmetric: getting this WRONG in the permissive direction
// (trusting X-Forwarded-For from an arbitrary peer) is worse than the bug it fixes, because a direct
// caller could then pick their own rate-limit bucket per request. So the "unconfigured → false" and
// "untrusted peer → false" cases matter more than the happy path.

import { resolveTrustProxy } from '../trusted-proxy';

const CF_RANGES = '173.245.48.0/20, 2400:cb00::/32';

describe('resolveTrustProxy', () => {
  it('returns false when no ranges are configured — preserves the pre-fix behaviour, never fails open', () => {
    expect(resolveTrustProxy(undefined)).toBe(false);
    expect(resolveTrustProxy('')).toBe(false);
    // A list of nothing but separators/whitespace is still "unconfigured", not "trust everything".
    expect(resolveTrustProxy(' , , ')).toBe(false);
  });

  it('trusts a peer inside a configured IPv4 range', () => {
    const trust = resolveTrustProxy(CF_RANGES) as (address: string) => boolean;
    expect(trust('173.245.48.1')).toBe(true);
    expect(trust('173.245.63.255')).toBe(true);
  });

  it('trusts a peer inside a configured IPv6 range', () => {
    const trust = resolveTrustProxy(CF_RANGES) as (address: string) => boolean;
    expect(trust('2400:cb00::1')).toBe(true);
  });

  it('does NOT trust a peer outside every configured range — this is what stops XFF spoofing', () => {
    const trust = resolveTrustProxy(CF_RANGES) as (address: string) => boolean;
    expect(trust('8.8.8.8')).toBe(false);
    expect(trust('173.245.64.0')).toBe(false); // one address past the /20
  });

  it('does not trust an unparseable address', () => {
    const trust = resolveTrustProxy(CF_RANGES) as (address: string) => boolean;
    expect(trust('not-an-ip')).toBe(false);
    expect(trust('')).toBe(false);
  });

  it('reads TRUSTED_PROXY_CIDRS from the environment when no argument is given', () => {
    const original = process.env['TRUSTED_PROXY_CIDRS'];
    try {
      process.env['TRUSTED_PROXY_CIDRS'] = '10.0.0.0/8';
      const trust = resolveTrustProxy() as (address: string) => boolean;
      expect(trust('10.1.2.3')).toBe(true);
      expect(trust('11.1.2.3')).toBe(false);

      delete process.env['TRUSTED_PROXY_CIDRS'];
      expect(resolveTrustProxy()).toBe(false);
    } finally {
      if (original === undefined) delete process.env['TRUSTED_PROXY_CIDRS'];
      else process.env['TRUSTED_PROXY_CIDRS'] = original;
    }
  });
});
