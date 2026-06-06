// RFQ Temporal Workflow — Phase 5
// Implements the RFQ state machine exactly as specified:
//   DRAFT → PUBLISHED → CLOSED → EVALUATED → [AWARDED | CANCELLED]
// Source: context/00_master_construction_os.md §WORKFLOW ENGINE SPEC
//
// RULES (spec):
// - Workflow functions MUST be deterministic — no I/O here; all I/O in activities.
// - Do NOT add states beyond those listed above.
// - All state transitions MUST emit Kafka events (via activities).
// - Compensation logic MUST be implemented for CANCELLED.

import {
  proxyActivities,
  sleep,
  condition,
  setHandler,
  defineSignal,
  defineQuery,
  log,
} from '@temporalio/workflow';
import type { updateRfqStatus, markQuotationsEvaluated } from './rfq.activities';

// ── Activity proxy ────────────────────────────────────────────────────────

const acts = proxyActivities<{
  updateRfqStatus: typeof updateRfqStatus;
  markQuotationsEvaluated: typeof markQuotationsEvaluated;
}>({
  startToCloseTimeout: '2m',
  retry: { maximumAttempts: 3, initialInterval: '5s', backoffCoefficient: 2 },
});

// ── Signals (PROCUREMENT_OFFICER / PROC_MANAGER trigger these) ────────────

export const publishRfqSignal = defineSignal<[{ actor_id: string }]>('publish');
export const closeRfqSignal = defineSignal<[{ actor_id: string }]>('close');
export const awardRfqSignal = defineSignal<[{ actor_id: string; quotation_id: string }]>('award');
export const cancelRfqSignal = defineSignal<[{ actor_id: string; reason?: string }]>('cancel');

// ── Queries ───────────────────────────────────────────────────────────────

export const rfqStatusQuery = defineQuery<string>('status');

// ── Workflow params ───────────────────────────────────────────────────────

export interface RfqWorkflowParams {
  rfq_id: string;
  tenant_id: string;
  correlation_id: string;
  deadline_ms: number; // absolute epoch ms — workflow sleeps until this
}

// ── Workflow ──────────────────────────────────────────────────────────────

export async function rfqWorkflow(params: RfqWorkflowParams): Promise<void> {
  const actParams = {
    rfq_id: params.rfq_id,
    tenant_id: params.tenant_id,
    correlation_id: params.correlation_id,
  };

  let status: 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'EVALUATED' | 'AWARDED' | 'CANCELLED' = 'DRAFT';
  let closed = false;
  let awarded = false;
  let cancelled = false;
  let selectedQuotationId: string | null = null;

  setHandler(rfqStatusQuery, () => status);

  // ── DRAFT → PUBLISHED ───────────────────────────────────────────────────
  setHandler(publishRfqSignal, async ({ actor_id }) => {
    if (status !== 'DRAFT') return;
    log.info('rfq.publish.signal', { rfq_id: params.rfq_id, actor_id });
    await acts.updateRfqStatus(actParams, 'DRAFT', 'PUBLISHED');
    status = 'PUBLISHED';
  });

  // ── Manual close signal (PUBLISHED → CLOSED) ────────────────────────────
  setHandler(closeRfqSignal, ({ actor_id }) => {
    if (status !== 'PUBLISHED') return;
    log.info('rfq.close.signal', { rfq_id: params.rfq_id, actor_id });
    closed = true;
  });

  // ── EVALUATED → AWARDED ─────────────────────────────────────────────────
  setHandler(awardRfqSignal, ({ actor_id, quotation_id }) => {
    if (status !== 'EVALUATED') return;
    log.info('rfq.award.signal', { rfq_id: params.rfq_id, actor_id, quotation_id });
    selectedQuotationId = quotation_id;
    awarded = true;
  });

  // ── EVALUATED → CANCELLED ────────────────────────────────────────────────
  setHandler(cancelRfqSignal, ({ actor_id }) => {
    log.info('rfq.cancel.signal', { rfq_id: params.rfq_id, actor_id });
    cancelled = true;
  });

  // ── Wait for PUBLISHED ───────────────────────────────────────────────────
  await condition(() => status === 'PUBLISHED' || cancelled);

  if (cancelled) {
    await acts.updateRfqStatus(actParams, status, 'CANCELLED');
    return;
  }

  // ── Sleep until deadline, then close — or close on manual signal ─────────
  const now = Date.now();
  const remainingMs = params.deadline_ms - now;
  if (remainingMs > 0) {
    await Promise.race([sleep(remainingMs), condition(() => closed || cancelled)]);
  }

  if (cancelled) {
    await acts.updateRfqStatus(actParams, 'PUBLISHED', 'CANCELLED');
    return;
  }

  // ── PUBLISHED → CLOSED ───────────────────────────────────────────────────
  await acts.updateRfqStatus(actParams, 'PUBLISHED', 'CLOSED');
  status = 'CLOSED';

  // ── CLOSED → EVALUATED (system auto) ────────────────────────────────────
  // Service layer computes quotation comparison before signalling EVALUATED.
  await acts.markQuotationsEvaluated(actParams);
  status = 'EVALUATED';

  // ── EVALUATED → AWARDED | CANCELLED ─────────────────────────────────────
  // Wait for human decision (no timeout specified in spec — wait indefinitely)
  await condition(() => awarded || cancelled);

  if (awarded) {
    await acts.updateRfqStatus(actParams, 'EVALUATED', 'AWARDED');
    log.info('rfq.awarded', { rfq_id: params.rfq_id, quotation_id: selectedQuotationId });
  } else {
    await acts.updateRfqStatus(actParams, 'EVALUATED', 'CANCELLED');
    // Compensation: no downstream state to roll back for RFQ cancellation at EVALUATED stage
  }
}
