jest.mock('../../api/auth', () => ({
  requestOtp: jest.fn(),
  verifyOtp: jest.fn(),
}));
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { useAuthStore } from '../authStore';
import { verifyOtp as verifyOtpApi, requestOtp as requestOtpApi } from '../../api/auth';

function tokenWithClaims(claims: Record<string, unknown>): string {
  const b64 = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `header.${b64}.signature`;
}

describe('authStore Path A OTP flow', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await useAuthStore.getState().logout();
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
});
