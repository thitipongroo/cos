// Canonical event: site.inspection.passed.v1
// Source: context/00_master_construction_os.md §Phase 6 Kafka event producers

import type { BaseEventEnvelope } from '@cos/types';

export interface InspectionPassedPayload {
  inspection_id: string; // UUID
  project_id: string; // UUID
  inspected_by: string; // UUID
}

export type InspectionPassedEvent = BaseEventEnvelope<InspectionPassedPayload>;
