// procurement.vendor_invoice.approved.v1 — Phase 5
// Canonical name: procurement.vendor_invoice.approved.v1
// Source: context/00_master_construction_os.md §5 Event Contract #13
import type { BaseEventEnvelope } from '@cos/types';

export interface VendorInvoiceApprovedPayload {
  invoice_id: string;
  po_id: string;
  project_id: string;
  vendor_id: string;
  amount: { amount: string; currency_code: string };
  approved_by: string;
  approved_at: string; // ISO 8601 UTC
  payment_due: string; // YYYY-MM-DD
}

export type VendorInvoiceApprovedEvent = BaseEventEnvelope<VendorInvoiceApprovedPayload>;
