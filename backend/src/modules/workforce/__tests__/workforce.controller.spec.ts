// Workforce Controller — unit tests
// Tests that each endpoint delegates correctly to WorkforceService.

import {
  WorkerController,
  ProjectWorkforceController,
  TimesheetController,
} from '../workforce.controller';
import { ClsServiceManager } from 'nestjs-cls';
import { CLS_USER_ID } from '../../../shared/context/cls-context';

const makeSvc = () => ({
  createWorker: jest.fn().mockResolvedValue({ worker_id: 'w-1' }),
  listWorkers: jest.fn().mockResolvedValue([]),
  getWorker: jest.fn().mockResolvedValue({ worker_id: 'w-1' }),
  getMyWorker: jest.fn().mockResolvedValue({ worker_id: 'w-1' }),
  recordAttendance: jest.fn().mockResolvedValue({ log_id: 'log-1' }),
  getAttendanceHistory: jest.fn().mockResolvedValue([]),
  allocateToProject: jest.fn().mockResolvedValue({ allocation_id: 'alloc-1' }),
  getProjectWorkforce: jest.fn().mockResolvedValue([]),
  getManpowerSummary: jest.fn().mockResolvedValue({}),
  submitTimesheet: jest.fn().mockResolvedValue({ timesheet_id: 'ts-1' }),
  approveTimesheet: jest.fn().mockResolvedValue({ timesheet_id: 'ts-1', status: 'APPROVED' }),
});

describe('WorkerController', () => {
  it('create — delegates to service.createWorker', () => {
    const svc = makeSvc();
    const ctrl = new WorkerController(svc as never);
    const dto = { full_name: 'Alice', trade: 'CARPENTER' };
    ctrl.create(dto as never);
    expect(svc.createWorker).toHaveBeenCalledWith(dto);
  });

  it('list — delegates to service.listWorkers', () => {
    const svc = makeSvc();
    const ctrl = new WorkerController(svc as never);
    ctrl.list();
    expect(svc.listWorkers).toHaveBeenCalled();
  });

  it('getMyWorker — resolves the worker linked to the request user', () => {
    const svc = makeSvc();
    const ctrl = new WorkerController(svc as never);
    ctrl.getMyWorker({ userId: 'u-1' } as never);
    expect(svc.getMyWorker).toHaveBeenCalledWith('u-1');
  });

  it('getMyWorker — falls back to the CLS user id when req.userId is absent (Fastify)', async () => {
    const svc = makeSvc();
    const ctrl = new WorkerController(svc as never);
    const cls = ClsServiceManager.getClsService();
    await cls.run(async () => {
      cls.set(CLS_USER_ID, 'cls-user-9');
      ctrl.getMyWorker({} as never);
    });
    expect(svc.getMyWorker).toHaveBeenCalledWith('cls-user-9');
  });

  it('getOne — delegates to service.getWorker', () => {
    const svc = makeSvc();
    const ctrl = new WorkerController(svc as never);
    ctrl.getOne('w-1');
    expect(svc.getWorker).toHaveBeenCalledWith('w-1');
  });

  it('recordAttendance — delegates to service.recordAttendance', () => {
    const svc = makeSvc();
    const ctrl = new WorkerController(svc as never);
    const dto = { project_id: 'proj-1', check_in_at: '2026-06-08T08:00:00Z' };
    ctrl.recordAttendance('w-1', dto as never);
    expect(svc.recordAttendance).toHaveBeenCalledWith('w-1', dto);
  });

  it('getAttendance — delegates to service.getAttendanceHistory', () => {
    const svc = makeSvc();
    const ctrl = new WorkerController(svc as never);
    ctrl.getAttendance('w-1', '2026-06-01', '2026-06-30');
    expect(svc.getAttendanceHistory).toHaveBeenCalledWith('w-1', '2026-06-01', '2026-06-30');
  });
});

describe('ProjectWorkforceController', () => {
  it('allocate — delegates to service.allocateToProject', () => {
    const svc = makeSvc();
    const ctrl = new ProjectWorkforceController(svc as never);
    const dto = { worker_id: 'w-1', role: 'FOREMAN' };
    ctrl.allocate('proj-1', dto as never);
    expect(svc.allocateToProject).toHaveBeenCalledWith('proj-1', dto);
  });

  it('list — delegates to service.getProjectWorkforce', () => {
    const svc = makeSvc();
    const ctrl = new ProjectWorkforceController(svc as never);
    ctrl.list('proj-1');
    expect(svc.getProjectWorkforce).toHaveBeenCalledWith('proj-1');
  });

  it('summary — delegates to service.getManpowerSummary', () => {
    const svc = makeSvc();
    const ctrl = new ProjectWorkforceController(svc as never);
    ctrl.summary('proj-1');
    expect(svc.getManpowerSummary).toHaveBeenCalledWith('proj-1');
  });
});

describe('TimesheetController', () => {
  it('submit — delegates to service.submitTimesheet', () => {
    const svc = makeSvc();
    const ctrl = new TimesheetController(svc as never);
    const dto = {
      worker_id: 'w-1',
      project_id: 'proj-1',
      period_date: '2026-06-01',
      regular_hours: 160,
    };
    ctrl.submit(dto as never);
    expect(svc.submitTimesheet).toHaveBeenCalledWith(dto);
  });

  it('approve — delegates to service.approveTimesheet', () => {
    const svc = makeSvc();
    const ctrl = new TimesheetController(svc as never);
    ctrl.approve('ts-1');
    expect(svc.approveTimesheet).toHaveBeenCalledWith('ts-1');
  });
});
