// Canonical event: site.report.submitted.v1
// Source: context/00_master_construction_os.md §Phase 6 Kafka event producers

import type { BaseEventEnvelope } from '@cos/types';

export interface SiteReportSubmittedPayload {
  report_id: string; // UUID
  project_id: string; // UUID
  report_date: string; // YYYY-MM-DD
  submitted_by: string; // UUID
}

export type SiteReportSubmittedEvent = BaseEventEnvelope<SiteReportSubmittedPayload>;
