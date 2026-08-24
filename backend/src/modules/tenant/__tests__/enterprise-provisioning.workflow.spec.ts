import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import {
  enterpriseProvisioningWorkflow,
  approveSignal,
  abortSignal,
  workflowStateQuery,
} from '../workflows/enterprise-provisioning.workflow';
import type { EnterpriseProvisioningParams } from '../workflows/enterprise-provisioning.workflow';

// ── Mock activities ────────────────────────────────────────────────────────

const mockCreateRds = jest
  .fn()
  .mockResolvedValue({ rdsEndpoint: 'cos-tenant-acme-prod.xxx.rds.amazonaws.com' });
const mockRunMigrations = jest.fn().mockResolvedValue(undefined);
// Added by security review F9 and, until 2026-08-04, called by the workflow but never registered
// here. An unregistered activity is not a fast failure: the worker rejects the task, Temporal retries
// it under the activity retry policy, and the workflow simply never advances — so both tests failed
// on `expect(state).toBe('AWAITING_APPROVAL')` with the state stuck wherever it was last set. The
// assertion that fails is nowhere near the cause, which is why the loop below names the state it got.
const mockSecureAppUser = jest.fn().mockResolvedValue(undefined);
const mockAssignDedicatedDb = jest.fn().mockResolvedValue(undefined);
const mockNotifyAwaitingApproval = jest.fn().mockResolvedValue(undefined);
const mockCompensateAssignDedicatedDb = jest.fn().mockResolvedValue(undefined);
const mockCompensateCreateRds = jest.fn().mockResolvedValue(undefined);
const mockMigrateData = jest.fn().mockResolvedValue(undefined);
const mockVerifyRouting = jest.fn().mockResolvedValue(undefined);
const mockProvisionKafkaTopics = jest.fn().mockResolvedValue(undefined);
const mockEmitProvisionedEvent = jest.fn().mockResolvedValue(undefined);

const mockActivities = {
  createRdsActivity: mockCreateRds,
  runMigrationsActivity: mockRunMigrations,
  secureAppUserActivity: mockSecureAppUser,
  assignDedicatedDbActivity: mockAssignDedicatedDb,
  notifyAwaitingApprovalActivity: mockNotifyAwaitingApproval,
  compensateAssignDedicatedDbActivity: mockCompensateAssignDedicatedDb,
  compensateCreateRdsActivity: mockCompensateCreateRds,
  migrateDataActivity: mockMigrateData,
  verifyRoutingActivity: mockVerifyRouting,
  provisionKafkaTopicsActivity: mockProvisionKafkaTopics,
  emitProvisionedEventActivity: mockEmitProvisionedEvent,
};

const baseParams: EnterpriseProvisioningParams = {
  tenantId: '550e8400-e29b-41d4-a716-446655440000',
  contractReference: 'CRM-2026-001',
  actorId: 'admin-user-id',
};

/**
 * Poll the state query until the workflow reaches `expected`.
 *
 * Replaces `await testEnv.sleep('1s')`, which measured the WRONG CLOCK. `testEnv.sleep` advances
 * WORKFLOW time and returns near-instantly on a time-skipping server, while the activities in front
 * of AWAITING_APPROVAL are dispatched to a real worker and take wall-clock time. The old assertion
 * was therefore racing activity execution even when every activity was registered.
 *
 * On timeout it reports the state it actually reached, which is the diagnostic the missing-activity
 * failure never gave: "stuck at RUNNING_MIGRATIONS" points straight at the activity in that step.
 */
async function waitForState(
  handle: { query: (q: typeof workflowStateQuery) => Promise<string> },
  expected: string,
  timeoutMs = 20_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let state = await handle.query(workflowStateQuery);
  while (state !== expected && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    state = await handle.query(workflowStateQuery);
  }
  if (state !== expected) {
    throw new Error(
      `Workflow never reached ${expected} within ${timeoutMs}ms — stuck at ${state}. ` +
        'A state that never advances usually means an activity the workflow calls is missing from ' +
        'mockActivities: the worker rejects the task and Temporal retries it indefinitely.',
    );
  }
  return state;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('EnterpriseProvisioningWorkflow', () => {
  let testEnv: TestWorkflowEnvironment;
  let worker: Worker;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  });

  afterAll(async () => {
    await testEnv.teardown();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: 'test-enterprise-provisioning',
      workflowsPath: require.resolve('../workflows/enterprise-provisioning.workflow'),
      activities: mockActivities,
    });
  });

  it('happy path — approve signal → all 5 activities execute → COMPLETED', async () => {
    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(enterpriseProvisioningWorkflow, {
        taskQueue: 'test-enterprise-provisioning',
        workflowId: 'ep-test-happy',
        args: [baseParams],
      });

      // Wait until the workflow pauses at AWAITING_APPROVAL (after the pre-approval activities).
      expect(await waitForState(handle, 'AWAITING_APPROVAL')).toBe('AWAITING_APPROVAL');

      // Verify the pre-approval activities ran
      expect(mockCreateRds).toHaveBeenCalledWith({ tenantId: baseParams.tenantId });
      expect(mockRunMigrations).toHaveBeenCalledWith({
        tenantId: baseParams.tenantId,
        rdsEndpoint: 'cos-tenant-acme-prod.xxx.rds.amazonaws.com',
      });
      // F9: the app_user password that `prisma migrate deploy` sets is the one published in the git
      // history, so it MUST be replaced before the connection URL is stored. Asserted explicitly —
      // this step being absent from the mocks is what broke this suite, and an unasserted step is
      // one that can be dropped from the workflow without any test noticing.
      expect(mockSecureAppUser).toHaveBeenCalledWith({
        tenantId: baseParams.tenantId,
        rdsEndpoint: 'cos-tenant-acme-prod.xxx.rds.amazonaws.com',
      });
      expect(mockAssignDedicatedDb).toHaveBeenCalledWith({
        tenantId: baseParams.tenantId,
        rdsEndpoint: 'cos-tenant-acme-prod.xxx.rds.amazonaws.com',
      });
      expect(mockNotifyAwaitingApproval).toHaveBeenCalledWith({ tenantId: baseParams.tenantId });

      // SYSTEM_ADMIN approves
      await handle.signal(approveSignal);
      await handle.result();

      expect(mockMigrateData).toHaveBeenCalledWith({
        tenantId: baseParams.tenantId,
        rdsEndpoint: 'cos-tenant-acme-prod.xxx.rds.amazonaws.com',
      });
      expect(mockVerifyRouting).toHaveBeenCalledWith({
        tenantId: baseParams.tenantId,
        rdsEndpoint: 'cos-tenant-acme-prod.xxx.rds.amazonaws.com',
      });
      expect(mockProvisionKafkaTopics).toHaveBeenCalledWith({ tenantId: baseParams.tenantId });
      expect(mockEmitProvisionedEvent).toHaveBeenCalledWith({
        tenantId: baseParams.tenantId,
        rdsEndpoint: 'cos-tenant-acme-prod.xxx.rds.amazonaws.com',
      });

      // Compensation must NOT run on happy path
      expect(mockCompensateAssignDedicatedDb).not.toHaveBeenCalled();
      expect(mockCompensateCreateRds).not.toHaveBeenCalled();
    });
  });

  it('abort path — abort signal → compensation runs, activities 4-5 do NOT run', async () => {
    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(enterpriseProvisioningWorkflow, {
        taskQueue: 'test-enterprise-provisioning',
        workflowId: 'ep-test-abort',
        args: [baseParams],
      });

      expect(await waitForState(handle, 'AWAITING_APPROVAL')).toBe('AWAITING_APPROVAL');

      // SYSTEM_ADMIN aborts
      await handle.signal(abortSignal);
      await handle.result();

      // Activities 4-6 must NOT run
      expect(mockMigrateData).not.toHaveBeenCalled();
      expect(mockVerifyRouting).not.toHaveBeenCalled();
      expect(mockProvisionKafkaTopics).not.toHaveBeenCalled();
      expect(mockEmitProvisionedEvent).not.toHaveBeenCalled();

      // Compensation must run — unassign the dedicated DB, then delete the orphaned RDS instance.
      expect(mockCompensateAssignDedicatedDb).toHaveBeenCalledWith({
        tenantId: baseParams.tenantId,
      });
      expect(mockCompensateCreateRds).toHaveBeenCalledWith({
        tenantId: baseParams.tenantId,
      });
    });
  });
});
