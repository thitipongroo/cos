// Workforce Repository unit tests — Phase 22
// Mocks TenantPrismaService.run() to avoid real DB connections.

import { WorkforceRepository } from '../workforce.repository';

const mockPrisma = {
  $queryRaw: jest.fn(),
};

const mockDb = {
  run: jest.fn((fn: (p: typeof mockPrisma) => unknown) => fn(mockPrisma)),
};

describe('WorkforceRepository', () => {
  let repo: WorkforceRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new WorkforceRepository(mockDb as never);
  });

  describe('createWorker', () => {
    it('inserts worker and returns first row', async () => {
      const row = { worker_id: 'w-1', full_name: 'Alice' };
      mockPrisma.$queryRaw.mockResolvedValue([row]);
      const result = await repo.createWorker({
        worker_id: 'w-1',
        tenant_id: 'tenant-1',
        employee_code: 'EMP-001',
        full_name: 'Alice',
        trade_type: 'CARPENTER',
        employment_type: 'FULL_TIME',
        contact_phone: null,
        user_id: null,
      });
      expect(result).toBe(row);
    });
  });

  describe('findAllWorkers', () => {
    it('returns all active workers', async () => {
      const rows = [{ worker_id: 'w-1' }, { worker_id: 'w-2' }];
      mockPrisma.$queryRaw.mockResolvedValue(rows);
      const result = await repo.findAllWorkers();
      expect(result).toBe(rows);
    });
  });

  describe('findWorkerById', () => {
    it('returns worker when found', async () => {
      const row = { worker_id: 'w-1' };
      mockPrisma.$queryRaw.mockResolvedValue([row]);
      const result = await repo.findWorkerById('w-1');
      expect(result).toBe(row);
    });

    it('returns null when not found', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      const result = await repo.findWorkerById('no-such');
      expect(result).toBeNull();
    });
  });

  describe('findWorkerByUserId', () => {
    it('returns worker linked to the user when found', async () => {
      const row = { worker_id: 'w-1', user_id: 'u-1' };
      mockPrisma.$queryRaw.mockResolvedValue([row]);
      const result = await repo.findWorkerByUserId('u-1');
      expect(result).toBe(row);
    });

    it('returns null when the user has no linked worker', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      const result = await repo.findWorkerByUserId('u-none');
      expect(result).toBeNull();
    });
  });

  describe('allocateWorker', () => {
    it('inserts allocation and returns first row', async () => {
      const row = { allocation_id: 'alloc-1' };
      mockPrisma.$queryRaw.mockResolvedValue([row]);
      const result = await repo.allocateWorker({
        allocation_id: 'alloc-1',
        project_id: 'proj-1',
        worker_id: 'w-1',
        tenant_id: 'tenant-1',
        role_on_project: null,
        start_date: '2026-06-01',
        end_date: null,
        daily_rate: null,
        currency_code: null,
      });
      expect(result).toBe(row);
    });
  });

  describe('getProjectWorkforce', () => {
    it('returns allocations for project', async () => {
      const rows = [{ allocation_id: 'a-1' }];
      mockPrisma.$queryRaw.mockResolvedValue(rows);
      const result = await repo.getProjectWorkforce('proj-1');
      expect(result).toBe(rows);
    });
  });

  describe('getProjectDirectory', () => {
    it('returns the crew and binds the project id', async () => {
      const rows = [{ worker_id: 'w-1', full_name: 'Anan S.', on_site: true }];
      mockPrisma.$queryRaw.mockResolvedValue(rows);
      const result = await repo.getProjectDirectory('proj-1');
      expect(result).toBe(rows);
      expect(mockPrisma.$queryRaw.mock.calls.at(-1)!.slice(1)).toContain('proj-1');
    });

    it('derives on_site from TODAY only, and only on this project', async () => {
      // The two predicates that make `on_site` mean what the card says. Asserted on the SQL text
      // because they live in the query, not in TypeScript: drop `date_trunc` and yesterday's
      // check-in marks a worker present; drop the project match and someone on another site does.
      mockPrisma.$queryRaw.mockResolvedValue([]);
      await repo.getProjectDirectory('proj-1');
      const sql = (mockPrisma.$queryRaw.mock.calls.at(-1)![0] as string[]).join('?');
      expect(sql).toContain("date_trunc('day', now())");
      expect(sql).toContain('al.project_id = pw.project_id');
      // Rotated-off allocations are excluded, so the directory is the CURRENT crew.
      expect(sql).toContain('pw.end_date IS NULL OR pw.end_date >= CURRENT_DATE');
    });
  });

  describe('recordAttendance', () => {
    it('inserts attendance log and returns first row', async () => {
      const row = { log_id: 'log-1' };
      mockPrisma.$queryRaw.mockResolvedValue([row]);
      const result = await repo.recordAttendance({
        log_id: 'log-1',
        recorded_at: '2026-06-08T08:00:00Z',
        worker_id: 'w-1',
        project_id: 'proj-1',
        tenant_id: 'tenant-1',
        check_in_at: '2026-06-08T08:00:00Z',
        check_out_at: null,
        hours_worked: null,
      });
      expect(result).toBe(row);
    });
  });

  describe('getAttendanceHistory', () => {
    it('returns logs in date range', async () => {
      const rows = [{ log_id: 'log-1' }];
      mockPrisma.$queryRaw.mockResolvedValue(rows);
      const result = await repo.getAttendanceHistory('w-1', '2026-06-01', '2026-06-30');
      expect(result).toBe(rows);
    });
  });

  describe('submitTimesheet', () => {
    it('inserts timesheet and returns first row', async () => {
      const row = { timesheet_id: 'ts-1', status: 'SUBMITTED' };
      mockPrisma.$queryRaw.mockResolvedValue([row]);
      const result = await repo.submitTimesheet({
        timesheet_id: 'ts-1',
        period_date: '2026-06-01',
        worker_id: 'w-1',
        project_id: 'proj-1',
        tenant_id: 'tenant-1',
        regular_hours: 160,
        overtime_hours: 0,
      });
      expect(result).toBe(row);
    });
  });

  describe('approveTimesheet', () => {
    it('updates status to APPROVED and returns first row', async () => {
      const row = { timesheet_id: 'ts-1', status: 'APPROVED' };
      mockPrisma.$queryRaw.mockResolvedValue([row]);
      const result = await repo.approveTimesheet('ts-1');
      expect(result.status).toBe('APPROVED');
    });
  });

  describe('getManpowerSummary', () => {
    it('returns daily aggregates for project', async () => {
      const rows = [{ date: new Date('2026-06-08'), total_workers: 5, total_hours: '40' }];
      mockPrisma.$queryRaw.mockResolvedValue(rows);
      const result = await repo.getManpowerSummary('proj-1');
      expect(result).toBe(rows);
    });
  });
});
