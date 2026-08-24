// Account security screen logic (mockup 03_04_manage_account_access).

import { REVOCATION_REASONS, isSelfRevocation, orderDevices } from '../accountSecurity';

describe('REVOCATION_REASONS', () => {
  it('does not offer ADMIN_REVOKED to a user revoking their own device', () => {
    // It is a real server value, but it describes an administrator offboarding someone else. A
    // self-service action must not be able to write a label that misdescribes who acted.
    expect(REVOCATION_REASONS).not.toContain('ADMIN_REVOKED');
  });

  it('puts COMPROMISED last, so it is a statement and not the nearest button', () => {
    // COMPROMISED is the trust model's only positive class (ADR-081). Listing it first would make
    // the most consequential label the easiest one to tap by accident.
    expect(REVOCATION_REASONS.at(-1)).toBe('COMPROMISED');
    expect(REVOCATION_REASONS[0]).toBe('USER_REVOKED');
  });

  it('offers exactly three choices', () => {
    expect([...REVOCATION_REASONS]).toEqual(['USER_REVOKED', 'LOST_OR_STOLEN', 'COMPROMISED']);
  });
});

describe('isSelfRevocation', () => {
  it('recognises the device in the user’s hand', () => {
    expect(isSelfRevocation('d1', 'd1')).toBe(true);
    expect(isSelfRevocation('d2', 'd1')).toBe(false);
  });

  it('is false when this install has no id yet', () => {
    // Before `getDeviceId()` resolves. Warning someone they are about to sign themselves out, when
    // it is not established that they are, would be a false alarm on a security screen.
    expect(isSelfRevocation('d1', null)).toBe(false);
  });
});

describe('orderDevices', () => {
  const devices = [
    { deviceId: 'old', lastSeenAt: '2026-01-01T00:00:00.000Z' },
    { deviceId: 'mine', lastSeenAt: '2026-02-01T00:00:00.000Z' },
    { deviceId: 'recent', lastSeenAt: '2026-08-01T00:00:00.000Z' },
  ];

  it('puts this device first even when another was seen more recently', () => {
    // It is the row the user came to check, and pushing it below a stranger's session buries it.
    expect(orderDevices(devices, 'mine').map((d) => d.deviceId)).toEqual(['mine', 'recent', 'old']);
  });

  it('falls back to most-recently-seen when this device is unknown', () => {
    expect(orderDevices(devices, null).map((d) => d.deviceId)).toEqual(['recent', 'mine', 'old']);
  });

  it('does not mutate the caller’s array', () => {
    const input = [...devices];
    orderDevices(input, 'mine');
    expect(input.map((d) => d.deviceId)).toEqual(['old', 'mine', 'recent']);
  });
});
