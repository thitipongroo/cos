import * as enums from '../enums';

// DESIGN.md §9.1 states "Do not invent states." These assertions pin the exact vocabularies so a
// silent edit here fails CI rather than shipping a value the API will reject.
const EXPECTED: Record<string, readonly string[]> = {
  ISSUE_SEVERITY: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  ISSUE_STATUS: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  INCIDENT_SEVERITY: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  INSPECTION_STATUS: ['PENDING', 'PASSED', 'FAILED', 'REQUIRES_REINSPECTION'],
  TASK_STATUS: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED'],
  PROJECT_STATUS: ['DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'],
  PROJECT_TYPE: ['RESIDENTIAL', 'COMMERCIAL', 'INFRASTRUCTURE', 'INDUSTRIAL'],
  RISK_CATEGORY: ['SAFETY', 'FINANCIAL', 'SCHEDULE', 'TECHNICAL', 'EXTERNAL', 'OTHER'],
  RISK_STATUS: ['OPEN', 'MITIGATING', 'CLOSED', 'ACCEPTED'],
};

describe('enum vocabularies match apps/web/src/lib/api/types.ts', () => {
  it.each(Object.entries(EXPECTED))('%s', (name, values) => {
    expect((enums as unknown as Record<string, readonly string[]>)[name]).toEqual(values);
  });
});

describe('every vocabulary has a matching zod schema that accepts exactly its values', () => {
  const pairs: [readonly string[], { safeParse: (v: unknown) => { success: boolean } }][] = [
    [enums.ISSUE_SEVERITY, enums.issueSeverity],
    [enums.ISSUE_STATUS, enums.issueStatus],
    [enums.INCIDENT_SEVERITY, enums.incidentSeverity],
    [enums.INSPECTION_STATUS, enums.inspectionStatus],
    [enums.TASK_STATUS, enums.taskStatus],
    [enums.PROJECT_STATUS, enums.projectStatus],
    [enums.PROJECT_TYPE, enums.projectType],
    [enums.RISK_CATEGORY, enums.riskCategory],
    [enums.RISK_STATUS, enums.riskStatus],
  ];

  it.each(pairs)('accepts every declared value (%s)', (values, schema) => {
    for (const v of values) expect(schema.safeParse(v).success).toBe(true);
  });

  it.each(pairs)('rejects a value outside the vocabulary (%s)', (_values, schema) => {
    expect(schema.safeParse('NOT_A_REAL_STATE').success).toBe(false);
  });
});

describe('enum rejection messages (QM-3)', () => {
  // zod's built-in enum failure reads "Invalid input" — an English literal that would reach the UI
  // untranslated. Every enum must instead emit a key the app resolves through its i18n layer.
  const SCHEMAS = {
    issueSeverity: enums.issueSeverity,
    issueStatus: enums.issueStatus,
    incidentSeverity: enums.incidentSeverity,
    inspectionStatus: enums.inspectionStatus,
    taskStatus: enums.taskStatus,
    projectStatus: enums.projectStatus,
    projectType: enums.projectType,
    riskCategory: enums.riskCategory,
    riskStatus: enums.riskStatus,
  };

  it.each(Object.entries(SCHEMAS))(
    '%s rejects with an i18n key, not English copy',
    (_name, schema) => {
      const r = schema.safeParse('NOT_A_REAL_VALUE');
      expect(r.success).toBe(false);
      expect(r.success === false && r.error.issues[0]?.message).toBe('validation.invalidOption');
    },
  );
});
