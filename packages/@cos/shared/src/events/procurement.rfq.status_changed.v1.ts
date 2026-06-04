// procurement.rfq.status_changed.v1 — Phase 5
// Canonical name: procurement.rfq.status_changed.v1
// Source: context/00_master_construction_os.md §5 (Kafka events list)
import type { BaseEventEnvelope } from '@cos/types';

export type RfqStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'EVALUATED' | 'AWARDED' | 'CANCELLED';

export interface RfqStatusChangedPayload {
  rfq_id: string;
  from_status: RfqStatus;
  to_status: RfqStatus;
}

export type RfqStatusChangedEvent = BaseEventEnvelope<RfqStatusChangedPayload>;
