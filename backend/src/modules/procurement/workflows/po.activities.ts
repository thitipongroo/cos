// PO Workflow Activities — Phase 5
// Activities contain all I/O — DB updates and Kafka events.
// Registered with the Temporal worker (worker.ts).
// Workflows (po.workflow.ts) call these via proxyActivities — determinism preserved.

import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../../shared/prisma/create-prisma-client';
import { OutboxPublisher } from '@cos/kafka';
import { createLogger } from '@cos/logger';
import { buildOutboxEvent } from '../../../shared/outbox/outbox.types';

import { getDbUrlForTenant } from '../../tenant/utils/get-db-url';

const logger = createLogger('po-activities');

export interface PoActivityParams {
  po_id: string;
  project_id: string;
  vendor_id: string;
  tenant_id: string;
  correlation_id: string;
}

async function withTenantTx<T>(
  tenantId: string,
  fn: (prisma: PrismaClient) => Promise<T>,
): Promise<T> {
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
 * Builds the outbox envelope for an activity event (§35.13 ESC-13).
 *
 * Replaces the previous `publishEvent`, which published straight to Kafka and then SWALLOWED the
 * error (`catch → logger.error('kafka.publish.failed')`). Because the activity still returned
 * normally, Temporal saw a success and never retried — so the event was lost exactly as in the
 * request-path services, and Temporal's durability guarantee never applied to it.
 */
function activityEvent<T>(
  event_type: string,
  payload: T,
  tenant_id: string,
  correlation_id: string,
) {
  return buildOutboxEvent({
    eventType: event_type,
    tenantId: tenant_id,
    actorId: 'system',
    correlationId: correlation_id,
    payload,
  });
}

/** Writes an activity event to the outbox in its own tenant transaction (no business write). */
async function writeStandaloneEvent<T>(
  event_type: string,
  payload: T,
  tenant_id: string,
  correlation_id: string,
): Promise<void> {
  await withTenantTx(tenant_id, async (prisma) => {
    await OutboxPublisher.write(
      prisma,
      activityEvent(event_type, payload, tenant_id, correlation_id),
    );
  });
}

export async function updatePoStatus(
  params: PoActivityParams,
  from_status: string,
  to_status: string,
): Promise<void> {
  // The event rides the status UPDATE's transaction — a PO is never reported as transitioned
  // unless the row actually changed, and never changes without the event (§35.13 ESC-13).
  await withTenantTx(params.tenant_id, async (prisma) => {
    await prisma.$executeRaw`
      UPDATE procurement.purchase_orders SET status = ${to_status}, updated_at = now()
      WHERE po_id = ${params.po_id}::uuid AND tenant_id = ${params.tenant_id}::uuid`;

    await OutboxPublisher.write(
      prisma,
      activityEvent(
        'procurement.po.status_changed.v1',
        { po_id: params.po_id, from_status, to_status },
        params.tenant_id,
        params.correlation_id,
      ),
    );
  });

  logger.info(
    { po_id: params.po_id, from_status, to_status, correlation_id: params.correlation_id },
    'po.status.changed',
  );
}

export async function notifyApprover(
  params: PoActivityParams,
  approver_id: string,
  tier: string,
  po_number: string,
  total_amount: string,
  currency_code: string,
): Promise<void> {
  // Notification via Kafka — consumed by Phase 20 Notification Service.
  // NotificationService sends push/email to approver.
  logger.info(
    {
      po_id: params.po_id,
      approver_id,
      tier,
      po_number,
      correlation_id: params.correlation_id,
    },
    'po.approval.requested',
  );

  // No business write in this activity — the outbox is the durable at-least-once relay.
  await writeStandaloneEvent(
    'procurement.po.approval_requested.v1',
    {
      po_id: params.po_id,
      project_id: params.project_id,
      approver_id,
      tier,
      po_number,
      total_amount,
      currency_code,
    },
    params.tenant_id,
    params.correlation_id,
  );
}

export async function compensateCancelledPo(params: PoActivityParams): Promise<void> {
  // Compensation: emit event for Finance Service to roll back committed cost.
  // Finance listens to procurement.po.status_changed.v1 with DRAFT (rejection)
  // or handle via dedicated compensation event.
  logger.info(
    { po_id: params.po_id, correlation_id: params.correlation_id },
    'po.cancelled.compensation',
  );

  // Compensation emits only — no business write to be atomic with.
  await writeStandaloneEvent(
    'procurement.po.status_changed.v1',
    { po_id: params.po_id, from_status: 'PENDING_APPROVAL', to_status: 'DRAFT' },
    params.tenant_id,
    params.correlation_id,
  );
}
