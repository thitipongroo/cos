// Tenant-scoped database access for code running OUTSIDE the Nest container.
//
// withTenantTx is the non-DI twin of TenantPrismaService.run(): a Temporal activity has no
// injector, so it cannot ask for the request-scoped client every controller uses. Nothing here is
// procurement-specific — it lived under modules/procurement/workflows only because procurement
// had Temporal activities first, and identity's data-export worker then reached across for it,
// past a module API that could never have offered it (a free function is not a NestJS provider).
// Moved to shared/workflows on 2026-08-26 (master:1608).

// Shared plumbing for Temporal activities — the I/O half of a workflow.
//
// Extracted 2026-07-21 (ADR-021). po.activities.ts and rfq.activities.ts each carried their own
// copy of both helpers below; 47 of the 50 duplicated lines were identical, the rest being the name
// of the id field. Two copies of a function that opens a tenant transaction is the kind of
// duplication worth removing on sight: `SET LOCAL app.current_tenant_id` is what RLS reads, so a
// divergence between the copies is a tenant-isolation bug rather than a style problem.

import { PrismaClient } from '@prisma/client';
import type { Logger } from '@cos/logger';

import { createPrismaClient } from '../prisma/create-prisma-client';
import { assertSafeTenantId } from '../prisma/assert-safe-tenant-id';
import { getDbUrlForTenant } from '../prisma/get-db-url';
import { EventOutboxService } from '../events/event-outbox.service';

// Clients pooled per datasource URL. Building a PrismaClient per activity (and disconnecting it in a
// finally) meant a fresh pg pool + connect/teardown for every workflow step; activities run
// constantly, so that churn was the dominant cost of a cheap UPDATE. Keyed by URL exactly as
// TenantPrismaService does, so tenants on the shared APP_DATABASE_URL share one client.
const clients = new Map<string, PrismaClient>();

function clientFor(dbUrl: string): PrismaClient {
  let client = clients.get(dbUrl);
  if (!client) {
    client = createPrismaClient(dbUrl);
    clients.set(dbUrl, client);
  }
  return client;
}

/**
 * Run `fn` inside a transaction scoped to one tenant.
 *
 * Sets `app.current_tenant_id` per ADR-008 — no tenant_code, no search_path routing. SET LOCAL is
 * transaction-scoped, so it still reverts on COMMIT/ROLLBACK now that the client is reused.
 */
export async function withTenantTx<T>(
  tenantId: string,
  fn: (prisma: PrismaClient) => Promise<T>,
): Promise<T> {
  // Validate before interpolation into SET LOCAL — same guard as TenantPrismaService (QM-4; the file
  // header warns a divergence between the tenant-transaction helpers is a tenant-isolation bug).
  assertSafeTenantId(tenantId);
  const dbUrl = await getDbUrlForTenant(tenantId);
  const prisma = clientFor(dbUrl);
  return prisma.$transaction(async (tx) => {
    await (tx as PrismaClient).$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
    return fn(tx as PrismaClient);
  });
}

/**
 * Close every pooled activity client. Call from the Temporal worker's shutdown path — these clients
 * outlive individual activities by design, so nothing else will close them.
 */
export async function disconnectActivityClients(): Promise<void> {
  await Promise.all([...clients.values()].map((c) => c.$disconnect()));
  clients.clear();
  await outbox?.onModuleDestroy();
  outbox = undefined;
}

/**
 * The outbox, for activities. Not injected — Temporal activities run outside the Nest container, so
 * there is no injector to ask. One instance per worker process, built on first use; its Prisma client
 * shares the process-wide pg pool like every other one (shared/prisma/create-prisma-client.ts).
 */
let outbox: EventOutboxService | undefined;

/**
 * Queue a domain event for delivery.
 *
 * A failure here was previously swallowed for a REASON specific to activities: the DB transaction has
 * already committed by the time an activity publishes, so throwing would make Temporal retry the whole
 * activity and repeat the write. That reasoning was sound and the outcome was still a lost event —
 * the retry policy protected the write, and nothing protected the event.
 *
 * Writing to the outbox keeps the property that matters (this never throws at the activity, so
 * Temporal never re-runs a committed write) and drops the one that did not (delivery is now retried
 * until it lands, by OutboxPollerService). The Kafka connect/publish/disconnect per activity goes with
 * it — activities run constantly, and that handshake was the same churn the pooled Prisma clients
 * above were introduced to remove.
 *
 * The logger parameter is kept: callers pass their own module's logger, and removing it would be an
 * unrelated change to two activity modules' signatures.
 */
export async function publishEvent<T>(
  _logger: Logger,
  event_type: string,
  payload: T,
  tenant_id: string,
  correlation_id: string,
): Promise<void> {
  outbox ??= new EventOutboxService();
  await outbox.publish({
    event_type,
    event_version: '1.0',
    tenant_id,
    actor_id: 'system',
    occurred_at: new Date().toISOString(),
    correlation_id,
    payload,
  });
}
