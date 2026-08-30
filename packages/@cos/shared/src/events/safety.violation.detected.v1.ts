// safety.violation.detected.v1 — Phase 23 (MLOps).
// The SafetyViolationDetected of 16-enterprise-event-flow §Safety and of §19.6's "cannot be
// disabled" pair; canonical name minted 2026-08-25 alongside SafetyVisionModel, the only detector of
// a violation in the specification. Payload table: spec §32.4 row 22.
// Shape mirrors src/avro/safety.violation.detected.v1.avsc.
import type { BaseEventEnvelope } from '@cos/types';

/** Avro enum ViolationSeverity — same symbols as IncidentSeverity; never reorder them. */
export type ViolationSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SafetyViolationDetectedPayload {
  violation_id: string;
  project_id: string;
  /** The analysed site photo — SafetyVisionModel.analyze takes an image. */
  file_id: string;
  /** SafetyAnalysisResult.violations. */
  violations: string[];
  /** DECIMAL string, not a float — matches ai.risk_prediction.generated.v1 and master:990. */
  confidence: string;
  severity: ViolationSeverity;
}

export type SafetyViolationDetectedEvent = BaseEventEnvelope<SafetyViolationDetectedPayload>;
