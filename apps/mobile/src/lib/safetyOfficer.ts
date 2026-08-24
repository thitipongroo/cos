// Pure display rules for the SAFETY_OFFICER screens (Home · Incidents · Checklists · Permits).
//
// In `src/lib/` for the reason every sibling here is — no React, no expo-router, so it is unit
// testable and inside the 100 %-line/branch coverage scope (QM-1) that a screen file cannot easily
// reach.
//
// Every function below answers a question the DATA can actually answer. Where the mockups draw
// something the platform has no source for — a compliance percentage, safe-hours-since-last-LTI, an
// AI risk score on an incident — there is deliberately no helper here to compute it: the screens
// draw those panels and say they are not available yet (PO decision 2026-08-13), rather than a
// number being invented in this file.

import type {
  IncidentRow,
  IncidentSeverity,
  PermitRow,
  PermitStatus,
  PermitType,
} from '../api/safety';

/** Which palette role a value takes. Resolved to a colour by the screen, so this stays pure. */
export type Tone = 'danger' | 'warning' | 'success' | 'muted';

/**
 * Severity → tone. HIGH and CRITICAL share `danger` because §14's own compliance query does:
 * `high_critical_incidents` counts them together as the ones that need attention now.
 */
export function severityTone(severity: string): Tone {
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'danger';
  if (severity === 'MEDIUM') return 'warning';
  return 'muted';
}

/** Incident status → tone. OPEN is the alarming one; anything closed out is settled. */
export function incidentStatusTone(status: string): Tone {
  if (status === 'OPEN') return 'danger';
  if (status === 'IN_PROGRESS') return 'warning';
  if (status === 'RESOLVED' || status === 'CLOSED') return 'success';
  return 'muted';
}

/** Permit status → tone. EXPIRED and REVOKED are what `GET /safety/compliance` counts as bad. */
export function permitStatusTone(status: PermitStatus | string): Tone {
  if (status === 'ACTIVE') return 'success';
  if (status === 'PENDING') return 'warning';
  if (status === 'EXPIRED' || status === 'REVOKED') return 'danger';
  return 'muted';
}

/**
 * How long ago something happened, to the minute.
 *
 * NOT `waitingAge()` from the approvals queue, and the difference is deliberate. That helper buckets
 * anything under an hour as "just now" because the gap between 14 and 38 minutes changes no decision
 * about a purchase order. On a safety incident it changes the decision: §19.3 escalates an
 * unacknowledged incident to the PM at THIRTY MINUTES, so the minutes are the number being watched —
 * and the mockups print them ("22m ago", "12m ago", "45m ago") for the same reason.
 *
 * A future timestamp (device/server clock skew) reads as 0 minutes rather than a negative age.
 */
export type IncidentAge =
  | { unit: 'minutes'; value: number }
  | { unit: 'hours'; value: number }
  | { unit: 'days'; value: number };

export function incidentAge(since: string | null | undefined, now: Date): IncidentAge | null {
  if (since == null || since === '') return null;
  const at = new Date(since).getTime();
  if (Number.isNaN(at)) return null;
  const minutes = Math.max(0, Math.floor((now.getTime() - at) / 60_000));
  if (minutes < 60) return { unit: 'minutes', value: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: 'hours', value: hours };
  return { unit: 'days', value: Math.floor(hours / 24) };
}

/** The i18n key `incidentAge` maps to, so a caller never branches on the unit itself. */
export function incidentAgeKey(age: IncidentAge): string {
  return `safety.age.${age.unit}`;
}

/**
 * §19.3 — a safety incident unacknowledged for 30 minutes escalates to the PM.
 *
 * The one deadline this product really has on an incident, so the card marks it rather than leaving
 * the reader to do the subtraction. Only OPEN rows can be overdue: IN_PROGRESS means it was
 * acknowledged, which is the event that stops this clock.
 */
export const ACKNOWLEDGEMENT_SLA_MINUTES = 30;

export function acknowledgementOverdue(incident: IncidentRow, now: Date): boolean {
  if (incident.status !== 'OPEN') return false;
  const age = incidentAge(incident.created_at, now);
  return age !== null && (age.unit !== 'minutes' || age.value >= ACKNOWLEDGEMENT_SLA_MINUTES);
}

/**
 * The incident feed's filter pills (mockup 02_sa_incident_dashboard).
 *
 * The drawing shows four: All Active · Critical · Near Miss · PPE Violation. Only the first two are
 * QUERIES this platform can run — `GET /safety/incidents` filters on `status` and `severity`, and
 * both are real enums. "Near Miss" and "PPE Violation" are incident TYPES, and `incident_type` is a
 * free-text column with no enum in §11, §14 or anywhere in `docs/specifications/`: matching those
 * two English strings against free text would return nothing for a Thai-language tenant while
 * looking like a working filter.
 *
 * So they are drawn — the product owner's ruling for every unbacked mockup element on these screens
 * is to draw it and say plainly that it is not ready — and marked `available: false`, which the
 * screen renders as a dimmed pill that explains itself instead of filtering.
 */
export interface IncidentFilter {
  id: 'all' | 'critical' | 'near-miss' | 'ppe';
  labelKey: string;
  available: boolean;
}

export const INCIDENT_FILTERS: readonly IncidentFilter[] = [
  { id: 'all', labelKey: 'safety.incidents.filterAll', available: true },
  { id: 'critical', labelKey: 'safety.incidents.filterCritical', available: true },
  { id: 'near-miss', labelKey: 'safety.incidents.filterNearMiss', available: false },
  { id: 'ppe', labelKey: 'safety.incidents.filterPpe', available: false },
];

/**
 * Apply a filter pill.
 *
 * `all` is "All Active" as the drawing labels it — OPEN and IN_PROGRESS, not everything ever
 * recorded; a feed of closed incidents is a report, not a work queue. `critical` narrows the same
 * set to CRITICAL. An unavailable pill can never be the selection (the screen does not set it), so
 * it falls through to the same active set rather than silently emptying the list.
 */
export function applyIncidentFilter(
  incidents: readonly IncidentRow[],
  filterId: IncidentFilter['id'],
): IncidentRow[] {
  const active = incidents.filter((i) => i.status === 'OPEN' || i.status === 'IN_PROGRESS');
  return filterId === 'critical' ? active.filter((i) => i.severity === 'CRITICAL') : active;
}

/** Severity first, then newest — the order a safety officer reads a feed in. */
const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export function sortIncidents(incidents: readonly IncidentRow[]): IncidentRow[] {
  return [...incidents].sort((a, b) => {
    const bySeverity = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
    if (bySeverity !== 0) return bySeverity;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

/**
 * May THIS role approve this permit?
 *
 * `PATCH /safety/permits/:id/approve` with `tier: 'SAFETY_OFFICER'` is REFUSED on a `SAFETY_PERMIT`
 * — COS-SAFE-004, "Safety permits require PM (final) approval", which is master §9's chain
 * (initiator → Safety Officer → PM final). The screen asks this before drawing the button, so the
 * rule is stated where the reader is rather than arriving as a 403 after they tap.
 *
 * Only a PENDING permit is approvable at all (COS-SAFE-003).
 */
export function canSafetyOfficerApprove(permit: PermitRow): boolean {
  return permit.status === 'PENDING' && permit.permit_type !== 'SAFETY_PERMIT';
}

/** A PENDING permit can always be rejected, including a SAFETY_PERMIT (no tier rule on reject). */
export function canSafetyOfficerReject(permit: PermitRow): boolean {
  return permit.status === 'PENDING';
}

/** Pending first (they need a decision), then newest. */
export function sortPermits(permits: readonly PermitRow[]): PermitRow[] {
  return [...permits].sort((a, b) => {
    const aPending = a.status === 'PENDING' ? 0 : 1;
    const bPending = b.status === 'PENDING' ? 0 : 1;
    if (aPending !== bPending) return aPending - bPending;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

/**
 * The permit dashboard's TYPE tabs (mockup 04_permit_management/01_sa_permit_dashboard).
 *
 * THE DRAWING SHOWS THREE — Work Permits · Safety Permits · Drawing Approvals — and this list has
 * FIVE. The two additions are not embellishment:
 *
 *   ENTRY_PERMIT is the fourth value of the `permit_type` CHECK constraint
 *   (20260619000002_tasks_permits) and of CreatePermitDto's enum. With only the drawn three, an
 *   entry permit would be filed by the request form and then be unreachable on every tab of the
 *   screen that lists permits. That is a defect, not a style difference, and ADR-085 makes the
 *   mockup authoritative for style — not for which rows the product can show.
 *
 *   ALL is the landing tab. A three-tab bar with no "all" forces a reader who does not yet know a
 *   permit's type to visit each tab in turn, and the officer's job here is to find what needs a
 *   decision, which is a question about STATUS, not type.
 */
export interface PermitTypeFilter {
  id: 'all' | PermitType;
  labelKey: string;
}

export const PERMIT_TYPE_FILTERS: readonly PermitTypeFilter[] = [
  { id: 'all', labelKey: 'safety.permits.filterAllTypes' },
  { id: 'WORK_PERMIT', labelKey: 'safety.permits.type.WORK_PERMIT' },
  { id: 'SAFETY_PERMIT', labelKey: 'safety.permits.type.SAFETY_PERMIT' },
  { id: 'DRAWING_APPROVAL', labelKey: 'safety.permits.type.DRAWING_APPROVAL' },
  { id: 'ENTRY_PERMIT', labelKey: 'safety.permits.type.ENTRY_PERMIT' },
];

/**
 * Both filters at once — type tab AND the pending-only pill — then the standard sort.
 *
 * The two are kept because they answer different questions and the screen offers both: the tab is
 * "which kind of permit", the pill is "which ones still need me". The pill predates the drawing and
 * is a real query (`status` is an enum the endpoint filters on), so ADR-085 keeps it: a drawing does
 * not remove reviewed working capability.
 */
export function applyPermitFilters(
  permits: readonly PermitRow[],
  filters: { type: PermitTypeFilter['id']; pendingOnly: boolean },
): PermitRow[] {
  const byType =
    filters.type === 'all' ? permits : permits.filter((p) => p.permit_type === filters.type);
  return sortPermits(filters.pendingOnly ? byType.filter((p) => p.status === 'PENDING') : byType);
}

/**
 * How long a permit's validity has left — the drawing's EXPIRY column.
 *
 * THE DRAWING PRINTS "04h 22m" AND THIS RETURNS DAYS. `valid_until` is a Postgres **DATE**
 * (20260619000002_tasks_permits) — no time part exists in the column, so an hours-and-minutes
 * countdown could only be manufactured by assuming a time of day the tenant never entered. Days is
 * what the data supports.
 *
 * Compared on the calendar rather than by elapsed milliseconds: a permit valid until today expires
 * at the END of today, so "0 days" means today, not overdue.
 */
export type PermitExpiry =
  { state: 'today' } | { state: 'remaining'; days: number } | { state: 'overdue'; days: number };

const MS_PER_DAY = 86_400_000;

export function permitExpiry(
  validUntil: string | null | undefined,
  now: Date,
): PermitExpiry | null {
  if (validUntil == null || validUntil === '') return null;
  // A DATE arrives as "YYYY-MM-DD"; once something has parsed it, as "YYYY-MM-DDT...". Take the
  // leading date either way, then compare local midnights so a timezone cannot shift the day.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(validUntil);
  if (m === null) return null;
  const until = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((until - today) / MS_PER_DAY);
  if (days === 0) return { state: 'today' };
  return days > 0 ? { state: 'remaining', days } : { state: 'overdue', days: -days };
}
