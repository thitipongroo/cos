// Projects API + offline cache.
// Projects are a read-only offline cache (§17.4 stale-while-revalidate): GET /projects (paginated
// { items, nextCursor }) refreshes local_projects when online; the pickers read local_projects.

import { get } from './client';
import { db, newLocalId } from '../db/database';
import { localProjects } from '../db/schema';

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
