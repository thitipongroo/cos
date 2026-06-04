// Canonical event: site.issue.created.v1
// Source: context/00_master_construction_os.md §Phase 6 Kafka event producers

import type { BaseEventEnvelope } from '@cos/types';

export interface IssueCreatedPayload {
  issue_id: string; // UUID
  project_id: string; // UUID
  report_id: string | null; // UUID — nullable
  title: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  created_by: string; // UUID
}

export type IssueCreatedEvent = BaseEventEnvelope<IssueCreatedPayload>;
