import {
  SEARCH_INDEXES,
  ensureSearchIndexTemplates,
  indexTemplateFor,
  issueDocument,
  projectDocument,
  siteReportDocument,
  templateNameFor,
} from '../search-index-mapping';

describe('search index templates', () => {
  it('covers the three indexes the read paths query', () => {
    expect([...SEARCH_INDEXES]).toEqual(['cos_projects', 'site-reports', 'site-issues']);
  });

  it.each(SEARCH_INDEXES)('%s: matches the name and its versioned indexes', (index) => {
    expect(indexTemplateFor(index)['index_patterns']).toEqual([`${index}*`]);
  });

  // The standard analyzer leaves a run of Thai as one token; `thai` segments it. And every read path
  // filters on `.keyword`, which the dynamic mapping used to create — the template must keep it.
  it('maps every string to Thai-analysed text with a keyword sub-field', () => {
    const template = indexTemplateFor('site-reports') as {
      template: { mappings: { dynamic_templates: Array<Record<string, unknown>> } };
    };
    expect(template.template.mappings.dynamic_templates).toEqual([
      {
        strings_thai_text_with_keyword: {
          match_mapping_type: 'string',
          mapping: {
            type: 'text',
            analyzer: 'cos_thai',
            fields: { keyword: { type: 'keyword', ignore_above: 256 } },
          },
        },
      },
    ]);
  });

  it('puts one named template per index', async () => {
    const putIndexTemplate = jest.fn().mockResolvedValue({});
    await ensureSearchIndexTemplates({ indices: { putIndexTemplate } });
    expect(putIndexTemplate.mock.calls.map((c) => (c[0] as { name: string }).name)).toEqual(
      SEARCH_INDEXES.map(templateNameFor),
    );
  });
});

describe('document projections', () => {
  it('site report carries blockers and the filtered ids', () => {
    expect(
      siteReportDocument({
        report_id: 'r',
        project_id: 'p',
        tenant_id: 't',
        report_date: '2026-06-01',
        summary: null,
        weather: null,
        blockers: 'ปูนมาช้า',
        submitted_by: 'u',
        status: 'SUBMITTED',
        modified_at: new Date(0),
      }),
    ).toEqual(
      expect.objectContaining({
        report_id: 'r',
        tenant_id: 't',
        project_id: 'p',
        blockers: 'ปูนมาช้า',
      }),
    );
  });

  it('issue and project keep their fields', () => {
    expect(
      issueDocument({
        issue_id: 'i',
        project_id: 'p',
        tenant_id: 't',
        title: 'x',
        description: null,
        severity: 'HIGH',
        status: 'OPEN',
        modified_at: new Date(0),
      }),
    ).toEqual(expect.objectContaining({ issue_id: 'i', title: 'x', status: 'OPEN' }));
    expect(
      projectDocument({
        project_id: 'p',
        tenant_id: 't',
        project_code: 'C',
        project_name: 'N',
        project_type: 'RESIDENTIAL',
        status: 'ACTIVE',
        updated_at: new Date(0),
      }),
    ).toEqual(expect.objectContaining({ tenant_id: 't', project_code: 'C', project_name: 'N' }));
  });
});
