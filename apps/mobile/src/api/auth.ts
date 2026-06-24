// Auth API — Path A (SMS OTP) endpoints. Called before a session exists, so no auth header.
// Backend: POST /auth/otp/request {phoneNumber}, POST /auth/otp/verify {phoneNumber, otp}.

import { apiClient } from './client';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

export async function requestOtp(phoneNumber: string): Promise<{ expiresInSeconds: number }> {
  const { data } = await apiClient.post<{ expiresInSeconds: number }>('/auth/otp/request', {
    phoneNumber,
  });
  return data;
}

export async function verifyOtp(phoneNumber: string, otp: string): Promise<AuthTokens> {
  const { data } = await apiClient.post<AuthTokens>('/auth/otp/verify', { phoneNumber, otp });
  return data;
}
