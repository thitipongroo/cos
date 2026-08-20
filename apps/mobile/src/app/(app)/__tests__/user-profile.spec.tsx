// Behaviour of the tenant-admin user profile.
//
// The screen is reached two ways and has to work from both: the user list pushes the whole row as
// route params, and the permission-success screen pushes only an id — in which case the profile
// fetches the row so it does not draw a page of blanks. That fallback is the case worth a test,
// because the happy path hides it.
//
// The two actions carry the profile forward. Reset-password in particular is handed `email`: that
// is what decides whether the next screen offers a reset LINK or a temporary password, so dropping
// it here would silently downgrade every reset started from this screen.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import UserProfileScreen from '../user-profile';

let mockParams: Record<string, string> = {};
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../../api/users', () => ({
  ...jest.requireActual('../../../api/users'),
  getUsers: jest.fn(),
}));
jest.mock('../../../api/projects', () => ({
  ...jest.requireActual('../../../api/projects'),
  getUserProjects: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const users = require('../../../api/users') as { getUsers: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const projects = require('../../../api/projects') as { getUserProjects: jest.Mock };

const FULL = {
  user_id: 'u-1',
  display_name: 'Waraporn Klinhom',
  email: 'waraporn@example.com',
  phone_number: '+66812345678',
  role: 'SITE_ENGINEER',
  is_active: 'true',
  photo_url: '',
  last_seen_at: '2026-08-19T09:00:00Z',
  department: 'Engineering',
};

function renderScreen() {
  return render(
    <I18nProvider>
      <UserProfileScreen />
    </I18nProvider>,
  );
}

describe('UserProfileScreen', () => {
  beforeEach(() => {
    mockParams = { ...FULL };
    mockPush.mockReset();
    users.getUsers.mockReset();
    projects.getUserProjects.mockReset();
    users.getUsers.mockResolvedValue([]);
    projects.getUserProjects.mockResolvedValue([]);
  });

  it('shows the account the route named', async () => {
    const { getByText } = await renderScreen();

    expect(getByText('Waraporn Klinhom')).toBeTruthy();
  });

  // Pushed here from permission-success with an id and nothing else.
  it('fetches the row when the route carried only an id', async () => {
    mockParams = { user_id: 'u-1' };
    users.getUsers.mockResolvedValue([
      { ...FULL, is_active: true, display_name: 'Somchai Jaidee' },
    ]);

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText('Somchai Jaidee')).toBeTruthy());
  });

  it('does not fetch when the route already carried the row', async () => {
    await renderScreen();

    await waitFor(() => expect(projects.getUserProjects).toHaveBeenCalled());
    expect(users.getUsers).not.toHaveBeenCalled();
  });

  it('stays on screen when the row could not be fetched', async () => {
    mockParams = { user_id: 'u-1' };
    users.getUsers.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('user-profile')).toBeTruthy());
  });

  it('stays on screen when the projects could not be fetched', async () => {
    projects.getUserProjects.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('user-profile')).toBeTruthy());
  });

  it('opens the role editor for this user', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('profile-edit-permissions'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/edit-permission',
      params: { user_id: 'u-1', display_name: 'Waraporn Klinhom' },
    });
  });

  // The email is what decides link-vs-temporary-password on the next screen — see its own spec.
  it('carries the email into the reset flow', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('profile-reset-password'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/reset-password',
      params: {
        user_id: 'u-1',
        display_name: 'Waraporn Klinhom',
        email: 'waraporn@example.com',
        role: 'SITE_ENGINEER',
        photo_url: '',
        is_active: 'true',
      },
    });
  });

  // PO 2026-08-20 — the glyph replaced the literal "?" here too. Counted rather than found by id:
  // this screen already draws a person icon in one of its detail rows, so the assertion is that the
  // avatar ADDS one, not that one exists.
  it('falls back to a person glyph when the name yields no initials', async () => {
    const readable = await renderScreen();
    const before = (await readable).queryAllByTestId('icon-person').length;

    mockParams = { ...FULL, display_name: '   ' };
    const { queryAllByTestId, queryByText } = await renderScreen();

    expect(queryAllByTestId('icon-person')).toHaveLength(before + 1);
    expect(queryByText('?')).toBeNull();
  });

  it('shows the initials when the name reads', async () => {
    const { getByText } = await renderScreen();

    expect(getByText('WK')).toBeTruthy();
  });
});
