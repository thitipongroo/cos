// OpenSearchService — indexes file metadata for full-text search.
// Index per tenant: files-{tenant_id}  (spec §Phase 9 OpenSearch Indexing).

import { Client } from '@opensearch-project/opensearch';
import type { FileServiceConfig } from '../config';
import type { StoredFileRow } from '../types';

export class OpenSearchService {
  private readonly client: Client;

  constructor(config: FileServiceConfig) {
    this.client = new Client({ node: config.opensearch.host });
  }

  private indexName(tenantId: string): string {
    return `files-${tenantId}`;
  }

  async indexFile(file: StoredFileRow): Promise<void> {
    await this.client.index({
      index: this.indexName(file.tenant_id),
      id: file.file_id,
      body: {
        file_id: file.file_id,
        tenant_id: file.tenant_id,
        original_filename: file.original_filename,
        mime_type: file.mime_type,
        file_status: file.file_status,
        uploaded_by: file.uploaded_by,
        uploaded_at: file.uploaded_at,
      },
    });
  }

  async deleteFileIndex(tenantId: string, fileId: string): Promise<void> {
    await this.client.delete({
      index: this.indexName(tenantId),
      id: fileId,
    });
  }
}
