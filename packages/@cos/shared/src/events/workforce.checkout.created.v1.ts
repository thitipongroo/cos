// workforce.checkout.created.v1 — Phase 22 Workforce Service
// Emitted when a worker checks out of a project.
import type { BaseEventEnvelope } from '@cos/types';

export interface WorkforceCheckoutCreatedPayload {
  worker_id: string;
  project_id: string;
  hours_worked: number | null;
}

export type WorkforceCheckoutCreatedEvent = BaseEventEnvelope<WorkforceCheckoutCreatedPayload>;
