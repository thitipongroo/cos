// Behaviour of the standard top bar — the one header every authenticated screen renders.
//
// The rule with the most history in it is the back control. It appears on PUSHED CHILD screens only,
// and "is this a child" has exactly ONE source: BREADCRUMB_MAP, read through `isChildRoute`. That is
// deliberate — adding a route to that map gives it both a breadcrumb and a Back button, so the two
// can never disagree. A tab that gained a Back control would be offering to leave a screen the user
// selected rather than arrived at, which is why `/more` and `/select-project` are absent from the map.
//
// The unread badge has its own rule: a failed fetch leaves it alone rather than claiming zero. "No
// unread notifications" and "we could not ask" are different statements, and only one of them is
// safe to make offline.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from '../../i18n';
import { useUiStore } from '../../store/uiStore';
import { TopBar } from '../TopBar';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockPathname = '/home';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
  usePathname: () => mockPathname,
}));

// `unreadCount` is a pure helper in the same module and is kept REAL — stubbing it would mean the
// badge under test was reading a number this file invented.
jest.mock('../../api/notifications', () => ({
  ...jest.requireActual('../../api/notifications'),
  listNotifications: jest.fn(),
}));
jest.mock('../../api/users', () => ({
  ...jest.requireActual('../../api/users'),
  getMe: jest.fn().mockResolvedValue({ photo_url: null }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../api/notifications') as { listNotifications: jest.Mock };

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function notification(id: string, read: string | null) {
  return {
    notification_id: id,
    channel: 'IN_APP',
    event_type: 'site.issue.created.v1',
    subject: `Subject ${id}`,
    body: '',
    status: 'SENT',
    sent_at: '2026-08-19T09:00:00Z',
    read_at: read,
    created_at: '2026-08-19T09:00:00Z',
  };
}

function renderBar(props: Record<string, unknown> = {}) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <I18nProvider>
        <TopBar {...props} />
      </I18nProvider>
    </SafeAreaProvider>,
  );
}

describe('TopBar', () => {
  let openDrawer: jest.Mock;

  beforeEach(() => {
    mockPush.mockReset();
    mockBack.mockReset();
    mockPathname = '/home';
    openDrawer = jest.fn();
    useUiStore.setState({ openDrawer } as never);
    api.listNotifications.mockReset();
    api.listNotifications.mockResolvedValue({ rows: [] });
  });

  it('carries the brand, the sync pill and the three right-hand controls', async () => {
    const { getByTestId } = await renderBar();

    expect(getByTestId('brand-logo')).toBeTruthy();
    expect(getByTestId('sync-pill')).toBeTruthy();
    expect(getByTestId('topbar-help')).toBeTruthy();
    expect(getByTestId('notifications-bell')).toBeTruthy();
    expect(getByTestId('profile-avatar')).toBeTruthy();
  });

  // A TAB is a screen the user selected; a Back control there offers to leave it.
  it('shows no back control on a tab', async () => {
    const { queryByTestId } = await renderBar();

    expect(queryByTestId('topbar-back')).toBeNull();
  });

  it('shows the back control on a pushed child screen', async () => {
    mockPathname = '/dashboard';

    const { getByTestId } = await renderBar();

    expect(getByTestId('topbar-back')).toBeTruthy();
  });

  // `/more` is a tab and is deliberately absent from BREADCRUMB_MAP — see the note there.
  it('shows no back control on the More tab', async () => {
    mockPathname = '/more';

    const { queryByTestId } = await renderBar();

    expect(queryByTestId('topbar-back')).toBeNull();
  });

  it('goes back rather than navigating somewhere new', async () => {
    mockPathname = '/dashboard';

    const { getByTestId } = await renderBar();
    await fireEvent.press(getByTestId('topbar-back'));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  // The wordmark doubles as the drawer trigger, and so does the avatar — there is no /profile route
  // to push any more (2026-08-09).
  it('opens the drawer from the wordmark', async () => {
    const { getByTestId } = await renderBar();

    await fireEvent.press(getByTestId('drawer-menu-button'));

    expect(openDrawer).toHaveBeenCalledTimes(1);
  });

  it('opens the drawer from the avatar', async () => {
    const { getByTestId } = await renderBar();

    await fireEvent.press(getByTestId('profile-avatar'));

    expect(openDrawer).toHaveBeenCalledTimes(1);
  });

  // The group is named on purpose: (auth)/support and (app)/support both resolve to `/support`, and
  // a bare push is ambiguous between them — the pre-auth one is behind a gate this user is past.
  it('opens the in-app support centre, naming its group', async () => {
    const { getByTestId } = await renderBar();

    await fireEvent.press(getByTestId('topbar-help'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/support');
  });

  it('opens the notification inbox from the bell', async () => {
    const { getByTestId } = await renderBar();

    await fireEvent.press(getByTestId('notifications-bell'));

    expect(mockPush).toHaveBeenCalledWith('/notifications');
  });

  it('shows no badge when nothing is unread', async () => {
    api.listNotifications.mockResolvedValue({
      rows: [notification('n-1', '2026-08-19T10:00:00Z')],
    });

    const { getByTestId, queryByTestId } = await renderBar();

    await waitFor(() => expect(getByTestId('notifications-bell')).toBeTruthy());
    expect(queryByTestId('bell-badge')).toBeNull();
  });

  it('counts the unread ones on the badge', async () => {
    api.listNotifications.mockResolvedValue({
      rows: [notification('n-1', null), notification('n-2', null), notification('n-3', 'read')],
    });

    const { getByTestId } = await renderBar();

    await waitFor(() => expect(getByTestId('bell-badge')).toBeTruthy());
    expect(getByTestId('bell-badge').props.children.props.children).toBe(2);
  });

  it('caps the badge at 9+', async () => {
    api.listNotifications.mockResolvedValue({
      rows: Array.from({ length: 12 }, (_, i) => notification(`n-${i}`, null)),
    });

    const { getByTestId } = await renderBar();

    await waitFor(() => expect(getByTestId('bell-badge')).toBeTruthy());
    expect(getByTestId('bell-badge').props.children.props.children).toBe('9+');
  });

  // "Nothing unread" and "we could not ask" are different statements. Only one is safe offline.
  it('leaves the badge alone when the fetch fails rather than claiming zero', async () => {
    api.listNotifications.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryByTestId } = await renderBar();

    await waitFor(() => expect(getByTestId('notifications-bell')).toBeTruthy());
    expect(queryByTestId('bell-badge')).toBeNull();
  });
});
