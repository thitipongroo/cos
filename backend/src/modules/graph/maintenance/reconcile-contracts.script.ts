/**
 * Prune the :Contract nodes kg-ingestion-worker should never have written.
 *
 *   pnpm --filter backend run reconcile:contracts -- --tenant <uuid> [--apply]
 *
 * The reasoning behind every statement it runs lives next to the statements, in
 * ./contract-reconcile.ts. In short: the mapper used to create a :Contract at PO creation time, and
 * master:4156 defines the node as an APPROVED purchase order. The mapper was fixed on 2026-08-29;
 * the nodes it had already written were not, and Kafka's 7-day retention means the worker's
 * full-rebuild endpoint cannot repair them — a wipe-and-replay would delete every contract older
 * than a week and be unable to put it back.
 *
 * DRY RUN BY DEFAULT: nothing is deleted without --apply, and the dry run prints the same plan the
 * apply would execute.
 *
 * ONE TENANT AND ONE DATABASE PER RUN. Enterprise tenants are provisioned onto dedicated databases,
 * so there is no single connection from which every tenant's purchase orders can be read. Naming
 * both keeps that explicit rather than silently reconciling whichever tenants shared a database.
 *
 * Written in TypeScript and run through ts-node (the same way prisma/seed.ts is) so it imports the
 * statements directly from the module the unit tests cover. A JavaScript copy would be a second
 * definition of the delete predicate, and the two would eventually disagree about which purchase
 * orders were never contracts.
 */
import { Client } from 'pg';
import neo4j from 'neo4j-driver';

import {
  NEVER_APPROVED_PO_SQL,
  NEVER_APPROVED_PO_STATUSES,
  PRUNE_CONTRACTS_CYPHER,
  planReconcile,
} from './contract-reconcile';

interface Args {
  tenantId: string;
  apply: boolean;
}

/** Pure, so the argument contract is covered by a unit test rather than by running the script. */
export function parseArgs(argv: readonly string[]): Args | { error: string } {
  const at = argv.indexOf('--tenant');
  const tenantId = at === -1 ? undefined : argv[at + 1];
  if (!tenantId || tenantId.startsWith('--')) {
    return { error: 'usage: --tenant <uuid> [--apply]' };
  }
  return { tenantId, apply: argv.includes('--apply') };
}

export function missingEnv(env: NodeJS.ProcessEnv): string[] {
  return ['DATABASE_URL', 'NEO4J_URI', 'NEO4J_USERNAME', 'NEO4J_PASSWORD'].filter((v) => !env[v]);
}

/* istanbul ignore next -- the I/O shell; the predicate and the argument parsing are unit-tested,
   and what remains is two client libraries being driven. Exercised by running it. */
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
  const { tenantId, apply } = parsed;

  const pg = new Client({ connectionString: process.env['DATABASE_URL'] });
  const driver = neo4j.driver(
    process.env['NEO4J_URI']!,
    neo4j.auth.basic(process.env['NEO4J_USERNAME']!, process.env['NEO4J_PASSWORD']!),
  );

  try {
    await pg.connect();
    // The GUC RLS reads, on this connection — the same contract every service honours.
    await pg.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId]);
    const { rows } = await pg.query<{ po_id: string }>(NEVER_APPROVED_PO_SQL, [
      tenantId,
      [...NEVER_APPROVED_PO_STATUSES],
    ]);
    const neverApproved = rows.map((r) => r.po_id);

    const readSession = driver.session({ defaultAccessMode: 'READ' });
    const existing = await readSession.run(
      'MATCH (c:Contract {tenant_id: $tenantId}) RETURN c.contract_id AS id',
      { tenantId },
    );
    await readSession.close();
    const existingIds = existing.records.map((r) => String(r.get('id')));

    const plan = planReconcile(tenantId, neverApproved, existingIds);

    console.log(`tenant                  ${tenantId}`);
    console.log(`POs never approved      ${neverApproved.length}`);
    console.log(`:Contract nodes present ${existingIds.length}`);
    console.log(`to delete               ${plan.toDelete.length}`);
    // The survivor count is the number an operator can compare against their own sense of how many
    // agreements this tenant has. A delete count on its own says nothing about the result.
    console.log(`will remain             ${existingIds.length - plan.toDelete.length}`);

    if (plan.toDelete.length === 0) {
      console.log('\nnothing to do.');
      return;
    }
    if (!apply) {
      console.log('\nDRY RUN — nothing was deleted. Re-run with --apply to execute.');
      for (const id of plan.toDelete.slice(0, 20)) console.log(`  would delete :Contract ${id}`);
      if (plan.toDelete.length > 20) console.log(`  ... and ${plan.toDelete.length - 20} more`);
      return;
    }
    const writeSession = driver.session({ defaultAccessMode: 'WRITE' });
    const res = await writeSession.run(PRUNE_CONTRACTS_CYPHER, {
      tenantId,
      poIds: plan.toDelete,
    });
    await writeSession.close();
    console.log(`\ndeleted ${res.records[0]?.get('deleted') ?? 0} :Contract node(s).`);
  } finally {
    await pg.end().catch(() => undefined);
    await driver.close().catch(() => undefined);
  }
}

/* istanbul ignore next */
if (require.main === module) {
  void main();
}
