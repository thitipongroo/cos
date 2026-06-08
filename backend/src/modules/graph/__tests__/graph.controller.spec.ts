// Graph Controller unit tests — Phase 13
// Tests: all 5 endpoint delegation paths

import { GraphController } from '../graph.controller';
import type { GraphService } from '../graph.service';

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

  it('getVendors delegates to svc.getVendorsForProject', () => {
    svc.getVendorsForProject.mockReturnValue([]);
    ctrl.getVendors('proj-1', 'tenant-1');
    expect(svc.getVendorsForProject).toHaveBeenCalledWith('proj-1', 'tenant-1');
  });

  it('getSupplyChain delegates to svc.getSupplyChain', () => {
    svc.getSupplyChain.mockReturnValue([]);
    ctrl.getSupplyChain('proj-1', 'tenant-1');
    expect(svc.getSupplyChain).toHaveBeenCalledWith('proj-1', 'tenant-1');
  });

  it('getInspections delegates to svc.getInspectionsForProject', () => {
    svc.getInspectionsForProject.mockReturnValue([]);
    ctrl.getInspections('proj-1', 'tenant-1');
    expect(svc.getInspectionsForProject).toHaveBeenCalledWith('proj-1', 'tenant-1');
  });

  it('getVendorProjects delegates to svc.getProjectsForVendor', () => {
    svc.getProjectsForVendor.mockReturnValue([]);
    ctrl.getVendorProjects('vendor-1', 'tenant-1');
    expect(svc.getProjectsForVendor).toHaveBeenCalledWith('vendor-1', 'tenant-1');
  });

  it('getVendorInvoices delegates to svc.getInvoicesForVendor', () => {
    svc.getInvoicesForVendor.mockReturnValue([]);
    ctrl.getVendorInvoices('vendor-1', 'tenant-1');
    expect(svc.getInvoicesForVendor).toHaveBeenCalledWith('vendor-1', 'tenant-1');
  });
});
