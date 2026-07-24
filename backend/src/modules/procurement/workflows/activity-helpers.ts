// Shared plumbing for Temporal activities — the I/O half of a workflow.
//
// Extracted 2026-07-21 (ADR-021). po.activities.ts and rfq.activities.ts each carried their own
// copy of both helpers below; 47 of the 50 duplicated lines were identical, the rest being the name
// of the id field. Two copies of a function that opens a tenant transaction is the kind of
// duplication worth removing on sight: `SET LOCAL app.current_tenant_id` is what RLS reads, so a
// divergence between the copies is a tenant-isolation bug rather than a style problem.

import { PrismaClient } from '@prisma/client';
import type { Logger } from '@cos/logger';
import { KafkaProducer } from '@cos/shared';

import { createPrismaClient } from '../../../shared/prisma/create-prisma-client';
import { assertSafeTenantId } from '../../../shared/prisma/assert-safe-tenant-id';
import { getDbUrlForTenant } from '../../tenant/utils/get-db-url';

/**
 * Run `fn` inside a transaction scoped to one tenant.
 *
 * Sets `app.current_tenant_id` per ADR-008 — no tenant_code, no search_path routing. The client is
 * disconnected in a finally so an activity that throws does not leak a pool.
 */
export async function withTenantTx<T>(
  tenantId: string,
  fn: (prisma: PrismaClient) => Promise<T>,
): Promise<T> {
  // Validate before interpolation into SET LOCAL — same guard as TenantPrismaService (QM-4; the file
  // header warns a divergence between the tenant-transaction helpers is a tenant-isolation bug).
  assertSafeTenantId(tenantId);
  const dbUrl = await getDbUrlForTenant(tenantId);
  const prisma = createPrismaClient(dbUrl);
  try {
    return await prisma.$transaction(async (tx) => {
      await (tx as PrismaClient).$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenantId}'`,
      );
      return fn(tx as PrismaClient);
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Publish a domain event, logging and swallowing any Kafka failure.
 *
 * Swallowing is deliberate and pre-existing: the DB transaction has already committed by the time
 * an activity publishes, so throwing here would make Temporal retry the whole activity and repeat
 * the write. The logger is a parameter because each activity module names its own.
 */
export async function publishEvent<T>(
  logger: Logger,
  event_type: string,
  payload: T,
  tenant_id: string,
  correlation_id: string,
): Promise<void> {
  const kafka = new KafkaProducer();
  try {
    await kafka.connect();
    await kafka.publish({
      event_type,
      event_version: '1.0',
      tenant_id,
      actor_id: 'system',
      occurred_at: new Date().toISOString(),
      correlation_id,
      payload,
    });
  } catch (err) {
    logger.error({ event_type, err, correlation_id }, 'kafka.publish.failed');
  } finally {
    await kafka.disconnect();
  }
}
