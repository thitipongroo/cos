// procurement.rfq.created.v1 — Phase 5
// Canonical name: procurement.rfq.created.v1
// Source: context/00_master_construction_os.md §5 (Kafka events list) + spec §32.4
import type { BaseEventEnvelope } from '@cos/types';

export interface RfqCreatedPayload {
  rfq_id: string;
  pr_id: string | null;
  project_id: string;
  rfq_number: string;
  deadline: string; // ISO 8601 UTC
  created_by: string;
}

export type RfqCreatedEvent = BaseEventEnvelope<RfqCreatedPayload>;
