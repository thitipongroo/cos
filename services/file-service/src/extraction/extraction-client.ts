// ExtractionClient — starts the ZIP extraction workflow from the Fastify upload path.
// Lazy Temporal connection (shared) so uploads don't pay a connect cost per request.

import { Client, Connection } from '@temporalio/client';
import { createLogger } from '@cos/logger';

const logger = createLogger('file-service.extraction-client');

export const EXTRACTION_TASK_QUEUE = 'file-extraction';

export class ExtractionClient {
  private client: Client | null = null;

  constructor(private readonly address: string) {}

  private getClient(): Client {
    if (!this.client) {
      this.client = new Client({ connection: Connection.lazy({ address: this.address }) });
    }
    return this.client;
  }

  async startExtraction(archiveFileId: string): Promise<void> {
    await this.getClient().workflow.start('zipExtractionWorkflow', {
      taskQueue: EXTRACTION_TASK_QUEUE,
      workflowId: `zip-extract-${archiveFileId}`,
      args: [archiveFileId],
    });
    logger.info({ archiveFileId }, 'extraction.workflow.started');
  }
}
