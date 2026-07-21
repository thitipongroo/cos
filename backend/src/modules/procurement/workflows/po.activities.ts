// PO Workflow Activities — Phase 5
// Activities contain all I/O — DB updates and Kafka events.
// Registered with the Temporal worker (worker.ts).
// Workflows (po.workflow.ts) call these via proxyActivities — determinism preserved.

import { createLogger } from '@cos/logger';

import { publishEvent, withTenantTx } from './activity-helpers';

const logger = createLogger('po-activities');

export interface PoActivityParams {
  po_id: string;
  project_id: string;
  vendor_id: string;
  tenant_id: string;
  correlation_id: string;
}

export async function updatePoStatus(
  params: PoActivityParams,
  from_status: string,
  to_status: string,
): Promise<void> {
  await withTenantTx(params.tenant_id, async (prisma) => {
    await prisma.$executeRaw`
      UPDATE procurement.purchase_orders SET status = ${to_status}, updated_at = now()
      WHERE po_id = ${params.po_id}::uuid AND tenant_id = ${params.tenant_id}::uuid`;
  });

  logger.info(
    { po_id: params.po_id, from_status, to_status, correlation_id: params.correlation_id },
    'po.status.changed',
  );

  await publishEvent(
    logger,
    'procurement.po.status_changed.v1',
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
    logger,
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

  await publishEvent(
    logger,
    'procurement.po.status_changed.v1',
    { po_id: params.po_id, from_status: 'PENDING_APPROVAL', to_status: 'DRAFT' },
    params.tenant_id,
    params.correlation_id,
  );
}
