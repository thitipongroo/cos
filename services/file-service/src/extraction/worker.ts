// ZIP extraction Temporal worker — registers the on-demand extraction workflow.
// Runs as a separate process alongside the Fastify HTTP server and the cleanup worker.

import { NativeConnection, Worker } from '@temporalio/worker';
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

  // config.temporal.address (TEMPORAL_ADDRESS). Without `connection`, Worker.create dials
  // localhost:7233 whatever the config says — so this worker could never have reached Temporal in
  // compose or Kubernetes; it died earlier on Alpine, so nobody saw it (D40, D41, 2026-11-12).
  const connection = await NativeConnection.connect({ address: config.temporal.address });
  try {
    const worker = await Worker.create({
      connection,
      taskQueue: EXTRACTION_TASK_QUEUE,
      workflowsPath: WORKFLOW_PATH,
      activities,
    });

    logger.info({ taskQueue: EXTRACTION_TASK_QUEUE }, 'file.extraction.worker.starting');
    await worker.run();
  } finally {
    await connection.close();
  }
}

if (require.main === module) {
  runZipExtractionWorker().catch((err) => {
    logger.error({ err }, 'file.extraction.worker.fatal');
    process.exit(1);
  });
}
