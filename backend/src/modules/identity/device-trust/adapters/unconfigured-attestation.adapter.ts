// The verifier that runs until the real ones exist (ADR-082; §32.9 Type B).
//
// WHY THIS SHIPS INSTEAD OF A REAL VERIFIER. `@expo/app-integrity` is not installed in apps/mobile —
// it is a native module and needs a dev-client / EAS rebuild, which ADR-082 records as a consequence
// and which is not done. So nothing in the system can currently PRODUCE a token, and a Play Integrity
// or App Attest implementation written now could only ever be exercised against fixtures this repo
// wrote itself. ADR-082 also notes neither path runs on a simulator or a bare emulator. Security code
// that has never been fed a real input is code whose correctness is unknown.
//
// Returning UNAVAILABLE is therefore honest rather than lazy: it is exactly what the column means —
// "we asked and got no verdict" — and it is what the real adapters will also return on a Google or
// Apple outage, so the downstream behaviour is the same code path either way rather than one that
// only gets exercised during an incident.
//
// It does NOT throw (§32.9 Type A), because ADR-082 forbids attestation blocking a login and ADR-054
// before it made non-blocking a safety property for field workers.

import { Injectable } from '@nestjs/common';
import { createLogger } from '@cos/logger';
import {
  UNAVAILABLE,
  type AttestationClaim,
  type AttestationResult,
  type AttestationVerifier,
} from '../attestation-verifier';

const logger = createLogger('attestation-verifier');

@Injectable()
export class UnconfiguredAttestationVerifier implements AttestationVerifier {
  /** Matches any platform — it is the fallback, selected only when no real verifier claims one. */
  readonly platform = '*';

  verify(claim: AttestationClaim): Promise<AttestationResult> {
    // WARN per §32.9, so an operator can see the path was reached with no real verifier active.
    // The token is never logged: it is a bearer assertion about a real person's device.
    logger.warn(
      { platform: claim.platform, event: 'attestation.verifier.unconfigured' },
      'Platform attestation was requested but no verifier is configured — recording UNAVAILABLE ' +
        '(ADR-082; §32.9 Type B). Login is unaffected.',
    );
    return Promise.resolve(UNAVAILABLE);
  }
}
