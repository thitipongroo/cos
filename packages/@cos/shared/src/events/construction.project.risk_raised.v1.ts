// Canonical event: construction.project.risk_raised.v1
// Source: ADR-065 (project risk register §Events)

import type { BaseEventEnvelope } from '@cos/types';

export type RiskCategory = 'SAFETY' | 'FINANCIAL' | 'SCHEDULE' | 'TECHNICAL' | 'EXTERNAL' | 'OTHER';
export type RiskSource = 'MANUAL' | 'AI_SUGGESTED';

export interface ProjectRiskRaisedPayload {
  project_id: string; // UUID
  risk_id: string; // UUID
  title: string;
  category: RiskCategory;
  likelihood: number; // 1–5
  impact: number; // 1–5
  risk_score: number; // likelihood * impact (1–25)
  source: RiskSource;
}

export type ProjectRiskRaisedEvent = BaseEventEnvelope<ProjectRiskRaisedPayload>;
