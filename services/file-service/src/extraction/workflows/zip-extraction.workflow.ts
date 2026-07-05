// ZIP extraction Temporal workflow — orchestrates extract → mark-extracted.
// Started on-demand by the upload route when an application/zip file is uploaded.

import { proxyActivities } from '@temporalio/workflow';
import type { ZipExtractionActivities } from '../zip-extraction.activities';

const { extractArchive, markArchiveExtracted } = proxyActivities<ZipExtractionActivities>({
  startToCloseTimeout: '10 minutes',
  retry: { maximumAttempts: 3 },
});

export async function zipExtractionWorkflow(archiveFileId: string): Promise<void> {
  await extractArchive(archiveFileId);
  await markArchiveExtracted(archiveFileId);
}
