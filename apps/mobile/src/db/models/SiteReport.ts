// WatermelonDB Model — local_site_reports
// Maps to the local_site_reports table defined in schema.ts.
// sync_status transitions: PENDING → SYNCED | CONFLICT (managed by SyncManager)

import { Model } from '@nozbe/watermelondb';
import { field, writer } from '@nozbe/watermelondb/decorators';

export type SiteReportStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED';
export type SyncStatus = 'PENDING' | 'SYNCED' | 'CONFLICT';

export default class SiteReport extends Model {
  static table = 'local_site_reports';

  @field('report_id') reportId!: string;
  @field('project_id') projectId!: string;
  @field('report_date') reportDate!: string;
  @field('summary') summary!: string | null;
  @field('status') status!: SiteReportStatus;
  @field('sync_status') offlineSyncStatus!: SyncStatus;

  @writer
  async markSynced(serverReportId: string): Promise<void> {
    await this.update((record) => {
      record.reportId = serverReportId;
      (record as SiteReport).offlineSyncStatus = 'SYNCED';
    });
  }

  @writer
  async markConflict(): Promise<void> {
    await this.update((record) => {
      (record as SiteReport).offlineSyncStatus = 'CONFLICT';
    });
  }
}
