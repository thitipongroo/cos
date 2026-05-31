// Event payload stub — full payload spec in context/00_master_construction_os.md §6
// Implemented in Phase 6 (Site Operations).
import type { BaseEventEnvelope } from '@cos/types';
export type InspectionFailedPayload = Record<string, unknown>;
export type InspectionFailedEvent = BaseEventEnvelope<InspectionFailedPayload>;
