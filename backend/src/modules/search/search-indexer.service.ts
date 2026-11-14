// Projects a project / site report / issue row into its OpenSearch index (TDD OQ-22).
//
// Failures THROW here, deliberately. Indexing used to happen inline in ProjectService and
// SiteOpsService inside a `try { … } catch { logger.warn('opensearch.index.failed') }`, which is
// correct for a write path — a search index must never fail a user's create — but it was also the
// end of the road. There is no reindex job, script or runbook anywhere in the repository, so a write
// lost to a restarting OpenSearch node was lost permanently: the row existed, the document did not,
// and nothing would ever put it back. `GET /projects?q=` searches the index, so a project silently
// stopped being findable by name for the rest of its life.
//
// On the consumer side there is somewhere for a failure to go. KafkaConsumer retries three times
// with exponential backoff and forwards to the DLQ after that, so a broker-side outage now ends in a
// DLQ message someone can replay rather than in a warning nobody reads.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client as OpenSearchClient } from '@opensearch-project/opensearch';
import { createLogger } from '@cos/logger';
import type { ProjectIndexRow, SiteReportIndexRow, IssueIndexRow } from './search-index.repository';
import {
  PROJECTS_INDEX,
  SITE_REPORTS_INDEX,
  SITE_ISSUES_INDEX,
  VERSION_TYPE,
  ensureSearchIndexTemplates,
  isVersionConflict,
  issueDocument,
  projectDocument,
  siteReportDocument,
  versionOf,
  type IndexTemplateClient,
} from './search-index-mapping';

const logger = createLogger('search-indexer');

// The index names live in search-index-mapping.ts with the templates that define them; re-exported
// so existing importers keep working. The read paths query the same names — an indexer writing to a
// name the search does not read is indistinguishable from not indexing at all.
export { PROJECTS_INDEX, SITE_REPORTS_INDEX, SITE_ISSUES_INDEX };

@Injectable()
export class SearchIndexerService implements OnModuleInit {
  private readonly client = new OpenSearchClient({
    node: process.env['OPENSEARCH_URL'] ?? 'http://localhost:9200',
  });

  /** Settles once the templates are in place; reset on failure so the next write tries again. */
  private templates: Promise<void> | null = null;

  /**
   * Put the index templates (Thai analyzer, `.keyword` sub-fields) before anything is indexed, so an
   * index created from nothing — a fresh environment, or after the index was deleted — gets them.
   * Started here and awaited again before every write (`ensureTemplates`): a failure here never
   * blocks startup (search is on no write path), and is retried by the next write instead of leaving
   * the first write to auto-create the index with the standard analyzer. An index that already
   * exists keeps its old mapping until the reindex script replaces it.
   */
  async onModuleInit(): Promise<void> {
    await this.ensureTemplates().catch((err: unknown) =>
      logger.warn({ err }, 'search.templates.ensure_failed'),
    );
  }

  private ensureTemplates(): Promise<void> {
    if (!this.templates) {
      this.templates = ensureSearchIndexTemplates(
        this.client as unknown as IndexTemplateClient,
      ).catch((err: unknown) => {
        this.templates = null;
        throw err;
      });
    }
    return this.templates;
  }

  async indexProject(row: ProjectIndexRow): Promise<void> {
    await this.index(PROJECTS_INDEX, row.project_id, projectDocument(row), row.updated_at);
  }

  async indexSiteReport(row: SiteReportIndexRow): Promise<void> {
    await this.index(SITE_REPORTS_INDEX, row.report_id, siteReportDocument(row), row.modified_at);
  }

  async indexIssue(row: IssueIndexRow): Promise<void> {
    await this.index(SITE_ISSUES_INDEX, row.issue_id, issueDocument(row), row.modified_at);
  }

  /**
   * Indexed under the row's own id, so re-delivering an event overwrites the document rather than
   * adding a second one. That is what lets a DLQ message be replayed without thought, and what lets
   * this run alongside a backfill of the same rows.
   */
  private async index(
    index: string,
    id: string,
    body: Record<string, unknown>,
    changedAt: Date,
  ): Promise<void> {
    await this.ensureTemplates();
    try {
      // External version = the row's change time, so a re-delivered older event (or the reindex's
      // catch-up) can never replace a newer document — see search-index-mapping.ts.
      await this.client.index({
        index,
        id,
        body,
        version: versionOf(changedAt),
        version_type: VERSION_TYPE,
      });
    } catch (err) {
      // A newer version is already indexed: this write is obsolete, not failed. Throwing would send
      // it through three retries to the DLQ for nothing.
      if (isVersionConflict(err)) {
        logger.debug({ index, id }, 'search.index.skipped_older_version');
        return;
      }
      throw err;
    }
    logger.debug({ index, id }, 'search.indexed');
  }
}
