// Graph Controller unit tests — Phase 13
// Tests: all 5 endpoint delegation paths. Tenant isolation is derived server-side
// from the JWT (clsTenantId), so the controller passes the CLS tenant — never a
// client-supplied value — to the service.

import { GraphController } from '../graph.controller';
import type { GraphService } from '../graph.service';

jest.mock('../../../shared/context/cls-context', () => ({
  clsTenantId: () => 'tenant-1',
}));

const makeService = () => ({
  getVendorsForProject: jest.fn(),
  getSupplyChain: jest.fn(),
  getInspectionsForProject: jest.fn(),
  getProjectsForVendor: jest.fn(),
  getInvoicesForVendor: jest.fn(),
});

describe('GraphController', () => {
  let ctrl: GraphController;
  let svc: ReturnType<typeof makeService>;

  beforeEach(() => {
    svc = makeService();
    ctrl = new GraphController(svc as unknown as GraphService);
  });

  it('getVendors delegates to svc.getVendorsForProject with the JWT tenant', () => {
    svc.getVendorsForProject.mockReturnValue([]);
    ctrl.getVendors('proj-1');
    expect(svc.getVendorsForProject).toHaveBeenCalledWith('proj-1', 'tenant-1');
  });

  it('getSupplyChain delegates to svc.getSupplyChain with the JWT tenant', () => {
    svc.getSupplyChain.mockReturnValue([]);
    ctrl.getSupplyChain('proj-1');
    expect(svc.getSupplyChain).toHaveBeenCalledWith('proj-1', 'tenant-1');
  });

  it('getInspections delegates to svc.getInspectionsForProject with the JWT tenant', () => {
    svc.getInspectionsForProject.mockReturnValue([]);
    ctrl.getInspections('proj-1');
    expect(svc.getInspectionsForProject).toHaveBeenCalledWith('proj-1', 'tenant-1');
  });

  it('getVendorProjects delegates to svc.getProjectsForVendor with the JWT tenant', () => {
    svc.getProjectsForVendor.mockReturnValue([]);
    ctrl.getVendorProjects('vendor-1');
    expect(svc.getProjectsForVendor).toHaveBeenCalledWith('vendor-1', 'tenant-1');
  });

  it('getVendorInvoices delegates to svc.getInvoicesForVendor with the JWT tenant', () => {
    svc.getInvoicesForVendor.mockReturnValue([]);
    ctrl.getVendorInvoices('vendor-1');
    expect(svc.getInvoicesForVendor).toHaveBeenCalledWith('vendor-1', 'tenant-1');
  });
});
