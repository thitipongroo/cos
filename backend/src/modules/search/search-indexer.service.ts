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

import { Injectable } from '@nestjs/common';
import { Client as OpenSearchClient } from '@opensearch-project/opensearch';
import { createLogger } from '@cos/logger';
import type { ProjectIndexRow, SiteReportIndexRow, IssueIndexRow } from './search-index.repository';

const logger = createLogger('search-indexer');

// The index names the read paths query: ProjectService.searchProjects and
// SiteOpsService.searchSiteReports / searchIssues. They must stay identical — an indexer writing to
// a name the search does not read is indistinguishable from not indexing at all.
export const PROJECTS_INDEX = 'cos_projects';
export const SITE_REPORTS_INDEX = 'site-reports';
export const SITE_ISSUES_INDEX = 'site-issues';

@Injectable()
export class SearchIndexerService {
  private readonly client = new OpenSearchClient({
    node: process.env['OPENSEARCH_URL'] ?? 'http://localhost:9200',
  });

  async indexProject(row: ProjectIndexRow): Promise<void> {
    await this.index(PROJECTS_INDEX, row.project_id, {
      tenant_id: row.tenant_id,
      project_code: row.project_code,
      project_name: row.project_name,
      project_type: row.project_type,
      status: row.status,
      updated_at: row.updated_at,
    });
  }

  async indexSiteReport(row: SiteReportIndexRow): Promise<void> {
    await this.index(SITE_REPORTS_INDEX, row.report_id, {
      report_id: row.report_id,
      project_id: row.project_id,
      tenant_id: row.tenant_id,
      report_date: row.report_date,
      summary: row.summary,
      weather: row.weather,
      submitted_by: row.submitted_by,
      status: row.status,
    });
  }

  async indexIssue(row: IssueIndexRow): Promise<void> {
    await this.index(SITE_ISSUES_INDEX, row.issue_id, {
      issue_id: row.issue_id,
      project_id: row.project_id,
      tenant_id: row.tenant_id,
      title: row.title,
      description: row.description,
      severity: row.severity,
      status: row.status,
    });
  }

  /**
   * Indexed under the row's own id, so re-delivering an event overwrites the document rather than
   * adding a second one. That is what lets a DLQ message be replayed without thought, and what lets
   * this run alongside a backfill of the same rows.
   */
  private async index(index: string, id: string, body: Record<string, unknown>): Promise<void> {
    await this.client.index({ index, id, body });
    logger.debug({ index, id }, 'search.indexed');
  }
}
