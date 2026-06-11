// equipment.unit.assigned.v1 — Phase 21 Equipment Service
// Emitted when a piece of equipment is assigned to a project.
import type { BaseEventEnvelope } from '@cos/types';

export interface EquipmentUnitAssignedPayload {
  equipment_id: string;
  project_id: string;
  assigned_by: string;
}

export type EquipmentUnitAssignedEvent = BaseEventEnvelope<EquipmentUnitAssignedPayload>;
