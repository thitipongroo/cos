import type { BaseEventEnvelope } from '@cos/types';

export interface BoqUpdatedPayload {
  version_id: string;
  project_id: string;
  changed_items_count: number;
  new_total_estimated_amount: string;
  new_total_estimated_currency: string;
}

export type BoqUpdatedEvent = BaseEventEnvelope<BoqUpdatedPayload>;
