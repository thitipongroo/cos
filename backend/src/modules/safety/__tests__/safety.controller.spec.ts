// Unit tests — Safety Controller (Phase 6)
import { SafetyController } from '../safety.controller';

const mockSvc = {
  createIncident: jest.fn(),
  listIncidents: jest.fn(),
  acknowledgeIncident: jest.fn(),
  createPermit: jest.fn(),
  listPermits: jest.fn(),
  approvePermit: jest.fn(),
  rejectPermit: jest.fn(),
  getCompliance: jest.fn(),
};
const mockSiteOps = {
  listChecklists: jest.fn(),
  submitInspection: jest.fn(),
};

describe('SafetyController', () => {
  let ctrl: SafetyController;

  beforeEach(() => {
    jest.clearAllMocks();
    ctrl = new SafetyController(mockSvc as never, mockSiteOps as never);
  });

  it('createIncident delegates', () => {
    const dto = { project_id: 'p1', incident_type: 'fall', severity: 'HIGH' };
    ctrl.createIncident(dto as never);
    expect(mockSvc.createIncident).toHaveBeenCalledWith(dto);
  });

  it('listIncidents parses params and delegates', () => {
    ctrl.listIncidents('p1', 'OPEN', 'HIGH', '2', '50');
    expect(mockSvc.listIncidents).toHaveBeenCalledWith({
      project_id: 'p1',
      status: 'OPEN',
      severity: 'HIGH',
      page: 2,
      limit: 50,
    });
  });

  it('listIncidents applies defaults on omitted/invalid params', () => {
    ctrl.listIncidents();
    expect(mockSvc.listIncidents).toHaveBeenCalledWith({
      project_id: undefined,
      status: undefined,
      severity: undefined,
      page: 1,
      limit: 20,
    });
    ctrl.listIncidents('p1', undefined, undefined, 'x', 'y');
    expect(mockSvc.listIncidents).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, limit: 20 }),
    );
  });

  it('acknowledgeIncident delegates', () => {
    ctrl.acknowledgeIncident('inc-1');
    expect(mockSvc.acknowledgeIncident).toHaveBeenCalledWith('inc-1');
  });

  it('createPermit delegates', () => {
    const dto = { project_id: 'p1', permit_type: 'WORK_PERMIT', permit_number: 'WP-1' };
    ctrl.createPermit(dto as never);
    expect(mockSvc.createPermit).toHaveBeenCalledWith(dto);
  });

  it('listPermits parses params and delegates', () => {
    ctrl.listPermits('p1', 'PENDING', '1', '20');
    expect(mockSvc.listPermits).toHaveBeenCalledWith({
      project_id: 'p1',
      status: 'PENDING',
      page: 1,
      limit: 20,
    });
  });

  it('listPermits applies defaults when omitted', () => {
    ctrl.listPermits();
    expect(mockSvc.listPermits).toHaveBeenCalledWith({
      project_id: undefined,
      status: undefined,
      page: 1,
      limit: 20,
    });
  });

  it('approvePermit passes tier', () => {
    ctrl.approvePermit('perm-1', { tier: 'PROJECT_MANAGER' } as never);
    expect(mockSvc.approvePermit).toHaveBeenCalledWith('perm-1', 'PROJECT_MANAGER');
  });

  // Both call shapes are asserted because the endpoint gained an OPTIONAL body on 2026-08-13 and the
  // no-body form has to keep working (QM-2) — the mobile app still sends `{}`.
  it('rejectPermit delegates with no reason when called without a body', () => {
    ctrl.rejectPermit('perm-1');
    expect(mockSvc.rejectPermit).toHaveBeenCalledWith('perm-1', undefined);
  });

  it('rejectPermit passes the reason through when one is given', () => {
    ctrl.rejectPermit('perm-1', { reason: 'Scaffold not tagged' });
    expect(mockSvc.rejectPermit).toHaveBeenCalledWith('perm-1', 'Scaffold not tagged');
  });

  it('listChecklists delegates to siteOps', () => {
    ctrl.listChecklists('p1');
    expect(mockSiteOps.listChecklists).toHaveBeenCalledWith('p1');
  });

  it('submitChecklist delegates to siteOps.submitInspection', () => {
    const dto = {
      project_id: 'p1',
      checklist_id: 'c1',
      status: 'PASSED',
      inspected_at: '2026-07-01',
    };
    ctrl.submitChecklist(dto as never);
    expect(mockSiteOps.submitInspection).toHaveBeenCalledWith(dto);
  });

  it('getCompliance delegates', () => {
    ctrl.getCompliance('p1');
    expect(mockSvc.getCompliance).toHaveBeenCalledWith('p1');
  });
});
