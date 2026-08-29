/**
 * Phase 5 checklist item 05 — the PO approval threshold chain (master:1513-1518).
 *
 *   <= 50,000 THB          PM (PROJECT_MANAGER) approves alone
 *   50,001 - 500,000 THB   PM + FINANCE
 *   > 500,000 THB          PM + FINANCE + EXECUTIVE
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The module's own po.workflow.spec.ts exercises 40,000 (band 1) and 600,000 (band 3) — both well
 * inside their bands. The MIDDLE band is never exercised at all, and neither boundary is: nothing
 * currently fails if `<=` becomes `<`, or if the middle branch selects the wrong tier set. Those are
 * the mutations QM-1 requires this code to survive, so the boundaries are the tests worth having.
 *
 * Named *.workflow.spec.ts on purpose: jest.workflows.config.js matches that suffix and runs it
 * SERIALLY (maxWorkers 1). Each spec starts its own time-skipping Temporal server, and running them
 * in parallel starves them — see context.md and the config's own header.
 */
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { poWorkflow, submitPoSignal, approvePoSignal } from '../workflows/po.workflow';
import type { PoWorkflowParams } from '../workflows/po.workflow';

const mockUpdatePoStatus = jest.fn().mockResolvedValue(undefined);
const mockNotifyApprover = jest.fn().mockResolvedValue(undefined);
const mockCompensateCancelledPo = jest.fn().mockResolvedValue(undefined);

const mockActivities = {
  updatePoStatus: mockUpdatePoStatus,
  notifyApprover: mockNotifyApprover,
  compensateCancelledPo: mockCompensateCancelledPo,
};

const paramsFor = (totalThb: string): PoWorkflowParams => ({
  po_id: 'po-threshold-001',
  project_id: 'project-uuid-001',
  vendor_id: 'vendor-uuid-001',
  tenant_id: 'tenant-uuid-001',
  correlation_id: 'corr-uuid-001',
  total_amount_thb: totalThb,
  po_number: 'PO-THRESHOLD',
  total_amount: totalThb,
  currency_code: 'THB',
  approval_thresholds: { pm_only_max: 50_000, pm_finance_max: 500_000 },
  approvers: {
    pm_id: 'pm-uuid-001',
    finance_id: 'finance-uuid-001',
    executive_id: 'exec-uuid-001',
    tenant_admin_id: 'admin-uuid-001',
  },
});

describe('Phase 5 · PO approval threshold boundaries (master:1513-1518)', () => {
  let testEnv: TestWorkflowEnvironment | undefined;
  let worker: Worker | undefined;
  let taskQueue: string;

  beforeAll(async () => {
    try {
      testEnv = await TestWorkflowEnvironment.createTimeSkipping();
    } catch {
      // Temporal test server binary unavailable (no network) — same guard the module's own spec uses.
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
    taskQueue = `test-po-threshold-${Math.random().toString(36).slice(2)}`;
    worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue,
      workflowsPath: require.resolve('../workflows/po.workflow'),
      activities: mockActivities,
    });
  });

  /**
   * The distinct tiers the workflow notified.
   *
   * notifyApprover takes POSITIONAL arguments — (activityParams, approver_id, tier, po_number,
   * total_amount, currency_code) — so the tier is argument 2, not a field on argument 0.
   *
   * The chain notifies ONE tier at a time and waits for its approval, so every tier has to be
   * approved to see the whole chain. Approving a tier the PO does not require is harmless: the
   * workflow only waits on the tiers its own threshold produced, which is precisely what is
   * under test here.
   */
  const tiersFor = async (totalThb: string, workflowId: string): Promise<string[]> => {
    await worker!.runUntil(async () => {
      const handle = await testEnv!.client.workflow.start(poWorkflow, {
        taskQueue,
        workflowId,
        args: [paramsFor(totalThb)],
      });
      await handle.signal(submitPoSignal, { actor_id: 'user-001' });
      await testEnv!.sleep('100ms');
      for (const [approver, tier] of [
        ['pm-uuid-001', 'PM'],
        ['finance-uuid-001', 'FINANCE'],
        ['exec-uuid-001', 'EXECUTIVE'],
      ] as const) {
        await handle.signal(approvePoSignal, { approver_id: approver, tier });
        await testEnv!.sleep('100ms');
      }
    });
    const seen: string[] = [];
    for (const call of mockNotifyApprover.mock.calls) {
      const tier = call[2] as string | undefined;
      if (typeof tier === 'string' && !seen.includes(tier)) seen.push(tier);
    }
    return seen;
  };

  const CASES: ReadonlyArray<[string, string[], string]> = [
    // exactly at the first boundary — the spec says "<= 50,000", so PM alone
    ['50000.0000', ['PM'], 'at the 50,000 boundary'],
    // one satang over it — the middle band the module's own spec never exercises
    ['50000.0001', ['PM', 'FINANCE'], 'one satang above 50,000'],
    ['50001.0000', ['PM', 'FINANCE'], 'just inside the middle band'],
    // exactly at the second boundary — still "<= 500,000", so no EXECUTIVE
    ['500000.0000', ['PM', 'FINANCE'], 'at the 500,000 boundary'],
    // one satang over it — EXECUTIVE joins
    ['500000.0001', ['PM', 'FINANCE', 'EXECUTIVE'], 'one satang above 500,000'],
    ['500001.0000', ['PM', 'FINANCE', 'EXECUTIVE'], 'just inside the top band'],
  ];

  it.each(CASES)('%s THB → %s (%s)', async (amount, expected) => {
    if (!worker) return;
    const tiers = await tiersFor(amount, `po-threshold-${amount.replace('.', '-')}`);
    // Exact set, not a superset: an extra tier means the PO demanded an approval the spec does not,
    // and a missing one means it skipped an approval the spec requires. Both are failures.
    expect(tiers).toEqual(expected);
  });
});
