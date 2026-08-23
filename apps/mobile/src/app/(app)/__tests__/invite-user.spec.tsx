// Behaviour of the invite-user form.
//
// This screen is where the platform's two sign-in paths are chosen for a colleague, and it models
// them as mutually exclusive: a phone account (Path A, OTP) or an email account (Path B), never
// both — switching method CLEARS the contact field so a phone number can never linger in the email
// input and be sent as an address. The payload carries exactly one of the two keys, which is what
// the backend enforces on its side (user.service.ts rejects a payload carrying both).
//
// That exclusivity is permanent, and it is a property of the mechanism rather than a product
// preference. Keycloak stores exactly ONE password credential per user, and Path A writes an
// ephemeral one over it on every OTP login — so an account holding both identifiers would lose its
// password to its own login, irreversibly (the stored hash cannot be read back to restore it).
// Measured on Keycloak 26.6.4; a "unified login" letting one account use either method was proposed
// on 2026-07-31 and withdrawn on 2026-08-23 for exactly this reason (TDD OQ-14, spec §5.4.4). Do not
// relax these tests expecting it to return.
//
// The phone case also normalises: the field takes Thai national digits and the API takes E.164, so
// 0812345678 must reach the server as +66812345678 (§20.5).

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { I18nProvider } from '../../../i18n';
import InviteUserScreen from '../invite-user';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace }),
}));

jest.mock('../../../api/users', () => ({
  ...jest.requireActual('../../../api/users'),
  createUser: jest.fn(),
}));
jest.mock('../../../api/projects', () => ({
  ...jest.requireActual('../../../api/projects'),
  getMyProjects: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const users = require('../../../api/users') as { createUser: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const projects = require('../../../api/projects') as { getMyProjects: jest.Mock };

function renderScreen() {
  return render(
    <I18nProvider>
      <InviteUserScreen />
    </I18nProvider>,
  );
}

describe('InviteUserScreen', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    mockReplace.mockReset();
    users.createUser.mockReset();
    users.createUser.mockResolvedValue({ user_id: 'u-1' });
    projects.getMyProjects.mockReset();
    projects.getMyProjects.mockResolvedValue([]);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => alert.mockRestore());

  it('offers both methods', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('invite-method-phone')).toBeTruthy();
    expect(getByTestId('invite-method-email')).toBeTruthy();
  });

  it('sends a phone invitation in E.164', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('invite-name'), 'Waraporn Klinhom');
    await fireEvent.press(getByTestId('invite-role-SITE_WORKER'));
    await fireEvent.changeText(getByTestId('invite-contact'), '0812345678');
    await fireEvent.press(getByTestId('invite-send'));

    await waitFor(() =>
      expect(users.createUser).toHaveBeenCalledWith({
        display_name: 'Waraporn Klinhom',
        role: 'SITE_WORKER',
        phone_number: '+66812345678',
      }),
    );
  });

  // ONE key, never both.
  it('sends an email invitation with no phone key at all', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('invite-method-email'));
    await fireEvent.changeText(getByTestId('invite-name'), 'Somchai Jaidee');
    await fireEvent.press(getByTestId('invite-role-EXECUTIVE'));
    await fireEvent.changeText(getByTestId('invite-contact'), 'somchai@example.com');
    await fireEvent.press(getByTestId('invite-send'));

    await waitFor(() => expect(users.createUser).toHaveBeenCalledTimes(1));
    expect(users.createUser.mock.calls[0][0]).toEqual({
      display_name: 'Somchai Jaidee',
      role: 'EXECUTIVE',
      email: 'somchai@example.com',
    });
  });

  // Only the first four roles are on the form; the rest are a route of their own, so a test that
  // reaches for a hidden one is testing the wrong screen.
  it('sends the roles it cannot show to their own screen', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('invite-show-more-roles')).toBeTruthy();
  });

  // The reason the field is cleared: a number left in the email input would be sent as an address.
  it('clears the contact when the method changes', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('invite-contact'), '0812345678');
    await fireEvent.press(getByTestId('invite-method-email'));

    await waitFor(() => expect(getByTestId('invite-contact').props.value).toBe(''));
  });

  it('refuses to send without a name', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('invite-role-SITE_WORKER'));
    await fireEvent.changeText(getByTestId('invite-contact'), '0812345678');
    await fireEvent.press(getByTestId('invite-send'));

    expect(users.createUser).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalled();
  });

  it('refuses to send without a role', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('invite-name'), 'Waraporn Klinhom');
    await fireEvent.changeText(getByTestId('invite-contact'), '0812345678');
    await fireEvent.press(getByTestId('invite-send'));

    expect(users.createUser).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalled();
  });

  it('refuses an address that is not one', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('invite-method-email'));
    await fireEvent.changeText(getByTestId('invite-name'), 'Somchai Jaidee');
    await fireEvent.press(getByTestId('invite-role-EXECUTIVE'));
    await fireEvent.changeText(getByTestId('invite-contact'), 'not-an-email');
    await fireEvent.press(getByTestId('invite-send'));

    expect(users.createUser).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalled();
  });

  it('hands the confirmation screen what was actually submitted', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('invite-name'), 'Waraporn Klinhom');
    await fireEvent.press(getByTestId('invite-role-SITE_WORKER'));
    await fireEvent.changeText(getByTestId('invite-contact'), '0812345678');
    await fireEvent.press(getByTestId('invite-send'));

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/invitation-success',
        params: {
          method: 'phone',
          contact: '+66812345678',
          role: 'SITE_WORKER',
          projects: '',
        },
      }),
    );
  });

  it('stays on the form and says so when the identity already exists', async () => {
    users.createUser.mockRejectedValue(new Error('Request failed: 409'));

    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('invite-name'), 'Waraporn Klinhom');
    await fireEvent.press(getByTestId('invite-role-SITE_WORKER'));
    await fireEvent.changeText(getByTestId('invite-contact'), '0812345678');
    await fireEvent.press(getByTestId('invite-send'));

    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
