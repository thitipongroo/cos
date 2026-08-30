// safety.incident.created.v1 — Phase 6 Site Operations
// Consumed by the Notification Service for §19.3 escalation.
// Shape mirrors src/avro/safety.incident.created.v1.avsc.
import type { BaseEventEnvelope } from '@cos/types';

/** Avro enum IncidentSeverity — the symbol order is part of the schema; never reorder it. */
export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SafetyIncidentCreatedPayload {
  incident_id: string;
  project_id: string;
  incident_type: string;
  severity: IncidentSeverity;
  /** Optional in the schema (["null","string"], default null) — not every incident sits on a task. */
  task_id: string | null;
  reported_by: string;
}

export type SafetyIncidentCreatedEvent = BaseEventEnvelope<SafetyIncidentCreatedPayload>;
