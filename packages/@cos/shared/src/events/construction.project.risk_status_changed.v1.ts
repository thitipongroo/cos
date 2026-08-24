// Canonical event: construction.project.risk_status_changed.v1
// Source: ADR-065 (project risk register §Events)

import type { BaseEventEnvelope } from '@cos/types';

export type RiskStatus = 'OPEN' | 'MITIGATING' | 'CLOSED' | 'ACCEPTED';

export interface ProjectRiskStatusChangedPayload {
  project_id: string; // UUID
  risk_id: string; // UUID
  from_status: RiskStatus;
  to_status: RiskStatus;
}

export type ProjectRiskStatusChangedEvent = BaseEventEnvelope<ProjectRiskStatusChangedPayload>;
