// Platform attestation port (ADR-082) — the seam between "the app sent a token" and "Google/Apple
// vouched for this device".
//
// A port rather than a direct client, for the same reason ADR-040 made the SMS gateway one: Android
// and iOS are two entirely different verification protocols (Play Integrity decodes a signed token
// server-to-server; App Attest verifies a CBOR attestation object against Apple's root CA), and an
// on-premise or air-gapped deployment has neither. Which one runs is a deployment fact, not a
// compile-time one.
//
// TYPE B, NOT TYPE A — the opposite of SmsSender, deliberately.
//
// §32.9 Type A stubs fail fast because a caller must not mistake an empty result for success. That is
// right for SMS: an OTP that was never sent must not look sent. It is WRONG here. ADR-082 is explicit
// that attestation "never blocks a login. The OTP remains the authenticator", and ADR-054 before it
// made non-blocking a safety property: a trust check must never lock out a legitimate field worker.
// So an unconfigured or failing verifier returns UNAVAILABLE and the login proceeds — §32.9 Type B,
// "return safe defaults so the calling service continues in a degraded but valid state".
//
// The safe default is UNAVAILABLE and never PASSED. Failing open into "this device is fine" would
// turn an outage at Google into a fleet-wide clean bill of health, which is the one answer that must
// not be produced by accident.

export const ATTESTATION_VERIFIER = Symbol('AttestationVerifier');

/** Mirrors platform."AttestationVerdict" (migration 20260805000001). */
export type AttestationVerdict = 'PASSED' | 'FAILED' | 'UNAVAILABLE';

/**
 * Mirrors platform."DeviceIntegrityLevel" — Play Integrity's device-integrity labels (ADR-083).
 * `null` on iOS: App Attest attests the app, not the device, and has no equivalent tier.
 */
export type DeviceIntegrityLevel = 'STRONG' | 'DEVICE' | 'BASIC';

/**
 * What the app collected on-device and submitted for server-side checking.
 *
 * Note what is NOT here: no osVersion, no securityPatchLevel. The client does not get to report
 * device properties. ADR-082 forbids client-side integrity signals, and ADR-083 establishes that the
 * only server-verifiable OS signal either platform offers is Play Integrity's own
 * `deviceAttributes.sdkVersion` — which arrives inside the token, not beside it.
 */
export interface AttestationClaim {
  /** 'ios' | 'android' — decides which verifier applies. */
  platform: string;
  /** The opaque platform token (@expo/app-integrity). Never logged: it is a bearer assertion. */
  token: string;
  /** The per-install id the token was requested for, so a replayed token cannot be re-bound. */
  deviceId: string;
  /**
   * The server-issued challenge this token was minted against.
   *
   * Both platforms are challenge-response — iOS `attestKeyAsync(keyId, challenge)`, Android
   * `requestIntegrityCheckAsync(requestHash)` — so a verifier must be able to check that the token
   * answers a challenge THIS server issued. Without it a captured token is replayable forever.
   */
  challenge: string;
  /**
   * iOS App Attest key identifier; null on Android.
   *
   * Apple attests a KEY, not a request, so the object is meaningless without knowing which key it
   * vouches for. Play Integrity's token stands alone and carries no key.
   *
   * ASYMMETRY WORTH KNOWING, because getting it backwards fails silently on one platform only:
   * on iOS the RAW challenge travels and the native layer hashes it — `attestKeyAsync` computes
   * `SHA256(utf8(challenge))` as Apple's `clientDataHash` — so an iOS verifier compares against that
   * digest. On Android `setRequestHash` is a pass-through, so the CLIENT computes the digest and the
   * server recomputes the same one to compare with the token's verbatim `requestHash`.
   */
  keyId: string | null;
}

export interface AttestationResult {
  verdict: AttestationVerdict;
  /**
   * How strong the answer was. Null when there is no tier — iOS always, and any non-PASSED verdict.
   */
  integrityLevel: DeviceIntegrityLevel | null;
  /**
   * The OS signal the SERVER established, never one the client sent.
   *
   * On Android this is Play Integrity's `deviceAttributes.sdkVersion`, extracted from the verified
   * token. On iOS it is always null — App Attest returns no device data whatsoever. A verifier that
   * cannot vouch for a value returns null, and the screen says "not reported" rather than showing a
   * number nobody stands behind.
   */
  osVersion: string | null;
}

export interface AttestationVerifier {
  /** Which platform string this verifier handles, e.g. 'android'. */
  readonly platform: string;
  verify(claim: AttestationClaim): Promise<AttestationResult>;
}

/** The result every path returns when no verdict could be obtained. Never PASSED. */
export const UNAVAILABLE: AttestationResult = {
  verdict: 'UNAVAILABLE',
  integrityLevel: null,
  osVersion: null,
};
