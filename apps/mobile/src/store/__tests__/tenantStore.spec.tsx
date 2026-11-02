import { renderHook } from '@testing-library/react-native';
import { useTenantStore } from '../tenantStore';
import { useTenantReadOnly } from '../../hooks/useTenantReadOnly';

const tenant = (subscription_status: string) => ({
  tenant_name: 'Somchai Build',
  tenant_code: 'somchai_build',
  plan_type: 'STARTER',
  subscription_status,
  trial_ends_at: null,
  read_only_until: null,
});

describe('tenantStore + useTenantReadOnly (§7.10)', () => {
  afterEach(() => useTenantStore.getState().setTenant(null));

  it('starts unknown — and unknown is not read-only', async () => {
    expect(useTenantStore.getState().tenant).toBeNull();
    expect((await renderHook(() => useTenantReadOnly())).result.current).toBe(false);
  });

  it.each([
    ['EXPIRED', true],
    ['PENDING_DELETION', true],
    ['TRIAL', false],
    ['ACTIVE', false],
  ])('%s → read-only %s', async (status, expected) => {
    useTenantStore.getState().setTenant(tenant(status));
    expect((await renderHook(() => useTenantReadOnly())).result.current).toBe(expected);
  });
});
