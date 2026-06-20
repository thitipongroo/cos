// finance.ar_receipt.recorded.v1 — Phase 7 Finance Service (AR Receipt; settles a billing to PAID)
import type { BaseEventEnvelope } from '@cos/types';

export interface ArReceiptRecordedPayload {
  ar_receipt_id: string;
  billing_id: string;
  project_id: string;
  amount_received: string; // decimal string — never float
}

export type ArReceiptRecordedEvent = BaseEventEnvelope<ArReceiptRecordedPayload>;
