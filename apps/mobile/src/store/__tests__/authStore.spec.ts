jest.mock('../../api/auth', () => ({
  requestOtp: jest.fn(),
  verifyOtp: jest.fn(),
  attestDevice: jest.fn(),
}));
jest.mock('../../api/devices', () => ({ registerDevice: jest.fn() }));
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
import { registerDevice } from '../../api/devices';
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

  it('hydrate clears an expired session (> 7 days)', async () => {
    const expired = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const map: Record<string, string> = {
      cos_access_token: 'a',
      cos_refresh_token: 'r',
      cos_user_id: 'u',
      cos_user_role: 'SITE_WORKER',
      cos_session_at: expired,
    };
    (SecureStore.getItemAsync as jest.Mock).mockImplementation((k: string) =>
      Promise.resolve(map[k] ?? null),
    );
    await useAuthStore.getState().hydrate();
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

  it('verifyOtp defaults userId to empty when the token lacks a user_id claim', async () => {
    (verifyOtpApi as jest.Mock).mockResolvedValue({
      accessToken: tokenWithClaims({ role: 'SITE_WORKER' }), // no user_id claim
      refreshToken: 'r',
      expiresIn: 60,
      refreshExpiresIn: 120,
    });
    await useAuthStore.getState().verifyOtp('+66800000001', '123456');
    expect(useAuthStore.getState().userId).toBe('');
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
