// The tenant store on its own (unit lane). The hook that reads it, useTenantReadOnly, is covered in the render lane
// (tenantStore.spec.tsx), where React is available.
import { useTenantStore } from '../tenantStore';

describe('tenantStore', () => {
  afterEach(() => useTenantStore.getState().setTenant(null));

  it('starts empty and holds what it is given', () => {
    expect(useTenantStore.getState().tenant).toBeNull();
    const tenant = {
      tenant_name: 'Somchai Build',
      tenant_code: 'somchai_build',
      plan_type: 'STARTER',
      subscription_status: 'EXPIRED',
      trial_ends_at: null,
      read_only_until: null,
    };
    useTenantStore.getState().setTenant(tenant);
    expect(useTenantStore.getState().tenant).toBe(tenant);
  });
});
