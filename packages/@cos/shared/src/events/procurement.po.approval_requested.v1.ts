// procurement.po.approval_requested.v1 — Phase 5
// Canonical name: procurement.po.approval_requested.v1
// Emitted by the PO Temporal workflow (notifyApprover activity) when a purchase order
// enters an approval tier (or is escalated on timeout); consumed by the Notification
// Service, which alerts the specific approver named in `approver_id`.
import type { BaseEventEnvelope } from '@cos/types';

export interface PurchaseOrderApprovalRequestedPayload {
  po_id: string;
  project_id: string;
  approver_id: string;
  tier: string;
  po_number: string;
  total_amount: string;
  currency_code: string;
}

export type PurchaseOrderApprovalRequestedEvent =
  BaseEventEnvelope<PurchaseOrderApprovalRequestedPayload>;
