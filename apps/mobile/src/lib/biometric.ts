// Biometric unlock — the mobile half of the Security Settings toggle
// (mockup 01_authen/05_privacy_policy/01_data_collection/03_04_manage_account_access, withdrawn
// 2026-08-15 with that whole set; the toggle and its screen stand — ADR-085).
//
// Wraps expo-local-authentication. What this gates is LOCAL: the session tokens already live in
// expo-secure-store and are protected at rest by the OS. The lock stops someone holding an already
// unlocked handset from opening the app — it is not a second factor and it never talks to the server.
//
// EVERY FUNCTION IS DEFENSIVE, for the same reason deviceTrust.ts is: a native failure must degrade
// to "cannot use biometrics", never throw into the launch path. A crash here would strand a signed-in
// user at a blank screen with no way forward.
//
// DEVICE-PASSCODE FALLBACK IS DELIBERATE AND NOT OPTIONAL. `disableDeviceFallback` stays false so the
// OS offers the passcode after failed biometric attempts. On a construction site the fingerprint
// reader is the component most likely to fail for entirely innocent reasons — gloves, wet hands,
// concrete dust, a cut finger — and a worker who cannot open the app cannot file a report. The
// passcode is the same security boundary the device already enforces, so nothing is weakened by
// accepting it.

import * as LocalAuthentication from 'expo-local-authentication';

/** What the Security Settings row says under "Biometric Unlock", derived from the hardware. */
export type BiometricKind = 'face' | 'fingerprint' | 'iris' | 'none';

export interface BiometricCapability {
  /** Hardware exists AND the user has enrolled something the OS will accept. */
  available: boolean;
  /** Drives the label. 'none' whenever `available` is false. */
  kind: BiometricKind;
  /**
   * True when the device has hardware but nothing enrolled. The distinction matters for the copy:
   * "your device does not support this" and "turn on Face ID in Settings first" send the user to
   * different places, and the second is fixable by them.
   */
  hardwareWithoutEnrolment: boolean;
}

const UNAVAILABLE: BiometricCapability = {
  available: false,
  kind: 'none',
  hardwareWithoutEnrolment: false,
};

/**
 * Pick the label-bearing modality when a device reports several.
 *
 * Face wins over fingerprint because a device offering both (an iPhone with Face ID, a Pixel with
 * both sensors) prompts with face first, and the label must match the prompt the user will actually
 * see rather than the first entry in an array.
 */
export function pickKind(types: LocalAuthentication.AuthenticationType[]): BiometricKind {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint';
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return 'iris';
  return 'none';
}

/**
 * What this device can actually do right now.
 *
 * Re-read on every use rather than cached: enrolment is changed in OS Settings, outside this app's
 * lifetime, and a user who removes their fingerprints must not be met with a prompt that cannot
 * succeed.
 */
export async function getCapability(): Promise<BiometricCapability> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return UNAVAILABLE;

    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) return { available: false, kind: 'none', hardwareWithoutEnrolment: true };

    const kind = pickKind(await LocalAuthentication.supportedAuthenticationTypesAsync());
    // Hardware + enrolment but no recognisable modality is not a state any current OS produces; if it
    // ever appears, treating it as unavailable is the safe reading — better an absent toggle than one
    // that opens a prompt nobody can satisfy.
    return kind === 'none'
      ? UNAVAILABLE
      : { available: true, kind, hardwareWithoutEnrolment: false };
  } catch {
    return UNAVAILABLE;
  }
}

/** Why an unlock attempt did not succeed, reduced to the three outcomes the UI treats differently. */
export type UnlockOutcome =
  /** The user is in. */
  | 'unlocked'
  /** They dismissed the prompt — offer it again; this is not a failure worth alarming them about. */
  | 'cancelled'
  /**
   * The prompt cannot succeed on this device right now: nothing enrolled, biometrics locked out
   * after too many attempts, or the hardware is gone. The gate must OPEN on this, not trap the user.
   */
  | 'unavailable';

/**
 * Ask the OS to verify the person holding the device.
 *
 * `disableDeviceFallback: false` (the default, stated explicitly here because it is a decision):
 * after failed biometric attempts the OS offers the device passcode, and that is accepted. See the
 * file header for why that matters on a site.
 */
export async function authenticate(promptMessage: string): Promise<UnlockOutcome> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      disableDeviceFallback: false,
    });
    if (result.success) return 'unlocked';

    // 'lockout' means too many failed attempts — the OS itself has stopped accepting biometrics for a
    // cooling-off period. Holding the app shut for that period would punish the wrong person: whoever
    // triggered it is gone, and the owner is the one now locked out of their own shift.
    switch (result.error) {
      case 'user_cancel':
      case 'app_cancel':
      case 'system_cancel':
      case 'authentication_failed':
        return 'cancelled';
      default:
        return 'unavailable';
    }
  } catch {
    // A native throw is indistinguishable, from here, from "this device cannot do it". Opening is the
    // only safe reading — the alternative is a signed-in user permanently unable to reach the app.
    return 'unavailable';
  }
}
