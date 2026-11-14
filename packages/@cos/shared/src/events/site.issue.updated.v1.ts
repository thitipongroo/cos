// Canonical event: site.issue.updated.v1
// An issue was edited through PATCH /site/issues/:id (field-level merge: description, severity,
// status, assignee, resolution note). Added 2026-11-14 so the search index follows such edits —
// site.issue.status_changed.v1 covers a status move only, and nothing announced the rest. Not routed
// to notifications.

import type { BaseEventEnvelope } from '@cos/types';

export interface SiteIssueUpdatedPayload {
  issue_id: string; // UUID
  project_id: string; // UUID
}

export type SiteIssueUpdatedEvent = BaseEventEnvelope<SiteIssueUpdatedPayload>;
