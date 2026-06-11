// equipment.unit.returned.v1 — Phase 21 Equipment Service
// Emitted when a piece of equipment is returned from a project.
import type { BaseEventEnvelope } from '@cos/types';

export interface EquipmentUnitReturnedPayload {
  equipment_id: string;
  project_id: string;
}

export type EquipmentUnitReturnedEvent = BaseEventEnvelope<EquipmentUnitReturnedPayload>;
