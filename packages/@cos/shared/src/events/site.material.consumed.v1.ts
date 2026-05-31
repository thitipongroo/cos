// Event payload stub — full payload spec in context/00_master_construction_os.md §6
// Implemented in Phase 6 (Site Operations).
import type { BaseEventEnvelope } from '@cos/types';
export type MaterialConsumedPayload = Record<string, unknown>;
export type MaterialConsumedEvent = BaseEventEnvelope<MaterialConsumedPayload>;
