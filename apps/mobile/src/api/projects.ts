// Projects API + offline cache.
// Projects are a read-only offline cache (§17.4 stale-while-revalidate): GET /projects (paginated
// { items, nextCursor }) refreshes local_projects when online; the pickers read local_projects.

import { get } from './client';
import { db, newLocalId } from '../db/database';
import { localProjects } from '../db/schema';
import type { ProjectPhase } from '../lib/siteEngineerHome';

interface ProjectRow {
  project_id: string;
  project_code: string;
  project_name: string;
  status: string;
}

interface ListProjectsResponse {
  items: ProjectRow[];
  nextCursor: string | null;
}

/** A project the signed-in engineer is a member of, with the dates the dashboard footer shows. */
export interface MyProject {
  project_id: string;
  project_code: string;
  project_name: string;
  status: string;
  start_date: string | null; // project start date (footer "START")
  end_date: string | null; // project end / contract-end date (footer "GOAL")
}

/**
 * The projects the signed-in engineer is a member of (GET /projects/mine — JWT-scoped). Scopes the
 * SITE_ENGINEER home picker to that engineer's own projects. Throws when offline — the screen keeps
 * its last list rather than showing someone else's or an empty picker.
 */
export async function getMyProjects(): Promise<MyProject[]> {
  const res = await get<{ items: MyProject[] }>('/projects/mine');
  return res.items;
}

export type ScheduleStatus = 'ahead' | 'on_track' | 'behind';

/**
 * §32.12 project progress. Every field is nullable and null means "not computable", never zero —
 * render a placeholder, not a 0% bar. `percentComplete` spans all BOQ-linked tasks; `spi`/`status`
 * are judged on the subset that has planned dates.
 */
export interface ProjectProgress {
  percentComplete: number | null;
  plannedPercent: number | null;
  spi: number | null;
  status: ScheduleStatus | null;
  /** Earned Schedule day-variance (§32.12): + behind, − ahead. Null when no schedulable task. */
  scheduleDaysBehind: number | null;
}

/**
 * BOQ-value-weighted progress for a project (§32.12).
 *
 * Not cached offline: the figure is a server-side aggregate over the whole task list, and §17.4's
 * stale-while-revalidate applies to entity caches, not derived metrics. Throws when offline —
 * callers keep the last value on screen rather than showing a wrong one.
 */
export async function getProjectProgress(projectId: string): Promise<ProjectProgress> {
  return get<ProjectProgress>(`/projects/${projectId}/progress`);
}

/**
 * Ordered project phases (ADR-070). Not cached offline — the dashboard derives the current phase
 * from the list and keeps its last value when this throws (offline), rather than showing a wrong one.
 */
export async function getProjectPhases(projectId: string): Promise<ProjectPhase[]> {
  return get<ProjectPhase[]>(`/projects/${projectId}/phases`);
}

export interface ProjectWorkHours {
  work_hours_start: string | null; // TIME "HH:MM[:SS]" (ADR-072)
  work_hours_end: string | null;
}

/** The project's standard daily working window (ADR-072). GET /projects/:id returns the whole row;
 *  only the two TIME fields are read. Throws when offline — the dashboard keeps its last value. */
export async function getProjectWorkHours(projectId: string): Promise<ProjectWorkHours> {
  const project = await get<ProjectWorkHours>(`/projects/${projectId}`);
  return {
    work_hours_start: project.work_hours_start ?? null,
    work_hours_end: project.work_hours_end ?? null,
  };
}

/** Best-effort refresh of the local project cache. Throws when offline — callers ignore. */
export async function refreshProjectsCache(): Promise<void> {
  const res = await get<ListProjectsResponse>('/projects');
  await db.delete(localProjects);
  if (res.items.length > 0) {
    await db.insert(localProjects).values(
      res.items.map((row) => ({
        id: newLocalId(),
        projectId: row.project_id,
        projectCode: row.project_code,
        projectName: row.project_name,
        status: row.status,
      })),
    );
  }
}
