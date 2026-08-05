// Google service-account access tokens for Play Integrity (ADR-082).
//
// Two properties this file defends:
//
//   1. THE PRIVATE KEY NEVER LEAVES. It is not logged, not returned in an error, and not echoed when
//      the JSON fails to parse. A service-account key in a log aggregator is a credential leak that
//      outlives the incident that caused it.
//   2. A MISSING OR BROKEN CREDENTIAL DEGRADES, IT DOES NOT THROW. Attestation is additive (ADR-082),
//      so a backend that refused to boot over an unset Play Integrity variable would turn an optional
//      security signal into a hard startup dependency.

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('@cos/logger', () => ({ createLogger: () => mockLogger }));

import * as crypto from 'crypto';
import {
  GoogleAccessTokenProvider,
  buildAssertion,
  loadServiceAccount,
} from '../adapters/google-service-account';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const KEY = { client_email: 'svc@cos.iam.gserviceaccount.com', private_key: PEM };

const originalFetch = global.fetch;

function mockFetch(...responses: unknown[]): jest.Mock {
  const fn = jest.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const tokenOk = (expiresIn = 3600) => ({
  ok: true,
  status: 200,
  json: async () => ({ access_token: 'AT', expires_in: expiresIn }),
});

beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  global.fetch = originalFetch;
});

describe('loadServiceAccount', () => {
  it('parses a well-formed key', () => {
    expect(loadServiceAccount(JSON.stringify(KEY))).toMatchObject({
      client_email: KEY.client_email,
    });
  });

  it('restores escaped newlines so node:crypto can parse the PEM', () => {
    // Env vars cannot carry real newlines through most orchestrators, so the PEM arrives with `\n`
    // written literally. Without this the key is unparseable and every attestation silently fails.
    const escaped = JSON.stringify({ ...KEY, private_key: PEM.replace(/\n/g, '\\n') });
    const loaded = loadServiceAccount(escaped);
    expect(loaded?.private_key).toContain('\n');
    // Provably usable, not merely newline-shaped.
    expect(() => crypto.createPrivateKey(loaded!.private_key)).not.toThrow();
  });

  it('returns null for an unset variable', () => {
    expect(loadServiceAccount(undefined)).toBeNull();
  });

  it('returns null — and logs no value — for unparseable JSON', () => {
    expect(loadServiceAccount('{not json')).toBeNull();
    expect(JSON.stringify(mockLogger.warn.mock.calls)).not.toContain('not json');
  });

  it('returns null when the key is incomplete', () => {
    expect(loadServiceAccount(JSON.stringify({ client_email: 'a@b.c' }))).toBeNull();
    expect(loadServiceAccount(JSON.stringify({ private_key: PEM }))).toBeNull();
  });

  it('never puts the private key in a log line', () => {
    loadServiceAccount(JSON.stringify({ private_key: PEM }));
    expect(JSON.stringify(mockLogger.warn.mock.calls)).not.toContain('PRIVATE KEY');
  });
});

describe('buildAssertion', () => {
  it('produces a JWT that verifies against the service account’s public key', () => {
    // The assertion IS the credential Google exchanges for an access token. If the signature is
    // malformed the failure surfaces only as a 400 from Google, which this adapter reports as
    // "unavailable" — so a broken signature would look like an outage forever.
    const jwt = buildAssertion(KEY, 1_700_000_000);
    const [header, claims, signature] = jwt.split('.');

    const ok = crypto.verify(
      'RSA-SHA256',
      Buffer.from(`${header}.${claims}`),
      publicKey,
      Buffer.from(signature!, 'base64url'),
    );
    expect(ok).toBe(true);
  });

  it('asserts the issuer, audience and the playintegrity scope', () => {
    const claims = JSON.parse(
      Buffer.from(buildAssertion(KEY, 1_700_000_000).split('.')[1]!, 'base64url').toString(),
    ) as Record<string, unknown>;

    expect(claims).toMatchObject({
      iss: KEY.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/playintegrity',
      iat: 1_700_000_000,
      exp: 1_700_000_000 + 3600,
    });
  });

  it('declares RS256 — the only algorithm Google accepts for this grant', () => {
    const header = JSON.parse(
      Buffer.from(buildAssertion(KEY, 1).split('.')[0]!, 'base64url').toString(),
    ) as Record<string, unknown>;
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });
  });
});

describe('GoogleAccessTokenProvider', () => {
  it('exchanges the assertion for an access token', async () => {
    const fetchMock = mockFetch(tokenOk());
    await expect(new GoogleAccessTokenProvider(KEY).getAccessToken()).resolves.toBe('AT');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(body.get('assertion')).toBeTruthy();
  });

  it('caches the token rather than re-minting per enrolment', async () => {
    // Attestation runs on every device enrolment and Google's token endpoint is rate limited;
    // re-minting would spend a round trip and a signature for a credential valid another 59 minutes.
    const fetchMock = mockFetch(tokenOk());
    const provider = new GoogleAccessTokenProvider(KEY);

    await provider.getAccessToken();
    await provider.getAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-mints once the cached token is inside the refresh skew', async () => {
    // A token that expires mid-flight comes back as a 401 and reads as "attestation unavailable" —
    // a self-inflicted gap in a security signal, so the boundary is never raced.
    const fetchMock = mockFetch(tokenOk(30), tokenOk());
    const provider = new GoogleAccessTokenProvider(KEY);

    await provider.getAccessToken();
    await provider.getAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when Google refuses, without throwing', async () => {
    mockFetch({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) });
    await expect(new GoogleAccessTokenProvider(KEY).getAccessToken()).resolves.toBeNull();
  });

  it('returns null when the response carries no access token', async () => {
    mockFetch({ ok: true, status: 200, json: async () => ({}) });
    await expect(new GoogleAccessTokenProvider(KEY).getAccessToken()).resolves.toBeNull();
  });

  it('returns null on a transport failure', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    await expect(new GoogleAccessTokenProvider(KEY).getAccessToken()).resolves.toBeNull();
  });

  it('defaults the cache lifetime when Google omits expires_in', async () => {
    const fetchMock = mockFetch({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'AT' }),
    });
    const provider = new GoogleAccessTokenProvider(KEY);
    await provider.getAccessToken();
    await provider.getAccessToken();
    // Treated as a full hour rather than as already-expired, so a missing field cannot turn every
    // request into a fresh token exchange.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never logs the assertion or the key on failure', async () => {
    mockFetch({ ok: false, status: 401, json: async () => ({}) });
    await new GoogleAccessTokenProvider(KEY).getAccessToken();

    const logged = JSON.stringify(mockLogger.warn.mock.calls);
    expect(logged).not.toContain('PRIVATE KEY');
    expect(logged).not.toContain(KEY.client_email);
  });
});
