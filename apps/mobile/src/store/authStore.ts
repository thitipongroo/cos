// Auth store — Priority 0 Section F
// JWT access + refresh tokens stored in expo-secure-store.
// Offline session valid for 7 days (spec §156).
// Role drives navigation (see (app)/_layout.tsx).

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { CosRole } from '@cos/types';
import {
  requestOtp as requestOtpApi,
  verifyOtp as verifyOtpApi,
  attestDevice as attestDeviceApi,
} from '../api/auth';
import { registerDevice, requestAttestationChallenge } from '../api/devices';
import { attest, type AttestationPayload } from '../lib/appIntegrity';
import {
  getDeviceId,
  ensureDeviceKey,
  hasDeviceKey,
  signChallenge,
  devicePlatform,
  deviceModel,
} from '../lib/deviceTrust';
import { decodeJwtPayload } from '../lib/jwt';

const ACCESS_TOKEN_KEY = 'cos_access_token';
const REFRESH_TOKEN_KEY = 'cos_refresh_token';
const USER_ID_KEY = 'cos_user_id';
const ROLE_KEY = 'cos_user_role';
const DISPLAY_NAME_KEY = 'cos_display_name';
const SESSION_AT_KEY = 'cos_session_at'; // ISO timestamp of last successful auth

const OFFLINE_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface AuthState {
  isAuthenticated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  role: CosRole | null;
  /**
   * Signed-in user's name, from the token's `name` claim. Persisted alongside the session so the
   * header avatar has its initials offline — the app must not need a network round-trip to draw a
   * screen a field worker opens underground (§17).
   */
  displayName: string | null;

  /**
   * Device-trust state (§20.6.1) for the OTP screen's indicator. null = not yet determined (shown as
   * a neutral "checking" state); true/false = the server's verdict from /auth/otp/attest.
   */
  deviceTrusted: boolean | null;

  /** Load persisted session from SecureStore on app launch. */
  hydrate: () => Promise<void>;

  /** Called after successful OTP verification or token refresh. */
  setTokens: (params: {
    accessToken: string;
    refreshToken: string;
    userId: string;
    role: CosRole;
    displayName?: string | null;
  }) => Promise<void>;

  /** Path A: request an SMS OTP for the given phone number. */
  requestOtp: (
    phoneNumber: string,
  ) => Promise<{ expiresInSeconds: number; resendCooldownSeconds: number }>;

  /** Path A: verify OTP, decode the issued token for user_id/role, and persist the session. */
  verifyOtp: (phoneNumber: string, otp: string) => Promise<void>;

  /** Update access token after silent refresh (refresh token still valid). */
  updateAccessToken: (accessToken: string) => Promise<void>;

  /**
   * Persist the rotated refresh token after a silent refresh. Keycloak issues single-use refresh
   * tokens (revokeRefreshToken=true, refreshTokenMaxReuse=0), so the old token is invalidated on
   * each refresh — the client MUST store the new one or the next refresh fails and logs the user out.
   */
  updateRefreshToken: (refreshToken: string) => Promise<void>;

  /** Clear all auth state — called on logout or expired session. */
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  accessToken: null,
  refreshToken: null,
  userId: null,
  role: null,
  displayName: null,
  deviceTrusted: null,

  hydrate: async () => {
    const [accessToken, refreshToken, userId, role, sessionAt, displayName] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.getItemAsync(USER_ID_KEY),
      SecureStore.getItemAsync(ROLE_KEY),
      SecureStore.getItemAsync(SESSION_AT_KEY),
      SecureStore.getItemAsync(DISPLAY_NAME_KEY),
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
      // Absent for sessions persisted before the avatar existed — the avatar falls back rather than
      // forcing those users to sign in again.
      displayName,
    });
  },

  setTokens: async ({ accessToken, refreshToken, userId, role, displayName }) => {
    const now = new Date().toISOString();
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
      SecureStore.setItemAsync(USER_ID_KEY, userId),
      SecureStore.setItemAsync(ROLE_KEY, role),
      SecureStore.setItemAsync(SESSION_AT_KEY, now),
      displayName
        ? SecureStore.setItemAsync(DISPLAY_NAME_KEY, displayName)
        : SecureStore.deleteItemAsync(DISPLAY_NAME_KEY),
    ]);
    set({
      isAuthenticated: true,
      accessToken,
      refreshToken,
      userId,
      role,
      displayName: displayName ?? null,
    });
  },

  requestOtp: async (phoneNumber) => {
    // Send a stable device id so the server mints a challenge for the trust indicator (§20.6.1).
    const deviceId = await getDeviceId().catch(() => null);
    const res = await requestOtpApi(phoneNumber, deviceId ?? undefined);
    // Determine device trust in the background so the OTP screen appears immediately; the banner
    // starts neutral (null) and flips to green/red when attest resolves. Best-effort — any failure
    // just reads as untrusted and never affects the login itself.
    set({ deviceTrusted: null });
    if (deviceId && res.challenge) {
      void resolveDeviceTrust(phoneNumber, deviceId, res.challenge, set);
    } else {
      set({ deviceTrusted: false });
    }
    // Default to the configured 60s if an older backend omits the field, so the cooldown never
    // silently disappears.
    return {
      expiresInSeconds: res.expiresInSeconds,
      resendCooldownSeconds: res.resendCooldownSeconds ?? 60,
    };
  },

  verifyOtp: async (phoneNumber, otp) => {
    const tokens = await verifyOtpApi(phoneNumber, otp);
    const claims = decodeJwtPayload(tokens.accessToken);
    const userId = typeof claims['user_id'] === 'string' ? claims['user_id'] : '';
    const role = claims['role'] as CosRole;
    // Keycloak's standard `name` claim (given_name + family_name). Not every account has one, so the
    // avatar treats it as optional.
    const displayName = typeof claims['name'] === 'string' ? claims['name'] : null;
    await get().setTokens({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      userId,
      role,
      displayName,
    });
    // Enrol this device's public key so the NEXT login on it is trusted (§20.6.1). Best-effort: runs
    // after the session is set (so the request is authenticated) and never blocks or fails login.
    void enrolDevice();
  },

  updateAccessToken: async (accessToken) => {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    set({ accessToken });
  },

  updateRefreshToken: async (refreshToken) => {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
    set({ refreshToken });
  },

  logout: async () => {
    await clearSecureStore();
    set({
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
      userId: null,
      role: null,
      displayName: null,
      deviceTrusted: null,
    });
  },
}));

/**
 * Prove possession of the device key against the issued challenge and publish the verdict to the
 * store. Fully best-effort: a device with no key, or any signing/network failure, resolves to
 * untrusted. Never throws (the caller does not await it).
 */
async function resolveDeviceTrust(
  phoneNumber: string,
  deviceId: string,
  challenge: string,
  set: (partial: Partial<AuthState>) => void,
): Promise<void> {
  try {
    if (!(await hasDeviceKey())) {
      set({ deviceTrusted: false }); // first device — no key yet, so not trusted until it enrols
      return;
    }
    const signature = await signChallenge(challenge);
    if (!signature) {
      set({ deviceTrusted: false });
      return;
    }
    const { deviceTrusted } = await attestDeviceApi(phoneNumber, deviceId, signature);
    set({ deviceTrusted });
  } catch {
    set({ deviceTrusted: false });
  }
}

/** Register the device's public key for the just-authenticated user. Best-effort; swallows failures. */
async function enrolDevice(): Promise<void> {
  try {
    const [deviceId, publicKey] = await Promise.all([getDeviceId(), ensureDeviceKey()]);
    if (!publicKey) return;
    const model = deviceModel();
    // Platform attestation (ADR-082/083), attempted but never required. Its own failure path returns
    // null — no Play Services, no project number configured, App Attest unsupported, offline — and
    // enrolment then proceeds exactly as it did before attestation existed. Wrapped separately so an
    // attestation problem can never take the ENROLMENT down with it: losing the public key would
    // make the next login untrusted, which is a worse outcome than losing a verdict.
    const attestation = await collectAttestation(deviceId);
    await registerDevice({
      deviceId,
      publicKey,
      platform: devicePlatform(),
      ...(model ? { model } : {}),
      ...(attestation ?? {}),
    });
  } catch {
    // Trust is a convenience layer — a failed enrolment just means the next login is untrusted too.
  }
}

/** Fetch a challenge and attest against it. Null whenever this device cannot produce a verdict. */
async function collectAttestation(deviceId: string): Promise<AttestationPayload | null> {
  try {
    return await attest(await requestAttestationChallenge(deviceId), deviceId);
  } catch {
    // A challenge request that fails (offline, an older backend with no such route) is not a reason
    // to skip enrolment — only a reason to enrol without a verdict.
    return null;
  }
}

async function clearSecureStore(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_ID_KEY),
    SecureStore.deleteItemAsync(ROLE_KEY),
    SecureStore.deleteItemAsync(SESSION_AT_KEY),
    SecureStore.deleteItemAsync(DISPLAY_NAME_KEY),
  ]);
}
