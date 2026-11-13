// Activity side of D52 (2026-11-13): turn "tenant inactive" into "paused — wait" or "inactive — stop".
//
// An activity that meets TenantInactiveError asks Temporal for the tenant's provisioning run state. If the
// run has the tenant paused, it fails with TENANT_PAUSED_FAILURE (non-retryable, so the WORKFLOW decides
// how long to wait rather than three quick activity retries); otherwise with TENANT_INACTIVE_FAILURE
// (non-retryable: a deactivated tenant is refused, D50). If the state cannot be read (no worker answers,
// a network error), the original error goes on — retried as before.

import { ApplicationFailure, getClient } from '@temporalio/activity';
import { WorkflowNotFoundError } from '@temporalio/client';
import { TenantInactiveError } from '../prisma/get-db-url';
import {
  PROVISIONING_PAUSED_STATES,
  TENANT_INACTIVE_FAILURE,
  TENANT_PAUSED_FAILURE,
  provisioningWorkflowId,
} from './provisioning-pause';

/** The provisioning run's `workflowState`, or null when the tenant has no run. */
export type ReadProvisioningState = (tenantId: string) => Promise<string | null>;

export const readProvisioningState: ReadProvisioningState = async (tenantId) => {
  try {
    return await getClient()
      .workflow.getHandle(provisioningWorkflowId(tenantId))
      .query<string>('workflowState');
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) return null;
    throw err;
  }
};

/** What to throw instead of `err` (see the header); `err` itself when it is not about an inactive tenant. */
export async function classifyInactiveTenant(
  err: unknown,
  tenantId: string,
  readState: ReadProvisioningState = readProvisioningState,
): Promise<unknown> {
  if (!(err instanceof TenantInactiveError)) return err;
  let state: string | null;
  try {
    state = await readState(tenantId);
  } catch {
    return err;
  }
  if (state !== null && PROVISIONING_PAUSED_STATES.includes(state)) {
    return ApplicationFailure.create({
      type: TENANT_PAUSED_FAILURE,
      message: `tenant ${tenantId} is paused by enterprise provisioning (${state})`,
      nonRetryable: true,
    });
  }
  return ApplicationFailure.nonRetryable(err.message, TENANT_INACTIVE_FAILURE);
}
