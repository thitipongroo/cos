// Data-export Temporal worker (ADR-078) — its own task queue, its own process.
//
// Separate from the procurement worker on purpose: an export reads across every domain schema and
// buffers an archive, so a burst of subject-rights requests would otherwise compete for slots with
// RFQ and PO workflows and delay purchasing. It also isolates the blast radius — this worker touches
// PII in bulk, and keeping it its own deployable means its logs, its metrics and its scaling are
// separate from everything else.

import { Worker } from '@temporalio/worker';
import { createLogger } from '@cos/logger';

import * as exportActivities from './data-export.activities';
import { disconnectExportClients } from './data-export.activities';
import { disconnectActivityClients } from '../../../procurement/workflows/activity-helpers';

const logger = createLogger('data-export-worker');

export const DATA_EXPORT_TASK_QUEUE = 'data-export';

export async function runDataExportWorker(): Promise<void> {
  const worker = await Worker.create({
    taskQueue: DATA_EXPORT_TASK_QUEUE,
    workflowsPath: require.resolve('./'), // auto-discovers data-export.workflow.ts
    activities: { ...exportActivities },
  });

  logger.info({ taskQueue: DATA_EXPORT_TASK_QUEUE }, 'data_export.worker.starting');
  try {
    await worker.run();
  } finally {
    // TWO pools to close (ADR-034 / Rule 39): the tenant clients that withTenantTx memoises per
    // datasource URL, and this module's own platform client. Both outlive individual activities by
    // design, so nothing else will close them.
    await Promise.all([disconnectActivityClients(), disconnectExportClients()]);
  }
}

if (require.main === module) {
  runDataExportWorker().catch((err) => {
    logger.error({ err }, 'data_export.worker.fatal');
    process.exit(1);
  });
}
