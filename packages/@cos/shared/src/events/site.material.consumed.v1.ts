// Canonical event: site.material.consumed.v1
// Source: context/00_master_construction_os.md §6 Event #10

import type { BaseEventEnvelope } from '@cos/types';

export interface MaterialConsumedPayload {
  consumption_id: string; // UUID
  project_id: string; // UUID
  task_id: string; // UUID
  material_id: string; // UUID
  quantity: string; // DECIMAL(10,4) as string
  unit: string;
  consumed_by: string; // UUID
  consumed_at: string; // ISO 8601 UTC
}

export type MaterialConsumedEvent = BaseEventEnvelope<MaterialConsumedPayload>;
