// Projects API + offline cache.
// Projects are a read-only offline cache (§17.4 stale-while-revalidate): GET /projects (paginated
// { items, nextCursor }) refreshes local_projects when online; the pickers read local_projects.

import { get } from './client';
import { database } from '../db/database';
import Project from '../db/models/Project';

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
  await database.write(async () => {
    const collection = database.get<Project>('local_projects');
    const existing = await collection.query().fetch();
    await Promise.all(existing.map((p) => p.destroyPermanently()));
    await Promise.all(
      res.items.map((row) =>
        collection.create((r) => {
          r.projectId = row.project_id;
          r.projectCode = row.project_code;
          r.projectName = row.project_name;
          r.status = row.status;
        }),
      ),
    );
  });
}
