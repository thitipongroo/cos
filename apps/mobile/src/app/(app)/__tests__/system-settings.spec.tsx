// Behaviour of the tenant-admin system settings.
//
// ONLINE-REQUIRED (§17.4). These are tenant-wide writes with no offline queue behind them, so
// offline the controls say so and DO NOTHING rather than appearing to have saved. A settings screen
// that silently discards a change is worse than one that refuses it.
//
// THE NOTIFICATION TOGGLE IS OPTIMISTIC AND REVERSIBLE. It moves at once, and a rejected save puts
// it back — unlike the notification-preferences panel, where the write queues. The difference is
// whether the change survives the failure: here it does not, so the control must not claim it did.
//
// THE LINE CHANNEL TOKEN IS A SECRET. It is masked until revealed, and an unchanged field is not
// re-sent — writing a secret back for no reason is a write that can fail for no reason.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { I18nProvider } from '../../../i18n';
import SystemSettingsScreen from '../system-settings';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

let mockOnline = true;
// The hook returns a NetworkStatus object, not a boolean — a bare boolean leaves `isOnline`
// undefined, which reads as permanently offline and passes the offline tests for the wrong reason.
jest.mock('../../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: mockOnline, connectionType: null }),
}));

jest.mock('../../../api/tenant', () => ({
  ...jest.requireActual('../../../api/tenant'),
  getMyTenant: jest.fn(),
}));
jest.mock('../../../api/settings', () => ({
  ...jest.requireActual('../../../api/settings'),
  getSettings: jest.fn(),
  updateSettings: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tenantApi = require('../../../api/tenant') as { getMyTenant: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const settingsApi = require('../../../api/settings') as {
  getSettings: jest.Mock;
  updateSettings: jest.Mock;
};

const TENANT = { tenant_id: 't-1', tenant_name: 'EKC', tenant_code: 'EKC-001' };
const SETTINGS = {
  notifications_enabled: true,
  line_channel_token: 'line-secret-token',
  brand_color: '#0066FF',
};

function renderScreen() {
  return render(
    <I18nProvider>
      <SystemSettingsScreen />
    </I18nProvider>,
  );
}

describe('SystemSettingsScreen', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    mockOnline = true;
    tenantApi.getMyTenant.mockReset();
    settingsApi.getSettings.mockReset();
    settingsApi.updateSettings.mockReset();
    tenantApi.getMyTenant.mockResolvedValue(TENANT);
    settingsApi.getSettings.mockResolvedValue(SETTINGS);
    settingsApi.updateSettings.mockResolvedValue(undefined);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => alert.mockRestore());

  it('shows the tenant it is settings for', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('org-code')).toBeTruthy());
  });

  it('reports a failure to load rather than showing empty settings', async () => {
    settingsApi.getSettings.mockRejectedValue(new Error('offline'));

    const { queryByTestId } = await renderScreen();

    await waitFor(() => expect(queryByTestId('org-code')).toBeNull());
  });

  it('turns the notification setting off', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('line-toggle')).toBeTruthy());
    await fireEvent(getByTestId('line-toggle'), 'valueChange', false);

    await waitFor(() =>
      expect(settingsApi.updateSettings).toHaveBeenCalledWith({ notifications_enabled: false }),
    );
  });

  // The write does NOT survive the failure here, so the control must not claim it did.
  it('puts the toggle back when the save is rejected', async () => {
    settingsApi.updateSettings.mockRejectedValue(new Error('server'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('line-toggle')).toBeTruthy());
    await fireEvent(getByTestId('line-toggle'), 'valueChange', false);

    await waitFor(() => expect(getByTestId('line-toggle').props.value).toBe(true));
    expect(alert).toHaveBeenCalled();
  });

  // ONLINE-REQUIRED. Offline it says so and does nothing — not "saves" into a queue that is not there.
  it('says these settings need a connection', async () => {
    mockOnline = false;

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('settings-online-only')).toBeTruthy());
  });

  it('writes nothing while offline', async () => {
    mockOnline = false;

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('line-toggle')).toBeTruthy());
    await fireEvent(getByTestId('line-toggle'), 'valueChange', false);

    expect(settingsApi.updateSettings).not.toHaveBeenCalled();
  });

  // A SECRET: masked until asked for.
  it('masks the channel token until it is revealed', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('line-token')).toBeTruthy());
    expect(getByTestId('line-token').props.secureTextEntry).toBe(true);

    await fireEvent.press(getByTestId('line-token-eye'));

    await waitFor(() => expect(getByTestId('line-token').props.secureTextEntry).toBe(false));
  });

  // The save fires on `onEndEditing`, not on blur — RN's TextInput has both and they are different
  // events; firing the wrong one leaves the field looking saved and never calling the API.
  it('saves a changed token', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('line-token')).toBeTruthy());
    await fireEvent.changeText(getByTestId('line-token'), 'new-token');
    await fireEvent(getByTestId('line-token'), 'endEditing');

    await waitFor(() =>
      expect(settingsApi.updateSettings).toHaveBeenCalledWith({ line_channel_token: 'new-token' }),
    );
  });

  // Writing a secret back for no reason is a write that can fail for no reason.
  it('does not re-send an unchanged token', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('line-token')).toBeTruthy());
    await fireEvent(getByTestId('line-token'), 'endEditing');

    expect(settingsApi.updateSettings).not.toHaveBeenCalled();
  });

  it('clears the token as null rather than as an empty string', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('line-token')).toBeTruthy());
    await fireEvent.changeText(getByTestId('line-token'), '');
    await fireEvent(getByTestId('line-token'), 'endEditing');

    await waitFor(() =>
      expect(settingsApi.updateSettings).toHaveBeenCalledWith({ line_channel_token: null }),
    );
  });

  // Drawn because the mockup draws them, and each says it is not built rather than doing nothing.
  it('reports the unbuilt integrations as unbuilt', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('integration-bim360')).toBeTruthy());
    await fireEvent.press(getByTestId('integration-bim360'));

    expect(alert).toHaveBeenCalled();
  });

  // Deleting a tenant is not something a mobile screen does — it says what it is, and stops.
  it('does not delete a tenant from here', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('delete-tenant')).toBeTruthy());
    await fireEvent.press(getByTestId('delete-tenant'));

    expect(alert).toHaveBeenCalled();
    expect(settingsApi.updateSettings).not.toHaveBeenCalled();
  });
});
