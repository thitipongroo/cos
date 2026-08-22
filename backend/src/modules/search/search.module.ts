// Search indexing (TDD OQ-22). Consumer-only: the SEARCH endpoints stay on their own modules
// (ProjectService.searchProjects, SiteOpsService.searchSiteReports / searchIssues) — this module
// owns the WRITE side of the index, which is the half that had no owner.

import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { SearchIndexRepository } from './search-index.repository';
import { SearchIndexerService } from './search-indexer.service';
import { SearchIndexerConsumer } from './search-indexer.consumer';

@Module({
  imports: [TenantModule],
  providers: [SearchIndexRepository, SearchIndexerService, SearchIndexerConsumer],
  exports: [SearchIndexerService],
})
export class SearchModule {}
