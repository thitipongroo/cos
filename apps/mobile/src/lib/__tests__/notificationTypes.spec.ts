import { CosRole } from '@cos/types';
import {
  NOTIFICATION_GROUPS,
  NOTIFICATION_TYPES,
  notificationSectionsFor,
  notificationTypesFor,
  toHhMm,
} from '../notificationTypes';

const events = (role: CosRole | null | undefined): string[] =>
  notificationTypesFor(role).map((t) => t.eventType);

describe('toHhMm', () => {
  it('trims the API’s seconds off a stored window', () => {
    expect(toHhMm('22:00:00')).toBe('22:00');
    expect(toHhMm('07:30:00')).toBe('07:30');
  });

  it('passes through a value that is already HH:MM', () => {
    expect(toHhMm('22:00')).toBe('22:00');
  });

  it('returns anything it cannot parse untouched, rather than blanking it', () => {
    expect(toHhMm('')).toBe('');
    expect(toHhMm('later')).toBe('later');
    expect(toHhMm('7:00')).toBe('7:00'); // single-digit hour is not the stored shape
  });
});

describe('notificationTypesFor — §19.4 decides who sees what', () => {
  it('gives each event exactly the roles §19.4 routes it to', () => {
    // Read straight off the §19.4 matrix. A cell that changes there must change here.
    const routed: Record<string, CosRole[]> = {
      'safety.incident.created.v1': [
        CosRole.EXECUTIVE,
        CosRole.PROJECT_MANAGER,
        CosRole.SITE_ENGINEER,
        CosRole.SAFETY_OFFICER,
      ],
      'site.inspection.failed.v1': [
        CosRole.PROJECT_MANAGER,
        CosRole.SITE_ENGINEER,
        CosRole.SAFETY_OFFICER,
      ],
      'finance.variance.alert.v1': [CosRole.EXECUTIVE, CosRole.PROJECT_MANAGER, CosRole.FINANCE],
      'ai.risk_prediction.generated.v1': [CosRole.EXECUTIVE, CosRole.PROJECT_MANAGER],
    };
    for (const [eventType, expected] of Object.entries(routed)) {
      const got = NOTIFICATION_TYPES.find((t) => t.eventType === eventType);
      expect({ eventType, roles: got?.roles }).toEqual({ eventType, roles: expected });
    }
  });

  it('gives TENANT_ADMIN only the two types §19.4 is silent on', () => {
    // §19.4's columns are Executive · PM · Site Engineer · Procurement · Finance · Safety · CRM —
    // there is no TENANT_ADMIN column, and the PO chose §19.4 as written over a wider mapping.
    expect(events(CosRole.TENANT_ADMIN)).toEqual([
      'procurement.po.approval_requested.v1',
      'site.report.created.v1',
    ]);
  });

  it('hides nothing where §19.4 has no row', () => {
    // A preference a user cannot see is one they cannot turn off, so silence is not a reason to hide.
    const silent = NOTIFICATION_TYPES.filter((t) => t.specSilent).map((t) => t.eventType);
    expect(silent).toEqual(['procurement.po.approval_requested.v1', 'site.report.created.v1']);
    for (const role of Object.values(CosRole)) {
      for (const eventType of silent) expect(events(role)).toContain(eventType);
    }
  });

  it('locks the critical safety type — §19.6 says it cannot be disabled', () => {
    const locked = NOTIFICATION_TYPES.filter((t) => t.locked).map((t) => t.eventType);
    expect(locked).toEqual(['safety.incident.created.v1']);
  });

  it('gives a session with no role nothing to configure', () => {
    expect(notificationTypesFor(null)).toEqual([]);
    expect(notificationTypesFor(undefined)).toEqual([]);
    expect(notificationSectionsFor(null)).toEqual([]);
  });

  it('routes no type to a role §19.4 leaves the whole row blank for', () => {
    // CRM/Sales holds only LeadCreated and OpportunityConverted in §19.4, neither of which is one of
    // the six types this screen persists — so it sees only the spec-silent pair.
    expect(events(CosRole.CRM_SALES_MANAGER)).toEqual([
      'procurement.po.approval_requested.v1',
      'site.report.created.v1',
    ]);
  });
});

describe('notificationSectionsFor — §19.3 decides the grouping', () => {
  it('uses the §19.3 groups, in that section’s order', () => {
    expect(NOTIFICATION_GROUPS).toEqual(['IMMEDIATE', 'DIGEST', 'ESCALATION']);
    expect(notificationSectionsFor(CosRole.PROJECT_MANAGER).map((s) => s.group)).toEqual([
      'IMMEDIATE',
      'DIGEST',
    ]);
  });

  it('drops a group the role has no type in, rather than drawing an empty heading', () => {
    const safety = notificationSectionsFor(CosRole.SAFETY_OFFICER);
    expect(safety.every((s) => s.types.length > 0)).toBe(true);
    // No type is filed under Escalation today — §19.3 describes those as timeouts on an already-sent
    // notification, not a preference of their own — so no role gets that heading.
    for (const role of Object.values(CosRole)) {
      expect(notificationSectionsFor(role).map((s) => s.group)).not.toContain('ESCALATION');
    }
  });

  it('loses no type in the split', () => {
    for (const role of Object.values(CosRole)) {
      const flat = notificationSectionsFor(role).flatMap((s) => s.types.map((t) => t.eventType));
      expect(flat.sort()).toEqual([...events(role)].sort());
    }
  });
});
