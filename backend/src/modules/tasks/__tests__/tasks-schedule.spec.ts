// Unit tests — the schedule half of TasksService (ADR-097).
//
// The CPM arithmetic itself is covered by cpm.spec.ts against literal arrays. What is tested here is
// the part that only the service does: turning day offsets back into calendar dates, the three
// checks that guard `addDependency`, and the promise that completion gate 3 was left alone.
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { TasksService } from '../tasks.service';
import { TasksRepository } from '../tasks.repository';

const mockRepo = {
  findScheduleTasks: jest.fn(),
  findDependencies: jest.fn(),
  findTaskProjects: jest.fn(),
  createDependency: jest.fn(),
  deleteDependency: jest.fn(),
  portfolioTaskSummary: jest.fn(),
  // Gate-3 counter — present so the "left alone" assertion can prove it is never called.
  countIncompletePredecessors: jest.fn(),
};

const PROJECT = '11111111-1111-4111-8111-111111111111';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function scheduleTask(task_id: string, start: string | null, end: string | null) {
  return {
    task_id,
    task_name: `task ${task_id.slice(0, 4)}`,
    status: 'IN_PROGRESS' as const,
    work_type: 'STRUCTURE',
    planned_start: start === null ? null : new Date(`${start}T00:00:00.000Z`),
    planned_end: end === null ? null : new Date(`${end}T00:00:00.000Z`),
  };
}

function dependency(predecessor_task_id: string, successor_task_id: string) {
  return {
    dependency_id: `dep-${predecessor_task_id.slice(0, 4)}-${successor_task_id.slice(0, 4)}`,
    tenant_id: 'tenant-1',
    project_id: PROJECT,
    predecessor_task_id,
    successor_task_id,
    dependency_type: 'FS' as const,
    lag_days: 0,
    created_at: new Date('2026-09-01T00:00:00.000Z'),
    modified_at: new Date('2026-09-01T00:00:00.000Z'),
  };
}

let service: TasksService;

beforeEach(async () => {
  jest.clearAllMocks();
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      TasksService,
      { provide: TasksRepository, useValue: mockRepo },
      { provide: REQUEST, useValue: { tenantId: 'tenant-1' } },
    ],
  }).compile();
  service = await moduleRef.resolve<TasksService>(TasksService);
});

describe('getCriticalPath', () => {
  it('returns calendar dates, not offsets, and flags the zero-float tasks', async () => {
    mockRepo.findScheduleTasks.mockResolvedValue([
      scheduleTask(A, '2026-09-01', '2026-09-02'),
      scheduleTask(B, '2026-09-01', '2026-09-03'),
    ]);
    mockRepo.findDependencies.mockResolvedValue([dependency(A, B)]);

    const result = await service.getCriticalPath(PROJECT);

    expect(result.project_start).toBe('2026-09-01');
    // A is 2 days from the 1st, so B starts on the 3rd and runs 3 days to the 6th.
    expect(result.project_finish).toBe('2026-09-06');
    expect(result.duration_days).toBe(5);
    expect(result.critical_task_ids).toEqual([A, B]);
    const first = result.tasks[0]!;
    expect(first.earliest_start).toBe('2026-09-01');
    expect(first.earliest_finish).toBe('2026-09-03');
    expect(first.is_critical).toBe(true);
  });

  it('carries the task name, status and work type through from the row', async () => {
    mockRepo.findScheduleTasks.mockResolvedValue([scheduleTask(A, '2026-09-01', '2026-09-01')]);
    mockRepo.findDependencies.mockResolvedValue([]);

    const result = await service.getCriticalPath(PROJECT);

    expect(result.tasks[0]).toMatchObject({
      task_id: A,
      task_name: 'task aaaa',
      status: 'IN_PROGRESS',
      work_type: 'STRUCTURE',
      duration_days: 1,
      total_float_days: 0,
    });
  });

  it('says the durations are not working days rather than leaving the caller to assume', async () => {
    mockRepo.findScheduleTasks.mockResolvedValue([scheduleTask(A, '2026-09-01', '2026-09-01')]);
    mockRepo.findDependencies.mockResolvedValue([]);

    expect((await service.getCriticalPath(PROJECT)).working_day_calendar).toBe(false);
  });

  it('reports an empty schedule with null dates when no task has both planned dates', async () => {
    mockRepo.findScheduleTasks.mockResolvedValue([
      scheduleTask(A, '2026-09-01', null),
      scheduleTask(B, null, null),
    ]);
    mockRepo.findDependencies.mockResolvedValue([]);

    const result = await service.getCriticalPath(PROJECT);

    expect(result).toEqual({
      project_id: PROJECT,
      project_start: null,
      project_finish: null,
      duration_days: 0,
      working_day_calendar: false,
      tasks: [],
      critical_task_ids: [],
      excluded_task_count: 2,
    });
  });

  it('counts the tasks it could not schedule instead of quietly dropping them', async () => {
    mockRepo.findScheduleTasks.mockResolvedValue([
      scheduleTask(A, '2026-09-01', '2026-09-02'),
      scheduleTask(B, null, null),
    ]);
    mockRepo.findDependencies.mockResolvedValue([]);

    const result = await service.getCriticalPath(PROJECT);

    expect(result.tasks).toHaveLength(1);
    expect(result.excluded_task_count).toBe(1);
  });

  it('never consults the ADR-026 completion gate — the two mechanisms stay separate', async () => {
    mockRepo.findScheduleTasks.mockResolvedValue([scheduleTask(A, '2026-09-01', '2026-09-02')]);
    mockRepo.findDependencies.mockResolvedValue([]);

    await service.getCriticalPath(PROJECT);

    expect(mockRepo.countIncompletePredecessors).not.toHaveBeenCalled();
  });
});

describe('addDependency', () => {
  const dto = { predecessor_task_id: A, successor_task_id: B };

  it('creates the edge when both tasks exist in the project and no cycle results', async () => {
    mockRepo.findTaskProjects.mockResolvedValue([
      { task_id: A, project_id: PROJECT },
      { task_id: B, project_id: PROJECT },
    ]);
    mockRepo.findDependencies.mockResolvedValue([]);
    mockRepo.createDependency.mockResolvedValue(dependency(A, B));

    await service.addDependency(PROJECT, dto);

    expect(mockRepo.createDependency).toHaveBeenCalledWith({
      project_id: PROJECT,
      predecessor_task_id: A,
      successor_task_id: B,
      dependency_type: 'FS',
      lag_days: 0,
    });
  });

  it('passes an explicit type and lag through instead of defaulting them', async () => {
    mockRepo.findTaskProjects.mockResolvedValue([
      { task_id: A, project_id: PROJECT },
      { task_id: B, project_id: PROJECT },
    ]);
    mockRepo.findDependencies.mockResolvedValue([]);
    mockRepo.createDependency.mockResolvedValue(dependency(A, B));

    await service.addDependency(PROJECT, { ...dto, dependency_type: 'SS', lag_days: -2 });

    expect(mockRepo.createDependency).toHaveBeenCalledWith(
      expect.objectContaining({ dependency_type: 'SS', lag_days: -2 }),
    );
  });

  it('404s naming the missing task, so a typo does not read as a cycle', async () => {
    mockRepo.findTaskProjects.mockResolvedValue([{ task_id: A, project_id: PROJECT }]);

    await expect(service.addDependency(PROJECT, dto)).rejects.toThrow(NotFoundException);
    expect(mockRepo.createDependency).not.toHaveBeenCalled();
  });

  it('422s COS-TASK-004 when either end belongs to another project', async () => {
    mockRepo.findTaskProjects.mockResolvedValue([
      { task_id: A, project_id: PROJECT },
      { task_id: B, project_id: 'other-project' },
    ]);

    await expect(service.addDependency(PROJECT, dto)).rejects.toMatchObject({
      response: { error: { code: 'COS-TASK-004', task_id: B } },
    });
    expect(mockRepo.createDependency).not.toHaveBeenCalled();
  });

  it('422s COS-TASK-003 when the edge would close a cycle, before storing anything', async () => {
    mockRepo.findTaskProjects.mockResolvedValue([
      { task_id: B, project_id: PROJECT },
      { task_id: A, project_id: PROJECT },
    ]);
    // B → C → A already exists, so adding A → B closes the loop.
    mockRepo.findDependencies.mockResolvedValue([dependency(B, C), dependency(C, A)]);

    await expect(service.addDependency(PROJECT, dto)).rejects.toMatchObject({
      response: { error: { code: 'COS-TASK-003' } },
    });
    expect(mockRepo.createDependency).not.toHaveBeenCalled();
  });

  it('rejects a self-edge', async () => {
    mockRepo.findTaskProjects.mockResolvedValue([{ task_id: A, project_id: PROJECT }]);
    mockRepo.findDependencies.mockResolvedValue([]);

    await expect(
      service.addDependency(PROJECT, { predecessor_task_id: A, successor_task_id: A }),
    ).rejects.toThrow(UnprocessableEntityException);
  });
});

describe('removeDependency', () => {
  it('resolves when a row was deleted', async () => {
    mockRepo.deleteDependency.mockResolvedValue(true);
    await expect(service.removeDependency('dep-1')).resolves.toBeUndefined();
  });

  it('404s COS-TASK-005 when the id matched nothing in this tenant', async () => {
    mockRepo.deleteDependency.mockResolvedValue(false);
    await expect(service.removeDependency('dep-1')).rejects.toMatchObject({
      response: { error: { code: 'COS-TASK-005' } },
    });
  });
});

describe('listDependencies and getPortfolioTaskSummary', () => {
  it('passes the project through to the repository', async () => {
    mockRepo.findDependencies.mockResolvedValue([dependency(A, B)]);
    await expect(service.listDependencies(PROJECT)).resolves.toHaveLength(1);
    expect(mockRepo.findDependencies).toHaveBeenCalledWith(PROJECT);
  });

  it('returns the tenant-wide counts unchanged — the shaping is all in SQL', async () => {
    const counts = {
      overdue_count: 4,
      due_this_week_count: 9,
      blocked_count: 2,
      open_count: 31,
      project_count: 5,
    };
    mockRepo.portfolioTaskSummary.mockResolvedValue(counts);
    await expect(service.getPortfolioTaskSummary()).resolves.toEqual(counts);
  });
});
