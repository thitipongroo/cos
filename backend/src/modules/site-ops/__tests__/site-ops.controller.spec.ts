// Unit tests — SiteOps Controller (Phase 6)
// Verifies delegation to SiteOpsService with correct arguments.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { SiteOpsController } from '../site-ops.controller';

const mockSvc = {
  createSiteReport: jest.fn(),
  getSiteReport: jest.fn(),
  listSiteReports: jest.fn(),
  syncSiteReports: jest.fn(),
  createIssue: jest.fn(),
  updateIssue: jest.fn(),
  listIssues: jest.fn(),
  submitInspection: jest.fn(),
  listConflictRecords: jest.fn(),
  resolveConflict: jest.fn(),
};

describe('SiteOpsController', () => {
  let ctrl: SiteOpsController;

  beforeEach(() => {
    jest.clearAllMocks();
    ctrl = new SiteOpsController(mockSvc as never);
  });

  it('createSiteReport delegates to svc.createSiteReport', () => {
    const dto = { project_id: 'p-001', report_date: '2026-06-04' };
    ctrl.createSiteReport(dto as never);
    expect(mockSvc.createSiteReport).toHaveBeenCalledWith(dto);
  });

  it('listSiteReports delegates with parsed page/limit defaults', () => {
    ctrl.listSiteReports(undefined, undefined, undefined, '1', '20', undefined);
    expect(mockSvc.listSiteReports).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20, minimal: false }),
    );
  });

  it('listSiteReports sets minimal=true when query is "true"', () => {
    ctrl.listSiteReports(undefined, undefined, undefined, '1', '10', 'true');
    expect(mockSvc.listSiteReports).toHaveBeenCalledWith(
      expect.objectContaining({ minimal: true }),
    );
  });

  it('listSiteReports clamps limit to 100 max', () => {
    ctrl.listSiteReports(undefined, undefined, undefined, '1', '999', undefined);
    expect(mockSvc.listSiteReports).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });

  it('listSiteReports uses default page=1 and limit=20 when not provided (covers default param branches)', () => {
    ctrl.listSiteReports();
    expect(mockSvc.listSiteReports).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20 }),
    );
  });

  it('listSiteReports defaults page to 1 on invalid input', () => {
    ctrl.listSiteReports(undefined, undefined, undefined, 'abc', undefined, undefined);
    expect(mockSvc.listSiteReports).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
  });

  it('getSiteReport delegates to svc.getSiteReport', () => {
    ctrl.getSiteReport('r-001');
    expect(mockSvc.getSiteReport).toHaveBeenCalledWith('r-001');
  });

  it('syncSiteReports delegates to svc.syncSiteReports', () => {
    const dto = { items: [] };
    ctrl.syncSiteReports(dto as never);
    expect(mockSvc.syncSiteReports).toHaveBeenCalledWith(dto);
  });

  it('createIssue delegates to svc.createIssue', () => {
    const dto = { project_id: 'p-001', title: 'Issue', severity: 'HIGH' };
    ctrl.createIssue(dto as never);
    expect(mockSvc.createIssue).toHaveBeenCalledWith(dto);
  });

  it('updateIssue delegates to svc.updateIssue', () => {
    const dto = { description: 'Updated' };
    ctrl.updateIssue('i-001', dto as never);
    expect(mockSvc.updateIssue).toHaveBeenCalledWith('i-001', dto);
  });

  it('listIssues uses default page=1 and limit=20 when not provided (covers default param branches)', () => {
    ctrl.listIssues();
    expect(mockSvc.listIssues).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20 }),
    );
  });

  it('listIssues delegates with parsed page/limit', () => {
    ctrl.listIssues(undefined, undefined, undefined, '2', '50');
    expect(mockSvc.listIssues).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 50 }),
    );
  });

  it('listIssues defaults page to 1 on invalid input (covers || 1 branch)', () => {
    ctrl.listIssues(undefined, undefined, undefined, 'bad', '20');
    expect(mockSvc.listIssues).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
  });

  it('listIssues clamps limit to 100 max (covers Math.min branch)', () => {
    ctrl.listIssues(undefined, undefined, undefined, '1', '500');
    expect(mockSvc.listIssues).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });

  it('listIssues defaults limit to 20 on invalid input (covers || 20 branch)', () => {
    ctrl.listIssues(undefined, undefined, undefined, '1', 'bad');
    expect(mockSvc.listIssues).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
  });

  it('listSiteReports defaults limit to 20 on invalid input (covers || 20 branch)', () => {
    ctrl.listSiteReports(undefined, undefined, undefined, '1', 'bad', undefined);
    expect(mockSvc.listSiteReports).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
  });

  it('submitInspection delegates to svc.submitInspection', () => {
    const dto = {
      project_id: 'p-001',
      checklist_id: 'c-001',
      status: 'PASSED',
      inspected_at: '2026-06-04T08:00:00Z',
    };
    ctrl.submitInspection(dto as never);
    expect(mockSvc.submitInspection).toHaveBeenCalledWith(dto);
  });

  it('listConflictRecords delegates to svc.listConflictRecords', () => {
    ctrl.listConflictRecords();
    expect(mockSvc.listConflictRecords).toHaveBeenCalled();
  });

  it('resolveConflict delegates to svc.resolveConflict', () => {
    const dto = { resolution: 'use_client' };
    ctrl.resolveConflict('conflict-001', dto as never);
    expect(mockSvc.resolveConflict).toHaveBeenCalledWith('conflict-001');
  });
});
