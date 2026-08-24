// Session and timestamp transparency facts (ADR-084).
//
// These tests are unusual: most of them assert constants. That is deliberate. The mockups for 03_05
// and 03_06 asserted four things about this platform's security machinery that were not true — a
// 3600-second token TTL, AES-256-GCM session encryption, a session id that does not exist, and
// Stratum-1 NTP discipline that nothing in docs/ mentions. Each constant below is pinned to the spec
// line it came from, so a value that drifts away from its source fails here rather than being read
// by someone who has no way to check it.

import {
  ACCESS_TOKEN_MINUTES,
  AUDIT_RETENTION_WORM_YEARS,
  LOG_RETENTION_COLD_YEARS,
  LOG_RETENTION_HOT_DAYS,
  REFRESH_TOKEN_DAYS,
  SESSION_CARDS,
  TIMESTAMP_FACTS,
  TRANSPORT,
  shortTokenId,
} from '../sessionFacts';

describe('token lifetimes', () => {
  it('is 15 minutes, not the mockup’s 3600 seconds', () => {
    // §5.4.1 step 4: "Keycloak issues RS256-signed access token (15 min) + refresh token (7 days)".
    // The mockup's TOKEN TTL row said 3600s, which is four times the real value on a screen whose
    // purpose is telling someone what the platform does.
    expect(ACCESS_TOKEN_MINUTES).toBe(15);
    expect(ACCESS_TOKEN_MINUTES * 60).not.toBe(3600);
  });

  it('is 7 days for the refresh token', () => {
    expect(REFRESH_TOKEN_DAYS).toBe(7);
  });
});

describe('transport', () => {
  it('is TLS 1.3 — AES-256-GCM is a different subsystem entirely', () => {
    // §5.2 transport row. AES-256-GCM is real, but it is ADR-035's at-rest cipher for issuer private
    // keys; putting it on a session panel described the wrong machinery with the right-sounding word.
    expect(TRANSPORT).toBe('TLS 1.3');
    expect(TRANSPORT).not.toContain('AES');
  });
});

describe('retention', () => {
  it('matches §31.2 and §31.4 rather than the mockup’s flat 30 days', () => {
    expect(LOG_RETENTION_HOT_DAYS).toBe(30);
    expect(LOG_RETENTION_COLD_YEARS).toBe(1);
    expect(AUDIT_RETENTION_WORM_YEARS).toBe(7);
  });
});

describe('shortTokenId', () => {
  it('returns null when there is no token id', () => {
    // The screen renders "not available" rather than an empty box that looks like a missing value.
    expect(shortTokenId(null)).toBeNull();
    expect(shortTokenId(undefined)).toBeNull();
    expect(shortTokenId('')).toBeNull();
  });

  it('truncates a real jti from both ends', () => {
    expect(shortTokenId('9f8a1b2c3d4e5f60718293a4b5c6d7e8')).toBe('9f8a…d7e8');
  });

  it('returns a short id unchanged rather than faking an ellipsis', () => {
    // A fake ellipsis implies hidden characters that are not there — a small lie on the screen
    // dedicated to not telling them.
    expect(shortTokenId('abc')).toBe('abc');
    expect(shortTokenId('123456789')).toBe('123456789');
  });

  it('honours a caller-chosen keep length', () => {
    expect(shortTokenId('9f8a1b2c3d4e5f60718293a4b5c6d7e8', 2)).toBe('9f…e8');
  });
});

describe('the card lists', () => {
  it('keeps the three 03_05 cards that describe real subsystems', () => {
    // ADR-084: unlike the parameters card, these turned out to be true — the offline sync queue, the
    // RBAC permission map, and Keycloak's native refresh rotation.
    expect([...SESSION_CARDS]).toEqual(['offlineQueue', 'rolePermissions', 'tokenRotation']);
  });

  it('keeps only the four timestamp facts that hold', () => {
    // Atomic clock sync, Stratum-1 NTP, latency compensation and hashed timestamps were removed, not
    // reworded: there is no phrasing of an unimplemented guarantee that makes it true.
    expect([...TIMESTAMP_FACTS]).toEqual(['utc', 'precision', 'appendOnly', 'retention']);
  });
});
