// Finance row types — Phase 7. The DB-row shapes returned by FinanceRepository, split out of
// finance.repository.ts to keep that file to its query logic. Re-exported from finance.repository so
// existing `from './finance.repository'` type imports keep resolving. Financial fields are stored as
// DECIMAL(19,4) and returned as string by Prisma.

export interface ProjectBudgetRow {
  budget_id: string;
  project_id: string;
  tenant_id: string;
  total_budget_amount: string;
  total_budget_currency: string;
  allocated_amount: string;
  committed_amount: string;
  actual_amount: string;
  variance_alert_threshold: string;
  created_at: Date;
  updated_at: Date;
}

export interface BudgetLineRow {
  line_id: string;
  budget_id: string;
  project_id: string;
  tenant_id: string;
  boq_category_id: string | null;
  line_name: string;
  allocated_amount: string;
  currency_code: string;
  created_at: Date;
}

export interface CostTransactionRow {
  transaction_id: string;
  project_id: string;
  tenant_id: string;
  source_type: 'PURCHASE_ORDER' | 'INVOICE' | 'ADJUSTMENT';
  source_id: string;
  budget_line_id: string | null;
  amount: string;
  currency_code: string;
  transaction_date: Date;
  description: string | null;
  recorded_at: Date;
  recorded_by: string | null;
}

export interface PaymentRow {
  payment_id: string;
  invoice_id: string;
  project_id: string;
  tenant_id: string;
  amount: string;
  currency_code: string;
  payment_date: Date;
  payment_reference: string | null;
  wht_certificate_ref: string | null;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  recorded_by: string;
  created_at: Date;
}

export interface WhtRuleRow {
  rule_id: string;
  tenant_id: string;
  jurisdiction_code: string;
  service_type: string;
  rate: string; // DECIMAL returned as string by Prisma
  is_active: boolean;
}

// AR Billing increment (§11) ─────────────────────────────────────────────────

export interface CustomerRow {
  customer_id: string;
  tenant_id: string;
  opportunity_id: string | null;
  company_name: string;
  customer_type: string | null;
  status: string;
  created_at: Date;
}

export interface ContractRow {
  contract_id: string;
  tenant_id: string;
  project_id: string;
  contract_type: 'MAIN_CONTRACT' | 'SUBCONTRACT' | 'SUPPLY_AGREEMENT';
  contract_value: string | null;
  customer_id: string | null;
  vendor_id: string | null;
  status: string;
  signed_document_id: string | null;
  terms: string | null;
  created_at: Date;
}

/** One materialized BOQ line (ADR-058 CT-2c-2) — carried by construction.boq.items_published.v1. */
export interface BoqSnapshotItem {
  item_code: string | null;
  description: string;
  unit: string;
  quantity: string;
  unit_cost: string;
  estimated_total: string;
}

export type SignerParty = 'INTERNAL' | 'CLIENT';
export type SignatureVerificationStatus = 'VERIFIED' | 'PENDING' | 'FAILED';

export interface ContractSignatureRow {
  signature_id: string;
  tenant_id: string;
  contract_id: string;
  signer_party: SignerParty;
  signer_identity: unknown;
  credential_ref: string | null;
  document_hash: string;
  signed_at: Date;
  ip_address: string | null;
  magic_link_token_id: string | null;
  verification_status: SignatureVerificationStatus;
  created_at: Date;
}

export interface ContractSignTokenRow {
  token_id: string;
  tenant_id: string;
  contract_id: string;
  token_hash: string;
  invited_name: string | null;
  invited_email: string | null;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export interface BillingRow {
  billing_id: string;
  tenant_id: string;
  project_id: string;
  contract_id: string;
  billing_number: string;
  amount: string;
  due_date: Date;
  status: 'DRAFT' | 'ISSUED' | 'PAID';
  issued_at: Date | null;
  approved_by: string | null;
  created_at: Date;
}

export interface ArReceiptRow {
  ar_receipt_id: string;
  tenant_id: string;
  project_id: string;
  billing_id: string;
  customer_id: string;
  amount_received: string;
  received_date: Date;
  payment_method: string | null;
  payment_reference: string | null;
  received_by: string;
  created_at: Date;
}

/** A dated amount feeding the direct-method cash flow forecast. */
export interface CashflowDueRow {
  due_date: Date;
  amount: string;
}
