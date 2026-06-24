jest.mock('../../api/auth', () => ({
  requestOtp: jest.fn(),
  verifyOtp: jest.fn(),
}));
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../authStore';
import { verifyOtp as verifyOtpApi, requestOtp as requestOtpApi } from '../../api/auth';

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
  });

  it('requestOtp delegates to the auth API', async () => {
    (requestOtpApi as jest.Mock).mockResolvedValue({ expiresInSeconds: 300 });
    const res = await useAuthStore.getState().requestOtp('+66800000001');
    expect(requestOtpApi).toHaveBeenCalledWith('+66800000001');
    expect(res.expiresInSeconds).toBe(300);
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
});
