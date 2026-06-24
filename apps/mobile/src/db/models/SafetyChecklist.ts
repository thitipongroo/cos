// WatermelonDB Model — local_safety_checklists
// Maps to the local_safety_checklists table defined in schema.ts.
// `itemsJson` is the cached template (server safety_checklists.items);
// `responsesJson` holds the worker's answers pending submission/sync.

import { Model } from '@nozbe/watermelondb';
import { field, writer } from '@nozbe/watermelondb/decorators';

export type SyncStatus = 'PENDING' | 'SYNCED' | 'CONFLICT';

export default class SafetyChecklist extends Model {
  static table = 'local_safety_checklists';

  @field('checklist_id') checklistId!: string;
  @field('project_id') projectId!: string;
  @field('checklist_name') checklistName!: string;
  @field('version') version!: number;
  @field('items') itemsJson!: string;
  @field('responses') responsesJson!: string | null;
  @field('sync_status') offlineSyncStatus!: SyncStatus;

  @writer
  async setResponses(responsesJson: string): Promise<void> {
    await this.update((record) => {
      (record as SafetyChecklist).responsesJson = responsesJson;
      (record as SafetyChecklist).offlineSyncStatus = 'PENDING';
    });
  }

  @writer
  async markSynced(): Promise<void> {
    await this.update((record) => {
      (record as SafetyChecklist).offlineSyncStatus = 'SYNCED';
    });
  }

  @writer
  async markConflict(): Promise<void> {
    await this.update((record) => {
      (record as SafetyChecklist).offlineSyncStatus = 'CONFLICT';
    });
  }
}
