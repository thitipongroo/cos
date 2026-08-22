// construction.boq.items_published.v1 — Phase 4 BOQ Service
// Emitted when a BOQ version is published; Finance materialises the line snapshot from it.
// Shape mirrors src/avro/construction.boq.items_published.v1.avsc field for field.
import type { BaseEventEnvelope } from '@cos/types';

export interface BoqLineItem {
  /** Optional in the schema (["null","string"], default null) — not every line is coded. */
  item_code: string | null;
  description: string;
  unit: string;
  /** DECIMAL strings, never numbers — money and quantities never travel as IEEE-754. */
  quantity: string;
  unit_cost: string;
  estimated_total: string;
}

export interface BoqItemsPublishedPayload {
  version_id: string;
  project_id: string;
  version_number: number;
  total_estimated_amount: string;
  total_estimated_currency: string;
  items: BoqLineItem[];
}

export type BoqItemsPublishedEvent = BaseEventEnvelope<BoqItemsPublishedPayload>;
