import type { BaseEventEnvelope } from '@cos/types';

export interface BoqCreatedPayload {
  project_id: string;
  version_id: string;
  version_number: number;
}

export type BoqCreatedEvent = BaseEventEnvelope<BoqCreatedPayload>;
