// Device-trust API (§20.6.1) — enrol / list / revoke the user's trusted devices.
// All calls are authenticated (the client interceptor attaches the access token).

import { apiClient, post, get } from './client';

/**
 * Platform attestation verdict (ADR-082), as the server established it.
 *
 * `null` means the device has never been attested — an enrolment predating the feature. That is a
 * different thing from `UNAVAILABLE` ("we asked and the platform could not answer") and from
 * `FAILED` ("we asked and it did not pass"), and the Device ID screen must not render them alike.
 */
export type AttestationVerdict = 'PASSED' | 'FAILED' | 'UNAVAILABLE';

/**
 * How strong the platform's answer was (ADR-083) — Play Integrity's device-integrity labels.
 *
 * `null` on iOS: App Attest attests the app, not the device, so it has no equivalent tier.
 *
 * The Device ID screen renders THIS instead of a security patch date. No attestation verdict on
 * either platform carries a patch date, and on Android 13+ `STRONG` already means "patched within
 * the last year" — the tier is the conclusion the date was only evidence for.
 */
export type DeviceIntegrityLevel = 'STRONG' | 'DEVICE' | 'BASIC';

export interface TrustedDeviceSummary {
  deviceId: string;
  platform: string;
  model: string | null;
  lastSeenAt: string;
  createdAt: string;
  expiresAt: string;
  attestationVerdict: AttestationVerdict | null;
  integrityLevel: DeviceIntegrityLevel | null;
  attestedAt: string | null;
  /** Play Integrity's verified SDK version. Null on iOS. Never what this device reported. */
  osVersion: string | null;
}

export interface RegisterDeviceBody {
  deviceId: string;
  publicKey: string;
  platform: string;
  model?: string;
  /**
   * Play Integrity / App Attest token from @expo/app-integrity (ADR-082).
   *
   * Optional, and enrolment succeeds without it: a device with no Play Services, or a build without
   * the native module, still enrols and simply carries no verdict. Attestation is additive and never
   * blocks — the OTP remains the authenticator.
   *
   * Send it WITH `attestationChallenge`. The server ignores a token that arrives alone.
   */
  attestationToken?: string;
  /**
   * The server-issued challenge the token answers, from `POST /auth/otp/request`.
   *
   * Both platforms are challenge-response — `attestKeyAsync(keyId, challenge)` on iOS,
   * `requestIntegrityCheckAsync(hash)` on Android — so a token detached from its challenge is a
   * bearer credential anyone who captures it can replay indefinitely.
   */
  attestationChallenge?: string;
  /**
   * iOS only: the App Attest key identifier the attestation object vouches for.
   *
   * Apple attests a KEY rather than a request, so the server cannot interpret the object without it.
   * Android's Play Integrity token stands alone and sends none.
   */
  attestationKeyId?: string;

  // No osVersion / securityPatchLevel: the client does not report device properties. The only
  // server-verifiable OS signal arrives inside the attestation token itself (ADR-083).
}

/**
 * Why a device is being revoked (ADR-081).
 *
 * COMPROMISED is the ONLY value treated as a positive training label for the trust model, so the UI
 * must present it as a deliberate security finding — not as the default for "remove this device".
 */
export type DeviceRevocationReason =
  'USER_REVOKED' | 'ADMIN_REVOKED' | 'LOST_OR_STOLEN' | 'COMPROMISED';

/** Enrol this device's public key for the authenticated user (idempotent on the server). */
export async function registerDevice(body: RegisterDeviceBody): Promise<void> {
  await post<void>('/auth/devices', body);
}

/**
 * Mint a single-use attestation challenge for this device.
 *
 * Separate from the login challenge in `POST /auth/otp/request`: that one is issued against a phone
 * number before sign-in and consumed by the P-256 signature check, this one against an authenticated
 * user. Feeding one flow's nonce to the other would spend a challenge the other still needs.
 */
export async function requestAttestationChallenge(deviceId: string): Promise<string> {
  const res = await post<{ challenge: string }>('/auth/devices/attestation-challenge', {
    deviceId,
  });
  return res.challenge;
}

/** The authenticated user's active (non-revoked) trusted devices. */
export async function listDevices(): Promise<TrustedDeviceSummary[]> {
  return get<TrustedDeviceSummary[]>('/auth/devices');
}

/**
 * Revoke a trusted device.
 *
 * The reason is REQUIRED and deliberately has no default here. The server will not accept a
 * revocation without one, because it is the only source of the trust model's positive class — and a
 * client-side default would silently label every revocation identically, which is worse than the
 * caller being made to choose.
 */
export async function revokeDevice(
  deviceId: string,
  reason: DeviceRevocationReason,
): Promise<void> {
  await apiClient.delete(`/auth/devices/${encodeURIComponent(deviceId)}`, { data: { reason } });
}
