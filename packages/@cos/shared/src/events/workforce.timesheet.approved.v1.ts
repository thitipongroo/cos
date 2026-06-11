// workforce.timesheet.approved.v1 — Phase 22 Workforce Service
// Emitted when a timesheet is approved by a SITE_ENGINEER.
import type { BaseEventEnvelope } from '@cos/types';

export interface WorkforceTimesheetApprovedPayload {
  worker_id: string;
  project_id: string;
  period_date: string; // ISO 8601 date (YYYY-MM-DD)
  total_hours: number;
}

export type WorkforceTimesheetApprovedEvent = BaseEventEnvelope<WorkforceTimesheetApprovedPayload>;
