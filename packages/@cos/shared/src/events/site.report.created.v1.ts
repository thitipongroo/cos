// Canonical event: site.report.created.v1
// Source: context/00_master_construction_os.md §6 Event #5

import type { BaseEventEnvelope } from '@cos/types';

export interface SiteReportCreatedPayload {
  report_id: string; // UUID
  project_id: string; // UUID
  report_date: string; // YYYY-MM-DD
  submitted_by: string; // UUID
  summary: string; // max 2000 chars
  issue_count: number;
  photo_count: number;
}

export type SiteReportCreatedEvent = BaseEventEnvelope<SiteReportCreatedPayload>;
