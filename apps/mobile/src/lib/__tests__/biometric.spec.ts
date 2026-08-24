// Biometric capability + prompt wrapper.
//
// The invariant every test here defends: THIS MODULE NEVER TRAPS THE USER. A signed-in worker whose
// sensor is wet, gloved, dusty or simply broken must still be able to reach the app. So every path
// that cannot produce a successful prompt resolves to 'unavailable' — which the gate treats as "open"
// — and nothing throws into the launch path.
//
// The mirror invariant: it never reports a capability the device does not have, because a toggle
// offered on a device that cannot satisfy the prompt is how a user locks themselves out.

const mockLA = {
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  authenticateAsync: jest.fn(),
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
};

jest.mock('expo-local-authentication', () => mockLA);

import { authenticate, getCapability, pickKind } from '../biometric';

const FINGERPRINT = 1;
const FACE = 2;
const IRIS = 3;

beforeEach(() => jest.clearAllMocks());

describe('pickKind', () => {
  it('prefers face when a device reports both', () => {
    // A device offering both prompts with face first, so the label has to match the prompt the user
    // will actually see — not whichever entry the array happens to list first.
    expect(pickKind([FINGERPRINT, FACE] as never)).toBe('face');
    expect(pickKind([FACE, FINGERPRINT] as never)).toBe('face');
  });

  it('maps each single modality', () => {
    expect(pickKind([FINGERPRINT] as never)).toBe('fingerprint');
    expect(pickKind([IRIS] as never)).toBe('iris');
    expect(pickKind([] as never)).toBe('none');
  });
});

describe('getCapability', () => {
  it('reports available with the modality when hardware and enrolment are both present', async () => {
    mockLA.hasHardwareAsync.mockResolvedValue(true);
    mockLA.isEnrolledAsync.mockResolvedValue(true);
    mockLA.supportedAuthenticationTypesAsync.mockResolvedValue([FACE]);

    await expect(getCapability()).resolves.toEqual({
      available: true,
      kind: 'face',
      hardwareWithoutEnrolment: false,
    });
  });

  it('distinguishes "no hardware" from "hardware but nothing enrolled"', async () => {
    // The two send the user to different places: one is a fact about the handset, the other is a
    // thing they can go and fix in OS Settings. Collapsing them would tell a fixable user nothing.
    mockLA.hasHardwareAsync.mockResolvedValue(false);
    await expect(getCapability()).resolves.toMatchObject({
      available: false,
      hardwareWithoutEnrolment: false,
    });

    mockLA.hasHardwareAsync.mockResolvedValue(true);
    mockLA.isEnrolledAsync.mockResolvedValue(false);
    await expect(getCapability()).resolves.toMatchObject({
      available: false,
      hardwareWithoutEnrolment: true,
    });
  });

  it('does not ask about enrolment when there is no hardware', async () => {
    mockLA.hasHardwareAsync.mockResolvedValue(false);
    await getCapability();
    expect(mockLA.isEnrolledAsync).not.toHaveBeenCalled();
  });

  it('treats enrolled-but-unrecognised as unavailable', async () => {
    // No current OS produces this. If one ever does, an absent toggle beats a toggle that opens a
    // prompt nobody can satisfy.
    mockLA.hasHardwareAsync.mockResolvedValue(true);
    mockLA.isEnrolledAsync.mockResolvedValue(true);
    mockLA.supportedAuthenticationTypesAsync.mockResolvedValue([]);
    await expect(getCapability()).resolves.toMatchObject({ available: false, kind: 'none' });
  });

  it('resolves to unavailable — never throws — when the native module fails', async () => {
    mockLA.hasHardwareAsync.mockRejectedValue(new Error('native bridge died'));
    await expect(getCapability()).resolves.toMatchObject({ available: false });
  });
});

describe('authenticate', () => {
  it('returns unlocked on success', async () => {
    mockLA.authenticateAsync.mockResolvedValue({ success: true });
    await expect(authenticate('Unlock')).resolves.toBe('unlocked');
  });

  it('leaves the device-passcode fallback ENABLED', async () => {
    // Not a default we inherited — a decision. On a site the fingerprint reader fails for entirely
    // innocent reasons (gloves, wet hands, concrete dust, a cut finger), and a worker who cannot open
    // the app cannot file a report. The passcode is the same boundary the device already enforces.
    mockLA.authenticateAsync.mockResolvedValue({ success: true });
    await authenticate('Unlock');
    expect(mockLA.authenticateAsync).toHaveBeenCalledWith({
      promptMessage: 'Unlock',
      disableDeviceFallback: false,
    });
  });

  it.each(['user_cancel', 'app_cancel', 'system_cancel', 'authentication_failed'])(
    'treats %s as cancelled — retryable, gate stays up',
    async (error) => {
      mockLA.authenticateAsync.mockResolvedValue({ success: false, error });
      await expect(authenticate('Unlock')).resolves.toBe('cancelled');
    },
  );

  it.each(['not_enrolled', 'not_available', 'passcode_not_set', 'unknown'])(
    'treats %s as unavailable — the gate must open',
    async (error) => {
      // These mean the OS itself cannot run the prompt. Holding the app shut would lock out the owner
      // and nobody else: an attacker who could induce this already holds an unlocked device, which is
      // the only thing the gate ever protected against.
      mockLA.authenticateAsync.mockResolvedValue({ success: false, error });
      await expect(authenticate('Unlock')).resolves.toBe('unavailable');
    },
  );

  it('treats lockout as unavailable, not as a reason to stay shut', async () => {
    // 'lockout' is the OS refusing biometrics after repeated failures. Whoever triggered it is gone;
    // the person now facing the gate is the owner, mid-shift.
    mockLA.authenticateAsync.mockResolvedValue({ success: false, error: 'lockout' });
    await expect(authenticate('Unlock')).resolves.toBe('unavailable');
  });

  it('resolves to unavailable — never throws — when the prompt itself explodes', async () => {
    mockLA.authenticateAsync.mockRejectedValue(new Error('activity destroyed'));
    await expect(authenticate('Unlock')).resolves.toBe('unavailable');
  });
});
