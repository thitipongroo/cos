// File hard-delete Temporal workflow — runs daily to remove soft-deleted files.
// Hard delete: 30 days after deleted_at per spec §Phase 9 File Retention.
// Scheduled daily at 00:00 UTC by the worker bootstrap (ScheduleClient.create).

import { proxyActivities } from '@temporalio/workflow';
import type { FileCleanupActivities } from '../file-cleanup.activities';

const { findExpiredFiles, hardDeleteFile } = proxyActivities<FileCleanupActivities>({
  startToCloseTimeout: '5 minutes',
});

export async function fileHardDeleteWorkflow(): Promise<void> {
  const expiredFileIds = await findExpiredFiles();
  for (const fileId of expiredFileIds) {
    await hardDeleteFile(fileId);
  }
}
