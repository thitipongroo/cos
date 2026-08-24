// Play Integrity verifier (ADR-082 / ADR-083).
//
// The three checks that must happen IN ORDER, and what skipping each would let through:
//   requestHash   — a token minted for any other request on the same device
//   packageName   — a valid token minted for an entirely different app
//   verdict       — only meaningful once the first two hold
//
// Google's own guidance is to "always verify requestDetails first before checking other verdicts",
// and the tests below assert that a mismatch in either short-circuits before the verdict is read.
//
// The other load-bearing distinction: UNAVAILABLE ("we could not establish anything") versus FAILED
// ("we established that this device is compromised"). An unconfigured deployment must never produce
// the second — that would be a fleet-wide false accusation caused by an unset environment variable.

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('@cos/logger', () => ({ createLogger: () => mockLogger }));

import * as crypto from 'crypto';
import {
  PlayIntegrityVerifier,
  expectedRequestHash,
  toIntegrityLevel,
} from '../adapters/play-integrity.adapter';

const CHALLENGE = 'CHAL_B64U';
const DEVICE = 'dev-1';
const PACKAGE = 'com.constructionos.cos';

/** A real RSA key so the assertion is genuinely signed rather than stubbed. */
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SERVICE_ACCOUNT = JSON.stringify({
  client_email: 'svc@cos.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
});

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

/** Answer the token endpoint, then the decode endpoint, in that order. */
function mockFetchSequence(...responses: unknown[]): jest.Mock {
  const fn = jest.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const tokenOk = {
  ok: true,
  status: 200,
  json: async () => ({ access_token: 'AT', expires_in: 3600 }),
};

const decodeOk = (payload: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({ tokenPayloadExternal: payload }),
});

function payload(over: Record<string, unknown> = {}) {
  return {
    requestDetails: {
      requestHash: expectedRequestHash(CHALLENGE, DEVICE),
      requestPackageName: PACKAGE,
      timestampMillis: '1675655009345',
    },
    deviceIntegrity: {
      deviceRecognitionVerdict: ['MEETS_BASIC_INTEGRITY', 'MEETS_DEVICE_INTEGRITY'],
      deviceAttributes: { sdkVersion: 34 },
    },
    ...over,
  };
}

const CLAIM = {
  platform: 'android',
  token: 'TOKEN',
  deviceId: DEVICE,
  challenge: CHALLENGE,
  keyId: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env['PLAY_INTEGRITY_SERVICE_ACCOUNT'] = SERVICE_ACCOUNT;
  process.env['PLAY_INTEGRITY_PACKAGE_NAME'] = PACKAGE;
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
});

describe('expectedRequestHash', () => {
  it('matches the formula the mobile client uses', () => {
    // apps/mobile/src/lib/appIntegrity.ts computes SHA256(`${challenge}|${deviceId}`) base64. The two
    // live in different packages and cannot share code, so a drift here silently rejects every
    // Android attestation — with no error, because a mismatch reads as "unavailable".
    const manual = crypto.createHash('sha256').update(`${CHALLENGE}|${DEVICE}`).digest('base64');
    expect(expectedRequestHash(CHALLENGE, DEVICE)).toBe(manual);
  });
});

describe('toIntegrityLevel', () => {
  it('picks the STRONGEST value present, not the first', () => {
    // The verdict is an array and a strong device reports all three at once.
    expect(
      toIntegrityLevel([
        'MEETS_BASIC_INTEGRITY',
        'MEETS_DEVICE_INTEGRITY',
        'MEETS_STRONG_INTEGRITY',
      ]),
    ).toBe('STRONG');
    expect(toIntegrityLevel(['MEETS_BASIC_INTEGRITY', 'MEETS_DEVICE_INTEGRITY'])).toBe('DEVICE');
    expect(toIntegrityLevel(['MEETS_BASIC_INTEGRITY'])).toBe('BASIC');
  });

  it('gives no tier to an empty array or to a bare emulator verdict', () => {
    // Empty = Google detected rooting/hooking/an unapproved emulator. MEETS_VIRTUAL_INTEGRITY is a
    // genuine emulator with Play services — legitimate for Play Games on PC, not for a site handset.
    expect(toIntegrityLevel([])).toBeNull();
    expect(toIntegrityLevel(['MEETS_VIRTUAL_INTEGRITY'])).toBeNull();
  });
});

describe('PlayIntegrityVerifier', () => {
  it('handles the android platform', () => {
    expect(new PlayIntegrityVerifier().platform).toBe('android');
  });

  it('PASSES a genuine device, carrying the tier and the verified SDK version', async () => {
    mockFetchSequence(tokenOk, decodeOk(payload()));
    await expect(new PlayIntegrityVerifier().verify(CLAIM)).resolves.toEqual({
      verdict: 'PASSED',
      integrityLevel: 'DEVICE',
      osVersion: '34',
    });
  });

  it('reports STRONG when Google does', async () => {
    mockFetchSequence(
      tokenOk,
      decodeOk(
        payload({
          deviceIntegrity: {
            deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY', 'MEETS_STRONG_INTEGRITY'],
            deviceAttributes: { sdkVersion: 34 },
          },
        }),
      ),
    );
    await expect(new PlayIntegrityVerifier().verify(CLAIM)).resolves.toMatchObject({
      integrityLevel: 'STRONG',
    });
  });

  it('FAILS an empty verdict — a detected compromise is not an absence', async () => {
    // Google omits deviceRecognitionVerdict when the device "shows signs of attack (API hooking,
    // rooting), system compromise, or [is] not running on a physical device". Filing that under
    // UNAVAILABLE would record a detected compromise as "we could not tell".
    mockFetchSequence(tokenOk, decodeOk(payload({ deviceIntegrity: {} })));
    await expect(new PlayIntegrityVerifier().verify(CLAIM)).resolves.toEqual({
      verdict: 'FAILED',
      integrityLevel: null,
      osVersion: null,
    });
  });

  it('FAILS an emulator', async () => {
    mockFetchSequence(
      tokenOk,
      decodeOk(
        payload({ deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_VIRTUAL_INTEGRITY'] } }),
      ),
    );
    await expect(new PlayIntegrityVerifier().verify(CLAIM)).resolves.toMatchObject({
      verdict: 'FAILED',
    });
  });

  it('refuses a token that answers a DIFFERENT request', async () => {
    // Without this, any token the app ever minted on this device would be accepted for any enrolment.
    mockFetchSequence(
      tokenOk,
      decodeOk(
        payload({
          requestDetails: { requestHash: 'SOMEONE_ELSES_HASH', requestPackageName: PACKAGE },
        }),
      ),
    );
    await expect(new PlayIntegrityVerifier().verify(CLAIM)).resolves.toMatchObject({
      verdict: 'UNAVAILABLE',
    });
  });

  it('refuses a token minted for a different app', async () => {
    mockFetchSequence(
      tokenOk,
      decodeOk(
        payload({
          requestDetails: {
            requestHash: expectedRequestHash(CHALLENGE, DEVICE),
            requestPackageName: 'com.someone.else',
          },
        }),
      ),
    );
    await expect(new PlayIntegrityVerifier().verify(CLAIM)).resolves.toMatchObject({
      verdict: 'UNAVAILABLE',
    });
  });

  it('checks requestDetails BEFORE the verdict', async () => {
    // A compromised device presenting a token for another request must not be recorded as FAILED
    // either — we have established nothing about THIS enrolment.
    mockFetchSequence(
      tokenOk,
      decodeOk(
        payload({
          requestDetails: { requestHash: 'WRONG', requestPackageName: PACKAGE },
          deviceIntegrity: {},
        }),
      ),
    );
    await expect(new PlayIntegrityVerifier().verify(CLAIM)).resolves.toMatchObject({
      verdict: 'UNAVAILABLE',
    });
  });

  describe('degrades to UNAVAILABLE — never FAILED — when nothing could be established', () => {
    it('with no service account configured', async () => {
      delete process.env['PLAY_INTEGRITY_SERVICE_ACCOUNT'];
      const fetchMock = mockFetchSequence();
      await expect(new PlayIntegrityVerifier().verify(CLAIM)).resolves.toMatchObject({
        verdict: 'UNAVAILABLE',
      });
      // Not even a network call: an unset env var is not a reason to ask Google anything.
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('with no package name configured', async () => {
      delete process.env['PLAY_INTEGRITY_PACKAGE_NAME'];
      mockFetchSequence();
      await expect(new PlayIntegrityVerifier().verify(CLAIM)).resolves.toMatchObject({
        verdict: 'UNAVAILABLE',
      });
    });

    it('when Google refuses the access token', async () => {
      mockFetchSequence({ ok: false, status: 401, json: async () => ({}) });
      await expect(new PlayIntegrityVerifier().verify(CLAIM)).resolves.toMatchObject({
        verdict: 'UNAVAILABLE',
      });
    });

    it('when the decode call is rejected', async () => {
      mockFetchSequence(tokenOk, { ok: false, status: 403, json: async () => ({}) });
      await expect(new PlayIntegrityVerifier().verify(CLAIM)).resolves.toMatchObject({
        verdict: 'UNAVAILABLE',
      });
    });

    it('when the decode response carries no payload', async () => {
      mockFetchSequence(tokenOk, { ok: true, status: 200, json: async () => ({}) });
      await expect(new PlayIntegrityVerifier().verify(CLAIM)).resolves.toMatchObject({
        verdict: 'UNAVAILABLE',
      });
    });

    it('when the network fails outright', async () => {
      const fn = jest
        .fn()
        .mockResolvedValueOnce(tokenOk)
        .mockRejectedValueOnce(new Error('ETIMEDOUT'));
      global.fetch = fn as unknown as typeof fetch;
      await expect(new PlayIntegrityVerifier().verify(CLAIM)).resolves.toMatchObject({
        verdict: 'UNAVAILABLE',
      });
    });
  });

  it('never logs the integrity token or the service-account key', async () => {
    // Both are bearer material about a real person's device. The adapter logs statuses only.
    mockFetchSequence(tokenOk, { ok: false, status: 500, json: async () => ({}) });
    await new PlayIntegrityVerifier().verify(CLAIM);

    const logged = JSON.stringify(mockLogger.warn.mock.calls);
    expect(logged).not.toContain('TOKEN');
    expect(logged).not.toContain('PRIVATE KEY');
  });

  it('sends the token to the package-scoped decode endpoint with the bearer credential', async () => {
    const fetchMock = mockFetchSequence(tokenOk, decodeOk(payload()));
    await new PlayIntegrityVerifier().verify(CLAIM);

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(
      `https://playintegrity.googleapis.com/v1/${encodeURIComponent(PACKAGE)}:decodeIntegrityToken`,
    );
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer AT');
    expect(JSON.parse(init.body as string)).toEqual({ integrity_token: 'TOKEN' });
  });

  it('omits osVersion when Google did not evaluate device attributes', async () => {
    mockFetchSequence(
      tokenOk,
      decodeOk(
        payload({ deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] } }),
      ),
    );
    await expect(new PlayIntegrityVerifier().verify(CLAIM)).resolves.toMatchObject({
      osVersion: null,
    });
  });
});
