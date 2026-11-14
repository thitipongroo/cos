import {
  aliasSwapActions,
  parseArgs,
  reindexSearch,
  type ReindexSearchClient,
  type ReindexTenant,
} from '../maintenance/reindex-search';
import { missingEnv } from '../maintenance/reindex-search.script';

describe('parseArgs', () => {
  it('defaults to a dry-run full rebuild of all three indexes', () => {
    expect(parseArgs([])).toEqual({
      apply: false,
      indexes: ['cos_projects', 'site-reports', 'site-issues'],
      tenantId: undefined,
      allowShrink: false,
    });
  });

  it('takes --apply, repeated --index, --tenant and --allow-shrink', () => {
    expect(
      parseArgs([
        '--index',
        'site-reports',
        '--index',
        'site-issues',
        '--tenant',
        't-1',
        '--apply',
      ]),
    ).toEqual({
      apply: true,
      indexes: ['site-reports', 'site-issues'],
      tenantId: 't-1',
      allowShrink: false,
    });
    expect(parseArgs(['--allow-shrink', '--apply'])).toEqual(
      expect.objectContaining({ apply: true, allowShrink: true }),
    );
  });

  it.each([
    [['--index']],
    [['--index', 'nope']],
    [['--tenant', '--apply']],
    [['--force']],
    [['--tenant', 't-1', '--allow-shrink']],
  ])('rejects %j', (argv) => {
    expect(parseArgs(argv)).toHaveProperty('error');
  });
});

describe('missingEnv', () => {
  it('needs DATABASE_URL and OPENSEARCH_URL', () => {
    expect(missingEnv({})).toEqual(['DATABASE_URL', 'OPENSEARCH_URL']);
    expect(missingEnv({ DATABASE_URL: 'x', OPENSEARCH_URL: 'y' })).toEqual([]);
  });
});

describe('aliasSwapActions', () => {
  it('nothing yet: adds the alias', () => {
    expect(aliasSwapActions('site-reports', 'site-reports-v1', { kind: 'none' })).toEqual([
      { add: { index: 'site-reports-v1', alias: 'site-reports' } },
    ]);
  });

  // An alias cannot share a name with an index, so the index the dynamic mapping created is removed
  // in the same atomic request that adds the alias.
  it('still the concrete index: removes it and adds the alias in one request', () => {
    expect(aliasSwapActions('site-reports', 'site-reports-v1', { kind: 'concrete' })).toEqual([
      { remove_index: { index: 'site-reports' } },
      { add: { index: 'site-reports-v1', alias: 'site-reports' } },
    ]);
  });

  it('already an alias: moves it, leaving the old index in place', () => {
    expect(
      aliasSwapActions('site-reports', 'site-reports-v2', {
        kind: 'alias',
        targets: ['site-reports-v1'],
      }),
    ).toEqual([
      { remove: { index: 'site-reports-v1', alias: 'site-reports' } },
      { add: { index: 'site-reports-v2', alias: 'site-reports' } },
    ]);
  });
});

describe('reindexSearch', () => {
  const NOW = new Date('2026-11-14T10:00:00.000Z');
  const DB_NOW = new Date('2026-11-14T09:30:00.000Z'); // the tenant database's own clock

  function stubClient(state: 'none' | 'concrete' = 'concrete', existingCount = 0) {
    const calls: string[] = [];
    const client = {
      indices: {
        putIndexTemplate: jest.fn(async () => calls.push('template')),
        create: jest.fn(async () => calls.push('create')),
        exists: jest.fn(async () => ({ body: state === 'concrete' })),
        existsAlias: jest.fn(async () => ({ body: false })),
        getAlias: jest.fn(async () => ({ body: {} })),
        updateAliases: jest.fn(async () => calls.push('swap')),
        refresh: jest.fn(async () => calls.push('refresh')),
      },
      count: jest.fn(async () => ({ body: { count: existingCount } })),
      bulk: jest.fn(async () => {
        calls.push('bulk');
        return { body: { errors: false, items: [] } };
      }),
    };
    return { client, calls };
  }

  function tenant(id: string, rows: Array<Record<string, unknown>>, changed: typeof rows = []) {
    const query = jest.fn(async (sql: string, params?: unknown[]) => {
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql) || sql.includes('set_config')) return { rows: [] };
      if (sql.includes('now()')) return { rows: [{ now: DB_NOW }] };
      return { rows: params && params.length > 1 ? changed : rows };
    });
    return { t: { tenantId: id, db: { query } } as ReindexTenant, query };
  }

  const report = (id: string, blockers: string, modifiedAt = '2026-11-14T08:00:00.000Z') => ({
    report_id: id,
    project_id: 'p',
    tenant_id: 't',
    report_date: '2026-06-01',
    summary: null,
    weather: null,
    blockers,
    submitted_by: 'u',
    status: 'SUBMITTED',
    modified_at: new Date(modifiedAt),
  });

  const run = (
    client: ReturnType<typeof stubClient>['client'],
    tenants: ReindexTenant[],
    args: Parameters<typeof reindexSearch>[2],
  ) => reindexSearch(client as unknown as ReindexSearchClient, tenants, args, () => NOW);

  it('dry run: reads and counts, writes nothing to OpenSearch', async () => {
    const { client, calls } = stubClient();
    const a = tenant('t-a', [report('r1', 'x'), report('r2', 'y')]);
    const reports = await run(client, [a.t], { apply: false, indexes: ['site-reports'] });
    expect(reports).toEqual([
      expect.objectContaining({
        index: 'site-reports',
        mode: 'rebuild',
        documents: 2,
        caughtUp: 0,
        before: { kind: 'concrete' },
      }),
    ]);
    expect(calls).toEqual([]);
  });

  // A role that cannot see platform.tenants answers with no rows; a rebuild from that would swap
  // empty indexes in.
  it('refuses when there are no tenants, before touching OpenSearch', async () => {
    const { client, calls } = stubClient();
    await expect(run(client, [], { apply: true, indexes: ['site-reports'] })).rejects.toThrow(
      /no tenants/,
    );
    expect(calls).toEqual([]);
  });

  it('reads each tenant in a read-only transaction with the GUC set LOCAL (PgBouncer-safe)', async () => {
    const { client } = stubClient();
    const a = tenant('t-a', [report('r1', 'x')]);
    await run(client, [a.t], { apply: false, indexes: ['site-reports'] });
    const sqls = a.query.mock.calls.map((c) => c[0] as string);
    expect(sqls[0]).toBe('BEGIN READ ONLY');
    expect(a.query.mock.calls[1]).toEqual([
      "SELECT set_config('app.current_tenant_id', $1, true)",
      ['t-a'],
    ]);
    expect(sqls.at(-1)).toBe('COMMIT');
  });

  it('apply: template, create, bulk, swap, then the catch-up pass, in that order', async () => {
    const { client, calls } = stubClient('concrete');
    const a = tenant('t-a', [report('r1', 'ปูนมาช้า')], [report('r1', 'ปูนมาช้า แก้แล้ว')]);
    const b = tenant('t-b', []);

    const [result] = await run(client, [a.t, b.t], { apply: true, indexes: ['site-reports'] });

    expect(calls).toEqual([
      'template',
      'template',
      'template',
      'create',
      'bulk',
      'refresh',
      'swap',
      'bulk',
      'refresh',
    ]);
    expect(result!.target).toBe('site-reports-v20261114t100000000z');
    expect(client.indices.updateAliases).toHaveBeenCalledWith({
      body: {
        actions: [
          { remove_index: { index: 'site-reports' } },
          { add: { index: result!.target, alias: 'site-reports' } },
        ],
      },
    });
    // The catch-up window is measured on the tenant database's clock, not the script host's.
    const catchUp = a.query.mock.calls.find((c) => (c[1] as unknown[] | undefined)?.length === 2)!;
    expect((catchUp[1] as unknown[])[1]).toEqual(new Date('2026-11-14T09:29:00.000Z'));
    expect(result).toEqual(expect.objectContaining({ documents: 1, caughtUp: 1 }));
    // Every document carries the row's change time as an external_gte version.
    const firstBulk = (client.bulk.mock.calls[0] as unknown as [{ body: unknown[] }])[0].body;
    expect(firstBulk[0]).toEqual({
      index: {
        _index: result!.target,
        _id: 'r1',
        version: Date.parse('2026-11-14T08:00:00.000Z'),
        version_type: 'external_gte',
      },
    });
    expect(firstBulk[1]).toEqual(expect.objectContaining({ blockers: 'ปูนมาช้า' }));
  });

  it('refuses to swap in fewer documents than the current index holds', async () => {
    const { client } = stubClient('concrete', 5);
    const a = tenant('t-a', [report('r1', 'x')]);
    await expect(run(client, [a.t], { apply: true, indexes: ['site-reports'] })).rejects.toThrow(
      /holds 1 documents, the current index 5; refusing/,
    );
    expect(client.indices.updateAliases).not.toHaveBeenCalled();

    const again = stubClient('concrete', 5);
    await run(again.client, [tenant('t-a', [report('r1', 'x')]).t], {
      apply: true,
      indexes: ['site-reports'],
      allowShrink: true,
    });
    expect(again.client.indices.updateAliases).toHaveBeenCalled();
  });

  // --tenant must never rebuild: the new index would hold that tenant only, and the swap would drop
  // every other tenant's documents.
  it('tenant repair writes into <name> in place: no new index, no alias move', async () => {
    const { client, calls } = stubClient('concrete');
    const a = tenant('t-a', [report('r1', 'x')]);
    const [result] = await run(client, [a.t], {
      apply: true,
      indexes: ['site-reports'],
      tenantId: 't-a',
    });
    expect(result).toEqual(
      expect.objectContaining({ mode: 'tenant', target: 'site-reports', documents: 1 }),
    );
    expect(client.indices.create).not.toHaveBeenCalled();
    expect(client.indices.updateAliases).not.toHaveBeenCalled();
    expect(calls).toEqual(['template', 'template', 'template', 'bulk', 'refresh']);
    const body = (client.bulk.mock.calls[0] as unknown as [{ body: unknown[] }])[0].body;
    expect(body[0]).toEqual(
      expect.objectContaining({ index: expect.objectContaining({ _index: 'site-reports' }) }),
    );
  });

  it('a version conflict (a newer document is already there) is not an error', async () => {
    const { client } = stubClient('none');
    client.bulk.mockResolvedValueOnce({
      body: {
        errors: true,
        items: [{ index: { status: 409, error: { type: 'version_conflict_engine_exception' } } }],
      },
    } as never);
    const a = tenant('t-a', [report('r1', 'x')]);
    await expect(
      run(client, [a.t], { apply: true, indexes: ['site-reports'] }),
    ).resolves.toHaveLength(1);
  });

  it('any other bulk error stops the run before the alias moves', async () => {
    const { client } = stubClient();
    client.bulk.mockResolvedValueOnce({
      body: {
        errors: true,
        items: [{ index: { status: 400, error: { type: 'mapper_parsing_exception' } } }],
      },
    } as never);
    const a = tenant('t-a', [report('r1', 'x')]);
    await expect(run(client, [a.t], { apply: true, indexes: ['site-reports'] })).rejects.toThrow(
      /mapper_parsing_exception/,
    );
    expect(client.indices.updateAliases).not.toHaveBeenCalled();
  });

  it('a failed tenant read rolls its transaction back', async () => {
    const { client } = stubClient();
    const a = tenant('t-a', []);
    a.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM site_ops.site_reports')) throw new Error('boom');
      return { rows: sql.includes('now()') ? [{ now: DB_NOW }] : [] };
    });
    await expect(run(client, [a.t], { apply: false, indexes: ['site-reports'] })).rejects.toThrow(
      'boom',
    );
    expect(a.query.mock.calls.map((c) => c[0])).toContain('ROLLBACK');
  });
});
