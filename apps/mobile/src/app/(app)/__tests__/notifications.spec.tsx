// Behaviour of the notification inbox, pinned before its row is memoized.
//
// This list is capped — one page of 20 — so the memo is for correctness of the reading, not for
// scale: marking one notification read must grey THAT row and leave the others alone, which is
// exactly what a row memoized on the wrong props gets wrong.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import NotificationsScreen from '../notifications';

// The three request functions are mocked; `unreadCount` is a pure helper in the same module and is
// kept REAL — stubbing it would mean the badge under test was reading a number this file invented.
jest.mock('../../../api/notifications', () => ({
  ...jest.requireActual('../../../api/notifications'),
  listNotifications: jest.fn(),
  markNotificationRead: jest.fn(),
  markAllNotificationsRead: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../../api/notifications') as {
  listNotifications: jest.Mock;
  markNotificationRead: jest.Mock;
  markAllNotificationsRead: jest.Mock;
};

function notification(id: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    notification_id: id,
    channel: 'IN_APP',
    event_type: 'site.issue.created.v1',
    subject: `Subject ${id}`,
    body: `Body ${id}`,
    status: 'SENT',
    sent_at: '2026-08-19T09:00:00Z',
    read_at: null,
    created_at: '2026-08-19T09:00:00Z',
    ...over,
  };
}

function renderScreen() {
  return render(
    <I18nProvider>
      <NotificationsScreen />
    </I18nProvider>,
  );
}

describe('NotificationsScreen', () => {
  beforeEach(() => {
    api.listNotifications.mockReset();
    api.markNotificationRead.mockReset();
    api.markAllNotificationsRead.mockReset();
    api.markNotificationRead.mockResolvedValue(undefined);
    api.markAllNotificationsRead.mockResolvedValue(undefined);
  });

  it('renders one row per notification', async () => {
    api.listNotifications.mockResolvedValue({ rows: [notification('n-1'), notification('n-2')] });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('notification-n-1')).toBeTruthy());
    expect(getByTestId('notification-n-2')).toBeTruthy();
  });

  it('marks the unread ones with a dot, and read ones without', async () => {
    api.listNotifications.mockResolvedValue({
      rows: [notification('n-1'), notification('n-2', { read_at: '2026-08-19T10:00:00Z' })],
    });

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('unread-dot')).toHaveLength(1));
  });

  it('marks read the notification that was tapped, and only that one', async () => {
    api.listNotifications.mockResolvedValue({ rows: [notification('n-1'), notification('n-2')] });

    const { getByTestId, getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('unread-dot')).toHaveLength(2));
    await fireEvent.press(getByTestId('notification-n-1'));

    await waitFor(() => expect(getAllByTestId('unread-dot')).toHaveLength(1));
    expect(api.markNotificationRead).toHaveBeenCalledWith('n-1');
  });

  it('does not re-mark a notification that is already read', async () => {
    api.listNotifications.mockResolvedValue({
      rows: [notification('n-1', { read_at: '2026-08-19T10:00:00Z' })],
    });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('notification-n-1')).toBeTruthy());
    await fireEvent.press(getByTestId('notification-n-1'));

    expect(api.markNotificationRead).not.toHaveBeenCalled();
  });

  it('shows the empty state when there is nothing to read', async () => {
    api.listNotifications.mockResolvedValue({ rows: [] });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('notifications-empty')).toBeTruthy());
  });
});
