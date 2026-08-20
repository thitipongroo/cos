// Behaviour of the tenant-admin user list.
//
// Two things here are worth holding. The avatar's fallback, which PO 2026-08-20 settled: a person
// glyph when the name yields no initials, and the existing glyph for a deactivated account — so a
// row must never draw a literal "?" again. And the audit card, which counts accounts nobody has
// used in 30 days; it reads `last_seen_at`, so a test with hard-coded dates would rot.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import UsersScreen from '../users';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../../api/users', () => ({
  ...jest.requireActual('../../../api/users'),
  getUsers: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../../api/users') as { getUsers: jest.Mock };

const DAY_MS = 24 * 60 * 60 * 1000;
const seenDaysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

function user(over: Partial<Record<string, unknown>> = {}) {
  return {
    user_id: 'u-1',
    email: 'waraporn@example.com',
    phone_number: null,
    display_name: 'Waraporn Klinhom',
    photo_url: null,
    department: 'Engineering',
    role: 'SITE_ENGINEER',
    mfa_enabled: false,
    is_active: true,
    last_seen_at: seenDaysAgo(1),
    ...over,
  };
}

function renderScreen() {
  return render(
    <I18nProvider>
      <UsersScreen />
    </I18nProvider>,
  );
}

describe('UsersScreen', () => {
  beforeEach(() => {
    api.getUsers.mockReset();
  });

  it('renders a row per user the tenant returns', async () => {
    api.getUsers.mockResolvedValue([
      user(),
      user({ user_id: 'u-2', display_name: 'Somchai Jaidee' }),
    ]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('user-row-u-1')).toBeTruthy());
    expect(getByTestId('user-row-u-2')).toBeTruthy();
  });

  // PO 2026-08-20. Before it, these two cases drew "?" — a character no one chose to display.
  it('falls back to a person glyph when the name yields no initials', async () => {
    api.getUsers.mockResolvedValue([user({ display_name: '   ' })]);

    const { getByTestId, queryByText } = await renderScreen();

    await waitFor(() => expect(getByTestId('user-row-u-1')).toBeTruthy());
    expect(queryByText('?')).toBeNull();
    expect(getByTestId('icon-person')).toBeTruthy();
  });

  it('draws the glyph for a deactivated account even when the name reads fine', async () => {
    api.getUsers.mockResolvedValue([user({ is_active: false })]);

    const { getByTestId, queryByText } = await renderScreen();

    await waitFor(() => expect(getByTestId('user-row-u-1')).toBeTruthy());
    expect(queryByText('WK')).toBeNull();
    expect(getByTestId('icon-person')).toBeTruthy();
  });

  it('shows the initials of an active account whose name reads', async () => {
    api.getUsers.mockResolvedValue([user()]);

    const { getByText } = await renderScreen();

    // First and LAST part — the one rule, app-wide since 2026-08-20.
    await waitFor(() => expect(getByText('WK')).toBeTruthy());
  });

  it('filters the list down to one role', async () => {
    api.getUsers.mockResolvedValue([
      user(),
      user({ user_id: 'u-2', display_name: 'Somchai Jaidee', role: 'SITE_WORKER' }),
    ]);

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('user-row-u-2')).toBeTruthy());
    await fireEvent.press(getByTestId('filter-SITE_WORKER'));

    await waitFor(() => expect(queryByTestId('user-row-u-1')).toBeNull());
    expect(getByTestId('user-row-u-2')).toBeTruthy();
  });

  it('keeps the screen usable when the request fails offline', async () => {
    api.getUsers.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('users-error')).toBeTruthy());
  });

  it('shows the empty state when the tenant has no users', async () => {
    api.getUsers.mockResolvedValue([]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('users-empty')).toBeTruthy());
  });
});
