// Behaviour of the tenant-admin notification panel.
//
// Same statutory rule as the per-role section, enforced a second time on a second surface: the
// critical safety event is LOCKED ON (§19.6) and is never written by the save. A test on one screen
// would not catch the other losing it, which is why this is asserted here too.
//
// A CHANNEL WITH NO STORED ROW DEFAULTS TO ON. This is an opt-out model matching the server's
// default-deliver, so a missing row means "never chosen", not "off".
//
// AND AN OFFLINE SAVE IS STILL A SAVE. `mutate()` queues the write for replay (§17), so the same
// confirmation is shown either way — telling an admin their change was lost when it is sitting in
// the queue would have them make it twice.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from '../../../i18n';
import NotificationPreferencesScreen from '../notification-preferences';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../../api/notifications', () => ({
  ...jest.requireActual('../../../api/notifications'),
  getNotificationPreferences: jest.fn(),
  updateNotificationPreferences: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../../api/notifications') as {
  getNotificationPreferences: jest.Mock;
  updateNotificationPreferences: jest.Mock;
};

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const CRITICAL = 'safety.incident.created.v1';
const DAILY_REPORT = 'site.report.created.v1';

function row(eventType: string, channel: string, isEnabled: boolean) {
  return {
    event_type: eventType,
    channel,
    is_enabled: isEnabled,
    quiet_hours_start: '22:00:00',
    quiet_hours_end: '07:00:00',
  };
}

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <I18nProvider>
        <NotificationPreferencesScreen />
      </I18nProvider>
    </SafeAreaProvider>,
  );
}

describe('NotificationPreferencesScreen', () => {
  beforeEach(() => {
    api.getNotificationPreferences.mockReset();
    api.updateNotificationPreferences.mockReset();
    api.getNotificationPreferences.mockResolvedValue([]);
    api.updateNotificationPreferences.mockResolvedValue(undefined);
  });

  it('renders the per-event, per-channel grid', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('notification-preferences')).toBeTruthy());
    expect(getByTestId(`pref-${DAILY_REPORT}-IN_APP`)).toBeTruthy();
  });

  // Opt-out: a missing row means "never chosen", not "off".
  it('reads a channel with no stored row as ON', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId(`pref-${DAILY_REPORT}-IN_APP`)).toBeTruthy());
    expect(getByTestId(`pref-${DAILY_REPORT}-IN_APP`).props.accessibilityState.checked).toBe(true);
  });

  it('reads a stored OFF as off', async () => {
    api.getNotificationPreferences.mockResolvedValue([row(DAILY_REPORT, 'IN_APP', false)]);

    const { getByTestId } = await renderScreen();

    await waitFor(() =>
      expect(getByTestId(`pref-${DAILY_REPORT}-IN_APP`).props.accessibilityState.checked).toBe(
        false,
      ),
    );
  });

  it('toggles the channel that was pressed, and only that one', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId(`pref-${DAILY_REPORT}-IN_APP`)).toBeTruthy());
    await fireEvent.press(getByTestId(`pref-${DAILY_REPORT}-IN_APP`));

    await waitFor(() =>
      expect(getByTestId(`pref-${DAILY_REPORT}-IN_APP`).props.accessibilityState.checked).toBe(
        false,
      ),
    );
    expect(getByTestId(`pref-${DAILY_REPORT}-EMAIL`).props.accessibilityState.checked).toBe(true);
  });

  // §19.6, on the second surface that could lose it. The critical event sits in its own locked
  // section — a padlock and ticks, with NO toggle to press, which is the same call the per-role
  // section makes: a control that refuses to move reads as broken.
  it('gives the critical safety event no toggle at all', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('notification-preferences')).toBeTruthy());
    expect(queryByTestId(`pref-${CRITICAL}-IN_APP`)).toBeNull();
    expect(queryByTestId(`pref-${CRITICAL}-LINE`)).toBeNull();
  });

  it('never writes the critical safety event on save', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('prefs-save')).toBeTruthy());
    await fireEvent.press(getByTestId('prefs-save'));

    await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenCalledTimes(1));
    const updates = api.updateNotificationPreferences.mock.calls[0][0] as { event_type: string }[];
    expect(updates.some((u) => u.event_type === CRITICAL)).toBe(false);
    expect(updates.length).toBeGreaterThan(0);
  });

  it('saves the quiet window alongside the flags', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('prefs-save')).toBeTruthy());
    await fireEvent.press(getByTestId('prefs-save'));

    await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenCalledTimes(1));
    expect(api.updateNotificationPreferences.mock.calls[0][1]).toEqual({
      start: '22:00',
      end: '07:00',
    });
  });

  // Hour granularity, minutes pinned to :00 — the stored column is a TIME and the window is hours.
  it('steps the quiet window by whole hours', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('quiet-start-inc')).toBeTruthy());
    await fireEvent.press(getByTestId('quiet-start-inc'));
    await fireEvent.press(getByTestId('prefs-save'));

    await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenCalledTimes(1));
    expect(api.updateNotificationPreferences.mock.calls[0][1].start).toBe('23:00');
  });

  it('wraps the hour round midnight rather than running past it', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('quiet-start-inc')).toBeTruthy());
    // 22:00 + 2 = 00:00, not 24:00.
    await fireEvent.press(getByTestId('quiet-start-inc'));
    await fireEvent.press(getByTestId('quiet-start-inc'));
    await fireEvent.press(getByTestId('prefs-save'));

    await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenCalledTimes(1));
    expect(api.updateNotificationPreferences.mock.calls[0][1].start).toBe('00:00');
  });

  it('steps an edge backwards too', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('quiet-end-dec')).toBeTruthy());
    await fireEvent.press(getByTestId('quiet-end-dec'));
    await fireEvent.press(getByTestId('prefs-save'));

    await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenCalledTimes(1));
    expect(api.updateNotificationPreferences.mock.calls[0][1].end).toBe('06:00');
  });

  it('starts from the stored window rather than the default', async () => {
    api.getNotificationPreferences.mockResolvedValue([
      { ...row(DAILY_REPORT, 'IN_APP', true), quiet_hours_start: '21:00:00' },
    ]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('prefs-save')).toBeTruthy());
    await fireEvent.press(getByTestId('prefs-save'));

    await waitFor(() => expect(api.updateNotificationPreferences).toHaveBeenCalledTimes(1));
    expect(api.updateNotificationPreferences.mock.calls[0][1].start).toBe('21:00');
  });

  it('confirms the save', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('prefs-save')).toBeTruthy());
    await fireEvent.press(getByTestId('prefs-save'));

    await waitFor(() => expect(getByTestId('prefs-saved-back')).toBeTruthy());
  });

  // Queued for replay is not lost — telling the admin otherwise has them make the change twice.
  it('confirms an offline save the same way, because it is queued', async () => {
    api.updateNotificationPreferences.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('prefs-save')).toBeTruthy());
    await fireEvent.press(getByTestId('prefs-save'));

    await waitFor(() => expect(getByTestId('prefs-saved-back')).toBeTruthy());
  });

  it('keeps the defaults when the preferences cannot be fetched', async () => {
    api.getNotificationPreferences.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('notification-preferences')).toBeTruthy());
    expect(getByTestId(`pref-${DAILY_REPORT}-IN_APP`).props.accessibilityState.checked).toBe(true);
  });
});
