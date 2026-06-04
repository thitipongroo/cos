// finance.variance.alert.v1 — Phase 7 Finance Service
// Emitted when (actual + committed) exceeds budget by > variance_alert_threshold %.
import type { BaseEventEnvelope } from '@cos/types';

export interface VarianceAlertPayload {
  project_id: string;
  budget_id: string;
  variance_percentage: string; // decimal string
  threshold_exceeded: string; // threshold that was breached
  actual_amount: string;
  committed_amount: string;
  allocated_amount: string;
  currency_code: string;
}

export type VarianceAlertEvent = BaseEventEnvelope<VarianceAlertPayload>;
