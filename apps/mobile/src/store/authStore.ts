// Auth store — Priority 0 Section F
// JWT access + refresh tokens stored in expo-secure-store.
// Offline session valid for 7 days (spec §156).
// Role drives navigation (see (app)/_layout.tsx).

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { CosRole } from '@cos/types';
import { requestOtp as requestOtpApi, verifyOtp as verifyOtpApi } from '../api/auth';
import { decodeJwtPayload } from '../lib/jwt';

const ACCESS_TOKEN_KEY = 'cos_access_token';
const REFRESH_TOKEN_KEY = 'cos_refresh_token';
const USER_ID_KEY = 'cos_user_id';
const ROLE_KEY = 'cos_user_role';
const SESSION_AT_KEY = 'cos_session_at'; // ISO timestamp of last successful auth

const OFFLINE_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface AuthState {
  isAuthenticated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  role: CosRole | null;

  /** Load persisted session from SecureStore on app launch. */
  hydrate: () => Promise<void>;

  /** Called after successful OTP verification or token refresh. */
  setTokens: (params: {
    accessToken: string;
    refreshToken: string;
    userId: string;
    role: CosRole;
  }) => Promise<void>;

  /** Path A: request an SMS OTP for the given phone number. */
  requestOtp: (phoneNumber: string) => Promise<{ expiresInSeconds: number }>;

  /** Path A: verify OTP, decode the issued token for user_id/role, and persist the session. */
  verifyOtp: (phoneNumber: string, otp: string) => Promise<void>;

  /** Update access token after silent refresh (refresh token still valid). */
  updateAccessToken: (accessToken: string) => Promise<void>;

  /** Clear all auth state — called on logout or expired session. */
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  accessToken: null,
  refreshToken: null,
  userId: null,
  role: null,

  hydrate: async () => {
    const [accessToken, refreshToken, userId, role, sessionAt] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.getItemAsync(USER_ID_KEY),
      SecureStore.getItemAsync(ROLE_KEY),
      SecureStore.getItemAsync(SESSION_AT_KEY),
    ]);

    if (!accessToken || !refreshToken || !userId || !role || !sessionAt) {
      return;
    }

    // Enforce 7-day offline session TTL
    const sessionAge = Date.now() - new Date(sessionAt).getTime();
    if (sessionAge > OFFLINE_SESSION_TTL_MS) {
      await clearSecureStore();
      return;
    }

    set({
      isAuthenticated: true,
      accessToken,
      refreshToken,
      userId,
      role: role as CosRole,
    });
  },

  setTokens: async ({ accessToken, refreshToken, userId, role }) => {
    const now = new Date().toISOString();
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
      SecureStore.setItemAsync(USER_ID_KEY, userId),
      SecureStore.setItemAsync(ROLE_KEY, role),
      SecureStore.setItemAsync(SESSION_AT_KEY, now),
    ]);
    set({ isAuthenticated: true, accessToken, refreshToken, userId, role });
  },

  requestOtp: async (phoneNumber) => {
    return requestOtpApi(phoneNumber);
  },

  verifyOtp: async (phoneNumber, otp) => {
    const tokens = await verifyOtpApi(phoneNumber, otp);
    const claims = decodeJwtPayload(tokens.accessToken);
    const userId = typeof claims['user_id'] === 'string' ? claims['user_id'] : '';
    const role = claims['role'] as CosRole;
    await get().setTokens({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      userId,
      role,
    });
  },

  updateAccessToken: async (accessToken) => {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    set({ accessToken });
  },

  logout: async () => {
    await clearSecureStore();
    set({
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
      userId: null,
      role: null,
    });
  },
}));

async function clearSecureStore(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_ID_KEY),
    SecureStore.deleteItemAsync(ROLE_KEY),
    SecureStore.deleteItemAsync(SESSION_AT_KEY),
  ]);
}
