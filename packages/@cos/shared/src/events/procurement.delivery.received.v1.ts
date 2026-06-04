// procurement.delivery.received.v1 — Phase 5
// Canonical name: procurement.delivery.received.v1
// Source: context/00_master_construction_os.md §5 Event Contract #11
import type { BaseEventEnvelope } from '@cos/types';

export interface DeliveryItemPayload {
  item_id: string;
  quantity_received: string; // DECIMAL(10,4) as string
}

export interface DeliveryReceivedPayload {
  delivery_id: string;
  po_id: string;
  project_id: string;
  vendor_id: string;
  received_by: string;
  received_at: string; // ISO 8601 UTC
  items_received: DeliveryItemPayload[];
  partial: boolean;
}

export type DeliveryReceivedEvent = BaseEventEnvelope<DeliveryReceivedPayload>;
