// procurement.vendor_invoice.received.v1 — Phase 5
// Canonical name: procurement.vendor_invoice.received.v1
// Source: context/00_master_construction_os.md §5 Event Contract #4
import type { BaseEventEnvelope } from '@cos/types';

export interface VendorInvoiceReceivedPayload {
  invoice_id: string;
  po_id: string;
  project_id: string;
  vendor_id: string;
  amount: { amount: string; currency_code: string };
  invoice_date: string; // YYYY-MM-DD
  due_date: string; // YYYY-MM-DD
}

export type VendorInvoiceReceivedEvent = BaseEventEnvelope<VendorInvoiceReceivedPayload>;
