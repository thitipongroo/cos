// WatermelonDB Model — local_incidents
// Read cache of site_ops.incidents, populated by delta-sync (entity type `safety`).

import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';
import type { SyncStatus } from './SiteReport';

export default class Incident extends Model {
  static table = 'local_incidents';

  @field('incident_id') incidentId!: string;
  @field('project_id') projectId!: string;
  @field('incident_type') incidentType!: string;
  @field('severity') severity!: string;
  @field('status') status!: string;
  @field('created_at') createdAt!: string | null;
  @field('sync_status') offlineSyncStatus!: SyncStatus;
}
