// Procurement Temporal Worker — Phase 5
// Dedicated worker registering RFQ and PO workflows + their activities.
// Runs as a separate process within the procurement module boundary.
// Source: context/00_master_construction_os.md §Phase 5 Workflow Implementation

import { Worker } from '@temporalio/worker';
import * as rfqActivities from './rfq.activities';
import * as poActivities from './po.activities';
import { disconnectActivityClients } from './activity-helpers';
import { createLogger } from '@cos/logger';

const logger = createLogger('procurement-worker');

const TASK_QUEUE = 'procurement';

export async function runProcurementWorker(): Promise<void> {
  const worker = await Worker.create({
    taskQueue: TASK_QUEUE,
    workflowsPath: require.resolve('./'), // auto-discovers rfq.workflow.ts + po.workflow.ts
    activities: {
      ...rfqActivities,
      ...poActivities,
    },
  });

  logger.info({ taskQueue: TASK_QUEUE }, 'procurement.worker.starting');
  try {
    await worker.run();
  } finally {
    // Activity Prisma clients are pooled for the worker's lifetime (activity-helpers.ts), so this is
    // the only place that closes them.
    await disconnectActivityClients();
  }
}

// Entry point for standalone worker process
if (require.main === module) {
  runProcurementWorker().catch((err) => {
    logger.error({ err }, 'procurement.worker.fatal');
    process.exit(1);
  });
}
