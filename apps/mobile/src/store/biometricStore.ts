// Biometric-unlock store — the Security Settings toggle and the app-lock state it drives
// (mockup 03_04_manage_account_access → Security Settings → Biometric Unlock).
//
// Persisted in expo-secure-store like themeStore/localeStore. Off by default: a security control that
// turns itself on is a control the user did not choose, and on a shared site handset the person who
// enrolled their face is not necessarily the person the phone belongs to.
//
// THE LOCK NEVER OUTLIVES ITS ABILITY TO OPEN. `locked` is only ever set true when the device can
// actually satisfy a prompt, and `unlock()` opens the gate on 'unavailable'. A signed-in worker must
// never reach a screen they cannot get past — see lib/biometric.ts for why that is a site problem and
// not a theoretical one.

import { create } from 'zustand';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { authenticate, getCapability, type BiometricKind } from '../lib/biometric';

const BIOMETRIC_KEY = 'cos_biometric_unlock';

interface BiometricState {
  /** The user's persisted choice. */
  enabled: boolean;
  /**
   * Whether the app is currently held behind the prompt.
   *
   * Distinct from `enabled`: the preference survives restarts, the lock is per-launch. Starts false
   * so nothing is gated until `lockIfEnabled()` has confirmed the device can open it.
   */
  locked: boolean;
  /** What this device offers, for the settings label. Null until `hydrate()` has looked. */
  kind: BiometricKind | null;
  /** Whether the toggle should be offered at all. */
  available: boolean;
  /** Hardware present but nothing enrolled — the copy points at OS Settings rather than giving up. */
  needsEnrolment: boolean;

  hydrate: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<boolean>;
  lockIfEnabled: () => Promise<void>;
  unlock: (promptMessage: string) => Promise<boolean>;

  /**
   * Re-raise the gate whenever the app returns to the foreground, for as long as the returned
   * function is not called.
   *
   * WHY THE LAUNCH-ONLY LOCK WAS NOT ENOUGH. `lockIfEnabled()` ran once, from the root layout's
   * hydrate effect, so the lock was per-PROCESS. A phone is rarely restarted: the app is
   * backgrounded and resumed dozens of times a day and killed once a week, so the case this gate
   * exists for — "someone holding an already unlocked handset opens the app" (lib/biometric.ts) — is
   * exactly the case it did not cover. Whoever picked up the unattended phone simply switched back
   * to a still-mounted, still-unlocked session.
   */
  watchAppState: () => () => void;
}

export const useBiometricStore = create<BiometricState>((set, get) => ({
  enabled: false,
  locked: false,
  kind: null,
  available: false,
  needsEnrolment: false,

  /**
   * Read the stored preference and re-check what the hardware can do.
   *
   * The capability is re-read every launch, never persisted: enrolment changes in OS Settings,
   * outside this app entirely. A user who removed their fingerprints since last launch has `enabled`
   * still true in storage and no way to satisfy a prompt — reading the hardware here is what stops
   * that becoming a lockout.
   */
  hydrate: async () => {
    const [stored, capability] = await Promise.all([
      SecureStore.getItemAsync(BIOMETRIC_KEY),
      getCapability(),
    ]);
    set({
      enabled: stored === 'true',
      kind: capability.kind,
      available: capability.available,
      needsEnrolment: capability.hardwareWithoutEnrolment,
    });
  },

  /**
   * Turn the setting on or off. Returns whether the change took effect.
   *
   * Turning it ON prompts first. Enabling a lock without proving the user can open it is how someone
   * flips a toggle, closes the app, and cannot get back in — so the proof comes before the promise.
   * Turning it OFF is never gated: the session is already unlocked and in front of them, so demanding
   * a fingerprint to REMOVE a lock protects nothing and fails exactly the user whose sensor stopped
   * working.
   */
  setEnabled: async (enabled) => {
    if (!enabled) {
      set({ enabled: false, locked: false });
      await SecureStore.setItemAsync(BIOMETRIC_KEY, 'false');
      return true;
    }

    const capability = await getCapability();
    set({
      kind: capability.kind,
      available: capability.available,
      needsEnrolment: capability.hardwareWithoutEnrolment,
    });
    if (!capability.available) return false;

    if ((await authenticate('Confirm to enable biometric unlock')) !== 'unlocked') return false;

    set({ enabled: true });
    await SecureStore.setItemAsync(BIOMETRIC_KEY, 'true');
    return true;
  },

  /**
   * Raise the gate on launch, if the user asked for it AND the device can still open it.
   *
   * The capability re-check is the load-bearing half. Without it, a stored `enabled: true` on a
   * device whose biometrics were removed would lock the app with no way through.
   */
  lockIfEnabled: async () => {
    if (!get().enabled) return;
    const capability = await getCapability();
    set({
      kind: capability.kind,
      available: capability.available,
      needsEnrolment: capability.hardwareWithoutEnrolment,
      locked: capability.available,
    });
  },

  /**
   * Attempt to open the gate. Returns whether the app is now unlocked.
   *
   * 'unavailable' opens it. That is not a loophole: reaching this state means the OS itself refuses
   * to run the prompt — nothing enrolled, biometrics locked out after repeated failures, hardware
   * gone — and an attacker who could induce it already holds an unlocked device, which is the only
   * thing this gate ever protected against. Holding it shut would lock out the owner and nobody else.
   */
  unlock: async (promptMessage) => {
    const outcome = await authenticate(promptMessage);
    if (outcome === 'cancelled') return false;
    set({ locked: false });
    return true;
  },

  watchAppState: () => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      // Only the background→active EDGE. 'inactive' is transient on iOS (the app switcher, a system
      // banner, the biometric prompt ITSELF), and re-locking on it would fire a second prompt on top
      // of the one the user is answering.
      const returned = previous.match(/inactive|background/) && next === 'active';
      previous = next;
      if (returned) void get().lockIfEnabled();
    });
    return () => subscription.remove();
  },
}));
