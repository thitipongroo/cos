import { Worker } from '@temporalio/worker';
import * as activities from './enterprise-provisioning.activities';
import { createLogger } from '@cos/logger';

const logger = createLogger('enterprise-provisioning-worker');

const TASK_QUEUE = 'enterprise-provisioning';

export async function runEnterpriseProvisioningWorker(): Promise<void> {
  const worker = await Worker.create({
    taskQueue: TASK_QUEUE,
    // The workflow FILE, not the directory — see the procurement worker for what './' did.
    workflowsPath: require.resolve('./enterprise-provisioning.workflow'),
    activities,
  });

  logger.info({ taskQueue: TASK_QUEUE }, 'enterprise-provisioning.worker.starting');
  await worker.run();
}

if (require.main === module) {
  runEnterpriseProvisioningWorker().catch((err) => {
    logger.error({ err }, 'enterprise-provisioning.worker.fatal');
    process.exit(1);
  });
}
