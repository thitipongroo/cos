// Auth API — Path A (SMS OTP) endpoints. Called before a session exists, so no auth header.
// Backend: POST /auth/otp/request {phoneNumber, deviceId?}, POST /auth/otp/verify {phoneNumber, otp},
//          POST /auth/otp/attest {phoneNumber, deviceId, signature} (device trust, §20.6.1).

import { apiClient } from './client';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

export interface RequestOtpResult {
  expiresInSeconds: number;
  /** Seconds to wait before a resend is allowed — drives the client's countdown (§5.5). */
  resendCooldownSeconds?: number;
  /** Base64url challenge to sign for device trust — present only when a deviceId was sent (§20.6.1). */
  challenge?: string;
}

export async function requestOtp(
  phoneNumber: string,
  deviceId?: string,
): Promise<RequestOtpResult> {
  const { data } = await apiClient.post<RequestOtpResult>('/auth/otp/request', {
    phoneNumber,
    ...(deviceId ? { deviceId } : {}),
  });
  return data;
}

export async function verifyOtp(phoneNumber: string, otp: string): Promise<AuthTokens> {
  const { data } = await apiClient.post<AuthTokens>('/auth/otp/verify', { phoneNumber, otp });
  return data;
}

/** Device trust (§20.6.1): prove key possession before OTP so the screen can show a real indicator. */
export async function attestDevice(
  phoneNumber: string,
  deviceId: string,
  signature: string,
): Promise<{ deviceTrusted: boolean }> {
  const { data } = await apiClient.post<{ deviceTrusted: boolean }>('/auth/otp/attest', {
    phoneNumber,
    deviceId,
    signature,
  });
  return data;
}
