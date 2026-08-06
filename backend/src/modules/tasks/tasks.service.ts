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
import type { ProgressSums, SchedulableTaskRow, TaskRow } from './tasks.repository';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';

const logger = createLogger('tasks-service');

/** §32.12 SPI verdict bands. */
const SPI_AHEAD_ABOVE = 1.05;
const SPI_BEHIND_BELOW = 0.95;

const MS_PER_DAY = 86_400_000;

export type ScheduleStatus = 'ahead' | 'on_track' | 'behind';

/** The value-weighted figures, derivable from the sums alone (deriveProgress). */
export interface ScheduleFigures {
  percentComplete: number | null;
  plannedPercent: number | null;
  spi: number | null;
  status: ScheduleStatus | null;
}

export interface ProjectProgress extends ScheduleFigures {
  /** Earned Schedule day-variance (§32.12): + behind, − ahead. Null when no schedulable task. */
  scheduleDaysBehind: number | null;
}

/**
 * Derive the §32.12 figures from the weighted sums.
 *
 * Exported as a free function, not a method: it is pure, and the null semantics are the whole point
 * of the metric, so they are tested directly rather than through a mocked repository.
 *
 * Every field is nullable and null always means "not computable" — never zero. A project with no
 * BOQ-linked task must not render a 0% bar, which would read as "no work done" rather than "no data".
 */
export function deriveProgress(sums: ProgressSums): ScheduleFigures {
  // No BOQ-linked, non-cancelled task carries any value: nothing is measurable.
  if (sums.weightTotal <= 0) {
    return { percentComplete: null, plannedPercent: null, spi: null, status: null };
  }

  const percentComplete = sums.earnedTotal / sums.weightTotal;

  // Nothing has planned dates → there is no schedule to judge against, but progress is still known.
  if (sums.schedWeightTotal <= 0) {
    return { percentComplete, plannedPercent: null, spi: null, status: null };
  }

  const plannedPercent = sums.schedPlannedTotal / sums.schedWeightTotal;

  // Nothing was due to have started yet. "Ahead of schedule" is meaningless here, and dividing by
  // zero would report Infinity as spectacular progress.
  if (plannedPercent <= 0) {
    return { percentComplete, plannedPercent, spi: null, status: null };
  }

  // Both sides span the schedulable subset only — see §32.12 "Schedule verdict".
  const earnedScheduled = sums.schedEarnedTotal / sums.schedWeightTotal;
  const spi = earnedScheduled / plannedPercent;

  const status: ScheduleStatus =
    spi > SPI_AHEAD_ABOVE ? 'ahead' : spi < SPI_BEHIND_BELOW ? 'behind' : 'on_track';

  return { percentComplete, plannedPercent, spi, status };
}

/** A date reduced to a whole day-number (UTC midnight), so arithmetic is in days like §32.12's SQL. */
function toDayNumber(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / MS_PER_DAY,
  );
}

/** One task's planned completion (0..100) at a given day-number — the clamped ramp of §32.12. */
function plannedPctAt(startDay: number, endDay: number, day: number): number {
  // Zero- or negative-length span is a milestone: 0 before its end, 100 from its end on.
  if (endDay <= startDay) return day >= endDay ? 100 : 0;
  const frac = (day - startDay) / (endDay - startDay);
  return Math.max(0, Math.min(1, frac)) * 100;
}

/**
 * Earned Schedule day-variance (§32.12): how many days behind (+) or ahead (−) the schedule is.
 *
 * Finds the date `ES` at which the time-phased planned curve `PV(d)` reaches today's earned percent,
 * then returns `round(today − ES)` in days. Pure and exported so the search + edge cases are tested
 * without a database. `null` when there is no schedulable task — same "not computable" as `spi`.
 */
export function earnedScheduleDays(rows: SchedulableTaskRow[], today: Date): number | null {
  const tasks = rows
    .filter((r) => r.weight > 0)
    .map((r) => ({
      progress: r.progress,
      weight: r.weight,
      startDay: toDayNumber(r.planned_start),
      endDay: toDayNumber(r.planned_end),
    }));
  const totalWeight = tasks.reduce((s, t) => s + t.weight, 0);
  if (totalWeight <= 0) return null;

  const earned = tasks.reduce((s, t) => s + t.progress * t.weight, 0) / totalWeight;
  const pvAt = (day: number): number =>
    tasks.reduce((s, t) => s + plannedPctAt(t.startDay, t.endDay, day) * t.weight, 0) / totalWeight;

  const minStart = Math.min(...tasks.map((t) => t.startDay));
  const maxEnd = Math.max(...tasks.map((t) => t.endDay));
  const todayDay = toDayNumber(today);

  // ES is the day where PV = earned. PV is monotonic non-decreasing between minStart and maxEnd.
  let es: number;
  if (earned <= pvAt(minStart)) {
    es = minStart; // nothing was due yet — the plan is at its start
  } else if (earned >= pvAt(maxEnd)) {
    es = maxEnd; // all scheduled work is done per the plan — the plan is at its finish
  } else {
    // Bisect for the crossing. ~50 iterations over a day range converges well past whole-day needs.
    let lo = minStart;
    let hi = maxEnd;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (pvAt(mid) < earned) lo = mid;
      else hi = mid;
    }
    es = (lo + hi) / 2;
  }

  return Math.round(todayDay - es);
}

@Injectable({ scope: Scope.REQUEST })
export class TasksService {
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? '';
  }

  constructor(
    private readonly repo: TasksRepository,
    @Inject(REQUEST)
    private readonly request: Request & { tenantId?: string },
  ) {}

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

  /** BOQ-value-weighted progress + schedule verdict + Earned Schedule day-variance (§32.12). */
  async getProjectProgress(project_id: string): Promise<ProjectProgress> {
    const [sums, schedulable] = await Promise.all([
      this.repo.findProgressSums(project_id),
      this.repo.findSchedulableTasks(project_id),
    ]);
    return {
      ...deriveProgress(sums),
      scheduleDaysBehind: earnedScheduleDays(schedulable, new Date()),
    };
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
      throw new NotFoundException({ error: { code: 'COS-TASK-002', message: 'Task not found' } });
    }
    return task;
  }

  /** Update task; enforces the 7 hard-block gates + budget warnings on COMPLETED (master Phase 6). */
  async updateTask(taskId: string, dto: UpdateTaskDto): Promise<TaskRow & { warnings: string[] }> {
    const task = await this.getTask(taskId); // 404 if missing
    const warnings: string[] = [];

    if (dto.status === 'COMPLETED') {
      const blocking = await this.evaluateCompletionGates(taskId, task);

      // Warnings 8–9: budget vs actual. ≥100% is a hard block unless acknowledged.
      const budget = await this.repo.getTaskBudgetRatio(taskId);
      if (budget) {
        const allocated = Number(budget.allocated);
        const ratio = allocated > 0 ? Number(budget.actual) / allocated : 0;
        if (ratio >= 1) {
          warnings.push('budget_overrun');
          if (!dto.acknowledge_budget_overrun) blocking.push('budget_overrun');
        } else if (ratio >= 0.85) {
          warnings.push('budget_warning');
        }
      }

      if (blocking.length > 0) {
        throw new UnprocessableEntityException({
          error: {
            code: 'COS-TASK-001',
            message: 'Task completion blocked by hard-block gates',
            blocking_gates: blocking,
          },
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
    return { ...updated, warnings };
  }

  /** Names of the hard-block gates that currently fail (empty = clear to complete). master Phase 6
   *  gates 1–7: inspections, issues, dependencies, permits, incidents, material, delay. */
  private async evaluateCompletionGates(taskId: string, task: TaskRow): Promise<string[]> {
    const [inspections, issues, dependencies, permits, incidents, undelivered] = await Promise.all([
      this.repo.countBlockingInspections(taskId),
      this.repo.countBlockingIssues(taskId),
      this.repo.countIncompletePredecessors(taskId),
      this.repo.countBlockingPermits(taskId),
      this.repo.countBlockingIncidents(taskId),
      this.repo.countUndeliveredMaterials(taskId),
    ]);
    const blocking: string[] = [];
    if (inspections > 0) blocking.push('inspections');
    if (issues > 0) blocking.push('issues');
    if (dependencies > 0) blocking.push('dependencies');
    if (permits > 0) blocking.push('permits');
    if (incidents > 0) blocking.push('incidents');
    if (undelivered > 0) blocking.push('material');
    if (task.status === 'BLOCKED') blocking.push('delay');
    return blocking;
  }
}
