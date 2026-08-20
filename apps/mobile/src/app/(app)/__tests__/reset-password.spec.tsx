// Behaviour of the admin's reset-password screen.
//
// Two methods, and which one is offered is decided by the target account rather than by the admin:
// the email reset link is the standards-compliant primary (NIST 800-63B Rev.4) and is preselected
// when the user has an email, and the temporary password is the fallback for a phone-only account
// with none. The screen is kept mounted by the Tabs navigator and REUSED for the next user, which
// is the interesting case — a no-email target must not inherit the previous target's "email"
// selection and be reset by a link that can never be delivered.
//
// The avatar's fallback is asserted here too: PO 2026-08-20 replaced the literal "?" with a person
// glyph wherever a name yields no initials.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import ResetPasswordScreen from '../reset-password';

let mockParams: Record<string, string> = {};
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace }),
}));

jest.mock('../../../api/users', () => ({
  ...jest.requireActual('../../../api/users'),
  resetUserPassword: jest.fn(),
  sendResetLinkEmail: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../../api/users') as {
  resetUserPassword: jest.Mock;
  sendResetLinkEmail: jest.Mock;
};

const WITH_EMAIL = {
  user_id: 'u-1',
  display_name: 'Waraporn Klinhom',
  email: 'waraporn@example.com',
  role: 'SITE_ENGINEER',
  photo_url: '',
  is_active: 'true',
};

function renderScreen() {
  return render(
    <I18nProvider>
      <ResetPasswordScreen />
    </I18nProvider>,
  );
}

describe('ResetPasswordScreen', () => {
  beforeEach(() => {
    mockParams = { ...WITH_EMAIL };
    mockReplace.mockReset();
    api.resetUserPassword.mockReset();
    api.sendResetLinkEmail.mockReset();
    api.sendResetLinkEmail.mockResolvedValue({ email: WITH_EMAIL.email });
    api.resetUserPassword.mockResolvedValue({
      display_name: WITH_EMAIL.display_name,
      temporary_password: 'Temp-1234',
    });
  });

  it('names the account being reset', async () => {
    const { getByText } = await renderScreen();

    expect(getByText('Waraporn Klinhom')).toBeTruthy();
  });

  it('sends the reset link when the account has an email', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('reset-confirm'));

    await waitFor(() => expect(api.sendResetLinkEmail).toHaveBeenCalledWith('u-1'));
    expect(api.resetUserPassword).not.toHaveBeenCalled();
  });

  it('carries the address the server actually sent to onto the receipt', async () => {
    // Not the address in the route: the server is what knows where the link went.
    api.sendResetLinkEmail.mockResolvedValue({ email: 'work@example.com' });

    const { getByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('reset-confirm'));

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/reset-password-email-success',
        params: { display_name: 'Waraporn Klinhom', email: 'work@example.com' },
      }),
    );
  });

  // The fallback path: no address to send a link to, so the temporary password is the only method.
  it('falls back to the temporary password for an account with no email', async () => {
    mockParams = { ...WITH_EMAIL, email: '' };

    const { getByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('reset-confirm'));

    await waitFor(() => expect(api.resetUserPassword).toHaveBeenCalledWith('u-1'));
    expect(api.sendResetLinkEmail).not.toHaveBeenCalled();
  });

  it('hands the temporary password to the receipt rather than showing it here', async () => {
    mockParams = { ...WITH_EMAIL, email: '' };

    const { getByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('reset-confirm'));

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/reset-password-success',
        params: {
          user_id: 'u-1',
          display_name: 'Waraporn Klinhom',
          temp_password: 'Temp-1234',
        },
      }),
    );
  });

  it('lets the admin choose the temporary password even when an email exists', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('method-temp'));
    await fireEvent.press(getByTestId('reset-confirm'));

    await waitFor(() => expect(api.resetUserPassword).toHaveBeenCalledWith('u-1'));
  });

  it('does nothing when the route carried no user', async () => {
    mockParams = { ...WITH_EMAIL, user_id: '' };

    const { getByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('reset-confirm'));

    expect(api.sendResetLinkEmail).not.toHaveBeenCalled();
    expect(api.resetUserPassword).not.toHaveBeenCalled();
  });

  // PO 2026-08-20 — a name that yields no initials draws the glyph, not a literal "?".
  it('falls back to a person glyph when the name yields no initials', async () => {
    mockParams = { ...WITH_EMAIL, display_name: '   ' };

    const { getByTestId, queryByText } = await renderScreen();

    expect(getByTestId('icon-person')).toBeTruthy();
    expect(queryByText('?')).toBeNull();
  });

  it('shows the initials when the name reads', async () => {
    const { getByText } = await renderScreen();

    expect(getByText('WK')).toBeTruthy();
  });
});
