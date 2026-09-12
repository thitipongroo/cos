// Behaviour of the file image source helper (ADR-105).
//
// THE RULE IS A SECURITY RULE. `Authorization` is a bearer credential, so the header goes ONLY to
// this deployment's own API. Attaching it to whatever string happened to be in a database column
// would send the user's session token to any host that column could be made to name — and
// `platform.users.photo_url` is a plain TEXT column.
//
// The origin comparison is deliberately not a prefix test, and the case below says why: a host that
// merely BEGINS with ours is exactly the URL an attacker would want the token sent to.

// Both modules are mocked rather than imported: the real `authStore` reaches `@expo/app-integrity`,
// which is ESM and untransformed by the LOGIC config (that config is the fast offline one and has no
// React Native preset). The same pattern `runPushSync.spec.ts` uses, and for the same reason.
jest.mock('../../api/client', () => ({ API_BASE_URL: 'https://api.cos.example.com/api/v1' }));
let token: string | null = 'tok-abc';
jest.mock('../../store/authStore', () => ({
  useAuthStore: { getState: () => ({ accessToken: token }) },
}));

import { fileImageSource, isOwnApi } from '../fileImageSource';

const OWN = 'https://api.cos.example.com/api/v1/files/f-1/image';

describe('fileImageSource', () => {
  beforeEach(() => {
    token = 'tok-abc';
  });

  it('attaches the bearer token to our own API', () => {
    expect(fileImageSource(OWN)).toEqual({
      uri: OWN,
      headers: { Authorization: 'Bearer tok-abc' },
    });
  });

  it('sends no token to any other host', () => {
    const foreign = 'https://cdn.example.net/avatars/a.jpg';
    expect(fileImageSource(foreign)).toEqual({ uri: foreign });
  });

  // A PREFIX TEST WOULD PASS THIS AND LEAK THE TOKEN. `https://api.cos.example.com.evil.test/x`
  // starts with `https://api.cos.example.com`, so only comparing the ORIGIN rejects it.
  it('rejects a host that merely begins with ours', () => {
    const lookalike = 'https://api.cos.example.com.evil.test/api/v1/files/f-1/image';
    expect(isOwnApi(lookalike)).toBe(false);
    expect(fileImageSource(lookalike)).toEqual({ uri: lookalike });
  });

  it('rejects our host on a different scheme or port', () => {
    expect(isOwnApi('http://api.cos.example.com/api/v1/files/f-1/image')).toBe(false);
    expect(isOwnApi('https://api.cos.example.com:8443/api/v1/files/f-1/image')).toBe(false);
  });

  it('matches our origin case-insensitively, as a host comparison must', () => {
    expect(isOwnApi('HTTPS://API.COS.EXAMPLE.COM/api/v1/files/f-1/image')).toBe(true);
  });

  it('treats a relative or malformed URL as not ours', () => {
    expect(isOwnApi('/api/v1/files/f-1/image')).toBe(false);
    expect(isOwnApi('not a url')).toBe(false);
    // `javascript:` and friends have no http origin, so they can never collect the token.
    expect(isOwnApi('javascript:alert(1)')).toBe(false);
  });

  // The caller renders its own fallback — initials, a glyph — rather than an <Image> pointed at
  // nothing, which draws a broken-image box on some platforms and nothing on others.
  it('returns null for a missing or blank URL', () => {
    expect(fileImageSource(null)).toBeNull();
    expect(fileImageSource(undefined)).toBeNull();
    expect(fileImageSource('   ')).toBeNull();
  });

  // Never `Bearer null`. A signed-out session sends no credential and gets a 401, which the caller
  // already handles as "no photo" — the same outcome as an account that never set one.
  it('omits the header entirely when there is no session token', () => {
    token = null;

    expect(fileImageSource(OWN)).toEqual({ uri: OWN });
  });

  // READ AT CALL TIME, not captured. A session that refreshes between renders must send the new
  // token; a stale one would 401 on every avatar until the screen remounted.
  it('reads the token freshly on each call', () => {
    expect(fileImageSource(OWN)?.headers?.['Authorization']).toBe('Bearer tok-abc');

    token = 'tok-xyz';

    expect(fileImageSource(OWN)?.headers?.['Authorization']).toBe('Bearer tok-xyz');
  });
});
