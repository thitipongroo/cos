// Event payload stub — full payload spec in context/00_master_construction_os.md §6
// Implemented in Phase 11 (AI Foundation).
import type { BaseEventEnvelope } from '@cos/types';
export type AiRiskPredictionGeneratedPayload = Record<string, unknown>;
export type AiRiskPredictionGeneratedEvent = BaseEventEnvelope<AiRiskPredictionGeneratedPayload>;
