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
import { Decimal } from '@cos/financial';
import { createLogger } from '@cos/logger';
import { TasksRepository } from './tasks.repository';
import type {
  DependencyRow,
  PortfolioTaskSummaryRow,
  ProgressSums,
  SchedulableTaskRow,
  TaskRow,
  TaskStatus,
} from './tasks.repository';
import { computeCriticalPath, offsetToDate, wouldCreateCycle } from './cpm';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';
import type { CreateDependencyDto } from './dto/create-dependency.dto';

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

/** One scheduled task in the critical-path response. Dates are `YYYY-MM-DD`. */
export interface CriticalPathTask {
  task_id: string;
  task_name: string;
  status: TaskStatus;
  work_type: string;
  duration_days: number;
  earliest_start: string;
  earliest_finish: string;
  latest_start: string;
  latest_finish: string;
  total_float_days: number;
  is_critical: boolean;
  /** Whether anyone is assigned. The id itself, or null — never a name (see `CpmTaskRow`). */
  assigned_to: string | null;
}

export interface CriticalPathResponse {
  project_id: string;
  /** Null when the project has no schedulable task at all. */
  project_start: string | null;
  project_finish: string | null;
  duration_days: number;
  /**
   * Always false today, and reported rather than assumed: the durations count calendar days.
   * A working-day pass needs a per-project calendar (weekends, Thai public holidays, site
   * shutdowns) and no such table exists — see `cpm.ts`.
   */
  working_day_calendar: boolean;
  tasks: CriticalPathTask[];
  critical_task_ids: string[];
  /** Tasks left out of the network for want of both planned dates. */
  excluded_task_count: number;
}

/** A critical task with the project it belongs to, for the tenant-wide roll-up. */
export interface PortfolioCriticalTask extends CriticalPathTask {
  project_id: string;
  project_name: string;
}

/**
 * The critical path of EVERY project in the tenant, merged.
 *
 * There is no such thing as one critical path across projects — each has its own network and its own
 * origin, so a single forward pass over all of them would invent dependencies nobody declared. This
 * runs the real per-project pass and CONCATENATES the zero-float tasks, which is what a portfolio
 * screen can honestly show: "the tasks that cannot slip, in every project". `project_count` says how
 * many networks that covers.
 */
export interface PortfolioCriticalPathResponse {
  tasks: PortfolioCriticalTask[];
  project_count: number;
  working_day_calendar: boolean;
  excluded_task_count: number;
}

/** `YYYY-MM-DD` from a UTC-midnight date, the form every other date in this service uses. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
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
        // master:991 forbids JavaScript Number for monetary calculations, and a ratio of two money
        // columns is one. The thresholds are compared by CROSS-MULTIPLYING instead of dividing, so
        // no quotient is formed and nothing is rounded: `actual/allocated >= 0.85` becomes
        // `actual * 100 >= allocated * 85`, which is exact in decimal arithmetic.
        //
        // The float version was demonstrably wrong at the boundary — allocated 5.40 with actual 4.59
        // is exactly 85%, but the double quotient lands just below it and the ORANGE warning never
        // fired. Only at small amounts, but a threshold that is right for most inputs is not a
        // threshold.
        const allocated = new Decimal(budget.allocated);
        const actual = new Decimal(budget.actual);
        if (allocated.gt(0)) {
          if (actual.gte(allocated)) {
            warnings.push('budget_overrun');
            if (!dto.acknowledge_budget_overrun) blocking.push('budget_overrun');
          } else if (actual.times(100).gte(allocated.times(85))) {
            warnings.push('budget_warning');
          }
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

  // ── Schedule network and critical path (ADR-097) ────────────────────────────
  //
  // `evaluateCompletionGates` above is UNTOUCHED by everything below. Its `dependencies` gate still
  // counts ADR-026 BOQ-category predecessors and never reads `projects.task_dependencies`
  // (product-owner decision 2026-09-04). Do not "unify" the two without reading ADR-097 §Rationale:
  // switching the gate to the explicit table silently stops gating every task with no edge.

  /** Tenant-wide task counts for the EXECUTIVE portfolio screen. */
  async getPortfolioTaskSummary(): Promise<PortfolioTaskSummaryRow> {
    return this.repo.portfolioTaskSummary();
  }

  /**
   * The project's critical path.
   *
   * Offsets from `computeCriticalPath` are turned back into calendar dates here rather than in the
   * pure module, so the algorithm stays free of formatting and the API returns `YYYY-MM-DD` like
   * every other date this service emits.
   */
  async getCriticalPath(projectId: string): Promise<CriticalPathResponse> {
    const [taskRows, dependencyRows] = await Promise.all([
      this.repo.findScheduleTasks(projectId),
      this.repo.findDependencies(projectId),
    ]);

    const computed = computeCriticalPath(
      taskRows.map((t) => ({
        taskId: t.task_id,
        plannedStart: t.planned_start,
        plannedEnd: t.planned_end,
      })),
      dependencyRows.map((d) => ({
        predecessorTaskId: d.predecessor_task_id,
        successorTaskId: d.successor_task_id,
        dependencyType: d.dependency_type,
        lagDays: d.lag_days,
      })),
    );

    if (computed.tasks.length === 0) {
      return {
        project_id: projectId,
        project_start: null,
        project_finish: null,
        duration_days: 0,
        working_day_calendar: false,
        tasks: [],
        critical_task_ids: [],
        excluded_task_count: computed.excludedTaskCount,
      };
    }

    // The same origin `computeCriticalPath` used: the earliest planned start among schedulable
    // tasks. Recomputed rather than returned by the module, which deals only in offsets.
    let origin: Date | null = null;
    for (const t of taskRows) {
      if (t.planned_start === null || t.planned_end === null) continue;
      if (origin === null || t.planned_start < origin) origin = t.planned_start;
    }

    const meta = new Map(taskRows.map((t) => [t.task_id, t]));
    const tasks = computed.tasks.map((s) => {
      const row = meta.get(s.taskId)!;
      return {
        task_id: s.taskId,
        task_name: row.task_name,
        status: row.status,
        work_type: row.work_type,
        duration_days: s.durationDays,
        earliest_start: isoDate(offsetToDate(origin!, s.earliestStartOffset)),
        earliest_finish: isoDate(offsetToDate(origin!, s.earliestFinishOffset)),
        latest_start: isoDate(offsetToDate(origin!, s.latestStartOffset)),
        latest_finish: isoDate(offsetToDate(origin!, s.latestFinishOffset)),
        total_float_days: s.totalFloatDays,
        is_critical: s.isCritical,
        assigned_to: row.assigned_to,
      };
    });

    const earliest = Math.min(...computed.tasks.map((t) => t.earliestStartOffset));
    const latest = Math.max(...computed.tasks.map((t) => t.earliestFinishOffset));
    return {
      project_id: projectId,
      project_start: isoDate(offsetToDate(origin!, earliest)),
      project_finish: isoDate(offsetToDate(origin!, latest)),
      duration_days: computed.durationDays,
      // Stated in the payload, not only in a comment: the caller is entitled to know that these
      // durations count weekends and holidays, because no calendar exists to exclude them.
      working_day_calendar: false,
      tasks,
      critical_task_ids: computed.criticalTaskIds,
      excluded_task_count: computed.excludedTaskCount,
    };
  }

  /**
   * The critical tasks of every project in the tenant.
   *
   * ONE REQUEST, N PASSES. The EXECUTIVE Tasks screen is a portfolio view and asked one project for
   * its critical path until 2026-09-07, while its heading named that project — which read as a
   * tenant-wide list of one project's work. Removing the heading alone would have made that reading
   * silent instead of wrong, so the roll-up is real: the same per-project pass `getCriticalPath`
   * runs, once per project that HAS tasks, with the results concatenated.
   *
   * The passes run SEQUENTIALLY rather than through `Promise.all`. Each is two more queries against
   * the same pool, and a tenant with forty projects would otherwise open eighty at once — the
   * fan-out `portfolioTaskSummary` was built to avoid, moved from the client into the server rather
   * than removed.
   */
  async getPortfolioCriticalPath(): Promise<PortfolioCriticalPathResponse> {
    const projects = await this.repo.findProjectsWithTasks();
    const tasks: PortfolioCriticalTask[] = [];
    let excluded = 0;

    for (const project of projects) {
      const path = await this.getCriticalPath(project.project_id);
      excluded += path.excluded_task_count;
      for (const task of path.tasks) {
        if (!task.is_critical) continue;
        tasks.push({ ...task, project_id: project.project_id, project_name: project.project_name });
      }
    }

    // Earliest first, so the reader meets the portfolio's schedule in the order it happens rather
    // than in project-name order, which means nothing to someone reading a list of risks.
    tasks.sort((a, b) => a.earliest_start.localeCompare(b.earliest_start));
    return {
      tasks,
      project_count: projects.length,
      working_day_calendar: false,
      excluded_task_count: excluded,
    };
  }

  async listDependencies(projectId: string): Promise<DependencyRow[]> {
    return this.repo.findDependencies(projectId);
  }

  /**
   * Add one edge, after the three checks that keep the network well-formed.
   *
   * Order matters: existence first (so a typo reports "not found" rather than "cycle"), then the
   * same-project rule, then reachability. The cycle check runs against the edges ALREADY stored,
   * which is why it is here and not in a database constraint — a CHECK cannot see a graph, and a
   * trigger doing a recursive walk would be the first in this schema (ADR-097).
   */
  async addDependency(projectId: string, dto: CreateDependencyDto): Promise<DependencyRow> {
    const { predecessor_task_id, successor_task_id } = dto;

    const found = await this.repo.findTaskProjects([predecessor_task_id, successor_task_id]);
    const byTask = new Map(found.map((r) => [r.task_id, r.project_id]));
    for (const id of [predecessor_task_id, successor_task_id]) {
      if (!byTask.has(id)) {
        throw new NotFoundException({
          error: { code: 'COS-TASK-002', message: `Task not found: ${id}` },
        });
      }
    }
    // Both ends must sit in the project the edge is being added to. A cross-project dependency is
    // not a relationship this product models, and allowing one would make the per-project CPM read
    // a network it cannot see all of.
    for (const id of [predecessor_task_id, successor_task_id]) {
      if (byTask.get(id) !== projectId) {
        throw new UnprocessableEntityException({
          error: {
            code: 'COS-TASK-004',
            message: 'Both tasks of a dependency must belong to the same project',
            task_id: id,
          },
        });
      }
    }

    const existing = await this.repo.findDependencies(projectId);
    if (
      wouldCreateCycle(
        existing.map((d) => ({
          predecessorTaskId: d.predecessor_task_id,
          successorTaskId: d.successor_task_id,
          dependencyType: d.dependency_type,
          lagDays: d.lag_days,
        })),
        predecessor_task_id,
        successor_task_id,
      )
    ) {
      throw new UnprocessableEntityException({
        error: {
          code: 'COS-TASK-003',
          message: 'Dependency rejected: it would create a cycle',
          predecessor_task_id,
          successor_task_id,
        },
      });
    }

    const created = await this.repo.createDependency({
      project_id: projectId,
      predecessor_task_id,
      successor_task_id,
      dependency_type: dto.dependency_type ?? 'FS',
      lag_days: dto.lag_days ?? 0,
    });
    logger.info(
      {
        dependency_id: created.dependency_id,
        project_id: projectId,
        tenant_id: this.tenantId,
      },
      'task.dependency.created',
    );
    return created;
  }

  async removeDependency(dependencyId: string): Promise<void> {
    const deleted = await this.repo.deleteDependency(dependencyId);
    if (!deleted) {
      throw new NotFoundException({
        error: { code: 'COS-TASK-005', message: 'Dependency not found' },
      });
    }
    logger.info(
      { dependency_id: dependencyId, tenant_id: this.tenantId },
      'task.dependency.deleted',
    );
  }
}
