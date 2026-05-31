// Canonical event: construction.project.archived.v1
// Source: context/00_master_construction_os.md §Phase 3 Kafka event producers

import type { BaseEventEnvelope } from '@cos/types';

export interface ProjectArchivedPayload {
  project_id: string; // UUID
}

export type ProjectArchivedEvent = BaseEventEnvelope<ProjectArchivedPayload>;
