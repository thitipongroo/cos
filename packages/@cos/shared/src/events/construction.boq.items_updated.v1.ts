// construction.boq.items_updated.v1 — Phase 4 BOQ Service
// Emitted after items are added / updated / deleted in a DRAFT BOQ version.
// Source: context/00_master_construction_os.md §Phase 4 Kafka event producers

import type { BaseEventEnvelope } from '@cos/types';

export interface BoqItemsUpdatedPayload {
  version_id: string;
  project_id: string;
  changed_items_count: number;
  new_total_estimated_amount: string; // decimal string — never float
  new_total_estimated_currency: string; // ISO 4217
}

export type BoqItemsUpdatedEvent = BaseEventEnvelope<BoqItemsUpdatedPayload>;
