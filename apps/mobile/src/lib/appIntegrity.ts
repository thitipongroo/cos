// Platform attestation client (ADR-082 / ADR-083) — the mobile half of B4.
//
// Wraps @expo/app-integrity. Like deviceTrust.ts and biometric.ts, EVERY path is defensive: a device
// with no Play Services, no cloud project number, an unsupported OS or a native failure returns null
// and enrolment proceeds without a verdict. Attestation is additive and never blocks a login —
// ADR-054's guarantee, restated by ADR-082.
//
// THE TWO PLATFORMS HASH IN DIFFERENT PLACES. This is the detail that fails silently if reversed,
// so it is stated once here and encoded below:
//
//   iOS      `attestKeyAsync(keyId, challenge)` — the NATIVE layer computes
//            `SHA256(utf8(challenge))` and passes it as Apple's `clientDataHash`. So the RAW
//            challenge is handed over, and the server compares against that same digest.
//            (Verified against IntegrityModule.swift, not assumed from the signature.)
//
//   Android  `requestIntegrityCheckAsync(requestHash)` — `setRequestHash` is a pass-through, so THIS
//            module computes the digest. Google's guidance: a SHA-256 of a stable serialisation of
//            the request, max 500 bytes, and "never put any sensitive information as plain-text into
//            the requestHash". The server recomputes the same digest and compares it with the value
//            the token carries verbatim.
//
// Sending the raw challenge on Android, or a pre-hashed one on iOS, would produce a token the server
// cannot match — and the failure looks like "attestation unavailable" rather than an error, which is
// exactly the kind of bug that survives a release.

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as AppIntegrity from '@expo/app-integrity';

/** The App Attest key id, minted once per install and reused for every later attestation. */
const APP_ATTEST_KEY_ID = 'cos.device.appAttestKeyId';

/**
 * Google Cloud project number for Play Integrity.
 *
 * EXPO_PUBLIC_ because it is genuinely public — the number identifies a project, it authorises
 * nothing, and the verification credential it pairs with lives on the server. Absent means Android
 * attestation is simply not attempted, which is a first-class state the backend already models as
 * "this client never offered a token".
 *
 * Read inside a function rather than at module scope. Expo's bundler inlines `EXPO_PUBLIC_*` textually
 * wherever the expression appears, so both forms compile to the same literal in a release build — but
 * a module-scope constant freezes the value at first import, which makes the configured and
 * unconfigured branches untestable in the same process.
 */
function cloudProjectNumber(): string | undefined {
  return process.env.EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER;
}

/** What the client produces for `POST /auth/devices`. Null whenever no attestation could be made. */
export interface AttestationPayload {
  attestationToken: string;
  attestationChallenge: string;
  /** iOS only — Apple attests a key, and the server cannot read the object without knowing which. */
  attestationKeyId?: string;
}

/**
 * The Android request hash: `SHA256(challenge + '|' + deviceId)`, base64.
 *
 * The device id is folded in so the token is bound to the enrolling install and not merely to the
 * nonce. Both inputs are opaque identifiers rather than personal data, and the result is a digest
 * regardless — Google's caution about plain-text in `requestHash` is satisfied by construction.
 *
 * Exported so the server-side recomputation has one definition to match; a second copy of this
 * formula in another file is how the two sides silently drift apart.
 */
export function buildRequestHash(challenge: string, deviceId: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${challenge}|${deviceId}`, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
}

/** The App Attest key for this install, minted on first use. Null if the service is unavailable. */
async function ensureAppAttestKeyId(): Promise<string | null> {
  try {
    const existing = await SecureStore.getItemAsync(APP_ATTEST_KEY_ID);
    if (existing) return existing;
    // One key per app instance, per Apple's model — generated once and then only asserted against.
    const keyId = await AppIntegrity.generateKeyAsync();
    await SecureStore.setItemAsync(APP_ATTEST_KEY_ID, keyId);
    return keyId;
  } catch {
    return null;
  }
}

/**
 * Produce an attestation for a server-issued challenge, or null when this device cannot.
 *
 * Null is not an error path — it is the ordinary outcome on an iPad without App Attest, an Android
 * build with no project number configured, a device without Play Services, or any release before the
 * native module shipped. The caller enrols regardless.
 */
export async function attest(
  challenge: string,
  deviceId: string,
): Promise<AttestationPayload | null> {
  try {
    if (Platform.OS === 'ios') {
      // `isSupported` is a plain boolean, not a promise — some device classes have no App Attest.
      if (!AppIntegrity.isSupported) return null;
      const keyId = await ensureAppAttestKeyId();
      if (!keyId) return null;
      // RAW challenge: the native layer hashes it. See the file header.
      const attestationToken = await AppIntegrity.attestKeyAsync(keyId, challenge);
      return { attestationToken, attestationChallenge: challenge, attestationKeyId: keyId };
    }

    if (Platform.OS === 'android') {
      const projectNumber = cloudProjectNumber();
      if (!projectNumber) return null;
      // Prepared before every request rather than cached. Google allows 5 preparations per minute
      // and a provider that has been held too long fails with INTEGRITY_TOKEN_PROVIDER_INVALID;
      // enrolment happens once per login, so re-preparing costs a few seconds on a path that is
      // already asynchronous and best-effort, and avoids caching a handle that expires unpredictably.
      await AppIntegrity.prepareIntegrityTokenProviderAsync(projectNumber);
      // HASHED here: setRequestHash is a pass-through. See the file header.
      const requestHash = await buildRequestHash(challenge, deviceId);
      const attestationToken = await AppIntegrity.requestIntegrityCheckAsync(requestHash);
      return { attestationToken, attestationChallenge: challenge };
    }

    return null;
  } catch {
    // Play Services missing, the provider expired, the user is offline, App Attest refused — all
    // indistinguishable from here and all mean the same thing to the caller: no verdict this time.
    return null;
  }
}
