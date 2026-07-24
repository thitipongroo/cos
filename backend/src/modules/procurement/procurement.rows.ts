// Procurement row types — Phase 5. The DB-row shapes returned by ProcurementRepository, split out of
// procurement.repository.ts to keep that file to its query logic. Re-exported from
// procurement.repository so existing `from './procurement.repository'` type imports keep resolving.
// Financial fields are stored as DECIMAL(19,4) and returned as string by Prisma for precision.

export interface VendorRow {
  vendor_id: string;
  tenant_id: string;
  vendor_code: string;
  vendor_name: string;
  tax_id: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PurchaseRequestRow {
  pr_id: string;
  project_id: string;
  tenant_id: string;
  pr_number: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PO_CREATED';
  requested_by: string;
  required_date: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface RfqRow {
  rfq_id: string;
  pr_id: string | null;
  project_id: string;
  tenant_id: string;
  rfq_number: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'EVALUATED' | 'AWARDED' | 'CANCELLED';
  deadline: Date;
  temporal_workflow_id: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface QuotationRow {
  quotation_id: string;
  rfq_id: string;
  vendor_id: string;
  tenant_id: string;
  total_amount: string;
  currency_code: string;
  validity_days: number;
  submitted_at: Date;
  is_selected: boolean;
}

export interface PurchaseOrderRow {
  po_id: string;
  rfq_id: string | null;
  vendor_id: string;
  project_id: string;
  tenant_id: string;
  po_number: string;
  status:
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
  total_amount: string;
  currency_code: string;
  delivery_date: Date;
  temporal_workflow_id: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface PoLineItemRow {
  line_id: string;
  po_id: string;
  tenant_id: string;
  boq_item_id: string | null;
  description: string;
  quantity: string;
  unit: string;
  unit_price: string;
  line_total: string;
}

export interface DeliveryRow {
  delivery_id: string;
  po_id: string;
  tenant_id: string;
  delivery_note: string | null;
  delivered_at: Date;
  received_by: string;
  notes: string | null;
}

export interface DeliveryItemRow {
  delivery_item_id: string;
  delivery_id: string;
  line_id: string;
  tenant_id: string;
  quantity_received: string;
}

export interface InvoiceRow {
  invoice_id: string;
  po_id: string;
  vendor_id: string;
  tenant_id: string;
  invoice_number: string;
  amount: string;
  currency_code: string;
  invoice_date: Date;
  due_date: Date;
  status: 'RECEIVED' | 'VERIFIED' | 'APPROVED' | 'PAID' | 'DISPUTED';
  file_id: string | null;
  note?: string | null; // G-M14 (optional for back-compat with pre-migration rows)
}
