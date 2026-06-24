// WatermelonDB Model — local_tasks
// Maps to the local_tasks table defined in schema.ts.
// progress_percent is monotonic — conflicts resolve Max-wins server-side (§17.5).

import { Model } from '@nozbe/watermelondb';
import { field, writer } from '@nozbe/watermelondb/decorators';

export type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
export type SyncStatus = 'PENDING' | 'SYNCED' | 'CONFLICT';

export default class Task extends Model {
  static table = 'local_tasks';

  @field('task_id') taskId!: string;
  @field('project_id') projectId!: string;
  @field('task_name') taskName!: string;
  @field('status') status!: TaskStatus;
  @field('progress_percent') progressPercent!: number;
  @field('assigned_to') assignedTo!: string | null;
  @field('sync_status') offlineSyncStatus!: SyncStatus;

  @writer
  async setProgress(percent: number): Promise<void> {
    await this.update((record) => {
      (record as Task).progressPercent = percent;
      (record as Task).offlineSyncStatus = 'PENDING';
    });
  }

  @writer
  async markSynced(serverTaskId: string): Promise<void> {
    await this.update((record) => {
      (record as Task).taskId = serverTaskId;
      (record as Task).offlineSyncStatus = 'SYNCED';
    });
  }

  @writer
  async markConflict(): Promise<void> {
    await this.update((record) => {
      (record as Task).offlineSyncStatus = 'CONFLICT';
    });
  }
}
