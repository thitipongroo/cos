import {
  CancellationScope,
  proxyActivities,
  condition,
  setHandler,
  defineSignal,
  defineQuery,
  log,
  patched,
} from '@temporalio/workflow';
import type {
  createRdsActivity,
  runMigrationsActivity,
  secureAppUserActivity,
  assignDedicatedDbActivity,
  notifyAwaitingApprovalActivity,
  compensateAssignDedicatedDbActivity,
  compensateCreateRdsActivity,
  migrateDataActivity,
  verifyRoutingActivity,
  provisionKafkaTopicsActivity,
  emitProvisionedEventActivity,
  getTenantActiveActivity,
  setTenantActiveActivity,
} from './enterprise-provisioning.activities';

const acts = proxyActivities<{
  createRdsActivity: typeof createRdsActivity;
  runMigrationsActivity: typeof runMigrationsActivity;
  secureAppUserActivity: typeof secureAppUserActivity;
  assignDedicatedDbActivity: typeof assignDedicatedDbActivity;
  notifyAwaitingApprovalActivity: typeof notifyAwaitingApprovalActivity;
  compensateAssignDedicatedDbActivity: typeof compensateAssignDedicatedDbActivity;
  compensateCreateRdsActivity: typeof compensateCreateRdsActivity;
  migrateDataActivity: typeof migrateDataActivity;
  verifyRoutingActivity: typeof verifyRoutingActivity;
  provisionKafkaTopicsActivity: typeof provisionKafkaTopicsActivity;
  emitProvisionedEventActivity: typeof emitProvisionedEventActivity;
  getTenantActiveActivity: typeof getTenantActiveActivity;
  setTenantActiveActivity: typeof setTenantActiveActivity;
}>({
  startToCloseTimeout: '30m',
  retry: { maximumAttempts: 3, initialInterval: '10s', backoffCoefficient: 2 },
});

// The data copy on its own options (D48, 2026-11-13): its length grows with the tenant, so 30 minutes is
// no bound for it. It heartbeats per table and per streamed chunk; a worker that dies or hangs without
// heartbeating is noticed after heartbeatTimeout, and the attempt it was running is cancelled through the
// heartbeat (the copy rolls back). The activity also heartbeats on a timer, so a query that hangs (rather
// than a worker) is not caught by heartbeatTimeout: TCP keepalive on its connections catches a dead peer,
// and 24 h — an outer limit chosen, not measured — bounds the rest.
const copyActs = proxyActivities<{ migrateDataActivity: typeof migrateDataActivity }>({
  startToCloseTimeout: '24h',
  heartbeatTimeout: '2m',
  retry: { maximumAttempts: 3, initialInterval: '10s', backoffCoefficient: 2 },
});

// Putting a tenant back (D49) and resuming it must not give up: either one failing for good would leave
// the tenant refused (is_active false) with nobody told. These retry until they succeed, backing off to
// one attempt every 10 minutes; a run stuck there shows RESTORING or RESUMING_TENANT.
const restoreActs = proxyActivities<{
  compensateAssignDedicatedDbActivity: typeof compensateAssignDedicatedDbActivity;
  setTenantActiveActivity: typeof setTenantActiveActivity;
}>({
  startToCloseTimeout: '5m',
  retry: { initialInterval: '10s', backoffCoefficient: 2, maximumInterval: '10m' },
});

/**
 * D48 (2026-11-13): routing switches after the approval and the copy, with the tenant paused, instead of
 * before the approval wait. A run whose history was written before this change (parked at
 * AWAITING_APPROVAL with routing already switched) replays and finishes the old way.
 */
export const COPY_BEFORE_SWITCH_PATCH = 'copy-before-switch';

export interface EnterpriseProvisioningParams {
  tenantId: string;
  contractReference: string | null;
  actorId: string;
}

export const approveSignal = defineSignal<[void]>('approve');
export const abortSignal = defineSignal<[void]>('abort');
// Named per §34.3 ("Query: `workflowState`") since 2026-09-14; it was registered as 'state' until then.
// An execution already parked at AWAITING_APPROVAL answers the new name once a worker on this code picks
// it up — measured, not assumed, by enterprise-provisioning-query-rename.workflow.spec.ts.
export const workflowStateQuery = defineQuery<string>('workflowState');

export async function enterpriseProvisioningWorkflow(
  params: EnterpriseProvisioningParams,
): Promise<void> {
  let state = 'CREATING_RDS';
  setHandler(workflowStateQuery, () => state);

  // Activity 1 — createRdsActivity
  log.info('enterprise-provisioning: creating RDS instance', { tenantId: params.tenantId });
  const { rdsEndpoint, masterSecretArn } = await acts.createRdsActivity({
    tenantId: params.tenantId,
  });
  state = 'RUNNING_MIGRATIONS';

  // Activity 2 — runMigrationsActivity
  log.info('enterprise-provisioning: running migrations', {
    tenantId: params.tenantId,
    rdsEndpoint,
  });
  await acts.runMigrationsActivity({ tenantId: params.tenantId, rdsEndpoint, masterSecretArn });
  // Activity 2b — secureAppUserActivity (security review F9). `prisma migrate deploy` above runs
  // 20260623000001_app_user_login_and_grants, which sets app_user's password to a value committed in
  // git. Replace it from Secrets Manager before the connection URL is stored and used.
  log.info('enterprise-provisioning: securing app_user credential', { tenantId: params.tenantId });
  await acts.secureAppUserActivity({ tenantId: params.tenantId, rdsEndpoint, masterSecretArn });

  const copyFirst = patched(COPY_BEFORE_SWITCH_PATCH);
  if (!copyFirst) {
    // Before D48: Activity 3 — assignDedicatedDbActivity, ahead of the approval wait.
    state = 'ASSIGNING_DB';
    await acts.assignDedicatedDbActivity({
      tenantId: params.tenantId,
      rdsEndpoint,
      masterSecretArn,
    });
  }
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
    // Compensate in reverse order (§Phase 25 compensation table): unassign the dedicated DB (assigned
    // before the wait only on the pre-D48 path), then delete the RDS instance so an aborted provisioning
    // leaves no orphaned instance running.
    if (!copyFirst) {
      await acts.compensateAssignDedicatedDbActivity({ tenantId: params.tenantId });
    }
    await acts.compensateCreateRdsActivity({ tenantId: params.tenantId });
    state = 'ABORTED';
    return;
  }

  const db = { tenantId: params.tenantId, rdsEndpoint, masterSecretArn };
  if (copyFirst) {
    await pauseCopySwitchVerifyResume(db, (s) => (state = s));
  } else {
    // Before D48: Activity 4 — migrateDataActivity (conditional: skipped if no existing domain data)
    state = 'MIGRATING_DATA';
    log.info('enterprise-provisioning: migrating data from shared DB', {
      tenantId: params.tenantId,
    });
    await acts.migrateDataActivity(db);
    state = 'VERIFYING';

    // Activity 5 — verifyRoutingActivity
    log.info('enterprise-provisioning: verifying routing to dedicated DB', {
      tenantId: params.tenantId,
    });
    await acts.verifyRoutingActivity(db);
  }

  // Activity 6 — provision the tenant's per-tenant Kafka topics (§7.3) before go-live
  state = 'PROVISIONING_TOPICS';
  log.info('enterprise-provisioning: provisioning Kafka topics', { tenantId: params.tenantId });
  await acts.provisionKafkaTopicsActivity({ tenantId: params.tenantId });

  // Emit platform.enterprise.db_provisioned.v1
  await acts.emitProvisionedEventActivity({
    tenantId: params.tenantId,
    rdsEndpoint,
    masterSecretArn,
  });
  state = 'COMPLETED';
  log.info('enterprise-provisioning: completed', {
    tenantId: params.tenantId,
    rdsEndpoint,
    masterSecretArn,
  });
}

/**
 * D48: pause the tenant, copy its rows, switch routing, verify, resume — in that order, so nothing the
 * tenant writes through a request falls between the copy's snapshot and the switch.
 *
 * D49: if any of it fails (each activity has already used its retries), routing goes back to the shared
 * database and `is_active` back to what it was before the pause, then the original failure is rethrown
 * and the run fails. The shared database was never changed, so the tenant is back where it started; the
 * dedicated database and its RDS instance stay for SYSTEM_ADMIN to decide (the copy has no automatic
 * rollback — master:5744).
 */
async function pauseCopySwitchVerifyResume(
  db: { tenantId: string; rdsEndpoint: string; masterSecretArn: string },
  setState: (state: string) => void,
): Promise<void> {
  const tenant = { tenantId: db.tenantId };
  setState('PAUSING_TENANT');
  // Read before writing, in its own activity, so a retried write cannot be mistaken for the prior state.
  let wasActive: boolean;
  try {
    wasActive = await acts.getTenantActiveActivity(tenant);
  } catch (err) {
    // Nothing has changed yet, so there is nothing to put back.
    setState('RESTORED');
    throw err;
  }
  try {
    log.info('enterprise-provisioning: pausing tenant for the copy', { ...tenant, wasActive });
    await acts.setTenantActiveActivity({ ...tenant, active: false });

    setState('MIGRATING_DATA');
    log.info('enterprise-provisioning: migrating data from shared DB', tenant);
    await copyActs.migrateDataActivity(db);

    setState('ASSIGNING_DB');
    await acts.assignDedicatedDbActivity(db);

    setState('VERIFYING');
    log.info('enterprise-provisioning: verifying routing to dedicated DB', tenant);
    await acts.verifyRoutingActivity(db);
  } catch (err) {
    setState('RESTORING');
    log.error('enterprise-provisioning: failed after the pause — restoring the tenant', {
      ...tenant,
      error: err instanceof Error ? err.message : String(err),
    });
    // Unassigning is idempotent and safe when nothing was assigned; whether the switch's UPDATE
    // committed before a failure is not knowable here, so it always runs. Both retry until they succeed
    // (restoreActs), and the run fails with the ORIGINAL error.
    // Non-cancellable: when the failure IS the run being cancelled (an operator, mid-copy), activities
    // scheduled in the cancelled scope would be rejected without an attempt and the tenant left refused.
    await CancellationScope.nonCancellable(async () => {
      await restoreActs.compensateAssignDedicatedDbActivity(tenant);
      await restoreActs.setTenantActiveActivity({ ...tenant, active: wasActive });
    });
    setState('RESTORED');
    throw err;
  }

  setState('RESUMING_TENANT');
  await CancellationScope.nonCancellable(() =>
    restoreActs.setTenantActiveActivity({ ...tenant, active: wasActive }),
  );
}
