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
    const noCtx = await m.resolve<TasksRepository>(TasksRepository);
    expect(noCtx).toBeDefined();
    expect((noCtx as unknown as { tenantId: string }).tenantId).toBe('');
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

  // /sync/delta pages `task` on modified_at. An UPDATE that leaves it alone is a change no device
  // ever hears about: the API returns 200, the row is right, and the handset keeps its stale copy
  // forever. That was the state of this table until 2026-08-23, when it had no such column at all.
  it('updateTask stamps modified_at so the edit reaches devices', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([taskRow]);

    await repo.updateTask({ task_id: 'task-1', status: 'BLOCKED' });

    const sql = (mockPrisma.$queryRaw.mock.calls[0]![0] as unknown as string[]).join('?');
    expect(sql.replace(/\s+/g, ' ')).toContain('modified_at = now()');
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
    ['countBlockingIncidents'],
    ['countUndeliveredMaterials'],
  ])('%s returns the count, and 0 when no rows', async (method) => {
    const fn = (repo as unknown as Record<string, (id: string) => Promise<number>>)[method]!;
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ count: 2n }]);
    expect(await fn.call(repo, 'task-1')).toBe(2);
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    expect(await fn.call(repo, 'task-1')).toBe(0);
  });

  it('getTaskBudgetRatio returns row then null', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ allocated: '100.0000', actual: '50.0000' }]);
    expect((await repo.getTaskBudgetRatio('task-1'))?.allocated).toBe('100.0000');
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    expect(await repo.getTaskBudgetRatio('task-1')).toBeNull();
  });

  // §32.12 progress aggregates. The SQL itself is integration-tested; what matters here is the
  // mapping out of Prisma — DECIMAL comes back as a string, and an empty result must read as 0
  // rather than NaN/undefined, because the service divides by these.
  it('findProgressSums maps the aggregate row to numbers', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      {
        weight_total: 1000,
        earned_total: 45000,
        sched_weight_total: 800,
        sched_earned_total: 40000,
        sched_planned_total: 52000,
      },
    ]);

    expect(await repo.findProgressSums('proj-1')).toEqual({
      weightTotal: 1000,
      earnedTotal: 45000,
      schedWeightTotal: 800,
      schedEarnedTotal: 40000,
      schedPlannedTotal: 52000,
    });
  });

  it('findProgressSums falls back to 0 for every sum when the project has no rows', async () => {
    // A project with no BOQ-linked task returns no row at all — every field must degrade to 0.
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);

    expect(await repo.findProgressSums('proj-empty')).toEqual({
      weightTotal: 0,
      earnedTotal: 0,
      schedWeightTotal: 0,
      schedEarnedTotal: 0,
      schedPlannedTotal: 0,
    });
  });

  it('findProgressSums coerces null sums to 0', async () => {
    // COALESCE guards the SQL side, but a null still has to survive the mapping as 0.
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      {
        weight_total: null,
        earned_total: null,
        sched_weight_total: null,
        sched_earned_total: null,
        sched_planned_total: null,
      },
    ]);

    expect(await repo.findProgressSums('proj-null')).toEqual({
      weightTotal: 0,
      earnedTotal: 0,
      schedWeightTotal: 0,
      schedEarnedTotal: 0,
      schedPlannedTotal: 0,
    });
  });

  it('findSchedulableTasks returns the rows as-is', async () => {
    const rows = [
      {
        progress: 50,
        planned_start: new Date('2026-07-01'),
        planned_end: new Date('2026-07-10'),
        weight: 100,
      },
    ];
    mockPrisma.$queryRaw.mockResolvedValueOnce(rows);

    expect(await repo.findSchedulableTasks('proj-1')).toBe(rows);
  });

  it('findSchedulableTasks returns an empty list when nothing is schedulable', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);

    expect(await repo.findSchedulableTasks('proj-empty')).toEqual([]);
  });
});
