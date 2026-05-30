// EP-DOMAIN-008: BiometricCheckIn
// Source: context/00_master_construction_os.md §Phase 2 Extension points
// Trigger: project requires hardware-based check-in (fingerprint/face scanner at site gate)
// Note: phone-based Face ID (iOS/Android) uses existing device auth — not this EP.
//       This EP covers dedicated hardware scanners at site entry points.

import { StubBase } from '../stub-base';

export type BiometricMethod = 'FINGERPRINT' | 'FACE_ID' | 'IRIS';

export class BiometricCheckIn extends StubBase {
  readonly EP_ID = 'EP-DOMAIN-008';
  readonly EP_VERSION = '0.1.0';
  readonly TRIGGER = 'Project requires hardware biometric scanner at site gate (not phone-based auth)';
  readonly PHASE = 'Phase 2 (Post-MVP)';

  async verifyCheckIn(
    workerId: string,
    projectId: string,
    method: BiometricMethod,
  ): Promise<boolean> {
    this.logStubCall('verifyCheckIn', { workerId, projectId, method });
    // Implementation: hardware vendor SDK integration (UNSPECIFIED — depends on vendor chosen at deployment)
    return false;
  }
}
