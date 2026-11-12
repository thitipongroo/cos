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
import { disconnectActivityClients } from '../../../../shared/workflows/activity-helpers';
import { connectTemporalWorker } from '../../../../shared/workflows/worker-connection';

const logger = createLogger('data-export-worker');

export const DATA_EXPORT_TASK_QUEUE = 'data-export';

export async function runDataExportWorker(): Promise<void> {
  // TEMPORAL_ADDRESS, not Worker.create's localhost default (shared/workflows/worker-connection.ts).
  const connection = await connectTemporalWorker();
  try {
    const worker = await Worker.create({
      connection,
      taskQueue: DATA_EXPORT_TASK_QUEUE,
      // The workflow FILE, not the directory — see the procurement worker for what './' did.
      workflowsPath: require.resolve('./data-export.workflow'),
      activities: { ...exportActivities },
    });

    logger.info({ taskQueue: DATA_EXPORT_TASK_QUEUE }, 'data_export.worker.starting');
    try {
      await worker.run();
    } finally {
      // TWO pools to close (ADR-034 / Rule 39): the tenant clients that withTenantTx memoises per
      // datasource URL, and this module's own platform client. Both outlive individual activities
      // by design, so nothing else will close them.
      await Promise.all([disconnectActivityClients(), disconnectExportClients()]);
    }
  } finally {
    await connection.close();
  }
}

if (require.main === module) {
  runDataExportWorker().catch((err) => {
    logger.error({ err }, 'data_export.worker.fatal');
    process.exit(1);
  });
}
