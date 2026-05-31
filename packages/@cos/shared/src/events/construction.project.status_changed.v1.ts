// Canonical event: construction.project.status_changed.v1
// Source: context/00_master_construction_os.md §Phase 3 Kafka event producers

import type { BaseEventEnvelope } from '@cos/types';

export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';

export interface ProjectStatusChangedPayload {
  project_id: string; // UUID
  from_status: ProjectStatus;
  to_status: ProjectStatus;
  reason: string | null; // on_hold_reason or cancellation_reason
}

export type ProjectStatusChangedEvent = BaseEventEnvelope<ProjectStatusChangedPayload>;
