// procurement.purchase_order.created.v1 — Phase 5
// Canonical name: procurement.purchase_order.created.v1
// Source: context/00_master_construction_os.md §5 Event Contract #3
import type { BaseEventEnvelope } from '@cos/types';

export interface PoLineItemPayload {
  item_id: string;
  quantity: string; // DECIMAL(10,4) as string
  unit: string;
  unit_price: string; // DECIMAL(19,4) as string
}

export interface PurchaseOrderCreatedPayload {
  po_id: string;
  project_id: string;
  vendor_id: string;
  po_number: string;
  total_amount: { amount: string; currency_code: string };
  delivery_date: string; // YYYY-MM-DD
  line_items: PoLineItemPayload[];
}

export type PurchaseOrderCreatedEvent = BaseEventEnvelope<PurchaseOrderCreatedPayload>;
