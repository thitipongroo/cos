import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

/**
 * Connection pools, keyed by connection string — ONE pool per datasource for the whole process.
 *
 * WHY THIS EXISTS
 * ---------------
 * Twenty-one long-lived call sites construct a PrismaClient (`grep -rn 'createPrismaClient('`):
 * every guard, interceptor and platform-schema service owns one, plus one per datasource inside
 * TenantPrismaService. Handing each of them a bare `{ connectionString }` made the adapter build a
 * private `pg.Pool` per client — twenty-one pools of pg's default 10 connections, ~210 per pod and
 * ~630 across the three prod replicas, nearly all of them permanently idle. They are not twenty-one
 * datasources; they are two (DATABASE_URL and APP_DATABASE_URL) opened twenty-one times.
 *
 * WHY HERE RATHER THAN AT THE CALL SITES
 * --------------------------------------
 * The alternative — one injected `PlatformPrismaService` that everything shares — is the same fix
 * spread across twenty-one constructors and the thirty spec files that reach in and replace
 * `.prisma` or assert on `onModuleDestroy`. Pooling below the client gets the identical connection
 * behaviour with no call-site or test churn, and it also covers the sites DI cannot reach: guards
 * built by Nest before providers resolve, and the Temporal activity helpers that run outside the
 * request container entirely.
 *
 * WHY $disconnect() STAYS SAFE
 * ----------------------------
 * PrismaPg treats a Pool it was GIVEN as external: on dispose it drops its error listener and leaves
 * the pool open (it only calls `.end()` on a pool it created itself, or when `disposeExternalPool`
 * is set — neither applies here). So the ~15 existing `onModuleDestroy → $disconnect()` hooks keep
 * working and keep meaning what they say, without one owner's shutdown severing the connections
 * fifteen others are still using. The pools themselves are closed once, by PrismaPoolShutdownService.
 */
const pools = new Map<string, Pool>();

/**
 * Connections per pool. Ten is pg's own default and was the per-client budget before pooling, so the
 * arithmetic that matters is what a pool now has to cover: with sharing, ONE pool serves every
 * caller on that datasource, and APP_DATABASE_URL in particular carries both request traffic
 * (TenantPrismaService) and the audit-log write on every mutation. Twenty gives that pool double the
 * headroom it used to have to itself while staying far inside PgBouncer's limits — 2 pools × 20 × 3
 * replicas = 120 client connections against `max_client_conn = 1000`
 * (infrastructure/kubernetes/pgbouncer/configmap.yaml), multiplexed onto `default_pool_size = 25`
 * server connections either way. Tunable because the right number is a property of the deployment,
 * not of this file; exhaustion shows up as requests queueing on the pool, not as errors.
 */
const POOL_MAX = parseInt(process.env['PRISMA_POOL_MAX'] ?? '20', 10);

function sharedPool(connectionString: string): Pool {
  let pool = pools.get(connectionString);
  if (!pool) {
    pool = new Pool({ connectionString, max: POOL_MAX });
    // A pg Pool emits 'error' for a failure on an IDLE client (server restart, PgBouncer recycling a
    // backend). With no listener attached that event is an unhandled 'error' and takes the process
    // down. PrismaPg attaches its own listener per adapter and REMOVES it on dispose, so a pool that
    // outlives the client that first wrapped it would be left bare — this listener is the one that
    // is always there.
    pool.on('error', () => undefined);
    pools.set(connectionString, pool);
  }
  return pool;
}

/**
 * Close every shared pool. Called once on application shutdown (PrismaPoolShutdownService) — the
 * individual `$disconnect()` hooks deliberately cannot do this, see above. Idempotent: the registry
 * is cleared, so a second call (Nest can fire shutdown hooks more than once across app.close() in
 * tests) has nothing left to end.
 */
export async function endSharedPgPools(): Promise<void> {
  const open = [...pools.values()];
  pools.clear();
  await Promise.all(open.map((p) => p.end().catch(() => undefined)));
}

/**
 * Build a PrismaClient backed by the node-postgres driver adapter (Prisma 7 / ADR-041).
 *
 * Prisma 7 removed schema `url`/`datasources`; a client must be given a driver adapter instead.
 * Defaults to `DATABASE_URL` — the app runtime connection, which routes through PgBouncer in
 * transaction mode (QM-18). Callers routing to a per-tenant / dedicated ENTERPRISE database pass an
 * explicit `connectionString` (ADR-008, spec §7.1); `TenantPrismaService` continues to key its
 * client pool by URL and wrap queries in `SET LOCAL app.current_tenant_id` for RLS.
 *
 * Clients built from the same connection string SHARE one pg pool (see above). The returned client
 * still exposes `$disconnect()` and is closed on shutdown (ADR-034); disconnecting it releases the
 * client without closing the shared pool.
 */
export function createPrismaClient(
  connectionString: string = process.env['DATABASE_URL'] ?? '',
  options?: Omit<Prisma.PrismaClientOptions, 'adapter' | 'datasources' | 'datasourceUrl'>,
): PrismaClient {
  return new PrismaClient({ ...options, adapter: new PrismaPg(sharedPool(connectionString)) });
}
