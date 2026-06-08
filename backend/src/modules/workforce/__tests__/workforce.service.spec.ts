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

type MockRequest = { tenantId: string; user: { sub: string } };

const makeRepo = () => ({
  createWorker: jest.fn(),
  findAllWorkers: jest.fn(),
  findWorkerById: jest.fn(),
  allocateWorker: jest.fn(),
  getProjectWorkforce: jest.fn(),
  recordAttendance: jest.fn(),
  getAttendanceHistory: jest.fn(),
  submitTimesheet: jest.fn(),
  approveTimesheet: jest.fn(),
  getManpowerSummary: jest.fn(),
});

const makeReq = (userId = 'user-1', tenantId = 'tenant-1'): MockRequest => ({
  tenantId,
  user: { sub: userId },
});

import { NotFoundException } from '@nestjs/common';
import { WorkforceService } from '../workforce.service';

describe('WorkforceService', () => {
  let service: WorkforceService;
  let repo: ReturnType<typeof makeRepo>;
  const req = makeReq();

  beforeEach(() => {
    repo = makeRepo();
    service = new WorkforceService(
      req as unknown as ConstructorParameters<typeof WorkforceService>[0],
      repo as unknown as WorkforceRepository,
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
      const { KafkaProducer } = jest.requireMock('@cos/shared');
      const kafkaMock = { connect: jest.fn(), publish: jest.fn() };
      KafkaProducer.mockImplementation(() => kafkaMock);
      repo = makeRepo();
      service = new WorkforceService(
        req as unknown as ConstructorParameters<typeof WorkforceService>[0],
        repo as unknown as WorkforceRepository,
      );

      repo.findWorkerById.mockResolvedValue({ worker_id: 'w1' });
      repo.recordAttendance.mockResolvedValue({ log_id: 'log-1' });

      await service.recordAttendance('w1', {
        project_id: 'proj-1',
        check_in_at: '2026-06-08T08:00:00Z',
      });

      expect(kafkaMock.publish).toHaveBeenCalledWith(
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
      const { KafkaProducer } = jest.requireMock('@cos/shared');
      const kafkaMock = { connect: jest.fn(), publish: jest.fn() };
      KafkaProducer.mockImplementation(() => kafkaMock);
      repo = makeRepo();
      service = new WorkforceService(
        req as unknown as ConstructorParameters<typeof WorkforceService>[0],
        repo as unknown as WorkforceRepository,
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
      expect(kafkaMock.publish).toHaveBeenCalledWith(
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
});
