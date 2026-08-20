// Behaviour of the account-settings route.
//
// It is a thin frame around <AccountSettings />, whose rules are covered in that component's spec.
// What only this file decides is that the frame exists at all and adds nothing of its own — and the
// two things it deliberately does NOT have are worth pinning, because both are the kind a later
// change adds back without knowing why they were left out:
//
//   NO IN-CONTENT TITLE. The breadcrumb already reads HOME › SETTINGS, and §32.7 says a screen is
//   named ONCE. A heading here would be the second name.
//
//   NOT system-settings. That is the TENANT_ADMIN tab for tenant-wide configuration; this is the
//   signed-in user's own account, on every role. The two have been confused before — they are
//   adjacent in the drawer and their names differ by one word.

import { render } from '@testing-library/react-native';
import { CosRole } from '@cos/types';
import { I18nProvider } from '../../../i18n';
import { useAuthStore } from '../../../store/authStore';
import { useBiometricStore } from '../../../store/biometricStore';
import { useThemeStore } from '../../../store/themeStore';
import AccountSettingsScreen from '../account-settings';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

function renderScreen() {
  return render(
    <I18nProvider>
      <AccountSettingsScreen />
    </I18nProvider>,
  );
}

describe('AccountSettingsScreen', () => {
  beforeEach(() => {
    useBiometricStore.setState({
      available: true,
      enabled: false,
      setEnabled: jest.fn().mockResolvedValue(undefined),
    } as never);
    useThemeStore.setState({ mode: 'dark', setMode: jest.fn() } as never);
    useAuthStore.setState({ role: CosRole.SITE_ENGINEER } as never);
  });

  it('frames the account settings', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('account-settings-screen')).toBeTruthy();
    expect(getByTestId('account-settings')).toBeTruthy();
  });

  it('carries the security and preference rows through', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('biometric-row')).toBeTruthy();
    expect(getByTestId('locale-row')).toBeTruthy();
    expect(getByTestId('theme-row')).toBeTruthy();
  });

  // §32.7 — a screen is named ONCE, and the breadcrumb already names this one.
  it('adds no heading of its own', async () => {
    const { queryByTestId } = await renderScreen();

    expect(queryByTestId('account-settings-title')).toBeNull();
    expect(queryByTestId('account-settings-heading')).toBeNull();
  });

  // Not the tenant panel. The two are adjacent in the drawer and differ by one word.
  it('is the user`s own account, not the tenant configuration', async () => {
    const { queryByTestId } = await renderScreen();

    expect(queryByTestId('tenant-admin-settings')).toBeNull();
    expect(queryByTestId('org-code')).toBeNull();
    expect(queryByTestId('delete-tenant')).toBeNull();
  });

  // Every role gets this screen; nothing here branches on which one.
  it('renders the same for a role with no admin rights', async () => {
    useAuthStore.setState({ role: CosRole.SITE_WORKER } as never);

    const { getByTestId } = await renderScreen();

    expect(getByTestId('account-settings')).toBeTruthy();
    expect(getByTestId('biometric-row')).toBeTruthy();
  });
});
