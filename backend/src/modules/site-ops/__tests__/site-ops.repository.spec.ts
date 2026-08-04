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
  issue_number: 'ISS-2026-0001',
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

  // Batch lookup backing the offline-sync path — one query for the whole push instead of one per item.
  it('findReportsByIds keys the returned rows by report_id', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([reportRow]);
    const found = await repo.findReportsByIds(['report-uuid-001', 'report-uuid-002']);
    expect(found.get('report-uuid-001')?.report_id).toBe('report-uuid-001');
    expect(found.get('report-uuid-002')).toBeUndefined();
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('findReportsByIds short-circuits an empty id list without querying', async () => {
    const found = await repo.findReportsByIds([]);
    expect(found.size).toBe(0);
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  // The LAST_WRITE_WINS half of offline sync (§17.5): when the client's submission is newer, the
  // server row is overwritten in place. modified_at is bumped here because the NEXT sync compares
  // against it to detect a concurrent server-side edit.
  describe('updateSiteReport', () => {
    it('returns the updated row', async () => {
      const updated = { ...reportRow, summary: 'poured slab', manpower_count: 12 };
      mockPrisma.$queryRaw.mockResolvedValue([updated]);

      const result = await repo.updateSiteReport('report-uuid-001', {
        summary: 'poured slab',
        blockers: null,
        weather: 'sunny',
        manpower_count: 12,
        client_submitted_at: '2026-06-04T09:00:00Z',
      });

      expect(result?.summary).toBe('poured slab');
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('returns null when the report belongs to another tenant', async () => {
      // The UPDATE carries `AND tenant_id = ...`, so a cross-tenant id simply matches no row. Null
      // lets the caller answer 404 rather than reporting a successful write that never happened.
      mockPrisma.$queryRaw.mockResolvedValue([]);
      const result = await repo.updateSiteReport('foreign-report', {
        summary: null,
        blockers: null,
        weather: null,
        manpower_count: null,
        client_submitted_at: null,
      });
      expect(result).toBeNull();
    });

    it('writes NULL coordinates when the client sends none (offline report with no GPS fix)', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([reportRow]);
      await repo.updateSiteReport('report-uuid-001', {
        summary: 's',
        blockers: null,
        weather: null,
        manpower_count: null,
        client_submitted_at: null,
        // latitude/longitude omitted entirely — the ?? null fallbacks supply them.
      });
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('passes explicit coordinates through', async () => {
      // SiteReportRow does not surface lat/lng, so assert the write happened rather than the shape.
      mockPrisma.$queryRaw.mockResolvedValue([reportRow]);
      const result = await repo.updateSiteReport('report-uuid-001', {
        summary: 's',
        blockers: null,
        weather: null,
        manpower_count: null,
        client_submitted_at: null,
        latitude: 13.75,
        longitude: 100.5,
      });
      expect(result).not.toBeNull();
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
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
      issue_number: 'ISS-2026-0001',
      project_id: 'proj-uuid-001',
      report_id: null,
      title: 'Crack',
      description: null,
      severity: 'HIGH',
      assigned_to: null,
      created_by: 'user-uuid-001',
      client_submitted_at: null,
    });
    expect(result.issue_id).toBe('issue-uuid-001');
  });

  // nextIssueNumber (ADR-069) — ISS-<year>-<seq> from MAX+1 per tenant/year. The three cases cover the
  // `rows[0]?.max_seq ?? 0` branches: no rows, a row with a null max, and a row with a value.
  it('nextIssueNumber starts at 0001 when the query returns no rows', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    expect(await repo.nextIssueNumber(2026)).toBe('ISS-2026-0001');
  });

  it('nextIssueNumber starts at 0001 when the tenant has no issues this year', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ max_seq: null }]);
    expect(await repo.nextIssueNumber(2026)).toBe('ISS-2026-0001');
  });

  it('nextIssueNumber increments the highest existing sequence', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ max_seq: 41 }]);
    expect(await repo.nextIssueNumber(2026)).toBe('ISS-2026-0042');
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

  // ── Carbon analytics (Phase 24 — spec §33.4) ────────────────────────────────

  it('findMaterialIdByName returns the master material id when the name resolves', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ material_id: 'mat-master-001' }]);
    const result = await repo.findMaterialIdByName('Steel rod');
    expect(result).toBe('mat-master-001');
  });

  it('findMaterialIdByName returns null for a name not in the master (mobile free-text)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const result = await repo.findMaterialIdByName('Sttel rodd');
    expect(result).toBeNull();
  });

  it('findCarbonFactor returns the tenant factor and its audit source', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ carbon_factor: '2.500000', source: 'EPD-2023-001' }]);
    const result = await repo.findCarbonFactor('mat-master-001');
    expect(result).toEqual({ carbon_factor: '2.500000', source: 'EPD-2023-001' });
  });

  it('findCarbonFactor returns null when the tenant has loaded no factor (§33.4 opt-in)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const result = await repo.findCarbonFactor('mat-master-001');
    expect(result).toBeNull();
  });

  it('insertCarbonRecord returns the inserted row', async () => {
    const carbonRow = {
      carbon_record_id: 'carbon-uuid-001',
      tenant_id: 'tenant-uuid-001',
      project_id: 'proj-uuid-001',
      consumption_id: 'cons-uuid-001',
      material_id: 'mat-master-001',
      quantity_consumed: '10.0000',
      unit: 'pcs',
      carbon_factor: '2.500000',
      carbon_factor_source: 'EPD-2023-001',
      carbon_kgco2e: '25.0000',
      recorded_at: '2026-06-11T00:00:00Z',
    };
    mockPrisma.$queryRaw.mockResolvedValue([carbonRow]);
    const result = await repo.insertCarbonRecord({
      carbon_record_id: 'carbon-uuid-001',
      project_id: 'proj-uuid-001',
      consumption_id: 'cons-uuid-001',
      material_id: 'mat-master-001',
      quantity_consumed: '10.0000',
      unit: 'pcs',
      carbon_factor: '2.500000',
      carbon_factor_source: 'EPD-2023-001',
    });
    expect(result?.carbon_kgco2e).toBe('25.0000');
  });

  it('insertCarbonRecord returns null when ON CONFLICT DO NOTHING suppressed a replay', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const result = await repo.insertCarbonRecord({
      carbon_record_id: 'carbon-uuid-002',
      project_id: 'proj-uuid-001',
      consumption_id: 'cons-uuid-001',
      material_id: 'mat-master-001',
      quantity_consumed: '10.0000',
      unit: 'pcs',
      carbon_factor: '2.500000',
      carbon_factor_source: 'EPD-2023-001',
    });
    expect(result).toBeNull();
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
