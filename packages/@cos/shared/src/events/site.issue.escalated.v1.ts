// site.issue.escalated.v1 — Phase 6 Site Operations
// Shape mirrors src/avro/site.issue.escalated.v1.avsc.
import type { BaseEventEnvelope } from '@cos/types';

/** Avro enum IssueEscalatedSeverity — the symbol order is part of the schema; never reorder it. */
export type IssueEscalatedSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface IssueEscalatedPayload {
  issue_id: string;
  project_id: string;
  title: string;
  severity: IssueEscalatedSeverity;
  escalated_by: string;
}

export type IssueEscalatedEvent = BaseEventEnvelope<IssueEscalatedPayload>;
