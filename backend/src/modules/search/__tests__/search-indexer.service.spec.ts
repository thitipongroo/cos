// SearchIndexerService — the write half of search (TDD OQ-22).
//
// The index NAMES are what these tests exist for. Indexing writes to one name and
// ProjectService.searchProjects / SiteOpsService.searchSiteReports read from another; if the two
// drift, nothing fails — the indexer succeeds, the search returns nothing, and the only symptom is a
// project that quietly cannot be found by name. So the constants are asserted as literals here
// rather than imported into the assertion, which would make the test agree with itself.

const index = jest.fn().mockResolvedValue({});
jest.mock('@opensearch-project/opensearch', () => ({
  Client: jest.fn().mockImplementation(() => ({ index })),
}));

import {
  SearchIndexerService,
  PROJECTS_INDEX,
  SITE_REPORTS_INDEX,
  SITE_ISSUES_INDEX,
} from '../search-indexer.service';

describe('SearchIndexerService', () => {
  beforeEach(() => index.mockClear());

  it('the index names are the ones the read paths query', () => {
    expect(PROJECTS_INDEX).toBe('cos_projects');
    expect(SITE_REPORTS_INDEX).toBe('site-reports');
    expect(SITE_ISSUES_INDEX).toBe('site-issues');
  });

  it('indexes a project under its own id, with the searchable fields', async () => {
    await new SearchIndexerService().indexProject({
      project_id: 'p-1',
      tenant_id: 't-1',
      project_code: 'P-001',
      project_name: 'Riverside Tower',
      project_type: 'COMMERCIAL',
      status: 'ACTIVE',
      updated_at: '2026-06-01T00:00:00Z',
    } as never);

    expect(index).toHaveBeenCalledWith({
      index: 'cos_projects',
      id: 'p-1',
      body: {
        tenant_id: 't-1',
        project_code: 'P-001',
        project_name: 'Riverside Tower',
        project_type: 'COMMERCIAL',
        status: 'ACTIVE',
        updated_at: '2026-06-01T00:00:00Z',
      },
    });
  });

  it('indexes a site report', async () => {
    await new SearchIndexerService().indexSiteReport({
      report_id: 'r-1',
      project_id: 'p-1',
      tenant_id: 't-1',
      report_date: '2026-06-01',
      summary: 'Slab poured',
      weather: 'CLEAR',
      submitted_by: 'u-1',
      status: 'SUBMITTED',
    } as never);

    expect(index).toHaveBeenCalledWith(
      expect.objectContaining({ index: 'site-reports', id: 'r-1' }),
    );
    expect((index.mock.calls[0]![0] as { body: Record<string, unknown> }).body).toMatchObject({
      summary: 'Slab poured',
      weather: 'CLEAR',
    });
  });

  it('indexes an issue', async () => {
    await new SearchIndexerService().indexIssue({
      issue_id: 'i-1',
      project_id: 'p-1',
      tenant_id: 't-1',
      title: 'Scaffolding gap',
      description: 'North face, level 6',
      severity: 'HIGH',
      status: 'OPEN',
    } as never);

    expect(index).toHaveBeenCalledWith(
      expect.objectContaining({ index: 'site-issues', id: 'i-1' }),
    );
  });

  it('a failed index THROWS rather than being swallowed', async () => {
    // The whole reason indexing moved onto the outbox: inline, a failure was caught, warned about
    // and lost for good — there is no reindex job anywhere in this repository. On the consumer side
    // a throw becomes three retries and then a DLQ message someone can replay.
    index.mockRejectedValueOnce(new Error('opensearch is down'));
    await expect(
      new SearchIndexerService().indexProject({ project_id: 'p-2' } as never),
    ).rejects.toThrow('opensearch is down');
  });
});
