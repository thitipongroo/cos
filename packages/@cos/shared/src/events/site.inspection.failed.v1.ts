// Canonical event: site.inspection.failed.v1
// Source: context/00_master_construction_os.md §6 Event #6

import type { BaseEventEnvelope } from '@cos/types';

export interface InspectionFailedPayload {
  inspection_id: string; // UUID
  project_id: string; // UUID
  checklist_id: string; // UUID
  failed_items: Array<{ item_id: string; description: string }>;
  inspected_by: string; // UUID
  inspected_at: string; // ISO 8601 UTC
}

export type InspectionFailedEvent = BaseEventEnvelope<InspectionFailedPayload>;
