// Event payload stub — full payload spec in context/00_master_construction_os.md §6
// Implemented in Phase 8 (Event-driven Infrastructure)
import { BaseEventEnvelope } from '@cos/types';
export type PlaceholderPayload = Record<string, unknown>;
export type PlaceholderEvent = BaseEventEnvelope<PlaceholderPayload>;
