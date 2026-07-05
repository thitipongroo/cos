// ZIP extraction Temporal worker — registers the on-demand extraction workflow.
// Runs as a separate process alongside the Fastify HTTP server and the cleanup worker.

import { Worker } from '@temporalio/worker';
import { createLogger } from '@cos/logger';
import { loadConfig } from '../config';
import { DbService } from '../services/db.service';
import { MinioService } from '../services/minio.service';
import { AntivirusService } from '../services/antivirus.service';
import { OpenSearchService } from '../services/opensearch.service';
import { KafkaService } from '../services/kafka.service';
import { ZipExtractionService } from '../services/zip-extraction.service';
import { createZipExtractionActivities } from './zip-extraction.activities';
import { EXTRACTION_TASK_QUEUE } from './extraction-client';

const logger = createLogger('file-service.extraction-worker');
const WORKFLOW_PATH = require.resolve('./workflows/zip-extraction.workflow');

export async function runZipExtractionWorker(): Promise<void> {
  const config = loadConfig();
  const db = new DbService(config);
  const minio = new MinioService(config);
  const antivirus = new AntivirusService(config, { db, minio });
  const opensearch = new OpenSearchService(config);
  const kafka = new KafkaService();
  const zip = new ZipExtractionService(config);

  const activities = createZipExtractionActivities({
    db,
    minio,
    zip,
    scanServices: { antivirus, db, minio, opensearch, kafka },
  });

  const worker = await Worker.create({
    taskQueue: EXTRACTION_TASK_QUEUE,
    workflowsPath: WORKFLOW_PATH,
    activities,
  });

  logger.info({ taskQueue: EXTRACTION_TASK_QUEUE }, 'file.extraction.worker.starting');
  await worker.run();
}

if (require.main === module) {
  runZipExtractionWorker().catch((err) => {
    logger.error({ err }, 'file.extraction.worker.fatal');
    process.exit(1);
  });
}
