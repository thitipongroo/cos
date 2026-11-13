import { ApplicationFailure } from '@temporalio/activity';
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
// D48: the tenant is paused for the copy and resumed after the switch.
const mockGetTenantActive = jest.fn().mockResolvedValue(true);
const mockSetTenantActive = jest.fn().mockResolvedValue(undefined);

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
  getTenantActiveActivity: mockGetTenantActive,
  setTenantActiveActivity: mockSetTenantActive,
};

/** The order the activities ran in, by name ("setTenantActive(false)" for the pause). */
function callOrder(): string[] {
  const named = Object.entries(mockActivities).flatMap(([name, fn]) =>
    fn.mock.calls.map((args, i) => ({
      at: fn.mock.invocationCallOrder[i]!,
      label:
        name === 'setTenantActiveActivity'
          ? `setTenantActive(${(args[0] as { active: boolean }).active})`
          : name.replace(/Activity$/, ''),
    })),
  );
  return named.sort((a, b) => a.at - b.at).map((c) => c.label);
}

const fails = (message: string) => () =>
  Promise.reject(ApplicationFailure.nonRetryable(message, 'TestFailure'));

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

  it('happy path — approve → pause, copy, switch, verify, resume, in that order → COMPLETED', async () => {
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
      // D48: routing does not switch before the approval — the tenant keeps the shared database while
      // the run waits, and writes nothing to the empty dedicated one.
      expect(mockAssignDedicatedDb).not.toHaveBeenCalled();
      expect(mockSetTenantActive).not.toHaveBeenCalled();
      expect(mockNotifyAwaitingApproval).toHaveBeenCalledWith({ tenantId: baseParams.tenantId });

      // SYSTEM_ADMIN approves
      await handle.signal(approveSignal);
      await handle.result();

      expect(callOrder()).toEqual([
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
        'provisionKafkaTopics',
        'emitProvisionedEvent',
      ]);
      expect(await handle.query(workflowStateQuery)).toBe('COMPLETED');
      expect(mockMigrateData).toHaveBeenCalledWith({
        tenantId: baseParams.tenantId,
        rdsEndpoint: 'cos-tenant-acme-prod.xxx.rds.amazonaws.com',
      });
      expect(mockAssignDedicatedDb).toHaveBeenCalledWith({
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

      // Compensation deletes the orphaned RDS instance. Nothing was assigned and the tenant was never
      // paused (D48), so neither is undone.
      expect(mockCompensateCreateRds).toHaveBeenCalledWith({
        tenantId: baseParams.tenantId,
      });
      expect(mockAssignDedicatedDb).not.toHaveBeenCalled();
      expect(mockCompensateAssignDedicatedDb).not.toHaveBeenCalled();
      expect(mockSetTenantActive).not.toHaveBeenCalled();
      expect(await handle.query(workflowStateQuery)).toBe('ABORTED');
    });
  });

  // D49: a failure after the pause puts the tenant back on the shared database, as active as it was.
  async function runToFailure(workflowId: string): Promise<{ error: unknown; state: string }> {
    return worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(enterpriseProvisioningWorkflow, {
        taskQueue: 'test-enterprise-provisioning',
        workflowId,
        args: [baseParams],
      });
      await waitForState(handle, 'AWAITING_APPROVAL');
      await handle.signal(approveSignal);
      const error = await handle.result().then(
        () => undefined,
        (e: unknown) => e,
      );
      return { error, state: await handle.query(workflowStateQuery) };
    });
  }

  afterEach(() => {
    mockMigrateData.mockReset().mockResolvedValue(undefined);
    mockVerifyRouting.mockReset().mockResolvedValue(undefined);
    mockGetTenantActive.mockReset().mockResolvedValue(true);
    mockCompensateAssignDedicatedDb.mockReset().mockResolvedValue(undefined);
    mockSetTenantActive.mockReset().mockResolvedValue(undefined);
  });

  /** The message of the activity failure a failed run carries. */
  const rootMessage = (error: unknown): string | undefined =>
    (error as { cause?: { cause?: { message?: string } } }).cause?.cause?.message;

  it('copy fails → no switch, tenant resumed, RESTORED, the run fails', async () => {
    mockMigrateData.mockImplementation(fails('copy broke'));
    const { error, state } = await runToFailure('ep-test-copy-fails');

    expect(error).toBeDefined();
    expect(state).toBe('RESTORED');
    expect(callOrder().slice(4)).toEqual([
      'getTenantActive',
      'setTenantActive(false)',
      'migrateData',
      'compensateAssignDedicatedDb',
      'setTenantActive(true)',
    ]);
    expect(mockAssignDedicatedDb).not.toHaveBeenCalled();
    expect(mockProvisionKafkaTopics).not.toHaveBeenCalled();
    expect(mockEmitProvisionedEvent).not.toHaveBeenCalled();
    // The dedicated database and its instance stay for SYSTEM_ADMIN (no automatic rollback of a copy).
    expect(mockCompensateCreateRds).not.toHaveBeenCalled();
  });

  it('verify fails after the switch → routing back to shared, tenant resumed, RESTORED', async () => {
    mockVerifyRouting.mockImplementation(fails('verify broke'));
    const { error, state } = await runToFailure('ep-test-verify-fails');

    expect(error).toBeDefined();
    expect(state).toBe('RESTORED');
    expect(callOrder().slice(4)).toEqual([
      'getTenantActive',
      'setTenantActive(false)',
      'migrateData',
      'assignDedicatedDb',
      'verifyRouting',
      'compensateAssignDedicatedDb',
      'setTenantActive(true)',
    ]);
  });

  const activeValuesSet = () =>
    mockSetTenantActive.mock.calls.map(([p]) => (p as { active: boolean }).active);

  it('a tenant already inactive before the run stays inactive after it', async () => {
    mockGetTenantActive.mockResolvedValue(false);
    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(enterpriseProvisioningWorkflow, {
        taskQueue: 'test-enterprise-provisioning',
        workflowId: 'ep-test-inactive-ok',
        args: [baseParams],
      });
      await waitForState(handle, 'AWAITING_APPROVAL');
      await handle.signal(approveSignal);
      await handle.result();
    });
    expect(activeValuesSet()).toEqual([false, false]);
  });

  it('a tenant already inactive before the run stays inactive after a restore', async () => {
    mockGetTenantActive.mockResolvedValue(false);
    mockMigrateData.mockImplementation(fails('copy broke'));
    const { state } = await runToFailure('ep-test-inactive-restore');
    expect(state).toBe('RESTORED');
    expect(activeValuesSet()).toEqual([false, false]);
  });

  it('reading is_active fails → nothing was changed, nothing is put back, RESTORED', async () => {
    mockGetTenantActive.mockImplementation(fails('platform db down'));
    const { error, state } = await runToFailure('ep-test-read-fails');
    expect(rootMessage(error)).toBe('platform db down');
    expect(state).toBe('RESTORED');
    expect(mockSetTenantActive).not.toHaveBeenCalled();
    expect(mockCompensateAssignDedicatedDb).not.toHaveBeenCalled();
    expect(mockMigrateData).not.toHaveBeenCalled();
  });

  it('putting the tenant back keeps retrying past failures, and the run fails with the original error', async () => {
    mockVerifyRouting.mockImplementation(fails('verify broke'));
    // Four failures: more than the three attempts every other activity gets.
    for (let i = 0; i < 4; i++) {
      mockCompensateAssignDedicatedDb.mockRejectedValueOnce(new Error('shared db blip'));
    }
    const { error, state } = await runToFailure('ep-test-restore-retries');
    expect(rootMessage(error)).toBe('verify broke');
    expect(state).toBe('RESTORED');
    expect(mockCompensateAssignDedicatedDb).toHaveBeenCalledTimes(5);
    expect(mockSetTenantActive.mock.calls.map(([p]) => (p as { active: boolean }).active)).toEqual([
      false,
      true,
    ]);
  });

  it('resuming the tenant keeps retrying past failures, and the run completes', async () => {
    mockSetTenantActive
      .mockResolvedValueOnce(undefined) // the pause
      .mockRejectedValueOnce(new Error('blip'))
      .mockRejectedValueOnce(new Error('blip'))
      .mockRejectedValueOnce(new Error('blip'));
    await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(enterpriseProvisioningWorkflow, {
        taskQueue: 'test-enterprise-provisioning',
        workflowId: 'ep-test-resume-retries',
        args: [baseParams],
      });
      await waitForState(handle, 'AWAITING_APPROVAL');
      await handle.signal(approveSignal);
      await handle.result();
      expect(await handle.query(workflowStateQuery)).toBe('COMPLETED');
    });
    expect(mockSetTenantActive).toHaveBeenCalledTimes(5);
  });

  it('the run cancelled mid-copy still puts the tenant back (non-cancellable restore)', async () => {
    // The activity outlives the cancel request (it does not heartbeat), as a real copy between heartbeats.
    mockMigrateData.mockImplementation(() => new Promise((r) => setTimeout(r, 1_500)));
    const state = await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(enterpriseProvisioningWorkflow, {
        taskQueue: 'test-enterprise-provisioning',
        workflowId: 'ep-test-cancelled-mid-copy',
        args: [baseParams],
      });
      await waitForState(handle, 'AWAITING_APPROVAL');
      await handle.signal(approveSignal);
      await waitForState(handle, 'MIGRATING_DATA');
      await handle.cancel();
      await expect(handle.result()).rejects.toThrow();
      return handle.query(workflowStateQuery);
    });
    expect(state).toBe('RESTORED');
    expect(mockCompensateAssignDedicatedDb).toHaveBeenCalledTimes(1);
    expect(mockSetTenantActive.mock.calls.map(([p]) => (p as { active: boolean }).active)).toEqual([
      false,
      true,
    ]);
    expect(mockAssignDedicatedDb).not.toHaveBeenCalled();
  });
});
