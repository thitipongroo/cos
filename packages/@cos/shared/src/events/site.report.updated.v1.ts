// Canonical event: site.report.updated.v1
// A site report was edited through offline sync (an id-hit edit, or a new save of a day that already
// had a report). Added 2026-11-14 so the search index follows such edits: site.report.created.v1
// notifies the project manager and site.report.submitted.v1 is counted once per report by the
// analytics worker, so neither may mark an edit. Not routed to notifications.

import type { BaseEventEnvelope } from '@cos/types';

export interface SiteReportUpdatedPayload {
  report_id: string; // UUID
  project_id: string; // UUID
  report_date: string; // YYYY-MM-DD
  submitted_by: string; // UUID
}

export type SiteReportUpdatedEvent = BaseEventEnvelope<SiteReportUpdatedPayload>;
