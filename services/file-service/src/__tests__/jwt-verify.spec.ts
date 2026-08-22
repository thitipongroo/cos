// Unit tests — verifyBearer (in-service Keycloak JWT verification). jsonwebtoken + jwks-rsa are mocked;
// no network, no real keys. The module reads Keycloak config from env at import; a separate isolated
// import with env set exercises the non-default config branches.

const mockGetSigningKey = jest.fn();
jest.mock('jwks-rsa', () => jest.fn(() => ({ getSigningKey: mockGetSigningKey })));

const mockDecode = jest.fn();
const mockVerify = jest.fn();
jest.mock('jsonwebtoken', () => ({
  decode: (...a: unknown[]) => mockDecode(...a),
  verify: (...a: unknown[]) => mockVerify(...a),
}));

import { verifyBearer, InvalidTokenError } from '../plugins/jwt-verify';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSigningKey.mockResolvedValue({ getPublicKey: () => 'PUBLIC_KEY' });
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

  it('returns identity from user_id + role claims', async () => {
    mockDecode.mockReturnValue({ header: { kid: 'k1' } });
    mockVerify.mockReturnValue({ tenant_id: 't1', user_id: 'u1', role: 'FINANCE' });
    expect(await verifyBearer('Bearer a')).toEqual({
      kind: 'user',
      tenantId: 't1',
      userId: 'u1',
      role: 'FINANCE',
    });
  });

  it('falls back to sub for userId and empty role when absent', async () => {
    mockDecode.mockReturnValue({ header: { kid: 'k1' } });
    mockVerify.mockReturnValue({ tenant_id: 't1', sub: 'sub-1' });
    expect(await verifyBearer('Bearer a')).toEqual({
      kind: 'user',
      tenantId: 't1',
      userId: 'sub-1',
      role: '',
    });
  });

  it('yields empty userId when neither user_id nor sub is present', async () => {
    mockDecode.mockReturnValue({ header: { kid: 'k1' } });
    mockVerify.mockReturnValue({ tenant_id: 't1' });
    const identity = await verifyBearer('Bearer a');
    expect(identity).toEqual({ kind: 'user', tenantId: 't1', userId: '', role: '' });
  });

  // ── Service tokens (TDD OQ-46) ─────────────────────────────────────────────
  // `azp` is NOT the discriminator. Both kinds were fetched from a live Keycloak 26.6.4 and it reads
  // `cos-backend` on both, because Path A users authenticate through that same client.
  describe('service account tokens', () => {
    it('recognises the backend service account when both signals match', async () => {
      mockDecode.mockReturnValue({ header: { kid: 'k1' } });
      mockVerify.mockReturnValue({
        azp: 'cos-backend',
        preferred_username: 'service-account-cos-backend',
      });
      expect(await verifyBearer('Bearer a')).toEqual({ kind: 'service', clientId: 'cos-backend' });
    });

    it('REFUSES a token with the right azp but a human username', async () => {
      // A Path A user token whose tenant_id mapper failed. Keying on azp alone would hand it the
      // trusted-subsystem path, and with it the freedom to set x-user-role.
      mockDecode.mockReturnValue({ header: { kid: 'k1' } });
      mockVerify.mockReturnValue({ azp: 'cos-backend', preferred_username: '+66800000001' });
      await expect(verifyBearer('Bearer a')).rejects.toThrow(/tenant_id/);
    });

    it('REFUSES a token with the right username but another azp', async () => {
      mockDecode.mockReturnValue({ header: { kid: 'k1' } });
      mockVerify.mockReturnValue({
        azp: 'cos-web',
        preferred_username: 'service-account-cos-backend',
      });
      await expect(verifyBearer('Bearer a')).rejects.toThrow(/tenant_id/);
    });

    it('REFUSES a token with neither', async () => {
      mockDecode.mockReturnValue({ header: { kid: 'k1' } });
      mockVerify.mockReturnValue({ sub: 'whoever' });
      await expect(verifyBearer('Bearer a')).rejects.toThrow(/tenant_id/);
    });
  });

  it('loads with explicit Keycloak env overrides (non-default config branches)', async () => {
    await jest.isolateModulesAsync(async () => {
      process.env['KEYCLOAK_URL'] = 'http://kc:8080';
      process.env['KEYCLOAK_REALM'] = 'cos-acme';
      process.env['KEYCLOAK_ISSUER'] = 'https://id.example.com/realms/cos-acme';
      process.env['KEYCLOAK_AUDIENCE'] = 'cos-files';
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('../plugins/jwt-verify') as typeof import('../plugins/jwt-verify');
      mockDecode.mockReturnValue({ header: { kid: 'k1' } });
      mockVerify.mockReturnValue({ tenant_id: 't1', user_id: 'u1', role: 'R' });
      expect(await mod.verifyBearer('Bearer a')).toEqual({
        kind: 'user',
        tenantId: 't1',
        userId: 'u1',
        role: 'R',
      });
    });
    delete process.env['KEYCLOAK_URL'];
    delete process.env['KEYCLOAK_REALM'];
    delete process.env['KEYCLOAK_ISSUER'];
    delete process.env['KEYCLOAK_AUDIENCE'];
  });
});
