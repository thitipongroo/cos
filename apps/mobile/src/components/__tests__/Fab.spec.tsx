// <Fab /> — every `+` in the app. Hidden while the tenant's free trial has ended (§7.10): the list screens' create
// and the Home screens' quick-action menus all go with it.

import { fireEvent, render } from '@testing-library/react-native';
import { Fab } from '../Fab';
import { useTenantStore } from '../../store/tenantStore';

const tenant = (subscription_status: string) => ({
  tenant_name: 'Somchai Build',
  tenant_code: 'somchai_build',
  plan_type: 'STARTER',
  subscription_status,
  trial_ends_at: null,
  read_only_until: null,
});

afterEach(() => useTenantStore.getState().setTenant(null));

it('renders and presses while the tenant can write', async () => {
  useTenantStore.getState().setTenant(tenant('TRIAL'));
  const onPress = jest.fn();
  const r = await render(<Fab testID="fab" accessibilityLabel="Add" onPress={onPress} />);
  await fireEvent.press(r.getByTestId('fab'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('renders while the tenant is not known yet', async () => {
  const r = await render(<Fab testID="fab" accessibilityLabel="Add" onPress={jest.fn()} />);
  expect(r.getByTestId('fab')).toBeTruthy();
});

it.each(['EXPIRED', 'PENDING_DELETION'])('renders nothing while %s', async (status) => {
  useTenantStore.getState().setTenant(tenant(status));
  const r = await render(<Fab testID="fab" accessibilityLabel="Add" onPress={jest.fn()} />);
  expect(r.queryByTestId('fab')).toBeNull();
});
