// Equipment Controller — unit tests
// Tests that each endpoint delegates correctly to EquipmentService.

import { EquipmentController, ProjectEquipmentController } from '../equipment.controller';

const makeSvc = () => ({
  createEquipment: jest.fn().mockResolvedValue({ equipment_id: 'eq-1' }),
  listEquipment: jest.fn().mockResolvedValue([]),
  getEquipment: jest.fn().mockResolvedValue({ equipment_id: 'eq-1' }),
  updateStatus: jest.fn().mockResolvedValue({ equipment_id: 'eq-1', status: 'IN_USE' }),
  assignToProject: jest.fn().mockResolvedValue({ assignment_id: 'a-1' }),
  returnFromProject: jest.fn().mockResolvedValue(undefined),
  logMaintenance: jest.fn().mockResolvedValue({ maintenance_id: 'm-1' }),
  recordUtilization: jest.fn().mockResolvedValue(undefined),
  getEquipmentByProject: jest.fn().mockResolvedValue([]),
});

describe('EquipmentController', () => {
  it('create — delegates to service.createEquipment', () => {
    const svc = makeSvc();
    const ctrl = new EquipmentController(svc as never);
    const dto = { equipment_name: 'Crane', equipment_type: 'CRANE', status: 'AVAILABLE' };
    ctrl.create(dto as never);
    expect(svc.createEquipment).toHaveBeenCalledWith(dto);
  });

  it('list — passes query params to service.listEquipment', () => {
    const svc = makeSvc();
    const ctrl = new EquipmentController(svc as never);
    ctrl.list('AVAILABLE', 'CRANE');
    expect(svc.listEquipment).toHaveBeenCalledWith({ status: 'AVAILABLE', type: 'CRANE' });
  });

  it('list — passes undefined query params when not supplied', () => {
    const svc = makeSvc();
    const ctrl = new EquipmentController(svc as never);
    ctrl.list();
    expect(svc.listEquipment).toHaveBeenCalledWith({ status: undefined, type: undefined });
  });

  it('getOne — delegates to service.getEquipment', () => {
    const svc = makeSvc();
    const ctrl = new EquipmentController(svc as never);
    ctrl.getOne('eq-1');
    expect(svc.getEquipment).toHaveBeenCalledWith('eq-1');
  });

  it('updateStatus — delegates to service.updateStatus', () => {
    const svc = makeSvc();
    const ctrl = new EquipmentController(svc as never);
    ctrl.updateStatus('eq-1', { status: 'IN_USE' });
    expect(svc.updateStatus).toHaveBeenCalledWith('eq-1', 'IN_USE');
  });

  it('assign — delegates to service.assignToProject', () => {
    const svc = makeSvc();
    const ctrl = new EquipmentController(svc as never);
    const dto = { project_id: 'proj-1' };
    ctrl.assign('eq-1', dto as never);
    expect(svc.assignToProject).toHaveBeenCalledWith('eq-1', dto);
  });

  it('returnEquipment — delegates to service.returnFromProject', () => {
    const svc = makeSvc();
    const ctrl = new EquipmentController(svc as never);
    const dto = { returned_condition: 'GOOD' };
    ctrl.returnEquipment('eq-1', 'asgn-1', dto as never);
    expect(svc.returnFromProject).toHaveBeenCalledWith('eq-1', 'asgn-1', dto);
  });

  it('logMaintenance — delegates to service.logMaintenance', () => {
    const svc = makeSvc();
    const ctrl = new EquipmentController(svc as never);
    const dto = { maintenance_type: 'SCHEDULED', scheduled_at: '2026-07-01T00:00:00Z' };
    ctrl.logMaintenance('eq-1', dto as never);
    expect(svc.logMaintenance).toHaveBeenCalledWith('eq-1', dto);
  });

  it('recordUtilization — delegates to service.recordUtilization', () => {
    const svc = makeSvc();
    const ctrl = new EquipmentController(svc as never);
    const dto = { recorded_at: '2026-06-08T06:00:00Z', hours_operated: 8, fuel_consumed: 100 };
    ctrl.recordUtilization('eq-1', dto as never);
    expect(svc.recordUtilization).toHaveBeenCalledWith('eq-1', dto);
  });
});

describe('ProjectEquipmentController', () => {
  it('getByProject — delegates to service.getEquipmentByProject', () => {
    const svc = makeSvc();
    const ctrl = new ProjectEquipmentController(svc as never);
    ctrl.getByProject('proj-1');
    expect(svc.getEquipmentByProject).toHaveBeenCalledWith('proj-1');
  });
});
