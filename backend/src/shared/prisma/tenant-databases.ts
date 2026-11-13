// Running a cross-tenant job against every database that holds tenant data (D54, 2026-11-13).
//
// The scheduled sweeps (permit expiry, notification escalation, cashflow risk, ledger reconciliation)
// used one superuser client on the shared database. An ENTERPRISE tenant's live rows are in its dedicated
// database, which none of them reached; and the copy that moved the tenant (D46) left its old rows in the
// shared database, which they kept reading. So each sweep now runs:
//
//   - on the shared database, for tenants that are active and still there — sharedTenantFilter(), a SQL
//     fragment to AND into its WHERE;
//   - once per active tenant with a dedicated database, through inDedicatedTenantTx: the tenant's app-role
//     URL, one transaction entered through enterTenantTx (RLS sees the tenant). Queries there must not
//     JOIN platform.*: platform never moves, so it is empty in a dedicated database.
//
// A dedicated database that cannot be reached is logged and skipped by forEachDedicatedTenant; the sweep
// goes on with the others.

import { Prisma, type PrismaClient } from '@prisma/client';
import { createLogger } from '@cos/logger';
import { createPrismaClient } from './create-prisma-client';
import { decryptDedicatedDbUrl } from '../crypto/dedicated-db-url-cipher';
import { enterTenantTx } from './tenant-tx';

const logger = createLogger('tenant-databases');

/**
 * AND this into a shared-database sweep's WHERE, with the row's tenant column: only tenants that are
 * active and have not moved to a dedicated database.
 */
export function sharedTenantFilter(tenantColumn: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`${tenantColumn} IN (
    SELECT tenant_id FROM platform.tenants WHERE is_active AND dedicated_db_url IS NULL
  )`;
}

export interface DedicatedTenant {
  tenantId: string;
  /** The tenant's app-role URL, decrypted. */
  url: string;
}

/**
 * Active tenants with a dedicated database, read from the shared `platform.tenants`. A row whose URL does
 * not decrypt (a rotated key, a corrupt value) is logged and left out — it must not stop the others.
 */
export async function listDedicatedTenants(
  platform: PrismaClient,
  job = 'tenant-databases',
): Promise<DedicatedTenant[]> {
  const rows = await platform.$queryRaw<Array<{ tenant_id: string; dedicated_db_url: string }>>`
    SELECT tenant_id::text, dedicated_db_url FROM platform.tenants
     WHERE is_active AND dedicated_db_url IS NOT NULL
     ORDER BY tenant_id
  `;
  const out: DedicatedTenant[] = [];
  for (const r of rows) {
    try {
      out.push({ tenantId: r.tenant_id, url: decryptDedicatedDbUrl(r.dedicated_db_url) });
    } catch (err) {
      logger.error(
        { job, tenantId: r.tenant_id, err: err instanceof Error ? err.message : String(err) },
        'tenant-databases.dedicated_url_unreadable',
      );
    }
  }
  return out;
}

const clients = new Map<string, PrismaClient>();

/** Run `fn` in one transaction on the tenant's dedicated database, scoped to the tenant. */
export async function inDedicatedTenantTx<T>(
  tenant: DedicatedTenant,
  fn: (tx: PrismaClient) => Promise<T>,
  /** Prisma's interactive-transaction limit (its own default when omitted: 5 s). */
  timeoutMs?: number,
): Promise<T> {
  let client = clients.get(tenant.url);
  if (!client) {
    client = createPrismaClient(tenant.url);
    clients.set(tenant.url, client);
  }
  return client.$transaction(
    async (tx) => {
      await enterTenantTx(tx as PrismaClient, tenant.tenantId, false);
      return fn(tx as PrismaClient);
    },
    timeoutMs === undefined ? undefined : { timeout: timeoutMs },
  );
}

/**
 * For each active dedicated tenant, run `fn` in its database; one that fails is logged and skipped, and
 * so is a failure to list them — the caller's shared-database work has usually committed already (the
 * permit sweep's UPDATE), and must still finish (its events). Returns the results of those that ran.
 *
 * `deadline` (epoch ms) is the whole sweep's: each tenant's transaction gets only the time left, and no
 * tenant starts after it. Callers pass their start + job lease — past the lease another replica may start
 * the same sweep, and an escalation sent twice is the duplicate the lease exists to prevent.
 */
export async function forEachDedicatedTenant<T>(
  platform: PrismaClient,
  job: string,
  fn: (tx: PrismaClient, tenant: DedicatedTenant) => Promise<T>,
  deadline?: number,
): Promise<Array<{ tenant: DedicatedTenant; result: T }>> {
  const out: Array<{ tenant: DedicatedTenant; result: T }> = [];
  let tenants: DedicatedTenant[];
  try {
    tenants = await listDedicatedTenants(platform, job);
  } catch (err) {
    logger.error(
      { job, err: err instanceof Error ? err.message : String(err) },
      'tenant-databases.list_failed',
    );
    return out;
  }
  for (const [i, tenant] of tenants.entries()) {
    const left = deadline === undefined ? undefined : deadline - Date.now();
    if (left !== undefined && left <= 0) {
      logger.warn({ job, skipped: tenants.length - i }, 'tenant-databases.deadline_reached');
      break;
    }
    try {
      out.push({ tenant, result: await inDedicatedTenantTx(tenant, (tx) => fn(tx, tenant), left) });
    } catch (err) {
      logger.error(
        { job, tenantId: tenant.tenantId, err: err instanceof Error ? err.message : String(err) },
        'tenant-databases.dedicated_tenant_failed',
      );
    }
  }
  return out;
}

/** Close the pooled dedicated-database clients (worker / app shutdown). */
export async function disconnectDedicatedClients(): Promise<void> {
  await Promise.all([...clients.values()].map((c) => c.$disconnect()));
  clients.clear();
}
