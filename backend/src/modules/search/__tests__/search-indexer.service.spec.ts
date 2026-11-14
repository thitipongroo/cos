// SearchIndexerService — the write half of search (TDD OQ-22).
//
// The index NAMES are what these tests exist for. Indexing writes to one name and
// ProjectService.searchProjects / SiteOpsService.searchSiteReports read from another; if the two
// drift, nothing fails — the indexer succeeds, the search returns nothing, and the only symptom is a
// project that quietly cannot be found by name. So the constants are asserted as literals here
// rather than imported into the assertion, which would make the test agree with itself.

const index = jest.fn().mockResolvedValue({});
const putIndexTemplate = jest.fn().mockResolvedValue({});
jest.mock('@opensearch-project/opensearch', () => ({
  Client: jest.fn().mockImplementation(() => ({ index, indices: { putIndexTemplate } })),
}));

import {
  SearchIndexerService,
  PROJECTS_INDEX,
  SITE_REPORTS_INDEX,
  SITE_ISSUES_INDEX,
} from '../search-indexer.service';

describe('SearchIndexerService', () => {
  beforeEach(() => {
    index.mockClear();
    putIndexTemplate.mockReset().mockResolvedValue({});
  });

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
      version: Date.parse('2026-06-01T00:00:00Z'),
      version_type: 'external_gte',
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
      blockers: 'cement late',
      submitted_by: 'u-1',
      status: 'SUBMITTED',
      modified_at: new Date(0),
    } as never);

    expect(index).toHaveBeenCalledWith(
      expect.objectContaining({ index: 'site-reports', id: 'r-1' }),
    );
    expect((index.mock.calls[0]![0] as { body: Record<string, unknown> }).body).toMatchObject({
      summary: 'Slab poured',
      weather: 'CLEAR',
      // The app's only free text: without it a report filed from the app has nothing to match.
      blockers: 'cement late',
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
      modified_at: new Date(0),
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
      new SearchIndexerService().indexProject({
        project_id: 'p-2',
        updated_at: new Date(0),
      } as never),
    ).rejects.toThrow('opensearch is down');
  });

  // Each write carries the row's change time as an external version, so an older snapshot — a
  // re-delivered event, or the reindex's catch-up — cannot replace a newer document.
  it('writes with the row change time as an external_gte version', async () => {
    await new SearchIndexerService().indexSiteReport({
      report_id: 'r-9',
      modified_at: new Date('2026-11-14T10:00:00.000Z'),
    } as never);
    expect(index).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'r-9',
        version: Date.parse('2026-11-14T10:00:00.000Z'),
        version_type: 'external_gte',
      }),
    );
  });

  it('an older version is skipped, not thrown (it would go to the DLQ for nothing)', async () => {
    index.mockRejectedValueOnce(
      Object.assign(new Error('conflict'), {
        statusCode: 409,
        body: { error: { type: 'version_conflict_engine_exception' } },
      }),
    );
    await expect(
      new SearchIndexerService().indexIssue({ issue_id: 'i-9', modified_at: new Date(0) } as never),
    ).resolves.toBeUndefined();
  });

  // The templates must exist before a write can auto-create an index (with the standard analyzer).
  it('puts the templates before the first write, and retries them after a failure', async () => {
    const service = new SearchIndexerService();
    putIndexTemplate.mockRejectedValueOnce(new Error('opensearch starting'));
    await service.onModuleInit(); // logged, not thrown
    expect(index).not.toHaveBeenCalled();

    await service.indexIssue({ issue_id: 'i-1', modified_at: new Date(0) } as never);
    expect(putIndexTemplate).toHaveBeenCalledTimes(1 + 3); // the failed first, then all three
    expect(putIndexTemplate.mock.invocationCallOrder.at(-1)!).toBeLessThan(
      index.mock.invocationCallOrder.at(-1)!,
    );

    await service.indexIssue({ issue_id: 'i-2', modified_at: new Date(0) } as never);
    expect(putIndexTemplate).toHaveBeenCalledTimes(4); // not again once in place
  });
});
