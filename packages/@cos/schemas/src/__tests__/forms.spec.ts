import {
  computeRiskScore,
  incidentReportSchema,
  inspectionSubmitSchema,
  issueCreateSchema,
  riskCreateSchema,
  siteReportCreateSchema,
} from '../forms';

const UUID = '88803908-e4b5-57bd-8e6b-ed4662b5d67d';
const OTHER_UUID = 'e1c9f0a2-3b4d-4c5e-8f60-7a8b9c0d1e2f';

const issueOf = (o: Partial<Record<string, unknown>> = {}) => ({
  project_id: UUID,
  title: 'Cracked slab on level 3',
  severity: 'HIGH',
  ...o,
});

describe('issueCreateSchema', () => {
  it('accepts a complete issue', () => {
    expect(issueCreateSchema.safeParse(issueOf()).success).toBe(true);
  });

  it('accepts an omitted description', () => {
    const r = issueCreateSchema.safeParse(issueOf());
    expect(r.success && r.data.description).toBeUndefined();
  });

  it('rejects a missing project', () => {
    expect(issueCreateSchema.safeParse(issueOf({ project_id: '' })).success).toBe(false);
  });

  it('rejects a blank title', () => {
    expect(issueCreateSchema.safeParse(issueOf({ title: '   ' })).success).toBe(false);
  });

  it('rejects a severity outside the vocabulary', () => {
    expect(issueCreateSchema.safeParse(issueOf({ severity: 'URGENT' })).success).toBe(false);
  });

  it('rejects a description over 2000 chars', () => {
    expect(issueCreateSchema.safeParse(issueOf({ description: 'x'.repeat(2001) })).success).toBe(
      false,
    );
  });
});

describe('inspectionSubmitSchema — UpdateInspectionInput { status, notes }', () => {
  // This endpoint PATCHes an existing inspection, so project_id and checklist_id are already on
  // the record. An earlier version of this schema required them plus a conditional issue_severity
  // taken from DESIGN.md §9.1 prose — none of which UpdateInspectionInput has, so every valid
  // PATCH would have been rejected. scripts/readiness/check-schema-contract.sh now guards that.
  it.each(['PASSED', 'FAILED', 'REQUIRES_REINSPECTION'])('accepts status %s', (status) => {
    expect(inspectionSubmitSchema.safeParse({ status }).success).toBe(true);
  });

  it('accepts notes alongside the status', () => {
    expect(
      inspectionSubmitSchema.safeParse({ status: 'FAILED', notes: 'rebar spacing' }).success,
    ).toBe(true);
  });

  it('rejects PENDING — an inspection cannot be submitted as still pending', () => {
    expect(inspectionSubmitSchema.safeParse({ status: 'PENDING' }).success).toBe(false);
  });

  it('rejects a missing status', () => {
    expect(inspectionSubmitSchema.safeParse({ notes: 'x' }).success).toBe(false);
  });

  it('rejects an unknown status with an i18n key', () => {
    const r = inspectionSubmitSchema.safeParse({ status: 'MAYBE' });
    expect(r.success === false && r.error.issues[0]?.message).toBe('validation.invalidOption');
  });

  it('rejects notes over 2000 chars', () => {
    expect(
      inspectionSubmitSchema.safeParse({ status: 'PASSED', notes: 'x'.repeat(2001) }).success,
    ).toBe(false);
  });
});

describe('incidentReportSchema — CreateIncidentInput', () => {
  const base = { project_id: UUID, incident_type: 'Fall from height', severity: 'CRITICAL' };

  it('accepts a complete incident', () => {
    expect(incidentReportSchema.safeParse(base).success).toBe(true);
  });

  it('accepts an optional task_id', () => {
    expect(incidentReportSchema.safeParse({ ...base, task_id: OTHER_UUID }).success).toBe(true);
  });

  it('accepts an empty task_id — the "not linked to a task" case', () => {
    expect(incidentReportSchema.safeParse({ ...base, task_id: '' }).success).toBe(true);
  });

  it('rejects a non-uuid task_id', () => {
    expect(incidentReportSchema.safeParse({ ...base, task_id: 'task-1' }).success).toBe(false);
  });

  it('rejects a blank incident_type', () => {
    expect(incidentReportSchema.safeParse({ ...base, incident_type: '  ' }).success).toBe(false);
  });

  it('rejects a severity outside the vocabulary', () => {
    expect(incidentReportSchema.safeParse({ ...base, severity: 'SEVERE' }).success).toBe(false);
  });
});

describe('siteReportCreateSchema', () => {
  const base = { project_id: UUID, report_date: '2026-08-03' };

  it('accepts the minimum required fields', () => {
    expect(siteReportCreateSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a zero manpower count', () => {
    expect(siteReportCreateSchema.safeParse({ ...base, manpower_count: 0 }).success).toBe(true);
  });

  it('rejects a negative manpower count', () => {
    expect(siteReportCreateSchema.safeParse({ ...base, manpower_count: -1 }).success).toBe(false);
  });

  it('rejects a fractional manpower count', () => {
    expect(siteReportCreateSchema.safeParse({ ...base, manpower_count: 1.5 }).success).toBe(false);
  });

  it('rejects a summary over 2000 chars', () => {
    expect(siteReportCreateSchema.safeParse({ ...base, summary: 'x'.repeat(2001) }).success).toBe(
      false,
    );
  });

  it('rejects a missing report_date', () => {
    expect(siteReportCreateSchema.safeParse({ project_id: UUID, report_date: '' }).success).toBe(
      false,
    );
  });
});

describe('riskCreateSchema — ADR-065', () => {
  const base = {
    title: 'Crane availability',
    category: 'SCHEDULE',
    status: 'OPEN',
    likelihood: 3,
    impact: 4,
  };

  it('accepts a complete risk', () => {
    expect(riskCreateSchema.safeParse(base).success).toBe(true);
  });

  it.each([0, 6])('rejects likelihood %i outside 1–5', (likelihood) => {
    expect(riskCreateSchema.safeParse({ ...base, likelihood }).success).toBe(false);
  });

  it.each([0, 6])('rejects impact %i outside 1–5', (impact) => {
    expect(riskCreateSchema.safeParse({ ...base, impact }).success).toBe(false);
  });

  it('rejects a category outside the vocabulary', () => {
    expect(riskCreateSchema.safeParse({ ...base, category: 'WEATHER' }).success).toBe(false);
  });
});

describe('computeRiskScore', () => {
  it('accepts the lowest product 1×1', () => {
    expect(computeRiskScore(1, 1).success).toBe(true);
  });

  it('accepts the highest product 5×5 = 25', () => {
    const r = computeRiskScore(5, 5);
    expect(r.success && r.data).toBe(25);
  });

  it('rejects a product below the range', () => {
    expect(computeRiskScore(0, 3).success).toBe(false);
  });

  it('rejects a product above the range', () => {
    expect(computeRiskScore(6, 5).success).toBe(false);
  });
});
