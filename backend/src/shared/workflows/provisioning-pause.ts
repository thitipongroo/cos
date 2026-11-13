// What a tenant's enterprise-provisioning pause looks like from outside the provisioning workflow
// (D52, 2026-11-13). Pure constants: imported by workflow code, which must not pull in Node modules.
//
// A paused tenant and a deactivated one look the same in platform.tenants (`is_active = false`, D48).
// The provisioning run tells them apart: between PAUSING_TENANT and RESTORING it has paused the tenant
// and will resume it (enterprise-provisioning.workflow.ts, pauseCopySwitchVerifyResume).

/** Workflow states of `enterprise-provisioning-{tenantId}` during which the tenant is paused. */
export const PROVISIONING_PAUSED_STATES: readonly string[] = [
  'PAUSING_TENANT',
  'MIGRATING_DATA',
  'ASSIGNING_DB',
  'VERIFYING',
  'RESUMING_TENANT',
  'RESTORING',
];

/** ApplicationFailure type: the tenant is paused by provisioning; wait and try again. */
export const TENANT_PAUSED_FAILURE = 'TenantPaused';

/** ApplicationFailure type: the tenant is inactive and not paused (deactivated, or unknown). */
export const TENANT_INACTIVE_FAILURE = 'TenantInactive';

export function provisioningWorkflowId(tenantId: string): string {
  return `enterprise-provisioning-${tenantId}`;
}
