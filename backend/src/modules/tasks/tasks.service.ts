// Tasks Service — Phase 6
// Project tasks with the master Phase 6 completion gate: a task may only become COMPLETED when
// all hard-block gates pass (inspections / issues / dependencies / permits). Otherwise HTTP 422
// with code COS-TASK-001 and the list of blocking gate names.

import {
  Injectable,
  Scope,
  Inject,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { createLogger } from '@cos/logger';
import { TasksRepository } from './tasks.repository';
import type { TaskRow } from './tasks.repository';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';

const logger = createLogger('tasks-service');

@Injectable({ scope: Scope.REQUEST })
export class TasksService {
  private readonly tenantId: string;

  constructor(
    private readonly repo: TasksRepository,
    @Inject(REQUEST)
    request: Request & { tenantId?: string },
  ) {
    this.tenantId = request.tenantId ?? '';
  }

  async listTasks(params: {
    project_id: string;
    assigned_to?: string;
    status?: string;
    page: number;
    limit: number;
  }): Promise<{ items: TaskRow[]; total: number; page: number; limit: number }> {
    const { rows, total } = await this.repo.findTasksByProject(params);
    return { items: rows, total, page: params.page, limit: params.limit };
  }

  async createTask(project_id: string, dto: CreateTaskDto): Promise<TaskRow> {
    const task = await this.repo.createTask({
      project_id,
      task_name: dto.task_name,
      work_type: dto.work_type,
      boq_item_id: dto.boq_item_id ?? null,
      floor_id: dto.floor_id ?? null,
      room_id: dto.room_id ?? null,
      assigned_to: dto.assigned_to ?? null,
      planned_start: dto.planned_start ?? null,
      planned_end: dto.planned_end ?? null,
    });
    logger.info({ task_id: task.task_id, project_id, tenant_id: this.tenantId }, 'task.created');
    return task;
  }

  async getTask(taskId: string): Promise<TaskRow> {
    const task = await this.repo.findTaskById(taskId);
    if (!task) {
      throw new NotFoundException({ code: 'COS-TASK-002', message: 'Task not found' });
    }
    return task;
  }

  /** Update task; enforces the completion gate when transitioning to COMPLETED. */
  async updateTask(taskId: string, dto: UpdateTaskDto): Promise<TaskRow> {
    await this.getTask(taskId); // 404 if missing

    if (dto.status === 'COMPLETED') {
      const blocking = await this.evaluateCompletionGates(taskId);
      if (blocking.length > 0) {
        throw new UnprocessableEntityException({
          code: 'COS-TASK-001',
          message: 'Task completion blocked by hard-block gates',
          blocking_gates: blocking,
        });
      }
    }

    const updated = await this.repo.updateTask({
      task_id: taskId,
      status: dto.status ?? null,
      progress_percent: dto.progress_percent ?? null,
      assigned_to: dto.assigned_to ?? null,
    });
    logger.info(
      { task_id: taskId, status: updated.status, tenant_id: this.tenantId },
      'task.updated',
    );
    return updated;
  }

  /** Returns the names of the hard-block gates that currently fail (empty = clear to complete). */
  private async evaluateCompletionGates(taskId: string): Promise<string[]> {
    const [inspections, issues, dependencies, permits] = await Promise.all([
      this.repo.countBlockingInspections(taskId),
      this.repo.countBlockingIssues(taskId),
      this.repo.countIncompletePredecessors(taskId),
      this.repo.countBlockingPermits(taskId),
    ]);
    const blocking: string[] = [];
    if (inspections > 0) blocking.push('inspections');
    if (issues > 0) blocking.push('issues');
    if (dependencies > 0) blocking.push('dependencies');
    if (permits > 0) blocking.push('permits');
    return blocking;
  }
}
