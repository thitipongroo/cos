// Behaviour of the role editor — the screen that decides what a colleague may do.
//
// Two controls that look alike answer different questions, and the accessibility work of
// 2026-08-20 made the difference explicit: the PRIMARY role is a radio group (exactly one), the
// ADDITIONAL roles are checkboxes (independent of one another). A test that only counted taps
// would not notice the two being conflated; these assert the announced state, which is what a
// screen-reader user actually gets.
//
// Save is off until something has changed. On a permissions screen that is not a nicety — a save
// with nothing dirty is a write to the authorisation record that nobody asked for.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import EditPermissionScreen from '../edit-permission';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ user_id: 'u-1', display_name: 'Waraporn Klinhom' }),
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn() }),
}));

jest.mock('../../../api/users', () => ({
  ...jest.requireActual('../../../api/users'),
  getUserRoles: jest.fn(),
  setUserRoles: jest.fn(),
}));
jest.mock('../../../api/roles', () => ({
  ...jest.requireActual('../../../api/roles'),
  getRolePermissions: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const users = require('../../../api/users') as { getUserRoles: jest.Mock; setUserRoles: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const roles = require('../../../api/roles') as { getRolePermissions: jest.Mock };

function renderScreen() {
  return render(
    <I18nProvider>
      <EditPermissionScreen />
    </I18nProvider>,
  );
}

describe('EditPermissionScreen', () => {
  beforeEach(() => {
    users.getUserRoles.mockReset();
    users.setUserRoles.mockReset();
    roles.getRolePermissions.mockReset();
    users.getUserRoles.mockResolvedValue({
      primary_role: 'SITE_ENGINEER',
      additional_roles: [],
    });
    users.setUserRoles.mockResolvedValue(undefined);
    roles.getRolePermissions.mockImplementation((role: string) =>
      Promise.resolve({ role, permissions: ['project:read'] }),
    );
  });

  it('opens on the role the user already holds', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('primary-role')).toBeTruthy());
    expect(getByTestId('primary-role').props.accessibilityState.expanded).toBe(false);
  });

  it('offers the primary role as a radio group — exactly one chosen', async () => {
    const { getByTestId, getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('primary-role')).toBeTruthy());
    await fireEvent.press(getByTestId('primary-role'));

    await waitFor(() => expect(getByTestId('pick-primary-SITE_ENGINEER')).toBeTruthy());
    const rows = getAllByTestId(/^pick-primary-/);
    const chosen = rows.filter((r) => r.props.accessibilityState.selected === true);

    expect(chosen).toHaveLength(1);
    expect(rows.every((r) => r.props.accessibilityRole === 'radio')).toBe(true);
  });

  it('moves the primary role to the one picked from the sheet', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('primary-role')).toBeTruthy());
    await fireEvent.press(getByTestId('primary-role'));
    await waitFor(() => expect(getByTestId('pick-primary-FINANCE')).toBeTruthy());
    await fireEvent.press(getByTestId('pick-primary-FINANCE'));

    await waitFor(() =>
      expect(getByTestId('save-roles').props.accessibilityState.disabled).toBe(false),
    );
  });

  // The other half of the pair: these are INDEPENDENT, so they are checkboxes and more than one
  // may be on at a time. Conflating them with the radio group above would quietly grant or revoke.
  it('offers the additional roles as independent checkboxes', async () => {
    const { getByTestId, getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('add-role-FINANCE')).toBeTruthy());

    const chips = getAllByTestId(/^add-role-/);
    expect(chips.every((c) => c.props.accessibilityRole === 'checkbox')).toBe(true);
    expect(chips.every((c) => c.props.accessibilityState.checked === false)).toBe(true);

    await fireEvent.press(getByTestId('add-role-FINANCE'));
    await fireEvent.press(getByTestId('add-role-SAFETY_OFFICER'));

    await waitFor(() =>
      expect(getByTestId('add-role-FINANCE').props.accessibilityState.checked).toBe(true),
    );
    expect(getByTestId('add-role-SAFETY_OFFICER').props.accessibilityState.checked).toBe(true);
  });

  it('unticks an additional role on a second press', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('add-role-FINANCE')).toBeTruthy());
    await fireEvent.press(getByTestId('add-role-FINANCE'));
    await waitFor(() =>
      expect(getByTestId('add-role-FINANCE').props.accessibilityState.checked).toBe(true),
    );

    await fireEvent.press(getByTestId('add-role-FINANCE'));
    await waitFor(() =>
      expect(getByTestId('add-role-FINANCE').props.accessibilityState.checked).toBe(false),
    );
  });

  // A write to the authorisation record that nobody asked for is the thing this prevents.
  it('will not save while nothing has changed', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('save-roles')).toBeTruthy());
    expect(getByTestId('save-roles').props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(getByTestId('save-roles'));

    expect(users.setUserRoles).not.toHaveBeenCalled();
  });

  it('saves the primary and the additional roles together', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('add-role-FINANCE')).toBeTruthy());
    await fireEvent.press(getByTestId('add-role-FINANCE'));
    await waitFor(() =>
      expect(getByTestId('save-roles').props.accessibilityState.disabled).toBe(false),
    );

    await fireEvent.press(getByTestId('save-roles'));

    await waitFor(() =>
      expect(users.setUserRoles).toHaveBeenCalledWith('u-1', 'SITE_ENGINEER', ['FINANCE']),
    );
  });

  it('puts the sheet back the way it was when Reset all is pressed', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('add-role-FINANCE')).toBeTruthy());
    await fireEvent.press(getByTestId('add-role-FINANCE'));
    await waitFor(() =>
      expect(getByTestId('save-roles').props.accessibilityState.disabled).toBe(false),
    );

    await fireEvent.press(getByTestId('reset-all'));

    await waitFor(() =>
      expect(getByTestId('add-role-FINANCE').props.accessibilityState.checked).toBe(false),
    );
  });
});
