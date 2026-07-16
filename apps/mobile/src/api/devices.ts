// Device-trust API (§20.6.1) — enrol / list / revoke the user's trusted devices.
// All calls are authenticated (the client interceptor attaches the access token).

import { apiClient, post, get } from './client';

export interface TrustedDeviceSummary {
  deviceId: string;
  platform: string;
  model: string | null;
  lastSeenAt: string;
  createdAt: string;
  expiresAt: string;
}

export interface RegisterDeviceBody {
  deviceId: string;
  publicKey: string;
  platform: string;
  model?: string;
}

/** Enrol this device's public key for the authenticated user (idempotent on the server). */
export async function registerDevice(body: RegisterDeviceBody): Promise<void> {
  await post<void>('/auth/devices', body);
}

/** The authenticated user's active (non-revoked) trusted devices. */
export async function listDevices(): Promise<TrustedDeviceSummary[]> {
  return get<TrustedDeviceSummary[]>('/auth/devices');
}

/** Revoke a trusted device. */
export async function revokeDevice(deviceId: string): Promise<void> {
  await apiClient.delete(`/auth/devices/${encodeURIComponent(deviceId)}`);
}
