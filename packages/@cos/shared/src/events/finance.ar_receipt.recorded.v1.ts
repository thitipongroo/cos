// finance.ar_receipt.recorded.v1 — Phase 7 Finance Service (an AR receipt recorded; one per receipt — the billing
// turns PAID when its receipts reach its amount, plan DF)
import type { BaseEventEnvelope } from '@cos/types';

export interface ArReceiptRecordedPayload {
  ar_receipt_id: string;
  billing_id: string;
  project_id: string;
  amount_received: string; // decimal string — never float
  /** The billing after this receipt (plan DF): ISSUED while part-received, PAID once fully received. */
  billing_status?: 'ISSUED' | 'PAID' | null;
}

export type ArReceiptRecordedEvent = BaseEventEnvelope<ArReceiptRecordedPayload>;
