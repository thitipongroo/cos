// finance.payment.processed.v1 — Phase 7 Finance Service
import type { BaseEventEnvelope } from '@cos/types';

export interface PaymentProcessedPayload {
  project_id: string;
  payment_id: string;
  invoice_id: string;
  amount: string; // decimal string — never float
  currency_code: string; // ISO 4217
  payment_date: string; // YYYY-MM-DD
}

export type PaymentProcessedEvent = BaseEventEnvelope<PaymentProcessedPayload>;
