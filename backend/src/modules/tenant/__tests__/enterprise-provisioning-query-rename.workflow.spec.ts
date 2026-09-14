// The query rename 'state' → 'workflowState' (§34.3, product-owner decision 2026-09-14), proven safe
// for a run that was already in flight when the worker was redeployed.
//
// WHY THIS NEEDS ITS OWN TEST. A provisioning run parks at AWAITING_APPROVAL with no timeout, so on
// any deploy there can be executions whose history was written by the OLD code. Temporal's docs say
// "Sending a Query doesn't add events to a Workflow's Event History", which suggests a renamed query
// handler cannot break replay — but they do not say that an in-flight execution answers the new
// name once a new worker picks it up. That is measured here rather than assumed:
//
//   1. start an execution on the frozen pre-rename code and drive it to AWAITING_APPROVAL
//   2. stop that worker; start one on the CURRENT code, same task queue
//   3. query `workflowState` — answered by the new worker replaying the old history
//   4. approve it, and the run completes on the new code
//   5. replay the recorded history offline against the current code — no nondeterminism error

import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

const TASK_QUEUE = 'test-enterprise-provisioning-rename';

const activities = {
  createRdsActivity: jest.fn().mockResolvedValue({
    rdsEndpoint: 'cos-tenant-acme-prod.xxx.rds.amazonaws.com',
    masterSecretArn: 'arn:aws:secretsmanager:ap-southeast-1:000000000000:secret:test',
  }),
  runMigrationsActivity: jest.fn().mockResolvedValue(undefined),
  secureAppUserActivity: jest.fn().mockResolvedValue(undefined),
  assignDedicatedDbActivity: jest.fn().mockResolvedValue(undefined),
  notifyAwaitingApprovalActivity: jest.fn().mockResolvedValue(undefined),
  compensateAssignDedicatedDbActivity: jest.fn().mockResolvedValue(undefined),
  compensateCreateRdsActivity: jest.fn().mockResolvedValue(undefined),
  migrateDataActivity: jest.fn().mockResolvedValue(undefined),
  verifyRoutingActivity: jest.fn().mockResolvedValue(undefined),
  provisionKafkaTopicsActivity: jest.fn().mockResolvedValue(undefined),
  emitProvisionedEventActivity: jest.fn().mockResolvedValue(undefined),
};

const PARAMS = {
  tenantId: '550e8400-e29b-41d4-a716-446655440000',
  contractReference: 'CRM-2026-001',
  actorId: 'admin-user-id',
};

async function waitFor(
  read: () => Promise<string>,
  expected: string,
  timeoutMs = 20_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (value !== expected && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    value = await read();
  }
  return value;
}

describe('EnterpriseProvisioningWorkflow — query renamed while a run is in flight', () => {
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  });

  afterAll(async () => {
    await testEnv.teardown();
  });

  it('an execution started on the old code answers workflowState on the new code, and completes', async () => {
    const workflowId = 'ep-rename-in-flight';

    // 1 — the OLD code, which registered the query as 'state'.
    const oldWorker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: TASK_QUEUE,
      workflowsPath: require.resolve('./fixtures/enterprise-provisioning-pre-rename.workflow'),
      activities,
      // No workflow cache on the old worker, so it holds no sticky queue for this execution. With a
      // cache, the first task after this worker stops waited ~89 s (measured 2026-09-14) before the
      // new worker received it. The new worker still replays the old history from the start either
      // way, which is exactly the property under test.
      maxCachedWorkflows: 0,
    });
    const handle = await oldWorker.runUntil(async () => {
      const h = await testEnv.client.workflow.start('enterpriseProvisioningWorkflow', {
        taskQueue: TASK_QUEUE,
        workflowId,
        args: [PARAMS],
      });
      const reached = await waitFor(() => h.query<string>('state'), 'AWAITING_APPROVAL');
      expect(reached).toBe('AWAITING_APPROVAL');
      return h;
    });

    // 2 + 3 + 4 — a NEW worker on the current code picks up the same execution.
    const newWorker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: TASK_QUEUE,
      workflowsPath: require.resolve('../workflows/enterprise-provisioning.workflow'),
      activities,
    });
    await newWorker.runUntil(async () => {
      expect(await handle.query<string>('workflowState')).toBe('AWAITING_APPROVAL');
      await handle.signal('approve');
      await handle.result();
      expect(await handle.query<string>('workflowState')).toBe('COMPLETED');
    });

    // 5 — the full history, begun on the old code and finished on the new, replays on the new code.
    const history = await handle.fetchHistory();
    await expect(
      Worker.runReplayHistory(
        { workflowsPath: require.resolve('../workflows/enterprise-provisioning.workflow') },
        history,
        workflowId,
      ),
    ).resolves.toBeUndefined();
  });
});
