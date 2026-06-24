// WatermelonDB Model — local_attendance
// Maps to the local_attendance table defined in schema.ts.
// check_in is server-authoritative on conflict (§17.5) — prevents time manipulation.

import { Model } from '@nozbe/watermelondb';
import { field, writer } from '@nozbe/watermelondb/decorators';

export type SyncStatus = 'PENDING' | 'SYNCED' | 'CONFLICT';

export default class Attendance extends Model {
  static table = 'local_attendance';

  @field('log_id') logId!: string;
  @field('worker_id') workerId!: string;
  @field('project_id') projectId!: string;
  @field('check_in_at') checkInAt!: string | null;
  @field('check_out_at') checkOutAt!: string | null;
  @field('hours_worked') hoursWorked!: number | null;
  @field('sync_status') offlineSyncStatus!: SyncStatus;

  @writer
  async setCheckOut(at: string): Promise<void> {
    await this.update((record) => {
      (record as Attendance).checkOutAt = at;
      (record as Attendance).offlineSyncStatus = 'PENDING';
    });
  }

  @writer
  async markSynced(serverLogId: string): Promise<void> {
    await this.update((record) => {
      (record as Attendance).logId = serverLogId;
      (record as Attendance).offlineSyncStatus = 'SYNCED';
    });
  }

  @writer
  async markConflict(): Promise<void> {
    await this.update((record) => {
      (record as Attendance).offlineSyncStatus = 'CONFLICT';
    });
  }
}
