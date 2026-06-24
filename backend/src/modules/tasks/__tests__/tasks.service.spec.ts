// Unit tests — Tasks Service (Phase 6) — focus: completion gate enforcement.
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { TasksService } from '../tasks.service';
import { TasksRepository } from '../tasks.repository';

const mockRepo = {
  createTask: jest.fn(),
  findTasksByProject: jest.fn(),
  findTaskById: jest.fn(),
  updateTask: jest.fn(),
  countBlockingInspections: jest.fn(),
  countBlockingIssues: jest.fn(),
  countIncompletePredecessors: jest.fn(),
  countBlockingPermits: jest.fn(),
  countBlockingIncidents: jest.fn(),
  countUndeliveredMaterials: jest.fn(),
  getTaskBudgetRatio: jest.fn(),
};

const taskRow = { task_id: 'task-1', project_id: 'proj-1', status: 'IN_PROGRESS' };

function clearGates() {
  mockRepo.countBlockingInspections.mockResolvedValue(0);
  mockRepo.countBlockingIssues.mockResolvedValue(0);
  mockRepo.countIncompletePredecessors.mockResolvedValue(0);
  mockRepo.countBlockingPermits.mockResolvedValue(0);
  mockRepo.countBlockingIncidents.mockResolvedValue(0);
  mockRepo.countUndeliveredMaterials.mockResolvedValue(0);
  mockRepo.getTaskBudgetRatio.mockResolvedValue(null);
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

it('constructor tolerates missing request context', async () => {
  const m = await Test.createTestingModule({
    providers: [
      TasksService,
      { provide: TasksRepository, useValue: mockRepo },
      { provide: REQUEST, useValue: {} },
    ],
  }).compile();
  const noCtx = await m.resolve<TasksService>(TasksService);
  expect(noCtx).toBeDefined();
  expect((noCtx as unknown as { tenantId: string }).tenantId).toBe('');
});

it('listTasks returns paginated envelope', async () => {
  mockRepo.findTasksByProject.mockResolvedValue({ rows: [taskRow], total: 1 });
  const r = await service.listTasks({ project_id: 'proj-1', page: 1, limit: 20 });
  expect(r).toEqual({ items: [taskRow], total: 1, page: 1, limit: 20 });
});

it('createTask delegates to repo', async () => {
  mockRepo.createTask.mockResolvedValue(taskRow);
  const r = await service.createTask('proj-1', { task_name: 'Pour slab' } as never);
  expect(r.task_id).toBe('task-1');
  expect(mockRepo.createTask).toHaveBeenCalledWith(
    expect.objectContaining({ project_id: 'proj-1', task_name: 'Pour slab' }),
  );
});

it('getTask returns task / throws NotFound', async () => {
  mockRepo.findTaskById.mockResolvedValueOnce(taskRow);
  expect((await service.getTask('task-1')).task_id).toBe('task-1');
  mockRepo.findTaskById.mockResolvedValueOnce(null);
  await expect(service.getTask('missing')).rejects.toBeInstanceOf(NotFoundException);
});

it('updateTask (non-COMPLETED) skips gates and updates', async () => {
  mockRepo.findTaskById.mockResolvedValue(taskRow);
  mockRepo.updateTask.mockResolvedValue({ ...taskRow, progress_percent: 50 });
  const r = await service.updateTask('task-1', { progress_percent: 50 } as never);
  expect(r.progress_percent).toBe(50);
  expect(mockRepo.countBlockingInspections).not.toHaveBeenCalled();
});

it('updateTask → COMPLETED succeeds when all gates clear', async () => {
  mockRepo.findTaskById.mockResolvedValue(taskRow);
  clearGates();
  mockRepo.updateTask.mockResolvedValue({ ...taskRow, status: 'COMPLETED' });
  const r = await service.updateTask('task-1', { status: 'COMPLETED' } as never);
  expect(r.status).toBe('COMPLETED');
});

it('updateTask → COMPLETED blocked lists all 7 gates + budget overrun (COS-TASK-001)', async () => {
  mockRepo.findTaskById.mockResolvedValue({ ...taskRow, status: 'BLOCKED' }); // gate 6 (delay)
  mockRepo.countBlockingInspections.mockResolvedValue(1);
  mockRepo.countBlockingIssues.mockResolvedValue(2);
  mockRepo.countIncompletePredecessors.mockResolvedValue(1);
  mockRepo.countBlockingPermits.mockResolvedValue(3);
  mockRepo.countBlockingIncidents.mockResolvedValue(1);
  mockRepo.countUndeliveredMaterials.mockResolvedValue(1);
  mockRepo.getTaskBudgetRatio.mockResolvedValue({ allocated: '100', actual: '150' });
  await expect(
    service.updateTask('task-1', { status: 'COMPLETED' } as never),
  ).rejects.toMatchObject({
    response: {
      code: 'COS-TASK-001',
      blocking_gates: [
        'inspections',
        'issues',
        'dependencies',
        'permits',
        'incidents',
        'material',
        'delay',
        'budget_overrun',
      ],
    },
  });
  expect(mockRepo.updateTask).not.toHaveBeenCalled();
});

it('updateTask → COMPLETED blocked by a single gate', async () => {
  mockRepo.findTaskById.mockResolvedValue(taskRow);
  clearGates();
  mockRepo.countBlockingIssues.mockResolvedValue(1);
  await expect(
    service.updateTask('task-1', { status: 'COMPLETED' } as never),
  ).rejects.toBeInstanceOf(UnprocessableEntityException);
});

it('budget 85–99% → ORANGE warning, completes (gate 8)', async () => {
  mockRepo.findTaskById.mockResolvedValue(taskRow);
  clearGates();
  mockRepo.getTaskBudgetRatio.mockResolvedValue({ allocated: '100', actual: '90' });
  mockRepo.updateTask.mockResolvedValue({ ...taskRow, status: 'COMPLETED' });
  const r = await service.updateTask('task-1', { status: 'COMPLETED' } as never);
  expect(r.warnings).toEqual(['budget_warning']);
});

it('budget ≥100% with acknowledge_budget_overrun → completes with warning (gate 9)', async () => {
  mockRepo.findTaskById.mockResolvedValue(taskRow);
  clearGates();
  mockRepo.getTaskBudgetRatio.mockResolvedValue({ allocated: '100', actual: '120' });
  mockRepo.updateTask.mockResolvedValue({ ...taskRow, status: 'COMPLETED' });
  const r = await service.updateTask('task-1', {
    status: 'COMPLETED',
    acknowledge_budget_overrun: true,
  } as never);
  expect(r.warnings).toEqual(['budget_overrun']);
});

it('budget with zero allocated → no warning (allocated>0 false branch)', async () => {
  mockRepo.findTaskById.mockResolvedValue(taskRow);
  clearGates();
  mockRepo.getTaskBudgetRatio.mockResolvedValue({ allocated: '0', actual: '50' });
  mockRepo.updateTask.mockResolvedValue({ ...taskRow, status: 'COMPLETED' });
  const r = await service.updateTask('task-1', { status: 'COMPLETED' } as never);
  expect(r.warnings).toEqual([]);
});
