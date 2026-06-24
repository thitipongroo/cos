// WatermelonDB Model — local_material_consumptions
// Read cache of site_ops.material_consumptions, populated by delta-sync (entity type `material`).

import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';
import type { SyncStatus } from './SiteReport';

export default class MaterialConsumption extends Model {
  static table = 'local_material_consumptions';

  @field('consumption_id') consumptionId!: string;
  @field('project_id') projectId!: string;
  @field('material_name') materialName!: string;
  @field('quantity') quantity!: number;
  @field('unit') unit!: string;
  @field('consumed_at') consumedAt!: string | null;
  @field('sync_status') offlineSyncStatus!: SyncStatus;
}
