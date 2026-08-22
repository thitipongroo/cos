// Canonical event: platform.sync.exhausted.v1
// Source: docs/specifications/17-offline-mobile-sync.md §17.2 "Max Retry Exhaustion Behavior"
// Emitted by: SyncService.reportExhaustion, when a device reports a mutation that failed 5 retries.
//
// Consumed by NotificationService, which routes it by `entity_type` — §17.2 gives a different alert
// target per type (safety incidents → PM + Safety Officer; attendance and inspections → PM; material
// consumption → the review queue with no alert at all).

import { BaseEventEnvelope } from '@cos/types';

/** The four §17.2 entity types that reach the tenant-admin review queue. */
export type SyncExhaustedEntityType =
  'safety_incidents' | 'workforce_attendance' | 'inspection_results' | 'material_consumption';

export interface SyncExhaustedPayload {
  exhaustion_id: string; // UUID of the platform.sync_exhaustions row
  entity_type: SyncExhaustedEntityType;
  entity_id: string; // UUID of the record that could not be synced
  reported_by: string; // UUID of the user whose device gave up
  retry_count: number; // always 5 — the §17.2 maximum
  last_error: string | null; // diagnostic only, never control flow
}

export type SyncExhaustedEvent = BaseEventEnvelope<SyncExhaustedPayload>;
