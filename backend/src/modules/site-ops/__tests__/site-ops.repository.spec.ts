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

  it('createSiteReport persists shift and blocker_category (20260808000001)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { ...reportRow, shift: 'NIGHT', blocker_category: 'WEATHER' },
    ]);
    const result = await repo.createSiteReport({
      report_id: 'report-uuid-003',
      project_id: 'proj-uuid-001',
      submitted_by: 'user-uuid-001',
      report_date: '2026-06-04',
      summary: null,
      blocker_category: 'WEATHER',
      weather: null,
      manpower_count: null,
      shift: 'NIGHT',
      client_submitted_at: null,
    });
    expect(result.shift).toBe('NIGHT');
    expect(result.blocker_category).toBe('WEATHER');
  });

  // ── Manpower logs (master §Phase 6) ─────────────────────────────────────────

  it('replaceManpowerLogs deletes the old breakdown then inserts each line', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(1);

    await repo.replaceManpowerLogs('report-uuid-001', [
      { trade_type: 'ELECTRICAL', worker_count: 8, hours_worked: 8 },
      { trade_type: 'STRUCTURAL', worker_count: 16, hours_worked: 10 },
    ]);

    // One DELETE + one INSERT per line, and both inside a SINGLE db.run transaction — a report must
    // never be observable with its old breakdown gone and the new one not yet written.
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(3);
    expect(mockTenantPrisma.run).toHaveBeenCalledTimes(1);
  });

  it('replaceManpowerLogs still clears the breakdown when given no lines', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(1);
    await repo.replaceManpowerLogs('report-uuid-001', []);
    // The DELETE alone — an empty array means "nobody on site", which is a statement, not a no-op.
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('listManpowerLogs returns the report breakdown', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      {
        log_id: 'log-uuid-001',
        report_id: 'report-uuid-001',
        tenant_id: 'tenant-uuid-001',
        trade_type: 'STRUCTURAL',
        worker_count: 16,
        hours_worked: '8.00',
      },
    ]);
    const rows = await repo.listManpowerLogs('report-uuid-001');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.trade_type).toBe('STRUCTURAL');
  });

  it('listManpowerLogs returns an empty list for a report with no breakdown', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    expect(await repo.listManpowerLogs('report-uuid-001')).toEqual([]);
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
    expect(result!.issue_id).toBe('issue-uuid-001');
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

  // The signature is SERIALISED in the repository (migration 20260808000002), so both sides of that
  // decision belong here rather than in the service: strokes → a JSON string bound to a ::jsonb
  // parameter, no strokes → a real SQL NULL. Binding the array itself would make Prisma send a
  // Postgres array, not JSONB, and the insert would fail at runtime with no test to catch it.
  it('createInspection serialises the signature strokes for the jsonb column', async () => {
    const signature = [{ d: 'M0.1,0.2 L0.3,0.4', color: '#FFFFFF', width: 0.006 }];
    mockPrisma.$queryRaw.mockResolvedValue([{ ...inspectionRow, signature }]);
    const result = await repo.createInspection({
      inspection_id: 'insp-uuid-003',
      project_id: 'proj-uuid-001',
      checklist_id: 'cl-uuid-001',
      status: 'PASSED',
      inspected_by: 'user-uuid-001',
      inspected_at: '2026-08-08T08:00:00Z',
      notes: null,
      signature,
    });
    // The bound value is the JSON text, never the array object.
    const bound = mockPrisma.$queryRaw.mock.calls.at(-1)!.slice(1) as unknown[];
    expect(bound).toContain(JSON.stringify(signature));
    expect(result.signature).toEqual(signature);
  });

  it('createInspection binds NULL when the inspection is unsigned', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ ...inspectionRow, signature: null }]);
    await repo.createInspection({
      inspection_id: 'insp-uuid-004',
      project_id: 'proj-uuid-001',
      checklist_id: 'cl-uuid-001',
      status: 'PASSED',
      inspected_by: 'user-uuid-001',
      inspected_at: '2026-08-08T08:00:00Z',
      notes: null,
      signature: null,
    });
    const bound = mockPrisma.$queryRaw.mock.calls.at(-1)!.slice(1) as unknown[];
    expect(bound).toContain(null);
    expect(bound.some((v) => typeof v === 'string' && v.startsWith('['))).toBe(false);
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

  // Phase 8 Outbox Pattern (§35.13 ESC-13): the outbox row goes through the SAME tx handle as the
  // business write, and the builder is skipped whenever there is no row to build from.
  describe('outbox writes', () => {
    const envelope = {
      event_type: 'site.inspection.passed.v1',
      event_version: '1.0',
      tenant_id: 'tenant-uuid-001',
      actor_id: 'user-uuid-001',
      occurred_at: '2026-08-22T00:00:00.000Z',
      correlation_id: 'corr-1',
      payload: { inspection_id: 'insp-1' },
    };

    it('updateInspectionStatus builds the event from the UPDATEd row', async () => {
      const row = { inspection_id: 'insp-1', project_id: 'proj-uuid-001' };
      mockPrisma.$queryRaw.mockResolvedValue([row]);
      const builder = jest.fn(() => envelope);

      await repo.updateInspectionStatus(
        { inspection_id: 'insp-1', status: 'PASSED' },
        builder as never,
      );

      expect(builder).toHaveBeenCalledWith(row);
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('updateInspectionStatus writes nothing when the UPDATE matched no row', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      const builder = jest.fn();
      await repo.updateInspectionStatus(
        { inspection_id: 'missing', status: 'PASSED' },
        builder as never,
      );
      expect(builder).not.toHaveBeenCalled();
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    // The true branch of every optional-outbox write: the outbox INSERT rides the SAME tx handle.
    it('every optional-outbox write emits one outbox row through the business tx', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'x' }]);
      const e = envelope as never;

      await repo.createSiteReport(
        {
          report_id: 'r-1',
          project_id: 'p-1',
          submitted_by: 'u-1',
          report_date: '2026-06-04',
          summary: null,
          weather: null,
          manpower_count: null,
          client_submitted_at: null,
        },
        e,
      );
      await repo.createIssue(
        {
          issue_id: 'i-1',
          issue_number: 'ISS-2026-0001',
          project_id: 'p-1',
          report_id: null,
          title: 't',
          description: null,
          severity: 'HIGH',
          assigned_to: null,
          created_by: 'user-uuid-001',
          client_submitted_at: null,
        },
        e,
      );
      await repo.updateIssueStatus('i-1', 'RESOLVED', 'done', (() => envelope) as never);
      await repo.createInspection(
        {
          inspection_id: 'insp-1',
          project_id: 'p-1',
          checklist_id: 'chk-1',
          status: 'PASSED',
          inspected_by: 'u-1',
          inspected_at: '2026-06-04T08:00:00Z',
          notes: null,
        },
        e,
      );
      await repo.createConflictRecord(
        {
          conflict_id: 'c-1',
          entity_type: 'issues',
          entity_id: 'i-1',
          client_payload: {},
          server_payload: {},
          conflict_type: 'STATUS_CONFLICT',
        },
        e,
      );
      await repo.insertMaterialConsumption(
        {
          consumption_id: 'mc-1',
          project_id: 'p-1',
          report_id: 'r-1',
          material_name: 'cement',
          material_id: 'm-1',
          task_id: null,
          quantity: '10',
          unit: 'bag',
          consumed_by: 'u-1',
          consumed_at: '2026-06-04T08:00:00Z',
        },
        e,
      );

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(6);
    });

    // The false branch of every optional-outbox write: the same method used without an event
    // must issue no outbox INSERT at all.
    it('every optional-outbox write skips the outbox when no event is supplied', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ id: 'x' }]);

      await repo.createSiteReport({
        report_id: 'r-1',
        project_id: 'p-1',
        submitted_by: 'u-1',
        report_date: '2026-06-04',
        summary: null,
        weather: null,
        manpower_count: null,
        client_submitted_at: null,
      });
      await repo.createIssue({
        issue_id: 'i-1',
        issue_number: 'ISS-2026-0001',
        project_id: 'p-1',
        report_id: null,
        title: 't',
        description: null,
        severity: 'HIGH',
        assigned_to: null,
        created_by: 'user-uuid-001',
        client_submitted_at: null,
      });
      await repo.updateIssue('i-1', { status: 'OPEN' });
      await repo.updateIssueStatus('i-1', 'RESOLVED', null);
      await repo.createInspection({
        inspection_id: 'insp-1',
        project_id: 'p-1',
        checklist_id: 'chk-1',
        status: 'PASSED',
        inspected_by: 'u-1',
        inspected_at: '2026-06-04T08:00:00Z',
        notes: null,
      });
      await repo.createConflictRecord({
        conflict_id: 'c-1',
        entity_type: 'issues',
        entity_id: 'i-1',
        client_payload: {},
        server_payload: {},
        conflict_type: 'STATUS_CONFLICT',
      });
      await repo.insertMaterialConsumption({
        consumption_id: 'mc-1',
        project_id: 'p-1',
        report_id: 'r-1',
        material_name: 'cement',
        material_id: 'm-1',
        task_id: null,
        quantity: '10',
        unit: 'bag',
        consumed_by: 'u-1',
        consumed_at: '2026-06-04T08:00:00Z',
      });

      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('updateIssueStatus writes nothing when the UPDATE matched no row', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      const builder = jest.fn();
      const r = await repo.updateIssueStatus('missing', 'RESOLVED', null, builder as never);
      expect(r).toBeNull();
      expect(builder).not.toHaveBeenCalled();
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('writeOutboxEvent writes the event with no business write alongside it', async () => {
      await repo.writeOutboxEvent(envelope as never);
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
      expect(mockTenantPrisma.run).toHaveBeenCalledTimes(1);
    });

    it('createIssue returns null when the issue_id is already taken (ON CONFLICT DO NOTHING)', async () => {
      // The offline replay: /sync/push resends a queued create under the same client UUID. This used to
      // raise a primary-key violation, which the device's outbox read as a retryable failure.
      mockPrisma.$queryRaw.mockResolvedValue([]);
      await expect(
        repo.createIssue({
          issue_id: 'issue-uuid-001',
          issue_number: 'ISS-2026-0001',
          project_id: 'proj-uuid-001',
          report_id: null,
          title: 'Cracked slab',
          description: null,
          severity: 'HIGH',
          assigned_to: null,
          created_by: 'user-uuid-001',
          client_submitted_at: null,
        }),
      ).resolves.toBeNull();
    });
  });

  // ── projectExists ────────────────────────────────────────────────────────
  //
  // The check that keeps an unknown project_id away from the FOREIGN KEY. It delegates to the same
  // helper the spatial repositories use, so the SQL itself is tested there; what matters here is
  // that the delegation carries the CALLER'S TENANT — a check that ignored it would let a write
  // reference another tenant's project and pass.

  describe('projectExists', () => {
    it('reports true when the row is there', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ exists: true }]);

      await expect(repo.projectExists('proj-uuid-001')).resolves.toBe(true);
    });

    it('reports false when it is not', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ exists: false }]);

      await expect(repo.projectExists('ghost')).resolves.toBe(false);
    });

    it('scopes the lookup to the caller tenant', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ exists: true }]);

      await repo.projectExists('proj-uuid-001');

      const params = mockPrisma.$queryRaw.mock.calls[0].slice(1);
      expect(params).toContain('proj-uuid-001');
      expect(params).toContain('tenant-uuid-001');
    });

    it('reports false rather than throwing when the query returns nothing', async () => {
      // EXISTS always yields a row in practice; a defensive false is still the right answer if it
      // ever does not, because throwing here would turn a create into a 500 again.
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(repo.projectExists('proj-uuid-001')).resolves.toBe(false);
    });
  });
});
