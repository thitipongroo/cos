// Account security screen logic (mockup 03_04_manage_account_access).

import type { DeviceRevocationReason } from '../api/devices';

/**
 * The revocation reasons offered to a user, in the order the picker lists them.
 *
 * `ADMIN_REVOKED` is deliberately ABSENT. It is a real server value, but it describes an
 * administrator offboarding someone else — a user revoking their own device is never that, and
 * offering it would let a self-service action write a label that misdescribes who acted. The server
 * still accepts all four; this list is what one screen is allowed to send.
 *
 * COMPROMISED comes last, not first, and is not the default: it is the trust model's only positive
 * class (ADR-081), so it has to be a deliberate statement rather than the button nearest the thumb.
 */
export const REVOCATION_REASONS = ['USER_REVOKED', 'LOST_OR_STOLEN', 'COMPROMISED'] as const;

export type RevocationChoice = (typeof REVOCATION_REASONS)[number];

/** Compile-time proof every offered choice is a value the server's enum accepts. */
const _assertServerAccepts: readonly DeviceRevocationReason[] = REVOCATION_REASONS;
void _assertServerAccepts;

/**
 * Does revoking this device sign the current session out?
 *
 * Revoking the device you are holding removes its trust, so the next login on it needs a full OTP
 * again. The screen warns before that happens: a user tidying up a list of devices should not
 * discover they logged themselves out by tapping the wrong row.
 */
export function isSelfRevocation(deviceId: string, currentDeviceId: string | null): boolean {
  return currentDeviceId !== null && deviceId === currentDeviceId;
}

/**
 * Sort devices for display: this device first, then most recently seen.
 *
 * This device first because it is the row a user came to check, and "last active: just now" on an
 * unfamiliar row further down is what makes an unrecognised device stand out.
 */
export function orderDevices<T extends { deviceId: string; lastSeenAt: string }>(
  devices: readonly T[],
  currentDeviceId: string | null,
): T[] {
  return [...devices].sort((a, b) => {
    const aIsCurrent = a.deviceId === currentDeviceId;
    const bIsCurrent = b.deviceId === currentDeviceId;
    if (aIsCurrent !== bIsCurrent) return aIsCurrent ? -1 : 1;
    return b.lastSeenAt.localeCompare(a.lastSeenAt);
  });
}
