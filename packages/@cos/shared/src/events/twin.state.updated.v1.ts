// twin.state.updated.v1 — Phase 24 Digital Twin
// Emitted when a TwinEntity state is updated from IoT, manual, or AI-inferred source.
import type { BaseEventEnvelope } from '@cos/types';

export interface TwinStateUpdatedPayload {
  entity_id: string;
  project_id: string;
  tenant_id: string;
  recorded_at: string;
  source: 'IOT' | 'MANUAL' | 'AI_INFERRED';
  confidence: number;
}

export type TwinStateUpdatedEvent = BaseEventEnvelope<TwinStateUpdatedPayload>;
