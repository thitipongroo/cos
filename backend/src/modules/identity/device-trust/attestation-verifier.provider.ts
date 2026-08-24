// AttestationVerifier selection (ADR-082).
//
// Resolution is by the DEVICE's platform, not by an environment variable — unlike ADR-040's SMS
// gateway, which is one deployment-wide choice. A single backend serves both Android and iOS clients
// at the same time, so "which verifier" is a per-request fact and the registry is a lookup, not a
// switch.
//
// An unknown platform resolves to the unconfigured verifier rather than throwing. A device reporting
// a platform string the server does not recognise is not a reason to fail a login (ADR-054's
// non-blocking guarantee); it is a reason to record UNAVAILABLE and let the trust score reflect that
// nothing could be established.

import { Inject, Injectable } from '@nestjs/common';
import {
  ATTESTATION_VERIFIER,
  type AttestationClaim,
  type AttestationResult,
  type AttestationVerifier,
} from './attestation-verifier';
import { UnconfiguredAttestationVerifier } from './adapters/unconfigured-attestation.adapter';
import { PlayIntegrityVerifier } from './adapters/play-integrity.adapter';
import { AppAttestVerifier } from './adapters/app-attest.adapter';

@Injectable()
export class AttestationVerifierRegistry {
  private readonly byPlatform = new Map<string, AttestationVerifier>();

  constructor(
    @Inject(ATTESTATION_VERIFIER) verifiers: AttestationVerifier[],
    private readonly fallback: UnconfiguredAttestationVerifier,
  ) {
    for (const v of verifiers) {
      // '*' is the fallback's own platform and must not be registered as a real handler, or it would
      // shadow a genuine verifier that registers later.
      if (v.platform !== '*') this.byPlatform.set(v.platform.toLowerCase(), v);
    }
  }

  /** The verifier for this platform, or the unconfigured one. Never null — callers must not branch. */
  resolve(platform: string): AttestationVerifier {
    return this.byPlatform.get(platform.toLowerCase()) ?? this.fallback;
  }

  /**
   * Verify a claim, converting ANY verifier failure into UNAVAILABLE.
   *
   * The catch is load-bearing, not defensive padding. Play Integrity and App Attest both reach out to
   * a third party at verification time, so a timeout or a 5xx at Google is an ordinary Tuesday — and
   * ADR-082 requires that this "cannot degrade sign-in". Letting the exception propagate would make
   * an outage at Google an authentication outage here, which is precisely what the ADR rejected when
   * it declined to block login on failed attestation.
   */
  async verify(claim: AttestationClaim): Promise<AttestationResult> {
    try {
      return await this.resolve(claim.platform).verify(claim);
    } catch {
      // Deliberately no error detail in the return: the caller records a verdict, and a message from
      // a third-party client has no place on a device row. The adapter logs its own failure.
      return { verdict: 'UNAVAILABLE', integrityLevel: null, osVersion: null };
    }
  }
}

/**
 * The verifier list — Android via Play Integrity, iOS via App Attest.
 *
 * Both self-disable to UNAVAILABLE when their configuration is absent (`PLAY_INTEGRITY_*` /
 * `APP_ATTEST_*`), so registering them unconditionally is safe: an unconfigured deployment behaves
 * exactly as it did before they existed, and no device is ever accused of failing an integrity check
 * because an operator has not set an environment variable.
 */
export const attestationVerifiersProvider = {
  provide: ATTESTATION_VERIFIER,
  useFactory: (
    playIntegrity: PlayIntegrityVerifier,
    appAttest: AppAttestVerifier,
  ): AttestationVerifier[] => [playIntegrity, appAttest],
  inject: [PlayIntegrityVerifier, AppAttestVerifier],
};
