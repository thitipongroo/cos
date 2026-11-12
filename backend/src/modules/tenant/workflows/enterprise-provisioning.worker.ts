import { Worker } from '@temporalio/worker';
import * as activities from './enterprise-provisioning.activities';
import { createLogger } from '@cos/logger';
import { connectTemporalWorker } from '../../../shared/workflows/worker-connection';

const logger = createLogger('enterprise-provisioning-worker');

const TASK_QUEUE = 'enterprise-provisioning';

export async function runEnterpriseProvisioningWorker(): Promise<void> {
  // TEMPORAL_ADDRESS, not Worker.create's localhost default (shared/workflows/worker-connection.ts).
  const connection = await connectTemporalWorker();
  try {
    const worker = await Worker.create({
      connection,
      taskQueue: TASK_QUEUE,
      // The workflow FILE, not the directory — see the procurement worker for what './' did.
      workflowsPath: require.resolve('./enterprise-provisioning.workflow'),
      activities,
    });

    logger.info({ taskQueue: TASK_QUEUE }, 'enterprise-provisioning.worker.starting');
    await worker.run();
  } finally {
    await connection.close();
  }
}

if (require.main === module) {
  runEnterpriseProvisioningWorker().catch((err) => {
    logger.error({ err }, 'enterprise-provisioning.worker.fatal');
    process.exit(1);
  });
}
