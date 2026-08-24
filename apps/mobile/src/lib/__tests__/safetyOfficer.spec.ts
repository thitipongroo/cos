// The SAFETY_OFFICER screens' display rules. Every branch, because `src/lib/**` is inside the
// 100 % line + branch gate (QM-1, jest.config.ts `collectCoverageFrom`).

import type { IncidentRow, PermitRow, PermitType, PermitStatus } from '../../api/safety';
import {
  ACKNOWLEDGEMENT_SLA_MINUTES,
  acknowledgementOverdue,
  applyIncidentFilter,
  canSafetyOfficerApprove,
  canSafetyOfficerReject,
  incidentAge,
  incidentAgeKey,
  incidentStatusTone,
  INCIDENT_FILTERS,
  permitStatusTone,
  severityTone,
  sortIncidents,
  sortPermits,
  applyPermitFilters,
  permitExpiry,
  PERMIT_TYPE_FILTERS,
} from '../safetyOfficer';

const NOW = new Date('2026-08-13T12:00:00.000Z');

function incident(over: Partial<IncidentRow> = {}): IncidentRow {
  return {
    incident_id: 'i1',
    project_id: 'p1',
    task_id: null,
    incident_type: 'Scaffold instability',
    severity: 'MEDIUM',
    reported_by: 'u1',
    status: 'OPEN',
    acknowledged_by: null,
    acknowledged_at: null,
    created_at: '2026-08-13T11:55:00.000Z',
    ...over,
  };
}

function permit(over: Partial<PermitRow> = {}): PermitRow {
  return {
    permit_id: 'pm1',
    project_id: 'p1',
    permit_type: 'WORK_PERMIT',
    permit_number: 'WP-001',
    issued_by: null,
    valid_from: null,
    valid_until: null,
    status: 'PENDING',
    linked_task_id: null,
    created_by: null,
    created_at: '2026-08-13T10:00:00.000Z',
    contractor_name: null,
    description: null,
    revoke_reason: null,
    ...over,
  };
}

describe('severityTone', () => {
  it('puts HIGH with CRITICAL, as the compliance query itself does', () => {
    expect(severityTone('CRITICAL')).toBe('danger');
    expect(severityTone('HIGH')).toBe('danger');
  });

  it('maps MEDIUM to warning and everything else to muted', () => {
    expect(severityTone('MEDIUM')).toBe('warning');
    expect(severityTone('LOW')).toBe('muted');
    expect(severityTone('SOMETHING_ELSE')).toBe('muted');
  });
});

describe('incidentStatusTone', () => {
  it.each([
    ['OPEN', 'danger'],
    ['IN_PROGRESS', 'warning'],
    ['RESOLVED', 'success'],
    ['CLOSED', 'success'],
    ['UNKNOWN', 'muted'],
  ])('%s → %s', (status, tone) => {
    expect(incidentStatusTone(status)).toBe(tone);
  });
});

describe('permitStatusTone', () => {
  it.each([
    ['ACTIVE', 'success'],
    ['PENDING', 'warning'],
    ['EXPIRED', 'danger'],
    ['REVOKED', 'danger'],
    ['UNKNOWN', 'muted'],
  ])('%s → %s', (status, tone) => {
    expect(permitStatusTone(status as PermitStatus)).toBe(tone);
  });
});

describe('incidentAge', () => {
  it('has nothing to say about a missing or unparseable timestamp', () => {
    expect(incidentAge(null, NOW)).toBeNull();
    expect(incidentAge(undefined, NOW)).toBeNull();
    expect(incidentAge('', NOW)).toBeNull();
    expect(incidentAge('not-a-date', NOW)).toBeNull();
  });

  it('keeps minute precision under an hour — §19.3 escalates on the minutes', () => {
    expect(incidentAge('2026-08-13T11:38:00.000Z', NOW)).toEqual({ unit: 'minutes', value: 22 });
  });

  it('reads a future timestamp as zero rather than a negative age', () => {
    // Device/server clock skew, not a bug in the record.
    expect(incidentAge('2026-08-13T12:05:00.000Z', NOW)).toEqual({ unit: 'minutes', value: 0 });
  });

  it('steps up to hours and then days', () => {
    expect(incidentAge('2026-08-13T10:45:00.000Z', NOW)).toEqual({ unit: 'hours', value: 1 });
    expect(incidentAge('2026-08-11T09:00:00.000Z', NOW)).toEqual({ unit: 'days', value: 2 });
  });

  it('names the i18n key for each unit', () => {
    expect(incidentAgeKey({ unit: 'minutes', value: 3 })).toBe('safety.age.minutes');
    expect(incidentAgeKey({ unit: 'hours', value: 3 })).toBe('safety.age.hours');
    expect(incidentAgeKey({ unit: 'days', value: 3 })).toBe('safety.age.days');
  });
});

describe('acknowledgementOverdue', () => {
  it('is the §19.3 rule and nothing else', () => {
    expect(ACKNOWLEDGEMENT_SLA_MINUTES).toBe(30);
  });

  it('stops the clock the moment an incident is acknowledged', () => {
    // IN_PROGRESS means someone acknowledged it — that IS the event this deadline is about.
    expect(acknowledgementOverdue(incident({ status: 'IN_PROGRESS' }), NOW)).toBe(false);
    expect(acknowledgementOverdue(incident({ status: 'RESOLVED' }), NOW)).toBe(false);
  });

  it('claims nothing when the row has no timestamp to measure from', () => {
    expect(acknowledgementOverdue(incident({ created_at: '' }), NOW)).toBe(false);
  });

  it('is false inside the window and true on it', () => {
    expect(acknowledgementOverdue(incident({ created_at: '2026-08-13T11:35:00.000Z' }), NOW)).toBe(
      false,
    );
    expect(acknowledgementOverdue(incident({ created_at: '2026-08-13T11:30:00.000Z' }), NOW)).toBe(
      true,
    );
  });

  it('is true for anything older than an hour, without re-checking the minutes', () => {
    expect(acknowledgementOverdue(incident({ created_at: '2026-08-12T12:00:00.000Z' }), NOW)).toBe(
      true,
    );
  });
});

describe('INCIDENT_FILTERS', () => {
  it('draws the drawing’s four pills and marks the two with no query behind them', () => {
    expect(INCIDENT_FILTERS.map((f) => f.id)).toEqual(['all', 'critical', 'near-miss', 'ppe']);
    expect(INCIDENT_FILTERS.filter((f) => f.available).map((f) => f.id)).toEqual([
      'all',
      'critical',
    ]);
  });
});

describe('applyIncidentFilter', () => {
  const rows = [
    incident({ incident_id: 'open-critical', status: 'OPEN', severity: 'CRITICAL' }),
    incident({ incident_id: 'progress-low', status: 'IN_PROGRESS', severity: 'LOW' }),
    incident({ incident_id: 'resolved-critical', status: 'RESOLVED', severity: 'CRITICAL' }),
    incident({ incident_id: 'closed-high', status: 'CLOSED', severity: 'HIGH' }),
  ];

  it('“All active” means OPEN and IN_PROGRESS, not everything ever recorded', () => {
    expect(applyIncidentFilter(rows, 'all').map((r) => r.incident_id)).toEqual([
      'open-critical',
      'progress-low',
    ]);
  });

  it('narrows the same active set to CRITICAL', () => {
    expect(applyIncidentFilter(rows, 'critical').map((r) => r.incident_id)).toEqual([
      'open-critical',
    ]);
  });

  it('falls back to the active set for a pill that cannot filter', () => {
    // The screen never selects one, but an empty list would be the wrong answer if it ever did.
    expect(applyIncidentFilter(rows, 'near-miss')).toHaveLength(2);
    expect(applyIncidentFilter(rows, 'ppe')).toHaveLength(2);
  });
});

describe('sortIncidents', () => {
  it('orders by severity, then newest first', () => {
    const rows = [
      incident({ incident_id: 'low', severity: 'LOW', created_at: '2026-08-13T11:00:00.000Z' }),
      incident({
        incident_id: 'crit-old',
        severity: 'CRITICAL',
        created_at: '2026-08-13T09:00:00.000Z',
      }),
      incident({
        incident_id: 'crit-new',
        severity: 'CRITICAL',
        created_at: '2026-08-13T11:30:00.000Z',
      }),
      incident({ incident_id: 'high', severity: 'HIGH', created_at: '2026-08-13T08:00:00.000Z' }),
      incident({
        incident_id: 'medium',
        severity: 'MEDIUM',
        created_at: '2026-08-13T07:00:00.000Z',
      }),
    ];
    expect(sortIncidents(rows).map((r) => r.incident_id)).toEqual([
      'crit-new',
      'crit-old',
      'high',
      'medium',
      'low',
    ]);
  });

  it('ranks an unrecognised severity last rather than dropping the row', () => {
    // BOTH sides of the comparator's `?? 9` are exercised: the pair below puts an unknown against a
    // known one, and the pair after it puts two unknowns against each other — where the fallback has
    // to hold on `b` as well, and the newest-first tiebreak decides.
    const mixed = [
      incident({ incident_id: 'weird', severity: 'SOMETHING' as IncidentRow['severity'] }),
      incident({ incident_id: 'low', severity: 'LOW' }),
    ];
    expect(sortIncidents(mixed).map((r) => r.incident_id)).toEqual(['low', 'weird']);

    const bothUnknown = [
      incident({
        incident_id: 'weird-old',
        severity: 'SOMETHING' as IncidentRow['severity'],
        created_at: '2026-08-13T08:00:00.000Z',
      }),
      incident({
        incident_id: 'weird-new',
        severity: 'ANOTHER' as IncidentRow['severity'],
        created_at: '2026-08-13T11:00:00.000Z',
      }),
    ];
    expect(sortIncidents(bothUnknown).map((r) => r.incident_id)).toEqual([
      'weird-new',
      'weird-old',
    ]);
  });

  it('does not mutate its input', () => {
    const rows = [
      incident({ incident_id: 'a', severity: 'LOW' }),
      incident({ incident_id: 'b', severity: 'CRITICAL' }),
    ];
    sortIncidents(rows);
    expect(rows.map((r) => r.incident_id)).toEqual(['a', 'b']);
  });
});

describe('the permit decisions this role may take', () => {
  it('approves a pending permit that is not a SAFETY_PERMIT', () => {
    expect(canSafetyOfficerApprove(permit())).toBe(true);
    for (const type of ['DRAWING_APPROVAL', 'ENTRY_PERMIT'] as PermitType[]) {
      expect(canSafetyOfficerApprove(permit({ permit_type: type }))).toBe(true);
    }
  });

  it('does NOT approve a SAFETY_PERMIT — master §9 ends that chain at the PM (COS-SAFE-004)', () => {
    expect(canSafetyOfficerApprove(permit({ permit_type: 'SAFETY_PERMIT' }))).toBe(false);
  });

  it('approves nothing that is not PENDING (COS-SAFE-003)', () => {
    expect(canSafetyOfficerApprove(permit({ status: 'ACTIVE' }))).toBe(false);
  });

  it('rejects any PENDING permit, SAFETY_PERMIT included — there is no tier rule on reject', () => {
    expect(canSafetyOfficerReject(permit())).toBe(true);
    expect(canSafetyOfficerReject(permit({ permit_type: 'SAFETY_PERMIT' }))).toBe(true);
    expect(canSafetyOfficerReject(permit({ status: 'REVOKED' }))).toBe(false);
  });
});

describe('sortPermits', () => {
  it('puts what needs a decision first, then newest', () => {
    const rows = [
      permit({ permit_id: 'active', status: 'ACTIVE', created_at: '2026-08-13T11:00:00.000Z' }),
      permit({ permit_id: 'pending-old', created_at: '2026-08-13T08:00:00.000Z' }),
      permit({ permit_id: 'pending-new', created_at: '2026-08-13T10:00:00.000Z' }),
      permit({ permit_id: 'revoked', status: 'REVOKED', created_at: '2026-08-13T09:00:00.000Z' }),
    ];
    expect(sortPermits(rows).map((r) => r.permit_id)).toEqual([
      'pending-new',
      'pending-old',
      'active',
      'revoked',
    ]);
  });

  it('does not mutate its input', () => {
    const rows = [permit({ permit_id: 'a', status: 'ACTIVE' }), permit({ permit_id: 'b' })];
    sortPermits(rows);
    expect(rows.map((r) => r.permit_id)).toEqual(['a', 'b']);
  });
});

describe('PERMIT_TYPE_FILTERS', () => {
  it('offers ALL plus every value of the permit_type enum', () => {
    // The drawing tabs three types. The enum has four (20260619000002_tasks_permits CHECK, and
    // CreatePermitDto), and a type with no tab is a permit the screen can never show — which is why
    // this list is longer than the mockup. If the enum ever grows, this assertion is what fails.
    expect(PERMIT_TYPE_FILTERS.map((f) => f.id)).toEqual([
      'all',
      'WORK_PERMIT',
      'SAFETY_PERMIT',
      'DRAWING_APPROVAL',
      'ENTRY_PERMIT',
    ]);
  });

  it('gives every tab a translation key — no literal label reaches the screen (QM-3)', () => {
    for (const filter of PERMIT_TYPE_FILTERS) {
      expect(filter.labelKey).toMatch(/^safety\.permits\./);
    }
  });
});

describe('applyPermitFilters', () => {
  const rows = [
    permit({ permit_id: 'work-pending', permit_type: 'WORK_PERMIT', status: 'PENDING' }),
    permit({ permit_id: 'work-active', permit_type: 'WORK_PERMIT', status: 'ACTIVE' }),
    permit({ permit_id: 'entry-pending', permit_type: 'ENTRY_PERMIT', status: 'PENDING' }),
    permit({ permit_id: 'safety-revoked', permit_type: 'SAFETY_PERMIT', status: 'REVOKED' }),
  ];

  it('all + everything: returns the whole set, pending first', () => {
    const ids = applyPermitFilters(rows, { type: 'all', pendingOnly: false }).map(
      (r) => r.permit_id,
    );
    expect(ids).toHaveLength(4);
    expect(ids.slice(0, 2).sort()).toEqual(['entry-pending', 'work-pending']);
  });

  it('narrows by type', () => {
    expect(
      applyPermitFilters(rows, { type: 'WORK_PERMIT', pendingOnly: false }).map((r) => r.permit_id),
    ).toEqual(['work-pending', 'work-active']);
  });

  it('narrows by pending', () => {
    const ids = applyPermitFilters(rows, { type: 'all', pendingOnly: true }).map(
      (r) => r.permit_id,
    );
    expect(ids.sort()).toEqual(['entry-pending', 'work-pending']);
  });

  it('applies both together', () => {
    expect(
      applyPermitFilters(rows, { type: 'WORK_PERMIT', pendingOnly: true }).map((r) => r.permit_id),
    ).toEqual(['work-pending']);
  });

  it('reaches ENTRY_PERMIT — the type the drawing has no tab for', () => {
    expect(
      applyPermitFilters(rows, { type: 'ENTRY_PERMIT', pendingOnly: false }).map(
        (r) => r.permit_id,
      ),
    ).toEqual(['entry-pending']);
  });

  it('does not mutate its input', () => {
    const before = rows.map((r) => r.permit_id);
    applyPermitFilters(rows, { type: 'all', pendingOnly: true });
    expect(rows.map((r) => r.permit_id)).toEqual(before);
  });
});

describe('permitExpiry', () => {
  // Local noon, so the assertions cannot be flipped by the runner's timezone.
  const now = new Date(2026, 7, 13, 12, 0);

  it('returns null when no validity window is recorded', () => {
    expect(permitExpiry(null, now)).toBeNull();
    expect(permitExpiry(undefined, now)).toBeNull();
    expect(permitExpiry('', now)).toBeNull();
  });

  it('returns null for a value that is not a date', () => {
    expect(permitExpiry('next Tuesday', now)).toBeNull();
  });

  it('counts a permit valid until today as today, not overdue', () => {
    // The column is a DATE: validity runs to the END of the day it names.
    expect(permitExpiry('2026-08-13', now)).toEqual({ state: 'today' });
  });

  it('counts days remaining', () => {
    expect(permitExpiry('2026-08-14', now)).toEqual({ state: 'remaining', days: 1 });
    expect(permitExpiry('2026-09-12', now)).toEqual({ state: 'remaining', days: 30 });
  });

  it('counts days overdue as a positive number', () => {
    expect(permitExpiry('2026-08-12', now)).toEqual({ state: 'overdue', days: 1 });
    expect(permitExpiry('2026-07-14', now)).toEqual({ state: 'overdue', days: 30 });
  });

  it('accepts a full ISO datetime, taking the leading date', () => {
    expect(permitExpiry('2026-08-14T23:59:59.000Z', now)).toEqual({ state: 'remaining', days: 1 });
  });

  it('is unaffected by the time of day on either side', () => {
    const justBeforeMidnight = new Date(2026, 7, 13, 23, 59);
    expect(permitExpiry('2026-08-14', justBeforeMidnight)).toEqual({
      state: 'remaining',
      days: 1,
    });
  });
});
