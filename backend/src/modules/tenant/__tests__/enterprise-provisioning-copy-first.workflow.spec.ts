// D48 (2026-11-13) moved the routing switch after the approval and the copy, behind
// patched('copy-before-switch'). A run parks at AWAITING_APPROVAL with no timeout, so on any deploy there
// can be executions whose history was written by the OLD code — with routing already switched before the
// wait. Moving an activity changes the command sequence, which fails replay unless the old path is kept.
// Measured here, with the method of enterprise-provisioning-query-rename.workflow.spec.ts:
//
//   1. start an execution on the frozen pre-D48 code and drive it to AWAITING_APPROVAL
//   2. stop that worker; start one on the CURRENT code, same task queue
//   3. approve it: it finishes the OLD way (no pause, the copy after the switch it already made) and
//      completes, without a nondeterminism error
//   4. replay the recorded history offline against the current code — no nondeterminism error
//   5. a run started on the current code takes the new path (pause → copy → switch → verify → resume)

import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

const TASK_QUEUE = 'test-enterprise-provisioning-copy-first';
const order: string[] = [];
const record =
  (name: string, result?: unknown) =>
  (...args: unknown[]): Promise<unknown> => {
    const a = args[0] as { active?: boolean } | undefined;
    order.push(name === 'setTenantActive' ? `${name}(${a?.active})` : name);
    return Promise.resolve(result);
  };

const activities = {
  createRdsActivity: record('createRds', {
    rdsEndpoint: 'cos-tenant-acme-prod.xxx.rds.amazonaws.com',
    masterSecretArn: 'arn:aws:secretsmanager:ap-southeast-1:000000000000:secret:test',
  }),
  runMigrationsActivity: record('runMigrations'),
  secureAppUserActivity: record('secureAppUser'),
  assignDedicatedDbActivity: record('assignDedicatedDb'),
  notifyAwaitingApprovalActivity: record('notifyAwaitingApproval'),
  compensateAssignDedicatedDbActivity: record('compensateAssignDedicatedDb'),
  compensateCreateRdsActivity: record('compensateCreateRds'),
  migrateDataActivity: record('migrateData'),
  verifyRoutingActivity: record('verifyRouting'),
  provisionKafkaTopicsActivity: record('provisionKafkaTopics'),
  emitProvisionedEventActivity: record('emitProvisionedEvent'),
  getTenantActiveActivity: record('getTenantActive', true),
  setTenantActiveActivity: record('setTenantActive'),
  replayPausedEventsActivity: record('replayPausedEvents', 0),
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

const CURRENT = require.resolve('../workflows/enterprise-provisioning.workflow');

describe('EnterpriseProvisioningWorkflow — routing moved after the copy while a run is in flight', () => {
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  });

  afterAll(async () => {
    await testEnv.teardown();
  });

  beforeEach(() => {
    order.length = 0;
  });

  it('a run parked on the pre-D48 code finishes the old way on the new code, and replays', async () => {
    const workflowId = 'ep-copy-first-in-flight';

    // 1 — the OLD code: routing switched before the wait.
    const oldWorker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: TASK_QUEUE,
      workflowsPath: require.resolve('./fixtures/enterprise-provisioning-pre-copy-first.workflow'),
      activities,
      // No sticky cache, so the new worker gets the next task at once (see the query-rename spec).
      maxCachedWorkflows: 0,
    });
    const handle = await oldWorker.runUntil(async () => {
      const h = await testEnv.client.workflow.start('enterpriseProvisioningWorkflow', {
        taskQueue: TASK_QUEUE,
        workflowId,
        args: [PARAMS],
      });
      expect(await waitFor(() => h.query<string>('workflowState'), 'AWAITING_APPROVAL')).toBe(
        'AWAITING_APPROVAL',
      );
      return h;
    });
    expect(order).toContain('assignDedicatedDb');

    // 2 + 3 — the NEW code picks it up and is approved.
    const newWorker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: TASK_QUEUE,
      workflowsPath: CURRENT,
      activities,
    });
    order.length = 0;
    await newWorker.runUntil(async () => {
      await handle.signal('approve');
      await handle.result();
      expect(await handle.query<string>('workflowState')).toBe('COMPLETED');
    });
    // The old path: no pause, no second switch.
    expect(order).toEqual([
      'migrateData',
      'verifyRouting',
      'provisionKafkaTopics',
      'emitProvisionedEvent',
    ]);

    // 4 — the whole history, begun on the old code and finished on the new, replays on the new code.
    const history = await handle.fetchHistory();
    await expect(
      Worker.runReplayHistory({ workflowsPath: CURRENT }, history, workflowId),
    ).resolves.toBeUndefined();
  });

  it('a run started on the new code takes the new path', async () => {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: TASK_QUEUE,
      workflowsPath: CURRENT,
      activities,
    });
    await worker.runUntil(async () => {
      const h = await testEnv.client.workflow.start('enterpriseProvisioningWorkflow', {
        taskQueue: TASK_QUEUE,
        workflowId: 'ep-copy-first-new',
        args: [PARAMS],
      });
      await waitFor(() => h.query<string>('workflowState'), 'AWAITING_APPROVAL');
      await h.signal('approve');
      await h.result();
    });
    expect(order).toEqual([
      'createRds',
      'runMigrations',
      'secureAppUser',
      'notifyAwaitingApproval',
      'getTenantActive',
      'setTenantActive(false)',
      'migrateData',
      'assignDedicatedDb',
      'verifyRouting',
      'setTenantActive(true)',
      'replayPausedEvents',
      'provisionKafkaTopics',
      'emitProvisionedEvent',
    ]);
  });
});
