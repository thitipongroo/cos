// OpenSearchService — indexes file metadata for full-text search.
// Index per tenant: files-{tenant_id}  (spec §Phase 9 OpenSearch Indexing).
//
// The document carries what spec §Phase 9 lists as the indexed fields: original_filename, mime_type,
// entity_type, entity_id, uploaded_by, uploaded_at, and the metadata key-value pairs. The last three
// used to be absent — entity_type/entity_id and the pairs live in files.file_metadata, a separate
// table, so nothing put them in the document unless the caller read them first. Their absence made
// the spec's other half unreachable too: "Full-text search: on original_filename and metadata
// values" cannot match a value the index never received.

import { Client } from '@opensearch-project/opensearch';
import type { FileServiceConfig } from '../config';
import type { FileMetadataRow, StoredFileRow } from '../types';

/** One indexed document's metadata pairs, flattened for search. */
interface IndexedMetadata {
  entity_type: string | null;
  entity_id: string | null;
  metadata: Array<{ key: string; value: string | null }>;
}

export class OpenSearchService {
  private readonly client: Client;

  constructor(config: FileServiceConfig) {
    this.client = new Client({ node: config.opensearch.host });
  }

  private indexName(tenantId: string): string {
    return `files-${tenantId}`;
  }

  /**
   * Collapse the metadata rows of one file into the fields the document needs.
   *
   * entity_type/entity_id are per-file in practice — insertMetadata writes one `entity_ref` row —
   * but the table permits several, so the first row that names an entity wins rather than the last
   * one read.
   */
  private static foldMetadata(rows: readonly FileMetadataRow[]): IndexedMetadata {
    const named = rows.find((r) => r.entity_type !== null || r.entity_id !== null);
    return {
      entity_type: named?.entity_type ?? null,
      entity_id: named?.entity_id ?? null,
      metadata: rows.map((r) => ({ key: r.metadata_key, value: r.metadata_value })),
    };
  }

  async indexFile(file: StoredFileRow, metadata: readonly FileMetadataRow[] = []): Promise<void> {
    const folded = OpenSearchService.foldMetadata(metadata);
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
        entity_type: folded.entity_type,
        entity_id: folded.entity_id,
        metadata: folded.metadata,
      },
    });
  }

  /**
   * Full-text search over one tenant's files.
   *
   * Both targets the spec names: the filename and the metadata VALUES. Filenames alone would find
   * "IMG_4821.jpg" and never the drawing number someone recorded against it, which is the thing a
   * site engineer actually types.
   *
   * Scoped by index rather than by a query filter, so a forgotten predicate cannot reach another
   * tenant's documents.
   */
  async search(tenantId: string, q: string, size = 50): Promise<string[]> {
    const response = await this.client.search({
      index: this.indexName(tenantId),
      body: {
        size,
        query: {
          multi_match: {
            query: q,
            fields: ['original_filename', 'metadata.value'],
          },
        },
      },
    });
    const hits = (response.body.hits?.hits ?? []) as Array<{ _source?: { file_id?: string } }>;
    return hits.map((h) => h._source?.file_id).filter((id): id is string => typeof id === 'string');
  }

  async deleteFileIndex(tenantId: string, fileId: string): Promise<void> {
    await this.client.delete({
      index: this.indexName(tenantId),
      id: fileId,
    });
  }
}
