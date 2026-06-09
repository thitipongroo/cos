// File cleanup Temporal worker — registers the file hard-delete workflow.
// Runs as a separate process alongside the Fastify HTTP server.
// Schedule: daily at 00:00 UTC (cron expression: '0 0 * * *').

import { Worker } from '@temporalio/worker';
import { Connection, ScheduleClient, ScheduleOverlapPolicy } from '@temporalio/client';
import { createLogger } from '@cos/logger';
import { loadConfig } from '../config';
import { DbService } from '../services/db.service';
import { MinioService } from '../services/minio.service';
import { OpenSearchService } from '../services/opensearch.service';
import { createFileCleanupActivities } from './file-cleanup.activities';

const logger = createLogger('file-service.cleanup-worker');
const TASK_QUEUE = 'file-cleanup';
const SCHEDULE_ID = 'file-hard-delete-daily';
const WORKFLOW_PATH = require.resolve('./workflows/file-cleanup.workflow');

export async function runFileCleanupWorker(): Promise<void> {
  const config = loadConfig();
  const db = new DbService(config);
  const minio = new MinioService(config);
  const opensearch = new OpenSearchService(config);
  const activities = createFileCleanupActivities(db, minio, opensearch);

  const worker = await Worker.create({
    taskQueue: TASK_QUEUE,
    workflowsPath: WORKFLOW_PATH,
    activities,
  });

  await ensureSchedule(config.temporal.address);

  logger.info({ taskQueue: TASK_QUEUE }, 'file.cleanup.worker.starting');
  await worker.run();
}

async function ensureSchedule(temporalAddress: string): Promise<void> {
  const scheduleClient = new ScheduleClient({
    connection: Connection.lazy({ address: temporalAddress }),
  });
  try {
    await scheduleClient.create({
      scheduleId: SCHEDULE_ID,
      spec: { cronExpressions: ['0 0 * * *'] },
      action: {
        type: 'startWorkflow',
        workflowType: 'fileHardDeleteWorkflow',
        taskQueue: TASK_QUEUE,
      },
      policies: { overlap: ScheduleOverlapPolicy.SKIP },
    });
    logger.info({ scheduleId: SCHEDULE_ID }, 'file.cleanup.schedule.created');
  } catch (err: unknown) {
    // Schedule already exists — expected on restart
    if (err instanceof Error && err.message.includes('already exists')) {
      logger.info({ scheduleId: SCHEDULE_ID }, 'file.cleanup.schedule.exists');
    } else {
      throw err;
    }
  }
}

if (require.main === module) {
  runFileCleanupWorker().catch((err) => {
    logger.error({ err }, 'file.cleanup.worker.fatal');
    process.exit(1);
  });
}
