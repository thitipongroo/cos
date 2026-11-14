// Rebuild the search indexes from the database — the logic behind reindex-search.script.ts.
//
// Kept apart from the CLI shell so the integration test drives exactly this code against real
// PostgreSQL and OpenSearch containers. See the script header for the runbook.

import {
  SEARCH_INDEXES,
  VERSION_TYPE,
  ensureSearchIndexTemplates,
  issueDocument,
  projectDocument,
  siteReportDocument,
  versionOf,
  type IndexTemplateClient,
  type SearchIndexName,
} from '../search-index-mapping';
import type {
  IssueIndexRow,
  ProjectIndexRow,
  SiteReportIndexRow,
} from '../search-index.repository';

/** What the reindex needs from OpenSearch (a subset of @opensearch-project/opensearch's Client). */
export interface ReindexSearchClient extends IndexTemplateClient {
  indices: IndexTemplateClient['indices'] & {
    create(params: { index: string }): Promise<unknown>;
    exists(params: { index: string }): Promise<{ body: boolean }>;
    existsAlias(params: { name: string }): Promise<{ body: boolean }>;
    getAlias(params: { name: string }): Promise<{ body: Record<string, unknown> }>;
    updateAliases(params: { body: { actions: unknown[] } }): Promise<unknown>;
    refresh(params: { index: string }): Promise<unknown>;
  };
  count(params: { index: string }): Promise<{ body: { count: number } }>;
  bulk(params: { body: unknown[]; refresh?: boolean }): Promise<{
    body: {
      errors: boolean;
      items: Array<Record<string, { status?: number; error?: unknown }>>;
    };
  }>;
}

/** A connection to one database (pg's Client fits). */
export interface ReindexDb {
  query<R>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

export interface ReindexTenant {
  tenantId: string;
  /** The tenant's own database when it has one, otherwise the shared one. */
  db: ReindexDb;
}

interface IndexSource {
  /** The row's id column (the document id). */
  idColumn: string;
  /** The row's last-change column (the document's external version). */
  versionColumn: string;
  /** Rows of one tenant, optionally only those changed since $2. */
  sql: (since: boolean) => string;
  document: (row: never) => Record<string, unknown>;
}

// The same columns SearchIndexRepository reads for the event-driven indexer, for a whole tenant.
// The tenant predicate is the secondary layer; the GUC set before each query is the primary (RLS).
const SOURCES: Record<SearchIndexName, IndexSource> = {
  cos_projects: {
    idColumn: 'project_id',
    versionColumn: 'updated_at',
    sql: (since) => `
      SELECT project_id, tenant_id, project_code, project_name, project_type, status, updated_at
      FROM projects.projects
      WHERE tenant_id = $1::uuid${since ? ' AND updated_at >= $2' : ''}`,
    document: (row) => projectDocument(row as ProjectIndexRow),
  },
  'site-reports': {
    idColumn: 'report_id',
    versionColumn: 'modified_at',
    sql: (since) => `
      SELECT report_id, project_id, tenant_id, report_date, summary, weather, blockers,
             submitted_by, status, modified_at
      FROM site_ops.site_reports
      WHERE tenant_id = $1::uuid${since ? ' AND modified_at >= $2' : ''}`,
    document: (row) => siteReportDocument(row as SiteReportIndexRow),
  },
  'site-issues': {
    idColumn: 'issue_id',
    versionColumn: 'modified_at',
    sql: (since) => `
      SELECT issue_id, project_id, tenant_id, title, description, severity, status, modified_at
      FROM site_ops.issues
      WHERE tenant_id = $1::uuid${since ? ' AND modified_at >= $2' : ''}`,
    document: (row) => issueDocument(row as IssueIndexRow),
  },
};

const BULK_BATCH = 500;
/**
 * The catch-up re-reads rows changed since this long before the tenant's fill read. Measured on the
 * tenant database's own clock (its `now()`, the transaction start), so the script host's clock does
 * not matter; the slack covers writes whose transaction began before the fill and committed after.
 */
const CATCH_UP_SLACK_MS = 60_000;

export interface ReindexArgs {
  apply: boolean;
  indexes: SearchIndexName[];
  /** Repair one tenant's documents in place — never builds a new index or moves an alias. */
  tenantId?: string;
  /** Let a rebuild hold fewer documents than the index it replaces. */
  allowShrink?: boolean;
}

/** Pure, so the argument contract is unit-tested rather than discovered by running the script. */
export function parseArgs(argv: readonly string[]): ReindexArgs | { error: string } {
  const usage =
    'usage: [--index cos_projects|site-reports|site-issues]... [--tenant <uuid>] [--allow-shrink] [--apply]';
  const indexes: SearchIndexName[] = [];
  let tenantId: string | undefined;
  let apply = false;
  let allowShrink = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') apply = true;
    else if (arg === '--allow-shrink') allowShrink = true;
    else if (arg === '--index' || arg === '--tenant') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) return { error: usage };
      i++;
      if (arg === '--tenant') tenantId = value;
      else if ((SEARCH_INDEXES as readonly string[]).includes(value)) {
        indexes.push(value as SearchIndexName);
      } else return { error: `unknown index '${value}'; ${usage}` };
    } else return { error: `unknown argument '${String(arg)}'; ${usage}` };
  }
  if (tenantId !== undefined && allowShrink) {
    return { error: `--allow-shrink applies to a full rebuild, not --tenant; ${usage}` };
  }
  return {
    apply,
    indexes: indexes.length > 0 ? indexes : [...SEARCH_INDEXES],
    tenantId,
    allowShrink,
  };
}

export interface TenantRow {
  tenant_id: string;
  dedicated_db_url: string | null;
}

/**
 * Every tenant (optionally one), with the stored — possibly encrypted — dedicated database URL.
 *
 * INACTIVE TENANTS INCLUDED. "Inactive" includes a tenant paused while enterprise provisioning moves
 * it (D48), which is temporary; a rebuild that left it out would drop its documents, and nothing puts
 * them back on reactivation. The read paths already refuse an inactive tenant, so indexing it exposes
 * nothing.
 */
export async function listTenants(shared: ReindexDb, tenantId?: string): Promise<TenantRow[]> {
  const { rows } = await shared.query<TenantRow>(
    `SELECT tenant_id::text AS tenant_id, dedicated_db_url FROM platform.tenants
      WHERE ($1::uuid IS NULL OR tenant_id = $1::uuid) ORDER BY tenant_id`,
    [tenantId ?? null],
  );
  return rows;
}

export type AliasState =
  { kind: 'none' } | { kind: 'concrete' } | { kind: 'alias'; targets: string[] };

/**
 * The `_aliases` actions that point `name` at `target`, applied atomically by OpenSearch.
 *
 * `concrete`: `name` is still the index the dynamic mapping created — it is removed in the same
 * request (`remove_index`), because an alias cannot share a name with an index. Its documents are
 * derived data; the new index holds every row from the database.
 */
export function aliasSwapActions(name: string, target: string, state: AliasState): unknown[] {
  switch (state.kind) {
    case 'none':
      return [{ add: { index: target, alias: name } }];
    case 'concrete':
      return [{ remove_index: { index: name } }, { add: { index: target, alias: name } }];
    case 'alias':
      return [
        ...state.targets.map((index) => ({ remove: { index, alias: name } })),
        { add: { index: target, alias: name } },
      ];
  }
}

export async function aliasStateOf(client: ReindexSearchClient, name: string): Promise<AliasState> {
  if ((await client.indices.existsAlias({ name })).body) {
    return { kind: 'alias', targets: Object.keys((await client.indices.getAlias({ name })).body) };
  }
  return (await client.indices.exists({ index: name })).body
    ? { kind: 'concrete' }
    : { kind: 'none' };
}

export interface ReindexReport {
  index: SearchIndexName;
  /** `rebuild`: a new index swapped in. `tenant`: one tenant's documents written in place. */
  mode: 'rebuild' | 'tenant';
  /** The index written: the new `<name>-v…` for a rebuild, `<name>` itself for a tenant repair. */
  target: string;
  before: AliasState;
  documents: number;
  caughtUp: number;
}

/**
 * One tenant's rows, read in a transaction with the GUC set LOCAL to it. Session-level
 * `set_config(..., false)` breaks under PgBouncer transaction pooling (QM-18): the SELECT can run on
 * another server connection without it — zero rows under RLS — and the setting leaks to whoever gets
 * this connection next. Also returns the database's own `now()` (the transaction start), the clock
 * the catch-up window is measured on.
 */
async function rowsOf(
  tenant: ReindexTenant,
  source: IndexSource,
  since?: Date,
): Promise<{ rows: Array<Record<string, unknown>>; dbNow: Date }> {
  await tenant.db.query('BEGIN READ ONLY');
  try {
    await tenant.db.query("SELECT set_config('app.current_tenant_id', $1, true)", [
      tenant.tenantId,
    ]);
    const clock = await tenant.db.query<{ now: Date }>('SELECT now() AS now');
    const params: unknown[] = since ? [tenant.tenantId, since] : [tenant.tenantId];
    const { rows } = await tenant.db.query<Record<string, unknown>>(
      source.sql(since !== undefined),
      params,
    );
    await tenant.db.query('COMMIT');
    return { rows, dbNow: new Date(clock.rows[0]!.now) };
  } catch (err) {
    await tenant.db.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}

async function bulkIndex(
  client: ReindexSearchClient,
  index: string,
  source: IndexSource,
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += BULK_BATCH) {
    const body = rows.slice(i, i + BULK_BATCH).flatMap((row) => [
      {
        index: {
          _index: index,
          _id: String(row[source.idColumn]),
          // The live indexer writes the same way: an older snapshot never replaces a newer one,
          // whichever of the two writes lands last (search-index-mapping.ts).
          version: versionOf(row[source.versionColumn] as Date),
          version_type: VERSION_TYPE,
        },
      },
      source.document(row as never),
    ]);
    const res = await client.bulk({ body });
    if (res.body.errors) {
      // 409 is "a newer version is already there" — the live indexer got there first. Not an error.
      const failed = res.body.items.find((item) => {
        const result = Object.values(item)[0];
        return result?.error !== undefined && result.status !== 409;
      });
      if (failed) throw new Error(`bulk index into ${index} failed: ${JSON.stringify(failed)}`);
    }
  }
}

/**
 * Dry run (apply = false): counts the rows each index would receive and reports the alias state;
 * writes nothing to OpenSearch.
 *
 * Rebuild (apply, no tenant): puts the templates; per index creates `<name>-v<stamp>`, fills it from
 * every tenant, re-reads the alias state, refuses to swap if the new index holds fewer documents than
 * the current one (unless allowShrink), swaps `<name>` onto it, and re-reads rows changed since each
 * tenant's fill (what the live indexer wrote to the old index meanwhile).
 *
 * Tenant repair (apply, tenantId): writes that tenant's rows into `<name>` as it is — no new index,
 * no alias move, so no other tenant's documents are touched.
 */
export async function reindexSearch(
  client: ReindexSearchClient,
  tenants: ReindexTenant[],
  args: ReindexArgs,
  now: () => Date = () => new Date(),
): Promise<ReindexReport[]> {
  if (tenants.length === 0) {
    // Zero tenants is never the database's real answer — it is a role that cannot see
    // platform.tenants, or a wrong DATABASE_URL. A rebuild from it would swap in empty indexes.
    throw new Error('no tenants to index: refusing (check DATABASE_URL and its role)');
  }
  const stamp = now().toISOString().replace(/[-:.]/g, '').toLowerCase();
  const reports: ReindexReport[] = [];
  if (args.apply) await ensureSearchIndexTemplates(client);

  for (const index of args.indexes) {
    const source = SOURCES[index];
    const before = await aliasStateOf(client, index);

    if (args.tenantId !== undefined) {
      let documents = 0;
      for (const tenant of tenants) {
        const { rows } = await rowsOf(tenant, source);
        documents += rows.length;
        if (args.apply && rows.length > 0) await bulkIndex(client, index, source, rows);
      }
      if (args.apply) await client.indices.refresh({ index });
      reports.push({ index, mode: 'tenant', target: index, before, documents, caughtUp: 0 });
      continue;
    }

    const target = `${index}-v${stamp}`;
    let documents = 0;
    const fillClock = new Map<ReindexTenant, Date>();
    if (args.apply) await client.indices.create({ index: target });
    for (const tenant of tenants) {
      const { rows, dbNow } = await rowsOf(tenant, source);
      fillClock.set(tenant, dbNow);
      documents += rows.length;
      if (args.apply && rows.length > 0) await bulkIndex(client, target, source, rows);
    }

    let caughtUp = 0;
    if (args.apply) {
      await client.indices.refresh({ index: target });
      // Read again: the live indexer may have created `<name>` during the fill.
      const current = await aliasStateOf(client, index);
      if (current.kind !== 'none' && !args.allowShrink) {
        const existing = (await client.count({ index })).body.count;
        if (documents < existing) {
          throw new Error(
            `${index}: the rebuild holds ${documents} documents, the current index ${existing}; ` +
              `refusing to swap (${target} is left for inspection; --allow-shrink to proceed)`,
          );
        }
      }
      await client.indices.updateAliases({
        body: { actions: aliasSwapActions(index, target, current) },
      });
      for (const tenant of tenants) {
        const since = new Date(fillClock.get(tenant)!.getTime() - CATCH_UP_SLACK_MS);
        const { rows } = await rowsOf(tenant, source, since);
        caughtUp += rows.length;
        if (rows.length > 0) await bulkIndex(client, target, source, rows);
      }
      await client.indices.refresh({ index: target });
    }
    reports.push({ index, mode: 'rebuild', target, before, documents, caughtUp });
  }
  return reports;
}
