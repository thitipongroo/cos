// Canonical event: site.conflict.flagged.v1
// Source: context/00_master_construction_os.md §Phase 6 Kafka event producers
// Emitted whenever a CONFLICT_FLAGGED ConflictRecord is persisted during offline sync
// (site_reports LAST_WRITE_WINS + issues FIELD_LEVEL_MERGE). Consumed by NotificationConsumer
// to alert SITE_ENGINEER / PROJECT_MANAGER / TENANT_ADMIN for manual review.

import type { BaseEventEnvelope } from '@cos/types';

export interface ConflictFlaggedPayload {
  conflict_id: string; // UUID — conflict_records.conflict_id
  entity_type: string; // e.g. 'site_reports' | 'issues'
  entity_id: string; // UUID of the conflicting entity
  conflict_type: 'FIELD_CONFLICT' | 'STATUS_CONFLICT' | 'REJECTED';
}

export type ConflictFlaggedEvent = BaseEventEnvelope<ConflictFlaggedPayload>;
