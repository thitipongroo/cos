// Event payload stub — full payload spec in context/00_master_construction_os.md §6
// Implemented in Phase 22 (Workforce Service).
import type { BaseEventEnvelope } from '@cos/types';
export type WorkforceCheckinCreatedPayload = Record<string, unknown>;
export type WorkforceCheckinCreatedEvent = BaseEventEnvelope<WorkforceCheckinCreatedPayload>;
