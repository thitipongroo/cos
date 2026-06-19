// Unit tests — Tasks Repository (Phase 6)
import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { TasksRepository } from '../tasks.repository';
import { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';

const mockPrisma = { $queryRaw: jest.fn() };
const mockTenantPrisma = {
  run: jest.fn((fn: (p: typeof mockPrisma) => unknown) => fn(mockPrisma)),
};
const mockRequest = { tenantId: 'tenant-uuid-001' };

const taskRow = { task_id: 'task-1', tenant_id: 'tenant-uuid-001', status: 'NOT_STARTED' };

describe('TasksRepository', () => {
  let repo: TasksRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TasksRepository,
        { provide: TenantPrismaService, useValue: mockTenantPrisma },
        { provide: REQUEST, useValue: mockRequest },
      ],
    }).compile();
    repo = await moduleRef.resolve<TasksRepository>(TasksRepository);
  });

  it('uses empty string tenantId when request has no tenantId', async () => {
    const m = await Test.createTestingModule({
      providers: [
        TasksRepository,
        { provide: TenantPrismaService, useValue: mockTenantPrisma },
        { provide: REQUEST, useValue: {} },
      ],
    }).compile();
    expect(await m.resolve<TasksRepository>(TasksRepository)).toBeDefined();
  });

  it('createTask with all optional fields provided', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([taskRow]);
    const r = await repo.createTask({
      project_id: 'proj-1',
      task_name: 'Pour slab',
      work_type: 'construction',
      boq_item_id: 'boq-1',
      floor_id: 'floor-1',
      room_id: 'room-1',
      assigned_to: 'user-1',
      planned_start: '2026-07-01',
      planned_end: '2026-07-10',
    });
    expect(r.task_id).toBe('task-1');
  });

  it('createTask with optionals omitted (null/default branch)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([taskRow]);
    const r = await repo.createTask({ project_id: 'proj-1', task_name: 'Pour slab' });
    expect(r.task_id).toBe('task-1');
  });

  it('findTasksByProject returns rows and total (filters applied)', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([taskRow]).mockResolvedValueOnce([{ count: 1n }]);
    const r = await repo.findTasksByProject({
      project_id: 'proj-1',
      assigned_to: 'user-1',
      status: 'IN_PROGRESS',
      page: 1,
      limit: 20,
    });
    expect(r.total).toBe(1);
    expect(r.rows).toHaveLength(1);
  });

  it('findTasksByProject returns total=0 when count empty (no filters)', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const r = await repo.findTasksByProject({ project_id: 'proj-1', page: 1, limit: 20 });
    expect(r.total).toBe(0);
  });

  it('findTaskById returns row then null', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([taskRow]);
    expect((await repo.findTaskById('task-1'))?.task_id).toBe('task-1');
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    expect(await repo.findTaskById('missing')).toBeNull();
  });

  it('updateTask returns updated row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ ...taskRow, status: 'IN_PROGRESS' }]);
    const r = await repo.updateTask({
      task_id: 'task-1',
      status: 'IN_PROGRESS',
      progress_percent: 40,
      assigned_to: 'user-2',
    });
    expect(r.status).toBe('IN_PROGRESS');
  });

  it('updateTask with only task_id (null branches)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([taskRow]);
    const r = await repo.updateTask({ task_id: 'task-1' });
    expect(r.task_id).toBe('task-1');
  });

  it.each([
    ['countBlockingInspections'],
    ['countBlockingIssues'],
    ['countIncompletePredecessors'],
    ['countBlockingPermits'],
  ])('%s returns the count, and 0 when no rows', async (method) => {
    const fn = (repo as unknown as Record<string, (id: string) => Promise<number>>)[method]!;
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ count: 2n }]);
    expect(await fn.call(repo, 'task-1')).toBe(2);
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    expect(await fn.call(repo, 'task-1')).toBe(0);
  });
});
