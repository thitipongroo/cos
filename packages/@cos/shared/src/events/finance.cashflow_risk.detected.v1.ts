// Event payload stub — full payload spec in context/00_master_construction_os.md §6
// Implemented in Phase 7 (Finance Service).
import type { BaseEventEnvelope } from '@cos/types';
export type CashflowRiskDetectedPayload = Record<string, unknown>;
export type CashflowRiskDetectedEvent = BaseEventEnvelope<CashflowRiskDetectedPayload>;
