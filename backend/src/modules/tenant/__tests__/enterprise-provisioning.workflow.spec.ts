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

      // Wait until workflow pauses at AWAITING_APPROVAL (after activities 1-3)
      await testEnv.sleep('1s');
      const state = await handle.query(workflowStateQuery);
      expect(state).toBe('AWAITING_APPROVAL');

      // Verify activities 1-3 ran
      expect(mockCreateRds).toHaveBeenCalledWith({ tenantId: baseParams.tenantId });
      expect(mockRunMigrations).toHaveBeenCalledWith({
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

      await testEnv.sleep('1s');
      const state = await handle.query(workflowStateQuery);
      expect(state).toBe('AWAITING_APPROVAL');

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
