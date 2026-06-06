// RFQ Workflow Activities — Phase 5
// Activities contain all I/O — DB updates and Kafka events.
// Registered with the Temporal worker (worker.ts).
// Workflows (rfq.workflow.ts) call these via proxyActivities — determinism preserved.

import { PrismaClient } from '@prisma/client';
import { KafkaProducer } from '@cos/shared';
import { createLogger } from '@cos/logger';

import { getDbUrlForTenant } from '../../tenant/utils/get-db-url';

const logger = createLogger('rfq-activities');

// Activities receive tenant_id from the workflow params and set app.current_tenant_id
// per ADR-008 — no tenant_code or search_path routing.

export interface RfqActivityParams {
  rfq_id: string;
  tenant_id: string;
  correlation_id: string;
}

async function withTenantTx<T>(
  tenantId: string,
  fn: (prisma: PrismaClient) => Promise<T>,
): Promise<T> {
  const dbUrl = await getDbUrlForTenant(tenantId);
  const prisma = new PrismaClient({
    datasources: { db: { url: dbUrl } },
  });
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

export async function updateRfqStatus(
  params: RfqActivityParams,
  from_status: string,
  to_status: string,
): Promise<void> {
  await withTenantTx(params.tenant_id, async (prisma) => {
    await prisma.$executeRaw`
      UPDATE procurement.rfqs SET status = ${to_status}, updated_at = now()
      WHERE rfq_id = ${params.rfq_id}::uuid AND tenant_id = ${params.tenant_id}::uuid`;
  });

  logger.info(
    { rfq_id: params.rfq_id, from_status, to_status, correlation_id: params.correlation_id },
    'rfq.status.changed',
  );

  await publishEvent(
    'procurement.rfq.status_changed.v1',
    { rfq_id: params.rfq_id, from_status, to_status },
    params.tenant_id,
    params.correlation_id,
  );
}

export async function markQuotationsEvaluated(params: RfqActivityParams): Promise<void> {
  // System automatically marks RFQ as EVALUATED after quotation comparison.
  // The service layer selects the winning quotation before this activity runs.
  await withTenantTx(params.tenant_id, async (prisma) => {
    await prisma.$executeRaw`
      UPDATE procurement.rfqs SET status = 'EVALUATED', updated_at = now()
      WHERE rfq_id = ${params.rfq_id}::uuid AND tenant_id = ${params.tenant_id}::uuid`;
  });

  logger.info({ rfq_id: params.rfq_id, correlation_id: params.correlation_id }, 'rfq.evaluated');

  await publishEvent(
    'procurement.rfq.status_changed.v1',
    { rfq_id: params.rfq_id, from_status: 'CLOSED', to_status: 'EVALUATED' },
    params.tenant_id,
    params.correlation_id,
  );
}
