// finance.budget.created.v1 — Phase 7 Finance Service
import type { BaseEventEnvelope } from '@cos/types';

export interface BudgetCreatedPayload {
  project_id: string;
  budget_id: string;
  total_budget_amount: string; // decimal string — never float
  total_budget_currency: string; // ISO 4217
}

export type BudgetCreatedEvent = BaseEventEnvelope<BudgetCreatedPayload>;
