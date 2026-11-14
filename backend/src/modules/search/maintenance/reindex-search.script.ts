/**
 * Rebuild the search indexes (cos_projects, site-reports, site-issues) from the database.
 *
 *   pnpm --filter backend run reindex:search -- [--index <name>]... [--allow-shrink] [--apply]
 *   pnpm --filter backend run reindex:search -- --tenant <uuid> [--index <name>]... [--apply]
 *
 * WHEN TO RUN IT. Once after deploying the Thai-aware index templates (search-index-mapping.ts) to an
 * environment whose indexes already exist — an existing index keeps the standard analyzer that does
 * not segment Thai, and only a new index takes the template. Also whenever the index has drifted
 * from the database: a topic replay cannot do this, because a topic only holds the broker's retention
 * (reports filed through sync before site.report.submitted.v1 was indexed were never documents at
 * all).
 *
 * FULL REBUILD (no --tenant), per index:
 *   1. puts the index templates (idempotent);
 *   2. creates `<name>-v<timestamp>`, which takes the template;
 *   3. reads every row of EVERY tenant, inactive ones included (a paused tenant is temporary, and
 *      nothing would re-add its documents on reactivation) — from the tenant's dedicated database
 *      when platform.tenants.dedicated_db_url is set, otherwise from DATABASE_URL — in a read-only
 *      transaction with the RLS GUC set LOCAL (safe through PgBouncer transaction pooling), and
 *      bulk-indexes it;
 *   4. refuses to go on if the new index holds fewer documents than the current `<name>` (a role
 *      that sees no rows would otherwise swap in an empty index) unless --allow-shrink;
 *   5. points `<name>` at the new index in one atomic `_aliases` request. If `<name>` is still the
 *      concrete index the dynamic mapping created, that request deletes it (an alias cannot share a
 *      name with an index; its documents are derived and the new index holds every row);
 *   6. re-reads rows changed since each tenant's fill (on that database's clock, less a minute) —
 *      what the live indexer wrote to the old index meanwhile — into the new one.
 * Every write, here and in the live indexer, carries the row's change time as an external version,
 * so step 6 cannot overwrite a newer document the live indexer wrote after the swap.
 * The read paths keep querying `<name>`, so nothing else changes.
 *
 * TENANT REPAIR (--tenant): writes that tenant's rows into `<name>` as it is. It never builds a new
 * index or moves an alias, so no other tenant's documents are touched.
 *
 * DRY RUN BY DEFAULT: without --apply it reads the database, prints the row counts and the alias
 * state each index is in, and writes nothing to OpenSearch. It refuses outright when the database
 * shows no tenants.
 *
 * WHAT IT DOES NOT DO: delete earlier `<name>-v…` indexes left by a previous run (listed in the
 * output; remove them once the new one is checked); stop the live indexer (versions and step 6
 * cover it); page within a tenant (each tenant's rows of one index are held in memory at once).
 *
 * Env: DATABASE_URL (the shared database; a role that can read platform.tenants), OPENSEARCH_URL,
 * and APP_SECRET_ENCRYPTION_KEY when a tenant's dedicated database URL is stored encrypted (decrypted
 * the way the app does, get-db-url.ts).
 */
import { Client as PgClient } from 'pg';
import { Client as OpenSearchClient } from '@opensearch-project/opensearch';

import { decryptDedicatedDbUrl } from '../../../shared/crypto/dedicated-db-url-cipher';
import {
  listTenants,
  parseArgs,
  reindexSearch,
  type ReindexSearchClient,
  type ReindexTenant,
} from './reindex-search';

export function missingEnv(env: NodeJS.ProcessEnv): string[] {
  return ['DATABASE_URL', 'OPENSEARCH_URL'].filter((v) => !env[v]);
}

/* istanbul ignore next -- the I/O shell; parsing, the alias plan and reindexSearch itself are tested
   (unit, and the integration suite against real containers). */
async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if ('error' in parsed) {
    console.error(parsed.error);
    process.exitCode = 2;
    return;
  }
  const missing = missingEnv(process.env);
  if (missing.length > 0) {
    console.error(`missing env: ${missing.join(', ')}`);
    process.exitCode = 2;
    return;
  }

  const shared = new PgClient({ connectionString: process.env['DATABASE_URL'] });
  const dedicated = new Map<string, PgClient>();
  try {
    await shared.connect();
    const rows = await listTenants(shared, parsed.tenantId);
    const tenants: ReindexTenant[] = [];
    for (const row of rows) {
      let db: PgClient = shared;
      if (row.dedicated_db_url) {
        const url = decryptDedicatedDbUrl(row.dedicated_db_url);
        const known = dedicated.get(url);
        if (known) db = known;
        else {
          db = new PgClient({ connectionString: url });
          // Registered before connecting, so the finally below ends it even if connect() throws.
          dedicated.set(url, db);
          await db.connect();
        }
      }
      tenants.push({ tenantId: row.tenant_id, db });
    }

    const client = new OpenSearchClient({ node: process.env['OPENSEARCH_URL']! });
    const reports = await reindexSearch(client as unknown as ReindexSearchClient, tenants, parsed);
    console.log(
      JSON.stringify(
        { mode: parsed.apply ? 'apply' : 'dry-run', tenants: tenants.length, reports },
        null,
        2,
      ),
    );
  } finally {
    for (const db of dedicated.values()) await db.end().catch(() => undefined);
    await shared.end();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
