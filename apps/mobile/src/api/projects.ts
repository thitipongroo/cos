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
