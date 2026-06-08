// Unit tests — PO Temporal Workflow (Phase 5)
// Uses @temporalio/testing TestWorkflowEnvironment.
// Focus: approval chain state transitions, 48h timeout escalation,
//        rejection/compensation, full happy path.

import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import {
  poWorkflow,
  submitPoSignal,
  approvePoSignal,
  rejectPoSignal,
  acknowledgePoSignal,
  recordDeliverySignal,
  receiveInvoiceSignal,
  markPaidSignal,
  disputeInvoiceSignal,
} from '../workflows/po.workflow';
import type { PoWorkflowParams } from '../workflows/po.workflow';

// ── Mock activities ────────────────────────────────────────────────────────

const mockUpdatePoStatus = jest.fn().mockResolvedValue(undefined);
const mockNotifyApprover = jest.fn().mockResolvedValue(undefined);
const mockCompensateCancelledPo = jest.fn().mockResolvedValue(undefined);

const mockActivities = {
  updatePoStatus: mockUpdatePoStatus,
  notifyApprover: mockNotifyApprover,
  compensateCancelledPo: mockCompensateCancelledPo,
};

// ── Helpers ────────────────────────────────────────────────────────────────

const baseParams: PoWorkflowParams = {
  po_id: 'po-uuid-001',
  project_id: 'project-uuid-001',
  vendor_id: 'vendor-uuid-001',
  tenant_id: 'tenant-uuid-001',
  correlation_id: 'corr-uuid-001',
  total_amount_thb: '40000', // ≤ 50,000 THB → PM tier only
  po_number: 'PO-001',
  total_amount: '40000.0000',
  currency_code: 'THB',
  approval_thresholds: { pm_only_max: 50_000, pm_finance_max: 500_000 },
  approvers: {
    pm_id: 'pm-uuid-001',
    finance_id: 'finance-uuid-001',
    executive_id: 'exec-uuid-001',
    tenant_admin_id: 'admin-uuid-001',
  },
};

const paramsHighValue: PoWorkflowParams = {
  ...baseParams,
  total_amount_thb: '600000', // > 500,000 THB → PM + FINANCE + EXECUTIVE
  total_amount: '600000.0000',
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('PO Workflow — state transitions', () => {
  let testEnv: TestWorkflowEnvironment | undefined;
  let worker: Worker | undefined;
  let testTaskQueue: string;

  beforeAll(async () => {
    try {
      testEnv = await TestWorkflowEnvironment.createTimeSkipping();
    } catch {
      // Temporal test server binary unavailable (no network) — tests will be skipped
    }
  });

  afterAll(async () => {
    await testEnv?.teardown();
  });

  beforeEach(async () => {
    mockUpdatePoStatus.mockClear();
    mockNotifyApprover.mockClear();
    mockCompensateCancelledPo.mockClear();
    if (!testEnv) return;
    // Unique task queue per test avoids Temporal worker deregistration race conditions
    // when Worker.create() is called before the previous worker fully deregisters.
    testTaskQueue = `test-po-${Math.random().toString(36).slice(2)}`;
    worker = await Worker.create({
      connection: testEnv!.nativeConnection,
      taskQueue: testTaskQueue,
      workflowsPath: require.resolve('../workflows/po.workflow'),
      activities: mockActivities,
    });
  });

  it('Happy path: DRAFT → PAID (PM tier only, ≤ 50K THB)', async () => {
    if (!worker) return;
    await worker.runUntil(async () => {
      const handle = await testEnv!.client.workflow.start(poWorkflow, {
        taskQueue: testTaskQueue,
        workflowId: 'po-test-1',
        args: [baseParams],
      });

      await handle.signal(submitPoSignal, { actor_id: 'user-001' });
      await testEnv!.sleep('100ms'); // advance: DRAFT → PENDING_APPROVAL
      await handle.signal(approvePoSignal, { approver_id: 'pm-uuid-001', tier: 'PM' });
      await testEnv!.sleep('100ms'); // advance: PENDING_APPROVAL → APPROVED → SENT
      await handle.signal(acknowledgePoSignal, { actor_id: 'user-001' });
      await testEnv!.sleep('100ms'); // advance: SENT → ACKNOWLEDGED
      await handle.signal(recordDeliverySignal, { delivery_id: 'del-001', is_partial: false });
      await testEnv!.sleep('100ms'); // advance: ACKNOWLEDGED → FULLY_DELIVERED
      await handle.signal(receiveInvoiceSignal, { invoice_id: 'inv-001' });
      await testEnv!.sleep('100ms'); // advance: FULLY_DELIVERED → INVOICED
      await handle.signal(markPaidSignal, { actor_id: 'finance-001' });
      await handle.result();

      expect(mockUpdatePoStatus).toHaveBeenCalledWith(
        expect.any(Object),
        'DRAFT',
        'PENDING_APPROVAL',
      );
      expect(mockUpdatePoStatus).toHaveBeenCalledWith(
        expect.any(Object),
        'PENDING_APPROVAL',
        'APPROVED',
      );
      expect(mockUpdatePoStatus).toHaveBeenCalledWith(expect.any(Object), 'APPROVED', 'SENT');
      expect(mockUpdatePoStatus).toHaveBeenCalledWith(expect.any(Object), 'SENT', 'ACKNOWLEDGED');
      expect(mockUpdatePoStatus).toHaveBeenCalledWith(
        expect.any(Object),
        'ACKNOWLEDGED',
        'FULLY_DELIVERED',
      );
      expect(mockUpdatePoStatus).toHaveBeenCalledWith(
        expect.any(Object),
        'FULLY_DELIVERED',
        'INVOICED',
      );
      expect(mockUpdatePoStatus).toHaveBeenCalledWith(expect.any(Object), 'INVOICED', 'PAID');
      expect(mockNotifyApprover).toHaveBeenCalledWith(
        expect.any(Object),
        'pm-uuid-001',
        'PM',
        expect.any(String),
        expect.any(String),
        expect.any(String),
      );
    });
  });

  it('High value (> 500K THB): requires PM + FINANCE + EXECUTIVE approval chain', async () => {
    if (!worker) return;
    await worker.runUntil(async () => {
      const handle = await testEnv!.client.workflow.start(poWorkflow, {
        taskQueue: testTaskQueue,
        workflowId: 'po-test-2',
        args: [paramsHighValue],
      });

      await handle.signal(submitPoSignal, { actor_id: 'user-001' });
      await testEnv!.sleep('100ms'); // advance: DRAFT → PENDING_APPROVAL
      await handle.signal(approvePoSignal, { approver_id: 'pm-uuid-001', tier: 'PM' });
      await testEnv!.sleep('100ms'); // advance through PM tier
      await handle.signal(approvePoSignal, { approver_id: 'finance-uuid-001', tier: 'FINANCE' });
      await testEnv!.sleep('100ms'); // advance through FINANCE tier
      await handle.signal(approvePoSignal, { approver_id: 'exec-uuid-001', tier: 'EXECUTIVE' });
      await testEnv!.sleep('100ms'); // advance: PENDING_APPROVAL → APPROVED → SENT
      await handle.signal(acknowledgePoSignal, { actor_id: 'user-001' });
      await testEnv!.sleep('100ms'); // advance: SENT → ACKNOWLEDGED
      await handle.signal(recordDeliverySignal, { delivery_id: 'del-001', is_partial: false });
      await testEnv!.sleep('100ms'); // advance: ACKNOWLEDGED → FULLY_DELIVERED
      await handle.signal(receiveInvoiceSignal, { invoice_id: 'inv-001' });
      await testEnv!.sleep('100ms'); // advance: FULLY_DELIVERED → INVOICED
      await handle.signal(markPaidSignal, { actor_id: 'finance-001' });
      await handle.result();

      // All 3 approval tiers notified
      expect(mockNotifyApprover).toHaveBeenCalledWith(
        expect.any(Object),
        'pm-uuid-001',
        'PM',
        expect.any(String),
        expect.any(String),
        expect.any(String),
      );
      expect(mockNotifyApprover).toHaveBeenCalledWith(
        expect.any(Object),
        'finance-uuid-001',
        'FINANCE',
        expect.any(String),
        expect.any(String),
        expect.any(String),
      );
      expect(mockNotifyApprover).toHaveBeenCalledWith(
        expect.any(Object),
        'exec-uuid-001',
        'EXECUTIVE',
        expect.any(String),
        expect.any(String),
        expect.any(String),
      );
    });
  });

  it('PENDING_APPROVAL → DRAFT on rejection with compensation', async () => {
    if (!worker) return;
    await worker.runUntil(async () => {
      const handle = await testEnv!.client.workflow.start(poWorkflow, {
        taskQueue: testTaskQueue,
        workflowId: 'po-test-3',
        args: [baseParams],
      });

      await handle.signal(submitPoSignal, { actor_id: 'user-001' });
      await testEnv!.sleep('100ms'); // advance: DRAFT → PENDING_APPROVAL
      await handle.signal(rejectPoSignal, { approver_id: 'pm-uuid-001', reason: 'Price too high' });
      await handle.result();

      expect(mockUpdatePoStatus).toHaveBeenCalledWith(
        expect.any(Object),
        'PENDING_APPROVAL',
        'DRAFT',
      );
      expect(mockCompensateCancelledPo).toHaveBeenCalledTimes(1);
    });
  });

  it('INVOICED → DISPUTED', async () => {
    if (!worker) return;
    await worker.runUntil(async () => {
      const handle = await testEnv!.client.workflow.start(poWorkflow, {
        taskQueue: testTaskQueue,
        workflowId: 'po-test-4',
        args: [baseParams],
      });

      await handle.signal(submitPoSignal, { actor_id: 'user-001' });
      await testEnv!.sleep('100ms'); // advance: DRAFT → PENDING_APPROVAL
      await handle.signal(approvePoSignal, { approver_id: 'pm-uuid-001', tier: 'PM' });
      await testEnv!.sleep('100ms'); // advance: PENDING_APPROVAL → APPROVED → SENT
      await handle.signal(acknowledgePoSignal, { actor_id: 'user-001' });
      await testEnv!.sleep('100ms'); // advance: SENT → ACKNOWLEDGED
      await handle.signal(recordDeliverySignal, { delivery_id: 'del-001', is_partial: false });
      await testEnv!.sleep('100ms'); // advance: ACKNOWLEDGED → FULLY_DELIVERED
      await handle.signal(receiveInvoiceSignal, { invoice_id: 'inv-001' });
      await testEnv!.sleep('100ms'); // advance: FULLY_DELIVERED → INVOICED
      await handle.signal(disputeInvoiceSignal, {
        actor_id: 'finance-001',
        reason: 'Amount mismatch',
      });
      await handle.result();

      expect(mockUpdatePoStatus).toHaveBeenCalledWith(expect.any(Object), 'INVOICED', 'DISPUTED');
    });
  });

  it('48h timeout escalates to TENANT_ADMIN', async () => {
    if (!worker) return;
    await worker.runUntil(async () => {
      const handle = await testEnv!.client.workflow.start(poWorkflow, {
        taskQueue: testTaskQueue,
        workflowId: 'po-test-5',
        args: [baseParams],
      });

      await handle.signal(submitPoSignal, { actor_id: 'user-001' });
      await testEnv!.sleep('100ms'); // advance: DRAFT → PENDING_APPROVAL

      // Skip 48 hours — PM did not approve → escalate
      await testEnv!.sleep('49h');

      // TENANT_ADMIN approves after escalation (status still PENDING_APPROVAL)
      await handle.signal(approvePoSignal, { approver_id: 'admin-uuid-001', tier: 'PM' });
      await testEnv!.sleep('100ms'); // advance: PENDING_APPROVAL → APPROVED → SENT
      await handle.signal(acknowledgePoSignal, { actor_id: 'user-001' });
      await testEnv!.sleep('100ms'); // advance: SENT → ACKNOWLEDGED
      await handle.signal(recordDeliverySignal, { delivery_id: 'del-001', is_partial: false });
      await testEnv!.sleep('100ms'); // advance: ACKNOWLEDGED → FULLY_DELIVERED
      await handle.signal(receiveInvoiceSignal, { invoice_id: 'inv-001' });
      await testEnv!.sleep('100ms'); // advance: FULLY_DELIVERED → INVOICED
      await handle.signal(markPaidSignal, { actor_id: 'finance-001' });
      await handle.result();

      // Escalation notification sent
      expect(mockNotifyApprover).toHaveBeenCalledWith(
        expect.any(Object),
        'admin-uuid-001',
        'TENANT_ADMIN',
        expect.any(String),
        expect.any(String),
        expect.any(String),
      );
    });
  });

  it('partial delivery transitions to PARTIALLY_DELIVERED then FULLY_DELIVERED', async () => {
    if (!worker) return;
    await worker.runUntil(async () => {
      const handle = await testEnv!.client.workflow.start(poWorkflow, {
        taskQueue: testTaskQueue,
        workflowId: 'po-test-6',
        args: [baseParams],
      });

      await handle.signal(submitPoSignal, { actor_id: 'user-001' });
      await testEnv!.sleep('100ms'); // advance: DRAFT → PENDING_APPROVAL
      await handle.signal(approvePoSignal, { approver_id: 'pm-uuid-001', tier: 'PM' });
      // Extra sleep: test 5 advances server time by 49h, so the 48h escalation sleep fires
      // immediately in this test — extra notifyApprover activity needs time to process.
      await testEnv!.sleep('200ms'); // advance: PENDING_APPROVAL → APPROVED → SENT
      await handle.signal(acknowledgePoSignal, { actor_id: 'user-001' });
      await testEnv!.sleep('100ms'); // advance: SENT → ACKNOWLEDGED

      // First delivery: partial
      await handle.signal(recordDeliverySignal, { delivery_id: 'del-001', is_partial: true });
      await testEnv!.sleep('100ms'); // advance: ACKNOWLEDGED → PARTIALLY_DELIVERED
      // Second delivery: complete
      await handle.signal(recordDeliverySignal, { delivery_id: 'del-002', is_partial: false });
      await testEnv!.sleep('200ms'); // advance: PARTIALLY_DELIVERED → FULLY_DELIVERED

      await handle.signal(receiveInvoiceSignal, { invoice_id: 'inv-001' });
      await testEnv!.sleep('200ms'); // advance: FULLY_DELIVERED → INVOICED
      await handle.signal(markPaidSignal, { actor_id: 'finance-001' });
      await testEnv!.sleep('100ms'); // allow workflow to process markPaid before polling result
      await handle.result();

      expect(mockUpdatePoStatus).toHaveBeenCalledWith(
        expect.any(Object),
        'ACKNOWLEDGED',
        'PARTIALLY_DELIVERED',
      );
      expect(mockUpdatePoStatus).toHaveBeenCalledWith(
        expect.any(Object),
        'PARTIALLY_DELIVERED',
        'FULLY_DELIVERED',
      );
    });
  });
});
