jest.mock('../../api/auth', () => ({
  requestOtp: jest.fn(),
  verifyOtp: jest.fn(),
  attestDevice: jest.fn(),
}));
jest.mock('../../api/devices', () => ({
  registerDevice: jest.fn(),
  requestAttestationChallenge: jest.fn(),
}));
// Mocked at the lib boundary, like deviceTrust above, so this spec never loads @expo/app-integrity —
// a native module with no JS implementation under Jest.
jest.mock('../../lib/appIntegrity', () => ({ attest: jest.fn() }));
jest.mock('../../lib/deviceTrust', () => ({
  getDeviceId: jest.fn(),
  ensureDeviceKey: jest.fn(),
  hasDeviceKey: jest.fn(),
  signChallenge: jest.fn(),
  devicePlatform: jest.fn(() => 'android'),
  deviceModel: jest.fn(() => null),
}));
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../authStore';
import {
  verifyOtp as verifyOtpApi,
  requestOtp as requestOtpApi,
  attestDevice as attestDeviceApi,
} from '../../api/auth';
import { registerDevice, requestAttestationChallenge } from '../../api/devices';
import { attest } from '../../lib/appIntegrity';
import {
  getDeviceId,
  ensureDeviceKey,
  hasDeviceKey,
  signChallenge,
  deviceModel,
} from '../../lib/deviceTrust';

/** Let a fire-and-forget trust/enrol chain (void-ed in the store) settle before asserting. */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function tokenWithClaims(claims: Record<string, unknown>): string {
  const b64 = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `header.${b64}.signature`;
}

describe('authStore Path A OTP flow', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    await useAuthStore.getState().logout();
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    // Device-trust deps default to a benign "new device" (no key → untrusted) so the OTP-flow tests
    // that don't care about trust are unaffected; trust-specific tests override per case.
    (getDeviceId as jest.Mock).mockResolvedValue('dev-1');
    (ensureDeviceKey as jest.Mock).mockResolvedValue('PUB');
    (hasDeviceKey as jest.Mock).mockResolvedValue(false);
    (signChallenge as jest.Mock).mockResolvedValue('SIG');
    (deviceModel as jest.Mock).mockReturnValue(null);
    (attestDeviceApi as jest.Mock).mockResolvedValue({ deviceTrusted: false });
    (registerDevice as jest.Mock).mockResolvedValue(undefined);
    (requestOtpApi as jest.Mock).mockResolvedValue({ expiresInSeconds: 300 });
    // Attestation defaults to "this device produced none" — the state of every build before the
    // native module ships, and of any device without Play Services. Cases that care override it.
    (requestAttestationChallenge as jest.Mock).mockResolvedValue('ATT_CHAL');
    (attest as jest.Mock).mockResolvedValue(null);
  });

  it('requestOtp delegates to the auth API with the device id (cooldown defaults to 60)', async () => {
    (requestOtpApi as jest.Mock).mockResolvedValue({ expiresInSeconds: 300 }); // no cooldown field
    const res = await useAuthStore.getState().requestOtp('+66800000001');
    expect(requestOtpApi).toHaveBeenCalledWith('+66800000001', 'dev-1');
    expect(res.expiresInSeconds).toBe(300);
    expect(res.resendCooldownSeconds).toBe(60); // falls back to the configured cooldown
  });

  it('requestOtp passes through the server-advertised resend cooldown', async () => {
    (requestOtpApi as jest.Mock).mockResolvedValue({
      expiresInSeconds: 300,
      resendCooldownSeconds: 45,
    });
    const res = await useAuthStore.getState().requestOtp('+66800000001');
    expect(res.resendCooldownSeconds).toBe(45);
  });

  it('verifyOtp decodes the token claims and persists the session', async () => {
    const accessToken = tokenWithClaims({ user_id: 'u-9', role: 'SITE_WORKER', tenant_id: 't-1' });
    (verifyOtpApi as jest.Mock).mockResolvedValue({
      accessToken,
      refreshToken: 'refresh-token',
      expiresIn: 60,
      refreshExpiresIn: 120,
    });

    await useAuthStore.getState().verifyOtp('+66800000001', '123456');

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.userId).toBe('u-9');
    expect(state.role).toBe('SITE_WORKER');
    expect(state.accessToken).toBe(accessToken);
    expect(state.refreshToken).toBe('refresh-token');
  });

  it('verifyOtp keeps the name claim for the header avatar', async () => {
    (verifyOtpApi as jest.Mock).mockResolvedValue({
      accessToken: tokenWithClaims({
        user_id: 'u-9',
        role: 'SITE_ENGINEER',
        name: 'Waraporn Klinhom',
      }),
      refreshToken: 'refresh-token',
      expiresIn: 60,
      refreshExpiresIn: 120,
    });

    await useAuthStore.getState().verifyOtp('+66811000009', '123456');

    expect(useAuthStore.getState().displayName).toBe('Waraporn Klinhom');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('cos_display_name', 'Waraporn Klinhom');
  });

  it('verifyOtp survives a token with no name claim', async () => {
    // Path A accounts are provisioned from a phone number and need not carry a name — the avatar
    // falls back to a person icon rather than the session failing to persist.
    (verifyOtpApi as jest.Mock).mockResolvedValue({
      accessToken: tokenWithClaims({ user_id: 'u-9', role: 'SITE_WORKER' }),
      refreshToken: 'refresh-token',
      expiresIn: 60,
      refreshExpiresIn: 120,
    });

    await useAuthStore.getState().verifyOtp('+66800000001', '123456');

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.displayName).toBeNull();
    // The stale name of a previous session must not survive a nameless sign-in.
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('cos_display_name');
  });

  it('hydrate does nothing when no session is stored', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('hydrate restores a valid (non-expired) session', async () => {
    const map: Record<string, string> = {
      cos_access_token: 'a-tok',
      cos_refresh_token: 'r-tok',
      cos_user_id: 'u-1',
      cos_user_role: 'SITE_WORKER',
      cos_session_at: new Date().toISOString(),
    };
    (SecureStore.getItemAsync as jest.Mock).mockImplementation((k: string) =>
      Promise.resolve(map[k] ?? null),
    );
    await useAuthStore.getState().hydrate();
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(true);
    expect(s.userId).toBe('u-1');
    expect(s.role).toBe('SITE_WORKER');
  });

  // The offline window is 30 days since OQ-14, matched to the realm's offlineSessionIdleTimeout.
  // Both bounds are asserted: a session that expires too early throws away a login that would still
  // have refreshed, and one that expires too late strands the worker on a screen whose next API call
  // is rejected by a token the realm has already forgotten.
  function hydrateWithSessionAge(days: number): Promise<void> {
    const map: Record<string, string> = {
      cos_access_token: 'a',
      cos_refresh_token: 'r',
      cos_user_id: 'u',
      cos_user_role: 'SITE_WORKER',
      cos_session_at: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
    };
    (SecureStore.getItemAsync as jest.Mock).mockImplementation((k: string) =>
      Promise.resolve(map[k] ?? null),
    );
    return useAuthStore.getState().hydrate();
  }

  it('hydrate keeps a session a worker was offline with for three weeks', async () => {
    // The case the 7-day window got wrong: a remote site, one trip out, still signed in on return.
    await hydrateWithSessionAge(21);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('hydrate clears an expired session (> 30 days)', async () => {
    await hydrateWithSessionAge(31);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });

  it('updateAccessToken persists and updates the token', async () => {
    await useAuthStore.getState().updateAccessToken('new-token');
    expect(useAuthStore.getState().accessToken).toBe('new-token');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('cos_access_token', 'new-token');
  });

  it('updateRefreshToken persists and updates the rotated refresh token', async () => {
    await useAuthStore.getState().updateRefreshToken('rotated-refresh');
    expect(useAuthStore.getState().refreshToken).toBe('rotated-refresh');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('cos_refresh_token', 'rotated-refresh');
  });

  it('logout clears state and secure store', async () => {
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });

  // A token missing or carrying a bad identity claim used to be accepted. `claims['role'] as CosRole`
  // handed `undefined` to SecureStore.setItemAsync (which throws, surfacing as a bare "login failed"
  // with no cause), and an unrecognised role string persisted and left the app routing by a role no
  // screen knows. Rejected at the door instead - see lib/sessionClaims.ts.
  describe('verifyOtp rejects a token it cannot build a session from', () => {
    const tokens = (accessToken: string, refreshToken = 'r') => ({
      accessToken,
      refreshToken,
      expiresIn: 60,
      refreshExpiresIn: 120,
    });

    const expectRejected = async () => {
      await expect(useAuthStore.getState().verifyOtp('+66800000001', '123456')).rejects.toThrow();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith('cos_user_role', undefined);
    };

    it('rejects a token with no user_id claim', async () => {
      (verifyOtpApi as jest.Mock).mockResolvedValue(
        tokens(tokenWithClaims({ role: 'SITE_WORKER' })),
      );
      await expectRejected();
    });

    it('rejects a token with no role claim', async () => {
      (verifyOtpApi as jest.Mock).mockResolvedValue(tokens(tokenWithClaims({ user_id: 'u-1' })));
      await expectRejected();
    });

    it('rejects a role that is not one this app knows', async () => {
      (verifyOtpApi as jest.Mock).mockResolvedValue(
        tokens(tokenWithClaims({ user_id: 'u-1', role: 'GALACTIC_OVERLORD' })),
      );
      await expectRejected();
    });

    it('rejects a sign-in that came back without a refresh token', async () => {
      // hydrate() rejects a stored session with no refresh token, so this would be a session that
      // silently disappears at the next cold start.
      (verifyOtpApi as jest.Mock).mockResolvedValue(
        tokens(tokenWithClaims({ user_id: 'u-1', role: 'SITE_WORKER' }), ''),
      );
      await expectRejected();
    });

    it('accepts a well-formed token', async () => {
      (verifyOtpApi as jest.Mock).mockResolvedValue(
        tokens(tokenWithClaims({ user_id: 'u-1', role: 'SITE_WORKER', name: 'Somchai' })),
      );
      await useAuthStore.getState().verifyOtp('+66800000001', '123456');
      expect(useAuthStore.getState().userId).toBe('u-1');
      expect(useAuthStore.getState().role).toBe('SITE_WORKER');
      expect(useAuthStore.getState().displayName).toBe('Somchai');
    });
  });

  describe('device trust (§20.6.1)', () => {
    it('leaves the banner untrusted when the device has no key yet (first login)', async () => {
      (requestOtpApi as jest.Mock).mockResolvedValue({ expiresInSeconds: 300, challenge: 'CH' });
      (hasDeviceKey as jest.Mock).mockResolvedValue(false);
      await useAuthStore.getState().requestOtp('+66811000009');
      await flush();
      expect(signChallenge).not.toHaveBeenCalled();
      expect(useAuthStore.getState().deviceTrusted).toBe(false);
    });

    it('reports trusted when the server accepts the signature', async () => {
      (requestOtpApi as jest.Mock).mockResolvedValue({ expiresInSeconds: 300, challenge: 'CH' });
      (hasDeviceKey as jest.Mock).mockResolvedValue(true);
      (signChallenge as jest.Mock).mockResolvedValue('SIG');
      (attestDeviceApi as jest.Mock).mockResolvedValue({ deviceTrusted: true });
      await useAuthStore.getState().requestOtp('+66811000009');
      await flush();
      expect(attestDeviceApi).toHaveBeenCalledWith('+66811000009', 'dev-1', 'SIG');
      expect(useAuthStore.getState().deviceTrusted).toBe(true);
    });

    it('is untrusted when the key exists but signing fails', async () => {
      (requestOtpApi as jest.Mock).mockResolvedValue({ expiresInSeconds: 300, challenge: 'CH' });
      (hasDeviceKey as jest.Mock).mockResolvedValue(true);
      (signChallenge as jest.Mock).mockResolvedValue(null);
      await useAuthStore.getState().requestOtp('+66811000009');
      await flush();
      expect(attestDeviceApi).not.toHaveBeenCalled();
      expect(useAuthStore.getState().deviceTrusted).toBe(false);
    });

    it('is untrusted when the attest call throws', async () => {
      (requestOtpApi as jest.Mock).mockResolvedValue({ expiresInSeconds: 300, challenge: 'CH' });
      (hasDeviceKey as jest.Mock).mockResolvedValue(true);
      (attestDeviceApi as jest.Mock).mockRejectedValue(new Error('network'));
      await useAuthStore.getState().requestOtp('+66811000009');
      await flush();
      expect(useAuthStore.getState().deviceTrusted).toBe(false);
    });

    it('is untrusted when no challenge is returned', async () => {
      (requestOtpApi as jest.Mock).mockResolvedValue({ expiresInSeconds: 300 }); // no challenge
      await useAuthStore.getState().requestOtp('+66811000009');
      await flush();
      expect(useAuthStore.getState().deviceTrusted).toBe(false);
    });

    it('falls back to no deviceId when secure storage is unavailable', async () => {
      (getDeviceId as jest.Mock).mockRejectedValue(new Error('keystore locked'));
      (requestOtpApi as jest.Mock).mockResolvedValue({ expiresInSeconds: 300, challenge: 'CH' });
      await useAuthStore.getState().requestOtp('+66811000009');
      await flush();
      expect(requestOtpApi).toHaveBeenCalledWith('+66811000009', undefined);
      expect(useAuthStore.getState().deviceTrusted).toBe(false);
    });

    it('enrols the device (with model) after a successful verify', async () => {
      (ensureDeviceKey as jest.Mock).mockResolvedValue('PUBKEY');
      (deviceModel as jest.Mock).mockReturnValue('Pixel 8');
      (verifyOtpApi as jest.Mock).mockResolvedValue({
        accessToken: tokenWithClaims({ user_id: 'u-1', role: 'SITE_ENGINEER' }),
        refreshToken: 'r',
        expiresIn: 60,
        refreshExpiresIn: 120,
      });
      await useAuthStore.getState().verifyOtp('+66811000009', '123456');
      await flush();
      expect(registerDevice).toHaveBeenCalledWith({
        deviceId: 'dev-1',
        publicKey: 'PUBKEY',
        platform: 'android',
        model: 'Pixel 8',
      });
    });

    // Attestation (ADR-082/083) rides along with enrolment. What these protect is that it can never
    // become a precondition for it: a device that cannot attest must still register its public key,
    // because losing the key means the NEXT login is untrusted — a worse outcome than losing a verdict.
    it('attaches the attestation when the device produced one', async () => {
      (ensureDeviceKey as jest.Mock).mockResolvedValue('PUBKEY');
      (attest as jest.Mock).mockResolvedValue({
        attestationToken: 'TOKEN',
        attestationChallenge: 'ATT_CHAL',
        attestationKeyId: 'KEY_ID',
      });
      (verifyOtpApi as jest.Mock).mockResolvedValue({
        accessToken: tokenWithClaims({ user_id: 'u-1', role: 'SITE_ENGINEER' }),
        refreshToken: 'r',
        expiresIn: 60,
        refreshExpiresIn: 120,
      });

      await useAuthStore.getState().verifyOtp('+66811000009', '123456');
      await flush();

      expect(requestAttestationChallenge).toHaveBeenCalledWith('dev-1');
      expect(attest).toHaveBeenCalledWith('ATT_CHAL', 'dev-1');
      expect(registerDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          attestationToken: 'TOKEN',
          attestationChallenge: 'ATT_CHAL',
          attestationKeyId: 'KEY_ID',
        }),
      );
    });

    it('enrols WITHOUT attestation fields when the device produced none', async () => {
      (ensureDeviceKey as jest.Mock).mockResolvedValue('PUBKEY');
      (attest as jest.Mock).mockResolvedValue(null);
      (verifyOtpApi as jest.Mock).mockResolvedValue({
        accessToken: tokenWithClaims({ user_id: 'u-1', role: 'SITE_ENGINEER' }),
        refreshToken: 'r',
        expiresIn: 60,
        refreshExpiresIn: 120,
      });

      await useAuthStore.getState().verifyOtp('+66811000009', '123456');
      await flush();

      const body = (registerDevice as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
      expect(body).not.toHaveProperty('attestationToken');
      expect(body['publicKey']).toBe('PUBKEY');
    });

    it('still enrols when the CHALLENGE request fails', async () => {
      // An older backend without the route, or an offline moment. Neither is a reason to skip
      // enrolment — only a reason to enrol without a verdict.
      (ensureDeviceKey as jest.Mock).mockResolvedValue('PUBKEY');
      (requestAttestationChallenge as jest.Mock).mockRejectedValue(new Error('404'));
      (verifyOtpApi as jest.Mock).mockResolvedValue({
        accessToken: tokenWithClaims({ user_id: 'u-1', role: 'SITE_ENGINEER' }),
        refreshToken: 'r',
        expiresIn: 60,
        refreshExpiresIn: 120,
      });

      await useAuthStore.getState().verifyOtp('+66811000009', '123456');
      await flush();

      expect(attest).not.toHaveBeenCalled();
      expect(registerDevice).toHaveBeenCalledWith(expect.objectContaining({ publicKey: 'PUBKEY' }));
    });

    it('skips enrolment when no key can be produced, and never fails login', async () => {
      (ensureDeviceKey as jest.Mock).mockResolvedValue(null);
      (verifyOtpApi as jest.Mock).mockResolvedValue({
        accessToken: tokenWithClaims({ user_id: 'u-1', role: 'SITE_ENGINEER' }),
        refreshToken: 'r',
        expiresIn: 60,
        refreshExpiresIn: 120,
      });
      await useAuthStore.getState().verifyOtp('+66811000009', '123456');
      await flush();
      expect(registerDevice).not.toHaveBeenCalled();
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('swallows enrolment failures (trust is best-effort)', async () => {
      (registerDevice as jest.Mock).mockRejectedValue(new Error('offline'));
      (verifyOtpApi as jest.Mock).mockResolvedValue({
        accessToken: tokenWithClaims({ user_id: 'u-1', role: 'SITE_ENGINEER' }),
        refreshToken: 'r',
        expiresIn: 60,
        refreshExpiresIn: 120,
      });
      await useAuthStore.getState().verifyOtp('+66811000009', '123456');
      await flush();
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('resets the trust state on logout', async () => {
      useAuthStore.setState({ deviceTrusted: true });
      await useAuthStore.getState().logout();
      expect(useAuthStore.getState().deviceTrusted).toBeNull();
    });
  });
});
