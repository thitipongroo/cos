// workforce.checkin.created.v1 — Phase 22 Workforce Service
// Emitted when a worker checks in to a project.
import type { BaseEventEnvelope } from '@cos/types';

export interface WorkforceCheckinCreatedPayload {
  worker_id: string;
  project_id: string;
  checked_in_at: string; // ISO 8601 timestamp
}

export type WorkforceCheckinCreatedEvent = BaseEventEnvelope<WorkforceCheckinCreatedPayload>;
