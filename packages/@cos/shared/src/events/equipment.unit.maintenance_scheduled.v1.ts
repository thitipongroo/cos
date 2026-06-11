// equipment.unit.maintenance_scheduled.v1 — Phase 21 Equipment Service
// Emitted when maintenance is scheduled for a piece of equipment.
import type { BaseEventEnvelope } from '@cos/types';

export interface EquipmentUnitMaintenanceScheduledPayload {
  equipment_id: string;
  scheduled_at: string; // ISO 8601 timestamp
}

export type EquipmentUnitMaintenanceScheduledEvent =
  BaseEventEnvelope<EquipmentUnitMaintenanceScheduledPayload>;
