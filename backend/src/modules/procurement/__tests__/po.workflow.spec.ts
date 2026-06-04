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
  tenant_code: 'acme_corp',
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
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
    worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: 'test-po',
      workflows: { poWorkflow },
      activities: mockActivities,
    });
  });

  afterAll(async () => {
    await testEnv.teardown();
  });

  beforeEach(() => {
    mockUpdatePoStatus.mockClear();
    mockNotifyApprover.mockClear();
    mockCompensateCancelledPo.mockClear();
  });

  it('Happy path: DRAFT → PAID (PM tier only, ≤ 50K THB)', async () => {
    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(poWorkflow, {
        taskQueue: 'test-po',
        workflowId: 'po-test-1',
        args: [baseParams],
      });

      await handle.signal(submitPoSignal, { actor_id: 'user-001' });
      await handle.signal(approvePoSignal, { approver_id: 'pm-uuid-001', tier: 'PM' });
      await handle.signal(acknowledgePoSignal, { actor_id: 'user-001' });
      await handle.signal(recordDeliverySignal, { delivery_id: 'del-001', is_partial: false });
      await handle.signal(receiveInvoiceSignal, { invoice_id: 'inv-001' });
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
    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(poWorkflow, {
        taskQueue: 'test-po',
        workflowId: 'po-test-2',
        args: [paramsHighValue],
      });

      await handle.signal(submitPoSignal, { actor_id: 'user-001' });
      await handle.signal(approvePoSignal, { approver_id: 'pm-uuid-001', tier: 'PM' });
      await handle.signal(approvePoSignal, { approver_id: 'finance-uuid-001', tier: 'FINANCE' });
      await handle.signal(approvePoSignal, { approver_id: 'exec-uuid-001', tier: 'EXECUTIVE' });
      await handle.signal(acknowledgePoSignal, { actor_id: 'user-001' });
      await handle.signal(recordDeliverySignal, { delivery_id: 'del-001', is_partial: false });
      await handle.signal(receiveInvoiceSignal, { invoice_id: 'inv-001' });
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
    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(poWorkflow, {
        taskQueue: 'test-po',
        workflowId: 'po-test-3',
        args: [baseParams],
      });

      await handle.signal(submitPoSignal, { actor_id: 'user-001' });
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
    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(poWorkflow, {
        taskQueue: 'test-po',
        workflowId: 'po-test-4',
        args: [baseParams],
      });

      await handle.signal(submitPoSignal, { actor_id: 'user-001' });
      await handle.signal(approvePoSignal, { approver_id: 'pm-uuid-001', tier: 'PM' });
      await handle.signal(acknowledgePoSignal, { actor_id: 'user-001' });
      await handle.signal(recordDeliverySignal, { delivery_id: 'del-001', is_partial: false });
      await handle.signal(receiveInvoiceSignal, { invoice_id: 'inv-001' });
      await handle.signal(disputeInvoiceSignal, {
        actor_id: 'finance-001',
        reason: 'Amount mismatch',
      });
      await handle.result();

      expect(mockUpdatePoStatus).toHaveBeenCalledWith(expect.any(Object), 'INVOICED', 'DISPUTED');
    });
  });

  it('48h timeout escalates to TENANT_ADMIN', async () => {
    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(poWorkflow, {
        taskQueue: 'test-po',
        workflowId: 'po-test-5',
        args: [baseParams],
      });

      await handle.signal(submitPoSignal, { actor_id: 'user-001' });

      // Skip 48 hours — PM did not approve → escalate
      await testEnv.sleep('49h');

      // TENANT_ADMIN approves after escalation
      await handle.signal(approvePoSignal, { approver_id: 'admin-uuid-001', tier: 'PM' });
      await handle.signal(acknowledgePoSignal, { actor_id: 'user-001' });
      await handle.signal(recordDeliverySignal, { delivery_id: 'del-001', is_partial: false });
      await handle.signal(receiveInvoiceSignal, { invoice_id: 'inv-001' });
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
    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(poWorkflow, {
        taskQueue: 'test-po',
        workflowId: 'po-test-6',
        args: [baseParams],
      });

      await handle.signal(submitPoSignal, { actor_id: 'user-001' });
      await handle.signal(approvePoSignal, { approver_id: 'pm-uuid-001', tier: 'PM' });
      await handle.signal(acknowledgePoSignal, { actor_id: 'user-001' });

      // First delivery: partial
      await handle.signal(recordDeliverySignal, { delivery_id: 'del-001', is_partial: true });
      // Second delivery: complete
      await handle.signal(recordDeliverySignal, { delivery_id: 'del-002', is_partial: false });

      await handle.signal(receiveInvoiceSignal, { invoice_id: 'inv-001' });
      await handle.signal(markPaidSignal, { actor_id: 'finance-001' });
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
