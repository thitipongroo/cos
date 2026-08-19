// Biometric-unlock store.
//
// The lockout invariants, which are what this store exists to get right:
//   - the lock is only ever raised on a device that can currently open it
//   - a stored preference from a device whose biometrics were since removed does NOT lock the app
//   - turning the setting ON proves the user can satisfy the prompt BEFORE promising to demand it
//   - turning it OFF is never gated — demanding a fingerprint to remove a lock protects nothing and
//     fails exactly the user whose sensor stopped working

const mockSecureStore = {
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
};
const mockBiometric = {
  getCapability: jest.fn(),
  authenticate: jest.fn(),
};

jest.mock('expo-secure-store', () => mockSecureStore);
jest.mock('../../lib/biometric', () => mockBiometric);

// The AppState listener the store registers to re-arm the lock on foreground. Captured here so a
// test can drive the transitions the OS would.
const appStateHandlers: Array<(state: string) => void> = [];
const mockRemove = jest.fn();
jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: (_type: string, handler: (state: string) => void) => {
      appStateHandlers.push(handler);
      return { remove: mockRemove };
    },
  },
}));

import { useBiometricStore } from '../biometricStore';

const AVAILABLE = { available: true, kind: 'face', hardwareWithoutEnrolment: false };
const NO_HARDWARE = { available: false, kind: 'none', hardwareWithoutEnrolment: false };
const NOT_ENROLLED = { available: false, kind: 'none', hardwareWithoutEnrolment: true };

const reset = (): void =>
  useBiometricStore.setState({
    enabled: false,
    locked: false,
    kind: null,
    available: false,
    needsEnrolment: false,
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockSecureStore.setItemAsync.mockResolvedValue(undefined);
  reset();
});

describe('hydrate', () => {
  it('restores the preference and re-reads what the hardware can do', async () => {
    mockSecureStore.getItemAsync.mockResolvedValue('true');
    mockBiometric.getCapability.mockResolvedValue(AVAILABLE);

    await useBiometricStore.getState().hydrate();

    expect(useBiometricStore.getState()).toMatchObject({
      enabled: true,
      available: true,
      kind: 'face',
    });
  });

  it('defaults to off when nothing is stored', async () => {
    // A security control that turns itself on is a control the user did not choose.
    mockSecureStore.getItemAsync.mockResolvedValue(null);
    mockBiometric.getCapability.mockResolvedValue(AVAILABLE);
    await useBiometricStore.getState().hydrate();
    expect(useBiometricStore.getState().enabled).toBe(false);
  });

  it('never persists the capability — it is re-read every launch', async () => {
    // Enrolment changes in OS Settings, outside this app's lifetime. Caching it is how a stored
    // "available" survives the user deleting their fingerprints.
    mockSecureStore.getItemAsync.mockResolvedValue('true');
    mockBiometric.getCapability.mockResolvedValue(NOT_ENROLLED);
    await useBiometricStore.getState().hydrate();
    expect(useBiometricStore.getState()).toMatchObject({ available: false, needsEnrolment: true });
    expect(mockSecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});

describe('lockIfEnabled — the lockout guard', () => {
  it('raises the lock when enabled and the device can open it', async () => {
    useBiometricStore.setState({ enabled: true });
    mockBiometric.getCapability.mockResolvedValue(AVAILABLE);
    await useBiometricStore.getState().lockIfEnabled();
    expect(useBiometricStore.getState().locked).toBe(true);
  });

  it('does NOT lock when the preference is on but biometrics were since removed', async () => {
    // The whole point. A stored `enabled: true` on a device with nothing enrolled would otherwise
    // put up a gate no prompt can open.
    useBiometricStore.setState({ enabled: true });
    mockBiometric.getCapability.mockResolvedValue(NOT_ENROLLED);
    await useBiometricStore.getState().lockIfEnabled();
    expect(useBiometricStore.getState().locked).toBe(false);
  });

  it('does nothing at all when the user never enabled it', async () => {
    mockBiometric.getCapability.mockResolvedValue(AVAILABLE);
    await useBiometricStore.getState().lockIfEnabled();
    expect(useBiometricStore.getState().locked).toBe(false);
    // Not even a capability probe: users who never opt in pay nothing on every launch.
    expect(mockBiometric.getCapability).not.toHaveBeenCalled();
  });
});

describe('setEnabled', () => {
  it('proves the user can satisfy the prompt BEFORE enabling', async () => {
    mockBiometric.getCapability.mockResolvedValue(AVAILABLE);
    mockBiometric.authenticate.mockResolvedValue('unlocked');

    await expect(useBiometricStore.getState().setEnabled(true)).resolves.toBe(true);
    expect(mockBiometric.authenticate).toHaveBeenCalled();
    expect(useBiometricStore.getState().enabled).toBe(true);
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('cos_biometric_unlock', 'true');
  });

  it('does not enable when the confirmation prompt is not satisfied', async () => {
    // Otherwise someone flips the toggle, closes the app, and cannot get back in.
    mockBiometric.getCapability.mockResolvedValue(AVAILABLE);
    mockBiometric.authenticate.mockResolvedValue('cancelled');

    await expect(useBiometricStore.getState().setEnabled(true)).resolves.toBe(false);
    expect(useBiometricStore.getState().enabled).toBe(false);
    expect(mockSecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('refuses to enable on a device that cannot do it, without prompting', async () => {
    mockBiometric.getCapability.mockResolvedValue(NO_HARDWARE);
    await expect(useBiometricStore.getState().setEnabled(true)).resolves.toBe(false);
    expect(mockBiometric.authenticate).not.toHaveBeenCalled();
  });

  it('turns OFF without any prompt, and drops the lock with it', async () => {
    // Never gated: the session is already unlocked and in front of them. Demanding a fingerprint to
    // REMOVE a lock protects nothing and fails the one user who most needs it removed.
    useBiometricStore.setState({ enabled: true, locked: true });
    await expect(useBiometricStore.getState().setEnabled(false)).resolves.toBe(true);

    expect(mockBiometric.authenticate).not.toHaveBeenCalled();
    expect(useBiometricStore.getState()).toMatchObject({ enabled: false, locked: false });
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith('cos_biometric_unlock', 'false');
  });
});

describe('unlock', () => {
  it('opens the gate on success', async () => {
    useBiometricStore.setState({ locked: true });
    mockBiometric.authenticate.mockResolvedValue('unlocked');
    await expect(useBiometricStore.getState().unlock('Unlock')).resolves.toBe(true);
    expect(useBiometricStore.getState().locked).toBe(false);
  });

  it('keeps the gate up when the user dismisses the prompt', async () => {
    useBiometricStore.setState({ locked: true });
    mockBiometric.authenticate.mockResolvedValue('cancelled');
    await expect(useBiometricStore.getState().unlock('Unlock')).resolves.toBe(false);
    expect(useBiometricStore.getState().locked).toBe(true);
  });

  it('OPENS the gate when the prompt cannot run at all', async () => {
    // Not a loophole. Reaching 'unavailable' means the OS refuses to run the prompt — nothing
    // enrolled, locked out after repeated failures, hardware gone. An attacker who could induce it
    // already holds an unlocked device, which is the only thing this gate ever protected against.
    useBiometricStore.setState({ locked: true });
    mockBiometric.authenticate.mockResolvedValue('unavailable');
    await expect(useBiometricStore.getState().unlock('Unlock')).resolves.toBe(true);
    expect(useBiometricStore.getState().locked).toBe(false);
  });

  it('passes the caller’s prompt message through to the OS', async () => {
    mockBiometric.authenticate.mockResolvedValue('unlocked');
    await useBiometricStore.getState().unlock('Unlock Construction OS');
    expect(mockBiometric.authenticate).toHaveBeenCalledWith('Unlock Construction OS');
  });

  // The lock used to be raised once, from the root layout's launch effect, so it was per-PROCESS.
  // A phone is backgrounded and resumed dozens of times a day and restarted once a week - so the
  // case the gate exists for ("someone holding an already unlocked handset opens the app") was
  // precisely the case it did not cover.
  describe('watchAppState', () => {
    const fire = (state: string) => appStateHandlers.forEach((h) => h(state));

    beforeEach(() => {
      appStateHandlers.length = 0;
      mockRemove.mockClear();
      mockBiometric.getCapability.mockResolvedValue(AVAILABLE);
    });

    it('re-raises the gate when the app returns from the background', async () => {
      useBiometricStore.setState({ enabled: true, locked: false });
      useBiometricStore.getState().watchAppState();

      fire('background');
      fire('active');
      await Promise.resolve();
      await Promise.resolve();

      expect(useBiometricStore.getState().locked).toBe(true);
    });

    it('ignores an inactive->active blip, which is the prompt itself on iOS', async () => {
      // 'inactive' covers the app switcher, a system banner, and the biometric prompt. Re-locking on
      // it would fire a second prompt on top of the one the user is answering.
      useBiometricStore.setState({ enabled: true, locked: false });
      useBiometricStore.getState().watchAppState();

      fire('inactive');
      await Promise.resolve();

      expect(useBiometricStore.getState().locked).toBe(false);
    });

    it('does nothing for a user who never turned the setting on', async () => {
      useBiometricStore.setState({ enabled: false, locked: false });
      useBiometricStore.getState().watchAppState();

      fire('background');
      fire('active');
      await Promise.resolve();
      await Promise.resolve();

      expect(useBiometricStore.getState().locked).toBe(false);
    });

    it('does not lock a device that can no longer open the prompt', async () => {
      // Same invariant as lockIfEnabled: the gate is never raised where it cannot be opened.
      mockBiometric.getCapability.mockResolvedValue(NO_HARDWARE);
      useBiometricStore.setState({ enabled: true, locked: false });
      useBiometricStore.getState().watchAppState();

      fire('background');
      fire('active');
      await Promise.resolve();
      await Promise.resolve();

      expect(useBiometricStore.getState().locked).toBe(false);
    });

    it('unsubscribes when told to', () => {
      const stop = useBiometricStore.getState().watchAppState();
      stop();
      expect(mockRemove).toHaveBeenCalled();
    });
  });
});
