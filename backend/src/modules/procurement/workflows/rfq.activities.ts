// RFQ Workflow Activities — Phase 5
// Activities contain all I/O — DB updates and Kafka events.
// Registered with the Temporal worker (worker.ts).
// Workflows (rfq.workflow.ts) call these via proxyActivities — determinism preserved.

import { PrismaClient } from '@prisma/client';
import { KafkaProducer } from '@cos/shared';
import { createLogger } from '@cos/logger';

const logger = createLogger('rfq-activities');

// Activities receive tenantCode + tenantId separately from the workflow params
// so they can SET LOCAL search_path without a full NestJS request scope.

export interface RfqActivityParams {
  rfq_id: string;
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

export async function updateRfqStatus(
  params: RfqActivityParams,
  from_status: string,
  to_status: string,
): Promise<void> {
  await withTenantTx(params.tenant_code, async (prisma) => {
    await prisma.$executeRaw`
      UPDATE rfqs SET status = ${to_status}, updated_at = now()
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
  await withTenantTx(params.tenant_code, async (prisma) => {
    await prisma.$executeRaw`
      UPDATE rfqs SET status = 'EVALUATED', updated_at = now()
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
