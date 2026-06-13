// twin.divergence.detected.v1 — Phase 24 Digital Twin
// Emitted when planned vs actual state divergence exceeds configured threshold.
import type { BaseEventEnvelope } from '@cos/types';

export interface TwinDivergenceDetectedPayload {
  project_id: string;
  tenant_id: string;
  generated_at: string;
  divergence_count: number;
  max_severity: 'LOW' | 'MEDIUM' | 'HIGH';
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export type TwinDivergenceDetectedEvent = BaseEventEnvelope<TwinDivergenceDetectedPayload>;
