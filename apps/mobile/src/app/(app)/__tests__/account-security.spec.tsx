// Behaviour of the account-security screen — the user's trusted devices.
//
// Revocation asks WHY — three named reasons (USER_REVOKED, LOST_OR_STOLEN, COMPROMISED) and a way
// out — rather than confirming. That is a trust decision, not a layout one: COMPROMISED is the
// model's only positive class, so a default would either label ordinary tidying-up as an attack or
// bury a real compromise among retired handsets.
//
// Revoking the device in your hand ends its trust, so the next login on it needs a full OTP again.
// That is said BEFORE the tap, not discovered after it.
//
// THE BIOMETRIC CASES LEFT WITH THE SWITCH on 2026-09-13 — it now lives once, under Security &
// Access in <AccountSettings />, and its tests moved to that component's spec rather than being
// deleted. See the screen header.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import AccountSecurityScreen from '../account-security';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../../api/devices', () => ({
  ...jest.requireActual('../../../api/devices'),
  listDevices: jest.fn(),
  revokeDevice: jest.fn(),
}));
jest.mock('../../../lib/deviceTrust', () => ({ getDeviceId: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../../api/devices') as { listDevices: jest.Mock; revokeDevice: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const trust = require('../../../lib/deviceTrust') as { getDeviceId: jest.Mock };

const THIS_DEVICE = 'dev-this';

function device(id: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    deviceId: id,
    platform: 'android',
    model: 'Pixel 6',
    lastSeenAt: '2026-08-19T09:00:00Z',
    createdAt: '2026-08-01T09:00:00Z',
    expiresAt: '2026-11-01T09:00:00Z',
    attestationVerdict: null,
    integrityLevel: null,
    attestedAt: null,
    osVersion: null,
    ...over,
  };
}

function renderScreen() {
  return render(
    <I18nProvider>
      <AccountSecurityScreen />
    </I18nProvider>,
  );
}

describe('AccountSecurityScreen', () => {
  beforeEach(() => {
    api.listDevices.mockReset();
    api.revokeDevice.mockReset();
    api.revokeDevice.mockResolvedValue(undefined);
    trust.getDeviceId.mockReset();
    trust.getDeviceId.mockResolvedValue(THIS_DEVICE);
    api.listDevices.mockResolvedValue([device(THIS_DEVICE), device('dev-other')]);
  });

  it('lists the trusted devices', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId(`device-row-${THIS_DEVICE}`)).toBeTruthy());
    expect(getByTestId('device-row-dev-other')).toBeTruthy();
  });

  it('marks which one you are holding', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('device-current')).toBeTruthy());
  });

  it('says so when nothing is trusted yet', async () => {
    api.listDevices.mockResolvedValue([]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('devices-empty')).toBeTruthy());
  });

  it('stays usable when the device list cannot be fetched', async () => {
    api.listDevices.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('account-security')).toBeTruthy());
  });

  // NAMED REASONS, no default — see the note at the top of this file.
  it('asks why, rather than confirming', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('device-revoke-dev-other')).toBeTruthy());
    await fireEvent.press(getByTestId('device-revoke-dev-other'));

    await waitFor(() => expect(getByTestId('revoke-reasons-dev-other')).toBeTruthy());
    expect(getByTestId('revoke-COMPROMISED')).toBeTruthy();
    expect(api.revokeDevice).not.toHaveBeenCalled();
  });

  it('revokes with the reason that was chosen', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('device-revoke-dev-other')).toBeTruthy());
    await fireEvent.press(getByTestId('device-revoke-dev-other'));
    await waitFor(() => expect(getByTestId('revoke-COMPROMISED')).toBeTruthy());
    await fireEvent.press(getByTestId('revoke-COMPROMISED'));

    await waitFor(() => expect(api.revokeDevice).toHaveBeenCalledWith('dev-other', 'COMPROMISED'));
  });

  it('backs out without revoking anything', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('device-revoke-dev-other')).toBeTruthy());
    await fireEvent.press(getByTestId('device-revoke-dev-other'));
    await waitFor(() => expect(getByTestId('revoke-cancel')).toBeTruthy());
    await fireEvent.press(getByTestId('revoke-cancel'));

    await waitFor(() => expect(queryByTestId('revoke-reasons-dev-other')).toBeNull());
    expect(api.revokeDevice).not.toHaveBeenCalled();
  });

  // Said before the tap, not discovered after it.
  it('warns before you revoke the handset in your hand', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId(`device-revoke-${THIS_DEVICE}`)).toBeTruthy());
    await fireEvent.press(getByTestId(`device-revoke-${THIS_DEVICE}`));

    await waitFor(() => expect(getByTestId('revoke-self-warning')).toBeTruthy());
  });

  it('gives no such warning for someone else`s handset', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('device-revoke-dev-other')).toBeTruthy());
    await fireEvent.press(getByTestId('device-revoke-dev-other'));

    await waitFor(() => expect(getByTestId('revoke-reasons-dev-other')).toBeTruthy());
    expect(queryByTestId('revoke-self-warning')).toBeNull();
  });

  it('refreshes the list after a revocation', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(api.listDevices).toHaveBeenCalledTimes(1));
    await fireEvent.press(getByTestId('device-revoke-dev-other'));
    await waitFor(() => expect(getByTestId('revoke-USER_REVOKED')).toBeTruthy());
    await fireEvent.press(getByTestId('revoke-USER_REVOKED'));

    await waitFor(() => expect(api.listDevices).toHaveBeenCalledTimes(2));
  });
});
