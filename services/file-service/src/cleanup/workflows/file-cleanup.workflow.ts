// File cleanup Temporal workflow — runs daily.
// 1. Hard-deletes soft-deleted files 30 days after deleted_at.
// 2. Purges quarantined files from cos-quarantine-{tenantId} bucket 30 days after quarantined_at.
// Scheduled daily at 00:00 UTC by the worker bootstrap (ScheduleClient.create).

import { proxyActivities } from '@temporalio/workflow';
import type { FileCleanupActivities } from '../file-cleanup.activities';

const { findExpiredFiles, hardDeleteFile, findExpiredQuarantinedFiles, purgeQuarantinedFile } =
  proxyActivities<FileCleanupActivities>({
    startToCloseTimeout: '5 minutes',
  });

export async function fileHardDeleteWorkflow(): Promise<void> {
  const expiredFileIds = await findExpiredFiles();
  for (const fileId of expiredFileIds) {
    await hardDeleteFile(fileId);
  }

  const expiredQuarantineIds = await findExpiredQuarantinedFiles();
  for (const fileId of expiredQuarantineIds) {
    await purgeQuarantinedFile(fileId);
  }
}
