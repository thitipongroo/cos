// SiteOps row types — Phase 6. The DB-row shapes returned by SiteOpsRepository, split out of
// site-ops.repository.ts to keep that file to its query logic. Re-exported from site-ops.repository
// so existing `from './site-ops.repository'` type imports (service, specs) keep resolving.

export interface SiteReportRow {
  report_id: string;
  project_id: string;
  tenant_id: string;
  report_date: Date;
  submitted_by: string;
  status: 'DRAFT' | 'SUBMITTED' | 'ACKNOWLEDGED';
  summary: string | null;
  blockers?: string | null; // spec 11 §474 (optional for back-compat with pre-migration rows)
  weather: string | null;
  manpower_count: number | null;
  client_submitted_at: Date | null;
  server_received_at: Date;
  modified_at: Date;
}

export interface IssueRow {
  issue_id: string;
  issue_number: string | null; // human-readable ISS-<year>-<seq> (ADR-069); NULL for pre-existing rows
  project_id: string;
  tenant_id: string;
  report_id: string | null;
  title: string;
  description: string | null;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  assigned_to: string | null;
  // Who raised it (20260804000004). NULL for every issue created before that migration — audit_logs
  // has no resource_id and the outbox is transient, so those rows cannot be backfilled.
  created_by: string | null;
  resolution_note: string | null;
  client_submitted_at: Date | null;
  modified_at: Date;
  created_at: Date;
}

export interface InspectionRow {
  inspection_id: string;
  project_id: string;
  tenant_id: string;
  checklist_id: string;
  status: 'PENDING' | 'PASSED' | 'FAILED' | 'REQUIRES_REINSPECTION';
  inspected_by: string;
  inspected_at: Date;
  notes: string | null;
  // spec 11 §517 — nullable; populated when result is FAILED/conditional (optional for back-compat).
  issue_severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
}

export interface SafetyChecklistRow {
  checklist_id: string;
  project_id: string;
  tenant_id: string;
  checklist_name: string;
  version: number;
  items: unknown; // JSONB
  created_at: Date;
}

export interface ManpowerLogRow {
  log_id: string;
  report_id: string;
  tenant_id: string;
  trade_type: string;
  worker_count: number;
  hours_worked: string; // DECIMAL as string
}

export interface MaterialConsumptionRow {
  consumption_id: string;
  project_id: string;
  tenant_id: string;
  report_id: string | null;
  material_name: string;
  material_id: string;
  task_id: string | null;
  quantity: string; // DECIMAL as string
  unit: string;
  consumed_by: string;
  consumed_at: Date;
  created_at: Date;
}

/** site_ops.carbon_records — embodied carbon derived from a material consumption (§33.4). */
export interface CarbonRecordRow {
  carbon_record_id: string;
  tenant_id: string;
  project_id: string;
  consumption_id: string;
  material_id: string;
  quantity_consumed: string; // DECIMAL as string
  unit: string;
  carbon_factor: string; // DECIMAL as string
  carbon_factor_source: string;
  carbon_kgco2e: string; // DECIMAL as string
  recorded_at: Date;
}

export interface ConflictRecordRow {
  conflict_id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  client_payload: unknown; // JSONB
  server_payload: unknown; // JSONB
  conflict_type: 'FIELD_CONFLICT' | 'STATUS_CONFLICT' | 'REJECTED';
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
}
