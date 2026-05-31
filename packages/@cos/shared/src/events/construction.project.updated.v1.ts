// Canonical event: construction.project.updated.v1
// Source: context/00_master_construction_os.md §Phase 3 Kafka event producers

import type { BaseEventEnvelope } from '@cos/types';

export interface ProjectUpdatedPayload {
  project_id: string; // UUID
  changed_fields: Record<string, unknown>; // patch of changed fields only
  updated_by: string; // UUID
}

export type ProjectUpdatedEvent = BaseEventEnvelope<ProjectUpdatedPayload>;
