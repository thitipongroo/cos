// Canonical event: construction.project.created.v1
// Source: context/00_master_construction_os.md §6 Event #1

import type { BaseEventEnvelope } from '@cos/types';

export interface ProjectCreatedPayload {
  project_id: string; // UUID
  project_code: string;
  project_name: string;
  project_type: 'RESIDENTIAL' | 'COMMERCIAL' | 'INFRASTRUCTURE' | 'INDUSTRIAL';
  budget: { amount: string; currency_code: string }; // amount: decimal string (never float)
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  created_by: string; // UUID
}

export type ProjectCreatedEvent = BaseEventEnvelope<ProjectCreatedPayload>;
