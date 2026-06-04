// Canonical event: site.issue.status_changed.v1
// Source: context/00_master_construction_os.md §Phase 6 Kafka event producers

import type { BaseEventEnvelope } from '@cos/types';

export interface IssueStatusChangedPayload {
  issue_id: string; // UUID
  project_id: string; // UUID
  from_status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  to_status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
}

export type IssueStatusChangedEvent = BaseEventEnvelope<IssueStatusChangedPayload>;
