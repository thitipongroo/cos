// Unit tests — assertSecurityTogglesConfigured (security review F8).

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { assertSecurityTogglesConfigured, REQUIRED_PRODUCTION_TOGGLES } from '../security-toggles';

/** A production env with every toggle stated outright — the shape a compliant deploy must have. */
function compliantProdEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    WAF_ORIGIN_ENFORCE: 'false',
    MFA_ENFORCE: 'false',
    WEBHOOK_REPLAY_PROTECTION: 'false',
    ...overrides,
  };
}

describe('assertSecurityTogglesConfigured', () => {
  it('is a no-op outside production, where the staged defaults are what local/CI want', () => {
    expect(() => assertSecurityTogglesConfigured({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertSecurityTogglesConfigured({ NODE_ENV: 'test' })).not.toThrow();
    expect(() => assertSecurityTogglesConfigured({})).not.toThrow();
  });

  it('accepts a production env that states every toggle', () => {
    expect(() => assertSecurityTogglesConfigured(compliantProdEnv())).not.toThrow();
  });

  it('accepts explicitly-enabled toggles too — it asserts intent, not a particular posture', () => {
    expect(() =>
      assertSecurityTogglesConfigured(
        compliantProdEnv({
          MFA_ENFORCE: 'true',
          WEBHOOK_REPLAY_PROTECTION: 'true',
          WAF_ORIGIN_ENFORCE: 'true',
          TRUSTED_PROXY_CIDRS: '173.245.48.0/20',
        }),
      ),
    ).not.toThrow();
  });

  // The whole point of F8: an unset variable is a DISABLED control that looks exactly like a
  // deliberate one. Each must fail independently, so a partially-configured deploy is still caught.
  it.each(REQUIRED_PRODUCTION_TOGGLES)('rejects production when %s is unset', (name) => {
    const env = compliantProdEnv();
    delete env[name];
    expect(() => assertSecurityTogglesConfigured(env)).toThrow(name);
  });

  it('names every missing toggle at once, so one boot fixes them all', () => {
    expect(() => assertSecurityTogglesConfigured({ NODE_ENV: 'production' })).toThrow(
      /WAF_ORIGIN_ENFORCE, MFA_ENFORCE, WEBHOOK_REPLAY_PROTECTION/,
    );
  });

  // WAF_ORIGIN_ENFORCE=true with an empty allowlist is not a stricter posture — the middleware
  // denies every request whose peer is not in an empty set, i.e. all of them.
  it('rejects WAF_ORIGIN_ENFORCE=true with no TRUSTED_PROXY_CIDRS', () => {
    expect(() =>
      assertSecurityTogglesConfigured(compliantProdEnv({ WAF_ORIGIN_ENFORCE: 'true' })),
    ).toThrow(/TRUSTED_PROXY_CIDRS/);

    expect(() =>
      assertSecurityTogglesConfigured(
        compliantProdEnv({ WAF_ORIGIN_ENFORCE: 'true', TRUSTED_PROXY_CIDRS: '  ,  ' }),
      ),
    ).toThrow(/TRUSTED_PROXY_CIDRS/);
  });

  it('allows an empty TRUSTED_PROXY_CIDRS while WAF_ORIGIN_ENFORCE is off', () => {
    expect(() =>
      assertSecurityTogglesConfigured(compliantProdEnv({ WAF_ORIGIN_ENFORCE: 'FALSE' })),
    ).not.toThrow();
  });

  it('defaults to process.env when called with no argument', () => {
    const original = process.env['NODE_ENV'];
    try {
      process.env['NODE_ENV'] = 'development';
      expect(() => assertSecurityTogglesConfigured()).not.toThrow();
    } finally {
      if (original === undefined) delete process.env['NODE_ENV'];
      else process.env['NODE_ENV'] = original;
    }
  });
});
