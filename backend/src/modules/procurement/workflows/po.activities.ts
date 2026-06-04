// PO Workflow Activities — Phase 5
// Activities contain all I/O — DB updates and Kafka events.
// Registered with the Temporal worker (worker.ts).
// Workflows (po.workflow.ts) call these via proxyActivities — determinism preserved.

import { PrismaClient } from '@prisma/client';
import { KafkaProducer } from '@cos/shared';
import { createLogger } from '@cos/logger';

const logger = createLogger('po-activities');

export interface PoActivityParams {
  po_id: string;
  project_id: string;
  vendor_id: string;
  tenant_id: string;
  tenant_code: string;
  correlation_id: string;
}

async function withTenantTx<T>(
  tenantCode: string,
  fn: (prisma: PrismaClient) => Promise<T>,
): Promise<T> {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env['DATABASE_URL'] } },
  });
  try {
    return await prisma.$transaction(async (tx) => {
      await (tx as PrismaClient).$executeRawUnsafe(
        `SET LOCAL search_path = "${tenantCode}", public`,
      );
      return fn(tx as PrismaClient);
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function publishEvent<T>(
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

export async function updatePoStatus(
  params: PoActivityParams,
  from_status: string,
  to_status: string,
): Promise<void> {
  await withTenantTx(params.tenant_code, async (prisma) => {
    await prisma.$executeRaw`
      UPDATE purchase_orders SET status = ${to_status}, updated_at = now()
      WHERE po_id = ${params.po_id}::uuid AND tenant_id = ${params.tenant_id}::uuid`;
  });

  logger.info(
    { po_id: params.po_id, from_status, to_status, correlation_id: params.correlation_id },
    'po.status.changed',
  );

  await publishEvent(
    'procurement.purchase_order.status_changed.v1',
    { po_id: params.po_id, from_status, to_status },
    params.tenant_id,
    params.correlation_id,
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

  await publishEvent(
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
  // Finance listens to procurement.purchase_order.status_changed.v1 with DRAFT (rejection)
  // or handle via dedicated compensation event.
  logger.info(
    { po_id: params.po_id, correlation_id: params.correlation_id },
    'po.cancelled.compensation',
  );

  await publishEvent(
    'procurement.purchase_order.status_changed.v1',
    { po_id: params.po_id, from_status: 'PENDING_APPROVAL', to_status: 'DRAFT' },
    params.tenant_id,
    params.correlation_id,
  );
}
