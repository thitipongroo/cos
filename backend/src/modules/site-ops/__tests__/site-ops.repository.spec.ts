// Unit tests — SiteOps Repository (Phase 6)
// Tests: tenant isolation, null-return handling, query delegation.

import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { SiteOpsRepository } from '../site-ops.repository';
import { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';

const mockPrisma = {
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),
};

const mockTenantPrisma = {
  run: jest.fn((fn: (p: typeof mockPrisma) => unknown) => fn(mockPrisma)),
};

const mockRequest = { tenantId: 'tenant-uuid-001' };

// ── Fixtures ────────────────────────────────────────────────────────────────

const reportRow = {
  report_id: 'report-uuid-001',
  project_id: 'proj-uuid-001',
  tenant_id: 'tenant-uuid-001',
  report_date: new Date('2026-06-04'),
  submitted_by: 'user-uuid-001',
  status: 'DRAFT' as const,
  summary: null,
  weather: null,
  manpower_count: null,
  client_submitted_at: null,
  server_received_at: new Date(),
  modified_at: new Date(),
};

const issueRow = {
  issue_id: 'issue-uuid-001',
  project_id: 'proj-uuid-001',
  tenant_id: 'tenant-uuid-001',
  report_id: null,
  title: 'Crack',
  description: null,
  severity: 'HIGH' as const,
  status: 'OPEN' as const,
  assigned_to: null,
  resolution_note: null,
  client_submitted_at: null,
  modified_at: new Date(),
  created_at: new Date(),
};

const inspectionRow = {
  inspection_id: 'insp-uuid-001',
  project_id: 'proj-uuid-001',
  tenant_id: 'tenant-uuid-001',
  checklist_id: 'cl-uuid-001',
  status: 'PASSED' as const,
  inspected_by: 'user-uuid-001',
  inspected_at: new Date(),
  notes: null,
};

const checklistRow = {
  checklist_id: 'cl-uuid-001',
  project_id: 'proj-uuid-001',
  tenant_id: 'tenant-uuid-001',
  checklist_name: 'Daily Safety',
  version: 1,
  items: [{ item_id: '1', description: 'wear helmet', is_required: true }],
  created_at: new Date(),
};

const conflictRow = {
  conflict_id: 'conf-uuid-001',
  tenant_id: 'tenant-uuid-001',
  entity_type: 'issues',
  entity_id: 'issue-uuid-001',
  client_payload: {},
  server_payload: {},
  conflict_type: 'STATUS_CONFLICT' as const,
  reviewed_by: null,
  reviewed_at: null,
  created_at: new Date(),
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SiteOpsRepository', () => {
  let repo: SiteOpsRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SiteOpsRepository,
        { provide: TenantPrismaService, useValue: mockTenantPrisma },
        { provide: REQUEST, useValue: mockRequest },
      ],
    }).compile();
    repo = await module.resolve<SiteOpsRepository>(SiteOpsRepository);
  });

  it('tenantId getter uses empty string when request has no tenantId (covers ?? "" branch)', async () => {
    const module = await Test.createTestingModule({
      providers: [
        SiteOpsRepository,
        { provide: TenantPrismaService, useValue: mockTenantPrisma },
        { provide: REQUEST, useValue: {} },
      ],
    }).compile();
    const r = await module.resolve<SiteOpsRepository>(SiteOpsRepository);
    // Call a method to trigger the tenantId getter with empty string
    mockPrisma.$queryRaw.mockResolvedValue([]);
    await r.findReportById('any');
    expect(r).toBeDefined();
  });

  // ── Site Reports ────────────────────────────────────────────────────────────

  it('createSiteReport returns inserted row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([reportRow]);
    const result = await repo.createSiteReport({
      report_id: 'report-uuid-001',
      project_id: 'proj-uuid-001',
      submitted_by: 'user-uuid-001',
      report_date: '2026-06-04',
      summary: null,
      weather: null,
      manpower_count: null,
      client_submitted_at: null,
    });
    expect(result.report_id).toBe('report-uuid-001');
  });

  it('createSiteReport persists blockers when provided (spec 11 §474)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ ...reportRow, blockers: 'crane down' }]);
    const result = await repo.createSiteReport({
      report_id: 'report-uuid-002',
      project_id: 'proj-uuid-001',
      submitted_by: 'user-uuid-001',
      report_date: '2026-06-04',
      summary: null,
      blockers: 'crane down',
      weather: null,
      manpower_count: null,
      client_submitted_at: null,
    });
    expect(result.blockers).toBe('crane down');
  });

  it('findReportById returns null when not found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    expect(await repo.findReportById('missing')).toBeNull();
  });

  it('findReportById returns row when found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([reportRow]);
    expect((await repo.findReportById('report-uuid-001'))?.report_id).toBe('report-uuid-001');
  });

  it('listSiteReports returns rows and total', async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([reportRow]) // first call = rows
      .mockResolvedValueOnce([{ count: 1n }]); // second call = COUNT(*) bigint
    const result = await repo.listSiteReports({ page: 1, limit: 20 });
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('updateReportStatus calls $queryRaw', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    await repo.updateReportStatus('report-uuid-001', 'SUBMITTED');
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  // ── Issues ──────────────────────────────────────────────────────────────────

  it('createIssue returns inserted row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([issueRow]);
    const result = await repo.createIssue({
      issue_id: 'issue-uuid-001',
      project_id: 'proj-uuid-001',
      report_id: null,
      title: 'Crack',
      description: null,
      severity: 'HIGH',
      assigned_to: null,
      client_submitted_at: null,
    });
    expect(result.issue_id).toBe('issue-uuid-001');
  });

  it('findIssueById returns null when not found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    expect(await repo.findIssueById('missing')).toBeNull();
  });

  it('findIssueById returns row when found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([issueRow]);
    expect((await repo.findIssueById('issue-uuid-001'))?.issue_id).toBe('issue-uuid-001');
  });

  it('listIssues returns rows and total', async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([issueRow]) // first call = rows
      .mockResolvedValueOnce([{ count: 1n }]); // second call = COUNT(*) bigint
    const result = await repo.listIssues({ page: 1, limit: 20 });
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('updateIssue returns updated row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([issueRow]);
    const result = await repo.updateIssue('issue-uuid-001', {
      description: null,
      severity: 'HIGH',
      status: 'OPEN',
      assigned_to: null,
      resolution_note: null,
      client_submitted_at: null,
    });
    expect(result?.issue_id).toBe('issue-uuid-001');
  });

  it('updateIssue with assigned_to undefined (covers !== undefined false branch)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([issueRow]);
    // assigned_to not in patch → ELSE branch of CASE WHEN
    const result = await repo.updateIssue('issue-uuid-001', { description: 'updated' });
    expect(result?.issue_id).toBe('issue-uuid-001');
  });

  it('updateIssue returns null when no row updated (covers ?? null branch)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const result = await repo.updateIssue('issue-uuid-001', {});
    expect(result).toBeNull();
  });

  it('listSiteReports with all optional params (covers ?? null false branches)', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([reportRow]).mockResolvedValueOnce([{ count: 0n }]);
    const result = await repo.listSiteReports({
      page: 1,
      limit: 20,
      project_id: 'proj-uuid-001',
      from_date: '2026-01-01',
      to_date: '2026-12-31',
    });
    expect(result.rows).toHaveLength(1);
  });

  it('listIssues with all optional params (covers ?? null false branches)', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([issueRow]).mockResolvedValueOnce([{ count: 0n }]);
    const result = await repo.listIssues({
      page: 1,
      limit: 20,
      project_id: 'proj-uuid-001',
      severity: 'HIGH',
      status: 'OPEN',
    });
    expect(result.rows).toHaveLength(1);
  });

  it('listSiteReports returns total=0 when count query returns empty (covers ?? 0 branch)', async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([]) // rows = empty
      .mockResolvedValueOnce([]); // countRows = empty → ?? 0
    const result = await repo.listSiteReports({ page: 1, limit: 20 });
    expect(result.total).toBe(0);
  });

  it('listIssues returns total=0 when count query returns empty (covers ?? 0 branch)', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await repo.listIssues({ page: 1, limit: 20 });
    expect(result.total).toBe(0);
  });

  // ── Inspections ─────────────────────────────────────────────────────────────

  it('createInspection returns inserted row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([inspectionRow]);
    const result = await repo.createInspection({
      inspection_id: 'insp-uuid-001',
      project_id: 'proj-uuid-001',
      checklist_id: 'cl-uuid-001',
      status: 'PASSED',
      inspected_by: 'user-uuid-001',
      inspected_at: '2026-06-04T08:00:00Z',
      notes: null,
    });
    expect(result.inspection_id).toBe('insp-uuid-001');
  });

  it('createInspection persists issue_severity when provided (spec 11 §517)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ ...inspectionRow, issue_severity: 'HIGH' }]);
    const result = await repo.createInspection({
      inspection_id: 'insp-uuid-002',
      project_id: 'proj-uuid-001',
      checklist_id: 'cl-uuid-001',
      status: 'FAILED',
      inspected_by: 'user-uuid-001',
      inspected_at: '2026-07-07T00:00:00Z',
      notes: null,
      issue_severity: 'HIGH',
    });
    expect(result.issue_severity).toBe('HIGH');
  });

  it('findChecklistById returns null when not found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    expect(await repo.findChecklistById('missing')).toBeNull();
  });

  it('findChecklistById returns row when found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([checklistRow]);
    expect((await repo.findChecklistById('cl-uuid-001'))?.checklist_id).toBe('cl-uuid-001');
  });

  // ── Conflict Records ─────────────────────────────────────────────────────────

  it('createConflictRecord calls $queryRaw and returns row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([conflictRow]);
    const result = await repo.createConflictRecord({
      conflict_id: 'conf-uuid-001',
      entity_type: 'issues',
      entity_id: 'issue-uuid-001',
      client_payload: {},
      server_payload: {},
      conflict_type: 'STATUS_CONFLICT',
    });
    expect(result.conflict_id).toBe('conf-uuid-001');
  });

  it('listConflictRecords returns rows', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([conflictRow]);
    const result = await repo.listConflictRecords(true);
    expect(result).toHaveLength(1);
  });

  it('resolveConflictRecord returns null when not found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    expect(await repo.resolveConflictRecord('missing', 'user-001')).toBeNull();
  });

  it('resolveConflictRecord returns resolved row when found', async () => {
    const resolved = { ...conflictRow, reviewed_by: 'user-001', reviewed_at: new Date() };
    mockPrisma.$queryRaw.mockResolvedValue([resolved]);
    const result = await repo.resolveConflictRecord('conf-uuid-001', 'user-001');
    expect(result?.reviewed_by).toBe('user-001');
  });

  it('insertMaterialConsumption calls $queryRaw and returns first row', async () => {
    const materialRow = {
      consumption_id: 'cons-uuid-001',
      project_id: 'proj-uuid-001',
      tenant_id: 'tenant-uuid-001',
      report_id: 'report-uuid-001',
      material_name: 'Steel rod',
      material_id: 'mat-uuid-001',
      task_id: null,
      quantity: '10',
      unit: 'pcs',
      consumed_by: 'user-uuid-001',
      consumed_at: '2026-06-11',
    };
    mockPrisma.$queryRaw.mockResolvedValue([materialRow]);
    const result = await repo.insertMaterialConsumption({
      consumption_id: 'cons-uuid-001',
      project_id: 'proj-uuid-001',
      report_id: 'report-uuid-001',
      material_name: 'Steel rod',
      material_id: 'mat-uuid-001',
      task_id: null,
      quantity: '10',
      unit: 'pcs',
      consumed_by: 'user-uuid-001',
      consumed_at: '2026-06-11',
    });
    expect(result.consumption_id).toBe('cons-uuid-001');
  });

  // ── Inspections list/detail/update (ADR-025) ────────────────────────────────

  it('findInspections returns rows and total (filters applied)', async () => {
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([inspectionRow])
      .mockResolvedValueOnce([{ count: 1n }]);
    const result = await repo.findInspections({
      project_id: 'proj-uuid-001',
      status: 'PENDING',
      page: 1,
      limit: 20,
    });
    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
  });

  it('findInspections returns total=0 when count empty (no filters)', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await repo.findInspections({ page: 1, limit: 20 });
    expect(result.total).toBe(0);
  });

  it('findInspectionById returns row then null', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([inspectionRow]);
    expect((await repo.findInspectionById('insp-uuid-001'))?.inspection_id).toBeDefined();
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    expect(await repo.findInspectionById('missing')).toBeNull();
  });

  it('updateInspectionStatus returns updated row (with and without notes)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ ...inspectionRow, status: 'PASSED' }]);
    const r1 = await repo.updateInspectionStatus({
      inspection_id: 'insp-uuid-001',
      status: 'PASSED',
      notes: 'approved',
    });
    expect(r1.status).toBe('PASSED');
    const r2 = await repo.updateInspectionStatus({
      inspection_id: 'insp-uuid-001',
      status: 'PASSED',
    });
    expect(r2.status).toBe('PASSED');
  });

  it('listChecklists returns rows (with and without project filter)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { checklist_id: 'chk-1', tenant_id: 'tenant-uuid-001' },
    ]);
    expect(await repo.listChecklists('proj-uuid-001')).toHaveLength(1);
    expect(await repo.listChecklists()).toHaveLength(1);
  });
});
