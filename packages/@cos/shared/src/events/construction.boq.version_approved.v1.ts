// construction.boq.version_approved.v1 — Phase 4 BOQ Service
// Emitted when a BOQ version moves from DRAFT → APPROVED.
// Source: context/00_master_construction_os.md §Phase 4 Kafka event producers

import type { BaseEventEnvelope } from '@cos/types';

export interface BoqVersionApprovedPayload {
  version_id: string;
  project_id: string;
  version_number: number;
  total_estimated_amount: string; // decimal string — never float
  total_estimated_currency: string; // ISO 4217
  approved_by: string; // UUID of approver
}

export type BoqVersionApprovedEvent = BaseEventEnvelope<BoqVersionApprovedPayload>;
