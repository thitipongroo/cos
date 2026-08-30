// RFQ Workflow Activities — Phase 5
// Activities contain all I/O — DB updates and Kafka events.
// Registered with the Temporal worker (worker.ts).
// Workflows (rfq.workflow.ts) call these via proxyActivities — determinism preserved.

import { OutboxPublisher } from '@cos/kafka';
import { createLogger } from '@cos/logger';
import { buildOutboxEvent } from '../../../shared/outbox/outbox.types';

import { withTenantTx } from '../../../shared/workflows/activity-helpers';

/** Envelope for an activity-emitted event: activities act as the system, not as a user. */
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

const logger = createLogger('rfq-activities');

// Activities receive tenant_id from the workflow params and set app.current_tenant_id
// per ADR-008 — no tenant_code or search_path routing.

export interface RfqActivityParams {
  rfq_id: string;
  tenant_id: string;
  correlation_id: string;
}

export async function updateRfqStatus(
  params: RfqActivityParams,
  from_status: string,
  to_status: string,
): Promise<void> {
  // The event rides the status UPDATE's transaction (§35.13 ESC-13).
  await withTenantTx(params.tenant_id, async (prisma) => {
    await prisma.$executeRaw`
      UPDATE procurement.rfqs SET status = ${to_status}, updated_at = now()
      WHERE rfq_id = ${params.rfq_id}::uuid AND tenant_id = ${params.tenant_id}::uuid`;

    await OutboxPublisher.write(
      prisma,
      activityEvent(
        'procurement.rfq.status_changed.v1',
        { rfq_id: params.rfq_id, from_status, to_status },
        params.tenant_id,
        params.correlation_id,
      ),
    );
  });

  logger.info(
    { rfq_id: params.rfq_id, from_status, to_status, correlation_id: params.correlation_id },
    'rfq.status.changed',
  );
}

export async function markQuotationsEvaluated(params: RfqActivityParams): Promise<void> {
  // System automatically marks RFQ as EVALUATED after quotation comparison.
  // The service layer selects the winning quotation before this activity runs.
  await withTenantTx(params.tenant_id, async (prisma) => {
    await prisma.$executeRaw`
      UPDATE procurement.rfqs SET status = 'EVALUATED', updated_at = now()
      WHERE rfq_id = ${params.rfq_id}::uuid AND tenant_id = ${params.tenant_id}::uuid`;

    await OutboxPublisher.write(
      prisma,
      activityEvent(
        'procurement.rfq.status_changed.v1',
        { rfq_id: params.rfq_id, from_status: 'CLOSED', to_status: 'EVALUATED' },
        params.tenant_id,
        params.correlation_id,
      ),
    );
  });

  logger.info({ rfq_id: params.rfq_id, correlation_id: params.correlation_id }, 'rfq.evaluated');
}
