// Workforce Service unit tests — Phase 22
// Tests: attendance calculation, timesheet aggregation, check-in/out cycle

jest.mock('@cos/shared', () => ({
  KafkaProducer: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

import type { WorkforceRepository } from '../workforce.repository';

type MockRequest = { tenantId: string; userId: string };

const makeRepo = () => ({
  createWorker: jest.fn(),
  findAllWorkers: jest.fn(),
  findWorkerById: jest.fn(),
  findWorkerByUserId: jest.fn(),
  allocateWorker: jest.fn(),
  getProjectWorkforce: jest.fn(),
  getProjectDirectory: jest.fn(),
  recordAttendance: jest.fn(),
  getAttendanceHistory: jest.fn(),
  submitTimesheet: jest.fn(),
  approveTimesheet: jest.fn(),
  getManpowerSummary: jest.fn(),
});

// req.userId — the PLATFORM user UUID. The mock used to supply `user: { sub }`, which is the
// KEYCLOAK id and, under the Fastify adapter, does not reliably reach a Scope.REQUEST provider at
// all — so the service read undefined and attributed every event to the literal 'system'.
const makeReq = (userId = 'user-1', tenantId = 'tenant-1'): MockRequest => ({
  tenantId,
  userId,
});

import { NotFoundException } from '@nestjs/common';
import { WorkforceService } from '../workforce.service';
import { makeOutboxDouble } from '../../../shared/events/__tests__/outbox-double';

describe('WorkforceService', () => {
  let service: WorkforceService;
  let repo: ReturnType<typeof makeRepo>;
  const req = makeReq();

  beforeEach(() => {
    repo = makeRepo();
    service = new WorkforceService(
      req as unknown as ConstructorParameters<typeof WorkforceService>[0],
      repo as unknown as WorkforceRepository,
      makeOutboxDouble().service,
    );
  });

  describe('attendance calculation', () => {
    it('calculates hours_worked from check_in and check_out when not provided', async () => {
      const worker = { worker_id: 'w1', full_name: 'Alice' };
      repo.findWorkerById.mockResolvedValue(worker);
      repo.recordAttendance.mockImplementation(async (p: { hours_worked: number }) => ({
        log_id: 'log-1',
        hours_worked: String(p.hours_worked),
      }));

      await service.recordAttendance('w1', {
        project_id: 'proj-1',
        check_in_at: '2026-06-08T08:00:00Z',
        check_out_at: '2026-06-08T17:00:00Z',
      });

      const callArg = repo.recordAttendance.mock.calls[0][0];
      expect(callArg.hours_worked).toBeCloseTo(9, 1);
    });

    it('uses provided hours_worked when supplied', async () => {
      repo.findWorkerById.mockResolvedValue({ worker_id: 'w1' });
      repo.recordAttendance.mockResolvedValue({ log_id: 'log-1' });

      await service.recordAttendance('w1', {
        project_id: 'proj-1',
        hours_worked: 7.5,
      });

      const callArg = repo.recordAttendance.mock.calls[0][0];
      expect(callArg.hours_worked).toBe(7.5);
    });

    it('emits checkin event when only check_in_at is set', async () => {
      const outboxMock = makeOutboxDouble();
      repo = makeRepo();
      service = new WorkforceService(
        req as unknown as ConstructorParameters<typeof WorkforceService>[0],
        repo as unknown as WorkforceRepository,
        outboxMock.service,
      );

      repo.findWorkerById.mockResolvedValue({ worker_id: 'w1' });
      repo.recordAttendance.mockResolvedValue({ log_id: 'log-1' });

      await service.recordAttendance('w1', {
        project_id: 'proj-1',
        check_in_at: '2026-06-08T08:00:00Z',
      });

      expect(outboxMock.publish).toHaveBeenCalledWith(
        expect.objectContaining({ event_type: 'workforce.checkin.created.v1' }),
      );
    });

    it('throws if worker not found', async () => {
      repo.findWorkerById.mockResolvedValue(null);
      await expect(
        service.recordAttendance('unknown', { project_id: 'proj-1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('timesheet aggregation', () => {
    it('approves timesheet and emits event with total_hours', async () => {
      const outboxMock = makeOutboxDouble();
      repo = makeRepo();
      service = new WorkforceService(
        req as unknown as ConstructorParameters<typeof WorkforceService>[0],
        repo as unknown as WorkforceRepository,
        outboxMock.service,
      );

      const ts = {
        timesheet_id: 'ts-1',
        worker_id: 'w1',
        project_id: 'proj-1',
        period_date: new Date('2026-06-01'),
        regular_hours: '160',
        overtime_hours: '8',
        status: 'APPROVED',
      };
      repo.approveTimesheet.mockResolvedValue(ts);

      const result = await service.approveTimesheet('ts-1');
      expect(result.status).toBe('APPROVED');
      expect(outboxMock.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'workforce.timesheet.approved.v1',
          payload: expect.objectContaining({ total_hours: 168 }),
        }),
      );
    });

    it('throws if timesheet not found on approve', async () => {
      repo.approveTimesheet.mockResolvedValue(null);
      await expect(service.approveTimesheet('unknown')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('submits timesheet with zero overtime when not provided', async () => {
      repo.findWorkerById.mockResolvedValue({ worker_id: 'w1' });
      repo.submitTimesheet.mockResolvedValue({ timesheet_id: 'ts-1', status: 'SUBMITTED' });

      const result = await service.submitTimesheet({
        worker_id: 'w1',
        project_id: 'proj-1',
        period_date: '2026-06-01',
        regular_hours: 160,
      });

      expect(result.status).toBe('SUBMITTED');
      expect(repo.submitTimesheet).toHaveBeenCalledWith(
        expect.objectContaining({ overtime_hours: 0 }),
      );
    });
  });

  describe('check-in/out cycle integration', () => {
    it('can record check-in then check-out for same worker', async () => {
      repo.findWorkerById.mockResolvedValue({ worker_id: 'w1' });
      repo.recordAttendance
        .mockResolvedValueOnce({ log_id: 'log-1', check_in_at: '2026-06-08T08:00:00Z' })
        .mockResolvedValueOnce({ log_id: 'log-2', check_out_at: '2026-06-08T17:00:00Z' });

      const checkIn = await service.recordAttendance('w1', {
        project_id: 'proj-1',
        check_in_at: '2026-06-08T08:00:00Z',
      });
      const checkOut = await service.recordAttendance('w1', {
        project_id: 'proj-1',
        check_out_at: '2026-06-08T17:00:00Z',
      });

      expect(checkIn.log_id).toBe('log-1');
      expect(checkOut.log_id).toBe('log-2');
      expect(repo.recordAttendance).toHaveBeenCalledTimes(2);
    });
  });

  describe('createWorker', () => {
    it('delegates to repo.createWorker and returns row', async () => {
      const row = { worker_id: 'w-new', full_name: 'Bob' };
      repo.createWorker.mockResolvedValue(row);
      const result = await service.createWorker({
        employee_code: 'EMP-001',
        full_name: 'Bob',
        trade_type: 'CARPENTER',
        employment_type: 'FULL_TIME',
      } as never);
      expect(result).toBe(row);
    });
  });

  describe('listWorkers', () => {
    it('returns all active workers', async () => {
      repo.findAllWorkers.mockResolvedValue([{ worker_id: 'w1' }, { worker_id: 'w2' }]);
      const result = await service.listWorkers();
      expect(result).toHaveLength(2);
    });
  });

  describe('allocateToProject', () => {
    it('allocates worker and returns allocation row', async () => {
      repo.findWorkerById.mockResolvedValue({ worker_id: 'w1' });
      repo.allocateWorker.mockResolvedValue({ allocation_id: 'alloc-1' });
      const result = await service.allocateToProject('proj-1', {
        worker_id: 'w1',
        start_date: '2026-06-01',
      } as never);
      expect(result).toEqual({ allocation_id: 'alloc-1' });
    });

    it('throws NotFoundException if worker does not exist', async () => {
      repo.findWorkerById.mockResolvedValue(null);
      await expect(
        service.allocateToProject('proj-1', {
          worker_id: 'unknown',
          start_date: '2026-06-01',
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getProjectWorkforce', () => {
    it('returns workforce allocations for project', async () => {
      repo.getProjectWorkforce.mockResolvedValue([{ allocation_id: 'a1' }]);
      const result = await service.getProjectWorkforce('proj-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('getProjectDirectory', () => {
    it('returns the project crew with its on-site state', async () => {
      repo.getProjectDirectory.mockResolvedValue([{ worker_id: 'w1', on_site: true }]);
      const result = await service.getProjectDirectory('proj-1');
      expect(result).toEqual([{ worker_id: 'w1', on_site: true }]);
      expect(repo.getProjectDirectory).toHaveBeenCalledWith('proj-1');
    });
  });

  describe('getAttendanceHistory', () => {
    it('returns attendance logs for worker in date range', async () => {
      repo.findWorkerById.mockResolvedValue({ worker_id: 'w1' });
      repo.getAttendanceHistory.mockResolvedValue([{ log_id: 'log-1' }]);
      const result = await service.getAttendanceHistory('w1', '2026-06-01', '2026-06-30');
      expect(result).toHaveLength(1);
      expect(repo.getAttendanceHistory).toHaveBeenCalledWith('w1', '2026-06-01', '2026-06-30');
    });
  });

  describe('getManpowerSummary', () => {
    it('returns aggregated daily summary', async () => {
      repo.getManpowerSummary.mockResolvedValue([
        { date: new Date('2026-06-08'), total_workers: 5, total_hours: '40' },
      ]);
      const result = await service.getManpowerSummary('proj-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('actor attribution when the request carries no user id', () => {
    it('records the CLS user rather than the literal "system"', async () => {
      // This used to assert actor_id: 'system'. Every workforce event was then attributed to nobody
      // — an audit trail that answers "who checked this worker in?" with a placeholder. It did not
      // crash, unlike the equipment module's version of the same getter, because actor_id lands in
      // the outbox payload JSON rather than in a UUID column. That is exactly why it survived.
      const outboxMock = makeOutboxDouble();
      const noUserReq = { tenantId: 'tenant-1' };
      repo = makeRepo();
      service = new WorkforceService(
        noUserReq as unknown as ConstructorParameters<typeof WorkforceService>[0],
        repo as unknown as WorkforceRepository,
        outboxMock.service,
      );
      repo.findWorkerById.mockResolvedValue({ worker_id: 'w1' });
      repo.recordAttendance.mockResolvedValue({ log_id: 'log-1' });

      await service.recordAttendance('w1', {
        project_id: 'proj-1',
        check_in_at: '2026-06-08T08:00:00Z',
      });

      // No CLS context in a bare unit test, so clsUserId() returns '' — the point is that the
      // fabricated 'system' identity is gone, not that a specific id appears here.
      expect(outboxMock.publish).toHaveBeenCalledWith(expect.objectContaining({ actor_id: '' }));
    });
  });

  describe('submitTimesheet with no regular_hours', () => {
    it('defaults regular_hours to 0 when not provided', async () => {
      repo.findWorkerById.mockResolvedValue({ worker_id: 'w1' });
      repo.submitTimesheet.mockResolvedValue({ timesheet_id: 'ts-1', status: 'SUBMITTED' });

      await service.submitTimesheet({
        worker_id: 'w1',
        project_id: 'proj-1',
        period_date: '2026-06-01',
      } as never);

      expect(repo.submitTimesheet).toHaveBeenCalledWith(
        expect.objectContaining({ regular_hours: 0 }),
      );
    });
  });

  describe('getMyWorker', () => {
    it('returns the worker linked to the user', async () => {
      const worker = { worker_id: 'w-1', user_id: 'u-1' };
      repo.findWorkerByUserId.mockResolvedValue(worker);
      await expect(service.getMyWorker('u-1')).resolves.toBe(worker);
      expect(repo.findWorkerByUserId).toHaveBeenCalledWith('u-1');
    });

    it('throws NotFoundException when no worker is linked', async () => {
      repo.findWorkerByUserId.mockResolvedValue(null);
      await expect(service.getMyWorker('u-none')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
