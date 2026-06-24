// WatermelonDB Model — local_projects (read-only offline cache).
// Mirrors the subset of server projects needed for the offline project pickers.

import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class Project extends Model {
  static table = 'local_projects';

  @field('project_id') projectId!: string;
  @field('project_code') projectCode!: string;
  @field('project_name') projectName!: string;
  @field('status') status!: string;
}
