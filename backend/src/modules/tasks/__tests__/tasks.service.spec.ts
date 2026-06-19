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
};

const taskRow = { task_id: 'task-1', project_id: 'proj-1', status: 'IN_PROGRESS' };

function clearGates() {
  mockRepo.countBlockingInspections.mockResolvedValue(0);
  mockRepo.countBlockingIssues.mockResolvedValue(0);
  mockRepo.countIncompletePredecessors.mockResolvedValue(0);
  mockRepo.countBlockingPermits.mockResolvedValue(0);
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
  expect(await m.resolve<TasksService>(TasksService)).toBeDefined();
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

it('updateTask → COMPLETED blocked lists every failing gate (COS-TASK-001)', async () => {
  mockRepo.findTaskById.mockResolvedValue(taskRow);
  mockRepo.countBlockingInspections.mockResolvedValue(1);
  mockRepo.countBlockingIssues.mockResolvedValue(2);
  mockRepo.countIncompletePredecessors.mockResolvedValue(1);
  mockRepo.countBlockingPermits.mockResolvedValue(3);
  await expect(
    service.updateTask('task-1', { status: 'COMPLETED' } as never),
  ).rejects.toMatchObject({
    response: {
      code: 'COS-TASK-001',
      blocking_gates: ['inspections', 'issues', 'dependencies', 'permits'],
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
