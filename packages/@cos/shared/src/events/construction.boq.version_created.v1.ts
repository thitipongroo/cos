// Event payload stub — full payload spec in context/00_master_construction_os.md §6
// Implemented in Phase 4 (BOQ Service).
import type { BaseEventEnvelope } from '@cos/types';
export type BoqVersionCreatedPayload = Record<string, unknown>;
export type BoqVersionCreatedEvent = BaseEventEnvelope<BoqVersionCreatedPayload>;
