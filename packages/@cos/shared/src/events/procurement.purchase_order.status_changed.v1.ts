// procurement.purchase_order.status_changed.v1 — Phase 5
// Canonical name: procurement.purchase_order.status_changed.v1
// Source: context/00_master_construction_os.md §5 (Kafka events list)
import type { BaseEventEnvelope } from '@cos/types';

export type PoStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SENT'
  | 'ACKNOWLEDGED'
  | 'PARTIALLY_DELIVERED'
  | 'FULLY_DELIVERED'
  | 'INVOICED'
  | 'PAID'
  | 'DISPUTED';

export interface PurchaseOrderStatusChangedPayload {
  po_id: string;
  from_status: PoStatus;
  to_status: PoStatus;
}

export type PurchaseOrderStatusChangedEvent = BaseEventEnvelope<PurchaseOrderStatusChangedPayload>;
