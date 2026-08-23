// procurement.purchase_order.created.v1 — Phase 5
// Canonical name: procurement.purchase_order.created.v1
// Source: context/00_master_construction_os.md §5 Event Contract #3
import type { BaseEventEnvelope } from '@cos/types';

export interface PoLineItemPayload {
  item_id: string;
  quantity: string; // DECIMAL(10,4) as string
  unit: string;
  unit_price: string; // DECIMAL(19,4) as string
  /**
   * The BOQ item this line was ordered against, when the buyer linked one.
   *
   * Added 2026-08-23 so Finance can attribute the resulting cost transaction to a budget line
   * (TDD OQ-50): `boq_items.category_id` → `finance.budget_lines.boq_category_id`. Without it the
   * cost ledger knows a PO's total and nothing about which part of the budget it consumes — and
   * `finance.cost_transactions.budget_line_id`, which already exists, was written NULL every time.
   *
   * Nullable with an Avro default, so the schema change is BACKWARD_TRANSITIVE: a line ordered
   * outside the BOQ genuinely has none, and older events decode with null rather than failing.
   */
  boq_item_id: string | null;
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
