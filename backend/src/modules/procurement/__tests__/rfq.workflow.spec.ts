// Unit tests — RFQ Temporal Workflow (Phase 5)
// Uses @temporalio/testing TestWorkflowEnvironment for deterministic workflow execution.
// Focus: all state transitions, cancellation compensation, deadline expiry.
// Rule 30: uses jest.useFakeTimers / jest.useRealTimers + jest.runAllTimersAsync for async timers.

import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import {
  rfqWorkflow,
  publishRfqSignal,
  closeRfqSignal,
  awardRfqSignal,
  cancelRfqSignal,
} from '../workflows/rfq.workflow';
import type { RfqWorkflowParams } from '../workflows/rfq.workflow';

// ── Mock activities ────────────────────────────────────────────────────────

const mockUpdateRfqStatus = jest.fn().mockResolvedValue(undefined);
const mockMarkQuotationsEvaluated = jest.fn().mockResolvedValue(undefined);

const mockActivities = {
  updateRfqStatus: mockUpdateRfqStatus,
  markQuotationsEvaluated: mockMarkQuotationsEvaluated,
};

// ── Helpers ────────────────────────────────────────────────────────────────

const baseParams: RfqWorkflowParams = {
  rfq_id: 'rfq-uuid-001',
  tenant_id: 'tenant-uuid-001',
  correlation_id: 'corr-uuid-001',
  deadline_ms: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days from now
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('RFQ Workflow — state transitions', () => {
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  });

  afterAll(async () => {
    await testEnv.teardown();
  });

  beforeEach(async () => {
    mockUpdateRfqStatus.mockClear();
    mockMarkQuotationsEvaluated.mockClear();
    // Fresh worker per test — runUntil() shuts down the worker on completion,
    // so each test needs its own instance.
    worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: 'test-rfq',
      workflowsPath: require.resolve('../workflows/rfq.workflow'),
      activities: mockActivities,
    });
  });

  it('DRAFT → PUBLISHED → CLOSED → EVALUATED → AWARDED (happy path)', async () => {
    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(rfqWorkflow, {
        taskQueue: 'test-rfq',
        workflowId: 'rfq-test-1',
        args: [{ ...baseParams, deadline_ms: Date.now() + 1000 }],
      });

      // Signal: publish
      await handle.signal(publishRfqSignal, { actor_id: 'user-001' });

      // Skip time past deadline → auto-close
      await testEnv.sleep('2s');

      // Signal: award (after evaluation)
      await handle.signal(awardRfqSignal, { actor_id: 'user-001', quotation_id: 'quot-001' });

      await handle.result();

      // Verify activity call sequence
      expect(mockUpdateRfqStatus).toHaveBeenCalledWith(expect.any(Object), 'DRAFT', 'PUBLISHED');
      expect(mockUpdateRfqStatus).toHaveBeenCalledWith(expect.any(Object), 'PUBLISHED', 'CLOSED');
      expect(mockMarkQuotationsEvaluated).toHaveBeenCalledTimes(1);
      expect(mockUpdateRfqStatus).toHaveBeenCalledWith(expect.any(Object), 'EVALUATED', 'AWARDED');
    });
  });

  it('DRAFT → cancelled before publish', async () => {
    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(rfqWorkflow, {
        taskQueue: 'test-rfq',
        workflowId: 'rfq-test-2',
        args: [baseParams],
      });

      await handle.signal(cancelRfqSignal, { actor_id: 'user-001' });
      await handle.result();

      expect(mockUpdateRfqStatus).toHaveBeenCalledWith(expect.any(Object), 'DRAFT', 'CANCELLED');
      expect(mockMarkQuotationsEvaluated).not.toHaveBeenCalled();
    });
  });

  it('EVALUATED → CANCELLED (cancellation at evaluated stage)', async () => {
    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(rfqWorkflow, {
        taskQueue: 'test-rfq',
        workflowId: 'rfq-test-3',
        args: [{ ...baseParams, deadline_ms: Date.now() + 100 }],
      });

      await handle.signal(publishRfqSignal, { actor_id: 'user-001' });
      await testEnv.sleep('200ms');

      // At this point: CLOSED → EVALUATED (auto). Now cancel.
      await handle.signal(cancelRfqSignal, { actor_id: 'user-001' });
      await handle.result();

      expect(mockUpdateRfqStatus).toHaveBeenCalledWith(
        expect.any(Object),
        'EVALUATED',
        'CANCELLED',
      );
    });
  });

  it('manual close before deadline', async () => {
    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(rfqWorkflow, {
        taskQueue: 'test-rfq',
        workflowId: 'rfq-test-4',
        args: [{ ...baseParams, deadline_ms: Date.now() + 60_000 }],
      });

      await handle.signal(publishRfqSignal, { actor_id: 'user-001' });
      // publishRfqSignal handler is async (awaits activity) — wait for it to complete
      // before sending close, otherwise close arrives while status is still 'DRAFT' and is dropped.
      await testEnv.sleep('100ms');
      await handle.signal(closeRfqSignal, { actor_id: 'user-001' });

      await testEnv.sleep('100ms');

      await handle.signal(awardRfqSignal, { actor_id: 'user-001', quotation_id: 'quot-001' });
      await handle.result();

      expect(mockUpdateRfqStatus).toHaveBeenCalledWith(expect.any(Object), 'PUBLISHED', 'CLOSED');
    });
  });
});
