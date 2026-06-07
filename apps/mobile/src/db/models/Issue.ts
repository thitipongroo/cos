// WatermelonDB Model — local_issues
// Maps to the local_issues table defined in schema.ts.

import { Model } from '@nozbe/watermelondb';
import { field, writer } from '@nozbe/watermelondb/decorators';
import type { SyncStatus } from './SiteReport';

export type IssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IssueStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export default class Issue extends Model {
  static table = 'local_issues';

  @field('issue_id') issueId!: string;
  @field('project_id') projectId!: string;
  @field('report_id') reportId!: string | null;
  @field('title') title!: string;
  @field('description') description!: string | null;
  @field('severity') severity!: IssueSeverity;
  @field('status') status!: IssueStatus;
  @field('sync_status') offlineSyncStatus!: SyncStatus;

  @writer
  async markSynced(serverIssueId: string): Promise<void> {
    await this.update((record) => {
      record.issueId = serverIssueId;
      (record as Issue).offlineSyncStatus = 'SYNCED';
    });
  }

  @writer
  async markConflict(): Promise<void> {
    await this.update((record) => {
      (record as Issue).offlineSyncStatus = 'CONFLICT';
    });
  }
}
