// Unit tests — verifyBearer (in-service Keycloak JWT verification). jsonwebtoken + jwks-rsa are mocked
// via ESM module mocks; no network, no real keys.

import { jest } from '@jest/globals';

const mockGetSigningKey = jest.fn<(kid: string) => Promise<{ getPublicKey: () => string }>>();
const jwksFactory = jest.fn(() => ({ getSigningKey: mockGetSigningKey }));
const mockDecode = jest.fn<(t: string, o: unknown) => unknown>();
const mockVerify = jest.fn<(...a: unknown[]) => unknown>();

jest.unstable_mockModule('jwks-rsa', () => ({ default: jwksFactory }));
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: { decode: mockDecode, verify: mockVerify },
}));

const { verifyBearer, InvalidTokenError } = await import('../plugins/jwt-verify.js');

const ENV_KEYS = ['KEYCLOAK_URL', 'KEYCLOAK_REALM', 'KEYCLOAK_ISSUER', 'KEYCLOAK_AUDIENCE'];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSigningKey.mockResolvedValue({ getPublicKey: () => 'PUBLIC_KEY' });
  for (const k of ENV_KEYS) delete process.env[k];
});

describe('verifyBearer', () => {
  it('returns null when there is no bearer token', async () => {
    expect(await verifyBearer(undefined)).toBeNull();
    expect(await verifyBearer('Basic xyz')).toBeNull();
    expect(await verifyBearer(123)).toBeNull();
  });

  it('throws for a malformed token (null / string / missing kid)', async () => {
    mockDecode.mockReturnValueOnce(null);
    await expect(verifyBearer('Bearer a')).rejects.toBeInstanceOf(InvalidTokenError);
    mockDecode.mockReturnValueOnce('opaque');
    await expect(verifyBearer('Bearer a')).rejects.toBeInstanceOf(InvalidTokenError);
    mockDecode.mockReturnValueOnce({ header: {} });
    await expect(verifyBearer('Bearer a')).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('throws InvalidTokenError when verification fails (Error and non-Error)', async () => {
    mockDecode.mockReturnValue({ header: { kid: 'k1' } });
    mockVerify.mockImplementationOnce(() => {
      throw new Error('bad signature');
    });
    await expect(verifyBearer('Bearer a')).rejects.toBeInstanceOf(InvalidTokenError);
    mockVerify.mockImplementationOnce(() => {
      throw 'weird';
    });
    await expect(verifyBearer('Bearer a')).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('throws when the token has no tenant_id claim', async () => {
    mockDecode.mockReturnValue({ header: { kid: 'k1' } });
    mockVerify.mockReturnValue({ sub: 's1' });
    await expect(verifyBearer('Bearer a')).rejects.toThrow(/tenant_id/);
  });

  it('returns identity from user_id + role claims (default config branches)', async () => {
    mockDecode.mockReturnValue({ header: { kid: 'k1' } });
    mockVerify.mockReturnValue({ tenant_id: 't1', user_id: 'u1', role: 'FINANCE' });
    expect(await verifyBearer('Bearer a')).toEqual({
      tenantId: 't1',
      userId: 'u1',
      role: 'FINANCE',
    });
  });

  it('falls back to sub for userId, empty role, and empty userId when all absent', async () => {
    mockDecode.mockReturnValue({ header: { kid: 'k1' } });
    mockVerify.mockReturnValueOnce({ tenant_id: 't1', sub: 'sub-1' });
    expect(await verifyBearer('Bearer a')).toEqual({ tenantId: 't1', userId: 'sub-1', role: '' });
    mockVerify.mockReturnValueOnce({ tenant_id: 't1' });
    expect((await verifyBearer('Bearer a'))?.userId).toBe('');
  });

  it('rebuilds the JWKS client when the URI changes and reuses it otherwise (env override)', async () => {
    mockDecode.mockReturnValue({ header: { kid: 'k1' } });
    mockVerify.mockReturnValue({ tenant_id: 't1', user_id: 'u1', role: 'R' });
    process.env['KEYCLOAK_URL'] = 'http://kc:8080';
    process.env['KEYCLOAK_REALM'] = 'cos-acme';
    process.env['KEYCLOAK_ISSUER'] = 'https://id.example.com/realms/cos-acme';
    process.env['KEYCLOAK_AUDIENCE'] = 'cos-cred';

    const before = jwksFactory.mock.calls.length;
    await verifyBearer('Bearer a'); // new URI → (re)build
    await verifyBearer('Bearer a'); // same URI → reuse cached client
    expect(jwksFactory.mock.calls.length).toBe(before + 1);
  });
});
