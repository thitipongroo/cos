// Safety API client — the four `/api/v1/safety/*` endpoints the SAFETY_OFFICER screens read
// (backend `modules/safety/safety.controller.ts`, ADR-027; spec §14 Safety APIs, §20.7.7).
//
// Reads use `get()` so they simply fail offline and the caller keeps its last value / local cache —
// none of these is a write, so there is nothing to queue. The two permit decisions use `patch()`,
// which NEVER enqueues: a permit approval replayed hours later would act on a state the approver did
// not see, and the server rejects a second attempt anyway (COS-SAFE-003, "only PENDING permits can
// be approved"). Creating an incident stays on `mutate()` in the screen that owns it — that one IS
// offline-writable (§17.4 lists safety incidents as offline read/write, §17.6 flushes them first).

import { get, patch, post } from './client';

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

/** `site_ops.incidents` as `GET /safety/incidents` returns it. Every field is a real column. */
export interface IncidentRow {
  incident_id: string;
  project_id: string;
  task_id: string | null;
  incident_type: string;
  severity: IncidentSeverity;
  reported_by: string;
  status: IncidentStatus;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

export type PermitType = 'WORK_PERMIT' | 'SAFETY_PERMIT' | 'DRAWING_APPROVAL' | 'ENTRY_PERMIT';
export type PermitStatus = 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';

/** `site_ops.permits` as `GET /safety/permits` returns it. */
export interface PermitRow {
  permit_id: string;
  project_id: string;
  permit_type: PermitType;
  permit_number: string;
  issued_by: string | null;
  valid_from: string | null;
  valid_until: string | null;
  status: PermitStatus;
  linked_task_id: string | null;
  created_by: string | null;
  created_at: string;
  /**
   * The three columns added 2026-08-13 for the permit screens
   * (migration 20260813000001_add_contractor_description_reason_to_permits).
   *
   * `contractor_name` is the firm doing the work — free text, NOT a vendor reference. `revoke_reason`
   * is set only when a permit is rejected, and is null when the approver gave none.
   */
  contractor_name: string | null;
  description: string | null;
  revoke_reason: string | null;
}

/**
 * `GET /safety/compliance` — FOUR COUNTS, and no percentage.
 *
 * Worth stating because the Home mockup draws a "Compliance 94%" dial: there is no compliance SCORE
 * anywhere in this platform. This is what the endpoint really answers, and the screens print these.
 */
export interface ComplianceSummary {
  open_incidents: number;
  high_critical_incidents: number;
  expired_permits: number;
  revoked_permits: number;
}

/** A list endpoint that may answer `T[]` or `{ items: T[] }` — both shapes are in use. */
function asList<T>(res: { items?: T[] } | T[]): T[] {
  return Array.isArray(res) ? res : (res.items ?? []);
}

export async function getCompliance(projectId?: string): Promise<ComplianceSummary> {
  return get<ComplianceSummary>('/safety/compliance', projectId ? { project_id: projectId } : {});
}

export async function listIncidents(params?: {
  projectId?: string;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
}): Promise<IncidentRow[]> {
  const query: Record<string, string> = {};
  if (params?.projectId) query['project_id'] = params.projectId;
  if (params?.status) query['status'] = params.status;
  if (params?.severity) query['severity'] = params.severity;
  return asList(await get<{ items?: IncidentRow[] } | IncidentRow[]>('/safety/incidents', query));
}

/** OPEN → IN_PROGRESS, recording who acknowledged it. Online-only, by design (see the header). */
export async function acknowledgeIncident(incidentId: string): Promise<IncidentRow> {
  return patch<IncidentRow>(`/safety/incidents/${incidentId}/acknowledge`, {});
}

export async function listPermits(params?: {
  projectId?: string;
  status?: PermitStatus;
}): Promise<PermitRow[]> {
  const query: Record<string, string> = {};
  if (params?.projectId) query['project_id'] = params.projectId;
  if (params?.status) query['status'] = params.status;
  return asList(await get<{ items?: PermitRow[] } | PermitRow[]>('/safety/permits', query));
}

export async function createPermit(body: {
  project_id: string;
  permit_type: PermitType;
  permit_number: string;
  valid_from?: string;
  valid_until?: string;
  contractor_name?: string;
  description?: string;
}): Promise<PermitRow> {
  return post<PermitRow>('/safety/permits', body);
}

/**
 * PENDING → ACTIVE.
 *
 * `tier` is the approver's own tier (§15.5). This app only ever sends `SAFETY_OFFICER`, and the
 * server REFUSES that tier on a `SAFETY_PERMIT` (COS-SAFE-004 — "Safety permits require PM (final)
 * approval", master §9's chain). The screen therefore does not offer the action on those rows at
 * all: see `canSafetyOfficerApprove()` in lib/safetyOfficer.ts.
 */
export async function approvePermit(permitId: string): Promise<PermitRow> {
  return patch<PermitRow>(`/safety/permits/${permitId}/approve`, { tier: 'SAFETY_OFFICER' });
}

/**
 * PENDING → REVOKED.
 *
 * `reason` is optional on the endpoint (added 2026-08-13, non-breaking per QM-2) and is sent only
 * when one was given — an empty `reason` key would store '' and read as a blank reason rather than
 * as none.
 */
export async function rejectPermit(permitId: string, reason?: string): Promise<PermitRow> {
  return patch<PermitRow>(
    `/safety/permits/${permitId}/reject`,
    reason === undefined || reason === '' ? {} : { reason },
  );
}
