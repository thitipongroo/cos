// Entering a tenant's transaction, and the drain the provisioning pause relies on (D51, 2026-11-13).
//
// Enterprise provisioning copies a tenant's rows from one snapshot of the shared database and switches
// routing after it, with the tenant paused (`is_active = false`, D48). A request admitted before the pause
// could still write after the snapshot, and that row would be left behind. No time limit bounds a handler
// (Fastify sets none, and Node's requestTimeout bounds receiving a request, not running it), so waiting
// "long enough" had nothing to wait for. A lock does:
//
//   - every tenant transaction on the SHARED database takes the tenant's advisory lock SHARED, then reads
//     `is_active` in a statement of its own — after the lock, so it sees a pause that committed while it
//     waited — and refuses an inactive tenant (TenantInactiveError);
//   - the pause takes the same lock EXCLUSIVE in the transaction that sets `is_active = false`, so it waits
//     for every tenant transaction already in flight, and every one that starts afterwards queues behind
//     it and then sees the tenant inactive.
//
// So when the pause commits, everything the tenant wrote through these paths is in the shared database,
// and nothing more will be. Writers outside them take the same lock where they write tenant tables
// (file-legal-hold.service.ts, the permit-expiry sweep, the notification escalation marker).
//
// On a tenant's DEDICATED database neither applies: its `platform.tenants` is empty (platform never
// moves), and the copy reads only the shared one. Advisory locks need no privilege; `SELECT … FOR SHARE`
// on the tenant row would need UPDATE, which app_user lacks. app_user reads its own `platform.tenants` row
// through rls_tenants_read once `app.current_tenant_id` is set.
//
// The same read also refuses a tenant that has been switched to its dedicated database since this caller
// resolved where to go (TenantMovedError): a request authenticated before a pause can outlive the pause,
// the copy, the switch and the resume, and its later transactions would otherwise write to the shared
// database the copy has already left.
//
// The protocol needs READ COMMITTED (the PostgreSQL and Prisma default, and what every caller uses): the
// read must take its snapshot after the lock is granted. Under REPEATABLE READ or SERIALIZABLE the
// snapshot would be the lock statement's, taken before it waited.

import { TenantInactiveError, TenantMovedError } from './get-db-url';

/** The parts of a Prisma transaction client this needs. */
export interface TenantTxClient {
  $executeRawUnsafe(query: string): Promise<number>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/**
 * The text both sides hash into the advisory-lock key (`hashtextextended(…, 0)`, a bigint). Namespaced so
 * it cannot collide with another use of advisory locks keyed by a bare tenant id.
 */
export function tenantLockName(tenantId: string): string {
  return `cos.tenant-pause:${tenantId}`;
}

/**
 * Scope `tx` to `tenantId` (SET LOCAL app.current_tenant_id — the GUC the RLS policies read) and, on the
 * shared database, hold the tenant's pause lock shared and refuse an inactive tenant. The caller has
 * already validated `tenantId` (assertSafeTenantId): it is interpolated into SET LOCAL.
 */
export async function enterTenantTx(
  tx: TenantTxClient,
  tenantId: string,
  onSharedDatabase: boolean,
): Promise<void> {
  await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
  if (!onSharedDatabase) return;
  // Separate statements: under READ COMMITTED each statement takes its snapshot when it starts, so the
  // read below — not one combined with the lock — sees a pause committed while this waited for the lock.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${tenantLockName(tenantId)}, 0))`;
  const rows = await tx.$queryRaw<Array<{ is_active: boolean; moved: boolean }>>`
    SELECT is_active, dedicated_db_url IS NOT NULL AS moved
      FROM platform.tenants WHERE tenant_id = ${tenantId}::uuid
  `;
  if (rows.length === 0) throw new TenantInactiveError(tenantId, 'unknown');
  if (!rows[0]!.is_active) throw new TenantInactiveError(tenantId, 'inactive');
  if (rows[0]!.moved) throw new TenantMovedError(tenantId);
}

/** The part of a `pg` client the pause needs. */
export interface SqlClient {
  query<R = unknown>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}

/**
 * Set a tenant's `is_active`, holding its pause lock EXCLUSIVE for the UPDATE: pausing (false) waits for
 * every tenant transaction in flight on the shared database and leaves every later one refused (see the
 * header). Returns the rows updated (1, or 0 for an unknown tenant). `db` is a connection to the shared
 * database as a role that may update `platform.tenants`; it waits as long as the slowest transaction in
 * flight, so it is a plain `pg` client rather than a Prisma interactive transaction (5 s default limit).
 */
export async function setTenantActiveDrained(
  db: SqlClient,
  tenantId: string,
  active: boolean,
): Promise<number> {
  await db.query('BEGIN');
  try {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      tenantLockName(tenantId),
    ]);
    const { rowCount } = await db.query(
      'UPDATE platform.tenants SET is_active = $1, updated_at = now() WHERE tenant_id = $2::uuid',
      [active, tenantId],
    );
    await db.query('COMMIT');
    return rowCount ?? 0;
  } catch (err) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}
