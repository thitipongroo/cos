import {
  proxyActivities,
  condition,
  setHandler,
  defineSignal,
  defineQuery,
  log,
} from '@temporalio/workflow';
import type {
  createRdsActivity,
  runMigrationsActivity,
  assignDedicatedDbActivity,
  notifyAwaitingApprovalActivity,
  compensateAssignDedicatedDbActivity,
  migrateDataActivity,
  verifyRoutingActivity,
  emitProvisionedEventActivity,
} from './enterprise-provisioning.activities';

const acts = proxyActivities<{
  createRdsActivity: typeof createRdsActivity;
  runMigrationsActivity: typeof runMigrationsActivity;
  assignDedicatedDbActivity: typeof assignDedicatedDbActivity;
  notifyAwaitingApprovalActivity: typeof notifyAwaitingApprovalActivity;
  compensateAssignDedicatedDbActivity: typeof compensateAssignDedicatedDbActivity;
  migrateDataActivity: typeof migrateDataActivity;
  verifyRoutingActivity: typeof verifyRoutingActivity;
  emitProvisionedEventActivity: typeof emitProvisionedEventActivity;
}>({
  startToCloseTimeout: '30m',
  retry: { maximumAttempts: 3, initialInterval: '10s', backoffCoefficient: 2 },
});

export interface EnterpriseProvisioningParams {
  tenantId: string;
  contractReference: string | null;
  actorId: string;
}

export const approveSignal = defineSignal<[void]>('approve');
export const abortSignal = defineSignal<[void]>('abort');
export const workflowStateQuery = defineQuery<string>('state');

export async function enterpriseProvisioningWorkflow(
  params: EnterpriseProvisioningParams,
): Promise<void> {
  let state = 'CREATING_RDS';
  setHandler(workflowStateQuery, () => state);

  // Activity 1 — createRdsActivity
  log.info('enterprise-provisioning: creating RDS instance', { tenantId: params.tenantId });
  const { rdsEndpoint } = await acts.createRdsActivity({ tenantId: params.tenantId });
  state = 'RUNNING_MIGRATIONS';

  // Activity 2 — runMigrationsActivity
  log.info('enterprise-provisioning: running migrations', {
    tenantId: params.tenantId,
    rdsEndpoint,
  });
  await acts.runMigrationsActivity({ tenantId: params.tenantId, rdsEndpoint });
  state = 'ASSIGNING_DB';

  // Activity 3 — assignDedicatedDbActivity
  await acts.assignDedicatedDbActivity({ tenantId: params.tenantId, rdsEndpoint });
  state = 'AWAITING_APPROVAL';

  // HUMAN GATE — notify SYSTEM_ADMIN, wait indefinitely for approve or abort signal
  log.info('enterprise-provisioning: awaiting SYSTEM_ADMIN approval for data migration', {
    tenantId: params.tenantId,
  });
  await acts.notifyAwaitingApprovalActivity({ tenantId: params.tenantId });

  let approved = false;
  let aborted = false;
  setHandler(approveSignal, () => {
    approved = true;
  });
  setHandler(abortSignal, () => {
    aborted = true;
  });

  await condition(() => approved || aborted);

  if (aborted) {
    log.warn('enterprise-provisioning: aborted by SYSTEM_ADMIN — compensating', {
      tenantId: params.tenantId,
    });
    state = 'ABORTING';
    await acts.compensateAssignDedicatedDbActivity({ tenantId: params.tenantId });
    state = 'ABORTED';
    return;
  }

  // Activity 4 — migrateDataActivity (conditional: skipped if no existing domain data)
  state = 'MIGRATING_DATA';
  log.info('enterprise-provisioning: migrating data from shared DB', { tenantId: params.tenantId });
  await acts.migrateDataActivity({ tenantId: params.tenantId, rdsEndpoint });
  state = 'VERIFYING';

  // Activity 5 — verifyRoutingActivity
  log.info('enterprise-provisioning: verifying routing to dedicated DB', {
    tenantId: params.tenantId,
  });
  await acts.verifyRoutingActivity({ tenantId: params.tenantId, rdsEndpoint });

  // Emit platform.enterprise.db_provisioned.v1
  await acts.emitProvisionedEventActivity({ tenantId: params.tenantId, rdsEndpoint });
  state = 'COMPLETED';
  log.info('enterprise-provisioning: completed', { tenantId: params.tenantId, rdsEndpoint });
}
