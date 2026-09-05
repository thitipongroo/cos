// Schedule API client — the two reads the EXECUTIVE Tasks screen makes (ADR-097).
//
// Both are GETs, so both simply fail offline and the caller keeps its last value. Nothing here is
// queued: there is no write, and a portfolio roll-up is not something a handset can compute from its
// own cache — `local_tasks` holds only the projects that have synced, so counting there would report
// a portfolio smaller than the one the executive has.
//
// The DEPENDENCY WRITES are deliberately absent from this module. `POST /projects/{id}/
// task-dependencies` and its DELETE exist on the server and are restricted to PROJECT_MANAGER /
// SITE_ENGINEER / TENANT_ADMIN; EXECUTIVE is read-only on mobile (master §Phase 10), so the mobile
// client has no reason to carry a caller for them.

import { get } from './client';

/** `GET /tasks/portfolio-summary` — tenant-wide counts, every field a plain integer. */
export interface PortfolioTaskSummary {
  /**
   * `planned_end` is already past and the task is neither COMPLETED nor CANCELLED.
   *
   * LATE, NOT IMPORTANT. `projects.tasks` has no priority or severity column, so this count cannot
   * be filtered to "critical" ones however the mockup labels the tile (ADR-085, and the same
   * substitution `tasks.tsx` already documents for the Site Worker badge).
   */
  overdue_count: number;
  /** `planned_end` within the next 7 days, inclusive of today. */
  due_this_week_count: number;
  /** `status = BLOCKED` — a real column value, not a derived one. */
  blocked_count: number;
  open_count: number;
  /** How many distinct projects the counted tasks span. */
  project_count: number;
}

/** One task's place in the schedule network. Dates are `YYYY-MM-DD`. */
export interface CriticalPathTask {
  task_id: string;
  task_name: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'CANCELLED';
  work_type: string;
  duration_days: number;
  earliest_start: string;
  earliest_finish: string;
  latest_start: string;
  latest_finish: string;
  /** Zero on the critical path; larger is slack. */
  total_float_days: number;
  is_critical: boolean;
}

export interface CriticalPath {
  project_id: string;
  /** Null when the project has no task carrying both planned dates. */
  project_start: string | null;
  project_finish: string | null;
  duration_days: number;
  /**
   * Always false today. The durations count CALENDAR days — a working-day pass needs a per-project
   * calendar (weekends, Thai public holidays, site shutdowns) and no such table exists. The server
   * reports it rather than leaving the client to assume, so a screen that shows "12 days" can say
   * which kind of day it means.
   */
  working_day_calendar: boolean;
  tasks: CriticalPathTask[];
  critical_task_ids: string[];
  /** Tasks left out of the network for want of both planned dates. */
  excluded_task_count: number;
}

export async function getPortfolioTaskSummary(): Promise<PortfolioTaskSummary> {
  return get<PortfolioTaskSummary>('/tasks/portfolio-summary');
}

export async function getCriticalPath(projectId: string): Promise<CriticalPath> {
  return get<CriticalPath>(`/projects/${projectId}/critical-path`);
}
