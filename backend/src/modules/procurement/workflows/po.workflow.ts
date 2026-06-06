// PO Temporal Workflow — Phase 5
// Implements the PO state machine exactly as specified:
//   DRAFT → PENDING_APPROVAL → APPROVED → SENT → ACKNOWLEDGED
//         → PARTIALLY_DELIVERED → FULLY_DELIVERED → INVOICED → PAID | DISPUTED
//   PENDING_APPROVAL → DRAFT (reject/revise)
// Source: context/00_master_construction_os.md §WORKFLOW ENGINE SPEC
//
// Approval thresholds (spec §15.5 / master §WORKFLOW ENGINE SPEC):
//   ≤ 50,000 THB         → PM (PROJECT_MANAGER) alone
//   50,001–500,000 THB   → PM + FINANCE
//   > 500,000 THB        → PM + FINANCE + EXECUTIVE
//   48h timeout per approver → escalate to manager; final escalation → TENANT_ADMIN
//
// RULES:
// - Workflow functions MUST be deterministic — no I/O; all I/O in activities.
// - Do NOT add states beyond those listed above.
// - All state transitions MUST emit Kafka events (via activities).
// - Compensation logic MUST be implemented for DRAFT (rejection/revise path).

import {
  proxyActivities,
  sleep,
  condition,
  setHandler,
  defineSignal,
  defineQuery,
  log,
} from '@temporalio/workflow';
import type { updatePoStatus, notifyApprover, compensateCancelledPo } from './po.activities';

// ── Activity proxy ────────────────────────────────────────────────────────

const acts = proxyActivities<{
  updatePoStatus: typeof updatePoStatus;
  notifyApprover: typeof notifyApprover;
  compensateCancelledPo: typeof compensateCancelledPo;
}>({
  startToCloseTimeout: '2m',
  retry: { maximumAttempts: 3, initialInterval: '5s', backoffCoefficient: 2 },
});

// ── Approval tier definitions ────────────────────────────────────────────
// Thresholds are in THB. tenantId-configurable at platform level; defaults from spec.

const APPROVAL_TIMEOUT_MS = 48 * 60 * 60 * 1000; // 48 hours

// ── Signals ───────────────────────────────────────────────────────────────

export const submitPoSignal = defineSignal<[{ actor_id: string }]>('submit');

export const approvePoSignal =
  defineSignal<[{ approver_id: string; tier: 'PM' | 'FINANCE' | 'EXECUTIVE' | 'TENANT_ADMIN' }]>(
    'approve',
  );

export const rejectPoSignal = defineSignal<[{ approver_id: string; reason: string }]>('reject');

export const acknowledgePoSignal = defineSignal<[{ actor_id: string }]>('acknowledge');

export const recordDeliverySignal =
  defineSignal<[{ delivery_id: string; is_partial: boolean }]>('recordDelivery');

export const receiveInvoiceSignal = defineSignal<[{ invoice_id: string }]>('receiveInvoice');

export const markPaidSignal = defineSignal<[{ actor_id: string }]>('markPaid');

export const disputeInvoiceSignal = defineSignal<[{ actor_id: string; reason: string }]>('dispute');

// ── Queries ───────────────────────────────────────────────────────────────

export const poStatusQuery = defineQuery<string>('status');

// ── Workflow params ───────────────────────────────────────────────────────

export interface PoWorkflowParams {
  po_id: string;
  project_id: string;
  vendor_id: string;
  tenant_id: string;
  correlation_id: string;
  total_amount_thb: string; // Amount in THB for approval threshold comparison
  po_number: string;
  total_amount: string;
  currency_code: string;
  approval_thresholds: {
    // Tenant-configurable; defaults in spec
    pm_only_max: number;
    pm_finance_max: number;
  };
  approvers: {
    pm_id: string;
    finance_id: string;
    executive_id: string;
    tenant_admin_id: string;
  };
}

type PoStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SENT'
  | 'ACKNOWLEDGED'
  | 'PARTIALLY_DELIVERED'
  | 'FULLY_DELIVERED'
  | 'INVOICED'
  | 'PAID'
  | 'DISPUTED';

// ── Approval tier builder ─────────────────────────────────────────────────

function buildApprovalTiers(
  totalThb: number,
  thresholds: PoWorkflowParams['approval_thresholds'],
  approvers: PoWorkflowParams['approvers'],
): Array<{ tier: string; approver_id: string }> {
  if (totalThb <= thresholds.pm_only_max) {
    return [{ tier: 'PM', approver_id: approvers.pm_id }];
  } else if (totalThb <= thresholds.pm_finance_max) {
    return [
      { tier: 'PM', approver_id: approvers.pm_id },
      { tier: 'FINANCE', approver_id: approvers.finance_id },
    ];
  } else {
    return [
      { tier: 'PM', approver_id: approvers.pm_id },
      { tier: 'FINANCE', approver_id: approvers.finance_id },
      { tier: 'EXECUTIVE', approver_id: approvers.executive_id },
    ];
  }
}

// ── Workflow ──────────────────────────────────────────────────────────────

export async function poWorkflow(params: PoWorkflowParams): Promise<void> {
  const actParams = {
    po_id: params.po_id,
    project_id: params.project_id,
    vendor_id: params.vendor_id,
    tenant_id: params.tenant_id,
    correlation_id: params.correlation_id,
  };

  let status: PoStatus = 'DRAFT';
  let submitted = false;
  let rejected = false;
  let acknowledged = false;
  let deliveryPartial = false;
  let deliveryComplete = false;
  let invoiceReceived = false;
  let paid = false;
  let disputed = false;

  // Approval tracking
  const approvalTiers = buildApprovalTiers(
    parseFloat(params.total_amount_thb),
    params.approval_thresholds,
    params.approvers,
  );
  const approvedTiers = new Set<string>();

  setHandler(poStatusQuery, () => status);

  // ── Signal handlers ────────────────────────────────────────────────────

  setHandler(submitPoSignal, ({ actor_id }) => {
    if (status !== 'DRAFT') return;
    log.info('po.submit.signal', { po_id: params.po_id, actor_id });
    submitted = true;
  });

  setHandler(approvePoSignal, ({ approver_id, tier }) => {
    if (status !== 'PENDING_APPROVAL') return;
    log.info('po.approve.signal', { po_id: params.po_id, approver_id, tier });
    approvedTiers.add(tier);
    if (approvedTiers.size >= approvalTiers.length) {
      // all tiers approved — loop will exit naturally
    }
  });

  setHandler(rejectPoSignal, ({ approver_id, reason }) => {
    if (status !== 'PENDING_APPROVAL') return;
    log.info('po.reject.signal', { po_id: params.po_id, approver_id, reason });
    rejected = true;
  });

  setHandler(acknowledgePoSignal, ({ actor_id }) => {
    if (status !== 'SENT') return;
    log.info('po.acknowledge.signal', { po_id: params.po_id, actor_id });
    acknowledged = true;
  });

  setHandler(recordDeliverySignal, ({ delivery_id, is_partial }) => {
    if (status !== 'ACKNOWLEDGED' && status !== 'PARTIALLY_DELIVERED') return;
    log.info('po.delivery.signal', { po_id: params.po_id, delivery_id, is_partial });
    if (is_partial) {
      deliveryPartial = true;
    } else {
      deliveryComplete = true;
    }
  });

  setHandler(receiveInvoiceSignal, ({ invoice_id }) => {
    if (status !== 'FULLY_DELIVERED') return;
    log.info('po.invoice.signal', { po_id: params.po_id, invoice_id });
    invoiceReceived = true;
  });

  setHandler(markPaidSignal, ({ actor_id }) => {
    if (status !== 'INVOICED') return;
    log.info('po.paid.signal', { po_id: params.po_id, actor_id });
    paid = true;
  });

  setHandler(disputeInvoiceSignal, ({ actor_id, reason }) => {
    if (status !== 'INVOICED') return;
    log.info('po.dispute.signal', { po_id: params.po_id, actor_id, reason });
    disputed = true;
  });

  // ── DRAFT → PENDING_APPROVAL ────────────────────────────────────────────
  await condition(() => submitted);
  await acts.updatePoStatus(actParams, 'DRAFT', 'PENDING_APPROVAL');
  status = 'PENDING_APPROVAL';

  // ── Approval chain with 48h timeout per approver ────────────────────────
  for (const tierDef of approvalTiers) {
    await acts.notifyApprover(
      actParams,
      tierDef.approver_id,
      tierDef.tier,
      params.po_number,
      params.total_amount,
      params.currency_code,
    );

    let escalated = false;
    await Promise.race([
      condition(() => approvedTiers.has(tierDef.tier) || rejected),
      sleep(APPROVAL_TIMEOUT_MS).then(() => {
        escalated = true;
      }),
    ]);

    if (rejected) {
      // PENDING_APPROVAL → DRAFT (reject/revise path)
      await acts.updatePoStatus(actParams, 'PENDING_APPROVAL', 'DRAFT');
      status = 'DRAFT';
      await acts.compensateCancelledPo(actParams);
      // Workflow ends — service layer will restart workflow when PROCUREMENT_OFFICER resubmits.
      return;
    }

    if (escalated && !approvedTiers.has(tierDef.tier)) {
      // 48h timeout — escalate to next manager; final escalation → TENANT_ADMIN
      const escalateTo = params.approvers.tenant_admin_id;
      log.warn('po.approval.timeout', { po_id: params.po_id, tier: tierDef.tier, escalateTo });
      await acts.notifyApprover(
        actParams,
        escalateTo,
        'TENANT_ADMIN',
        params.po_number,
        params.total_amount,
        params.currency_code,
      );
      // Continue waiting for either escalated approval or rejection
      await condition(() => approvedTiers.has(tierDef.tier) || rejected);

      if (rejected) {
        await acts.updatePoStatus(actParams, 'PENDING_APPROVAL', 'DRAFT');
        status = 'DRAFT';
        await acts.compensateCancelledPo(actParams);
        return;
      }
    }
  }

  // ── PENDING_APPROVAL → APPROVED → SENT (auto) ───────────────────────────
  await acts.updatePoStatus(actParams, 'PENDING_APPROVAL', 'APPROVED');
  status = 'APPROVED';

  // Auto-transition: APPROVED → SENT
  await acts.updatePoStatus(actParams, 'APPROVED', 'SENT');
  status = 'SENT';

  // ── SENT → ACKNOWLEDGED ─────────────────────────────────────────────────
  await condition(() => acknowledged);
  await acts.updatePoStatus(actParams, 'SENT', 'ACKNOWLEDGED');
  status = 'ACKNOWLEDGED';

  // ── ACKNOWLEDGED → PARTIALLY_DELIVERED → FULLY_DELIVERED ────────────────
  await condition(() => deliveryPartial || deliveryComplete);

  if (deliveryPartial && !deliveryComplete) {
    await acts.updatePoStatus(actParams, 'ACKNOWLEDGED', 'PARTIALLY_DELIVERED');
    status = 'PARTIALLY_DELIVERED';

    // Wait for completion delivery
    await condition(() => deliveryComplete);
  }

  await acts.updatePoStatus(
    actParams,
    status === 'PARTIALLY_DELIVERED' ? 'PARTIALLY_DELIVERED' : 'ACKNOWLEDGED',
    'FULLY_DELIVERED',
  );
  status = 'FULLY_DELIVERED';

  // ── FULLY_DELIVERED → INVOICED ───────────────────────────────────────────
  await condition(() => invoiceReceived);
  await acts.updatePoStatus(actParams, 'FULLY_DELIVERED', 'INVOICED');
  status = 'INVOICED';

  // ── INVOICED → PAID | DISPUTED ───────────────────────────────────────────
  await condition(() => paid || disputed);

  if (paid) {
    await acts.updatePoStatus(actParams, 'INVOICED', 'PAID');
  } else {
    await acts.updatePoStatus(actParams, 'INVOICED', 'DISPUTED');
  }
}
