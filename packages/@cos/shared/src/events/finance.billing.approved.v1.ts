// finance.billing.approved.v1 — Phase 7 Finance Service (AR Client Billing approval, §15)
import type { BaseEventEnvelope } from '@cos/types';

export interface BillingApprovedPayload {
  billing_id: string;
  project_id: string;
  contract_id: string;
  amount: string; // decimal string — never float
  approved_by: string;
  tier: string; // PM | EXECUTIVE | TENANT_ADMIN
}

export type BillingApprovedEvent = BaseEventEnvelope<BillingApprovedPayload>;
