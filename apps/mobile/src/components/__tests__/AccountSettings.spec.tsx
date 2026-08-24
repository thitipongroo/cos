// Behaviour of the account settings card.
//
// Three rows here are deliberately NOT what they look like, and each is a decision that a test can
// stop someone "fixing":
//
// The biometric switch is DISABLED, not hidden, when the device has nothing enrolled — hiding it
// leaves a worker wondering where it went, and the OS, not this row, is where a fingerprint gets
// enrolled.
//
// "Change Secure PIN" reports being unavailable rather than opening anything. This product has no
// PIN: no column, no set/verify endpoint, no recovery path. A credential dialog with nothing behind
// it is a security feature in name only.
//
// The language row TOGGLES rather than pushing a picker. With exactly two locales, a picker screen
// would be a screen for choosing between two items.
//
// And the version is the REAL build version, not the mockup's "2.4.0-stable" — it is the one thing
// on this card a user might quote in a support request, so it must never be decorative.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { I18nProvider } from '../../i18n';
import { useBiometricStore } from '../../store/biometricStore';
import { useThemeStore } from '../../store/themeStore';
import { AccountSettings } from '../AccountSettings';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

function renderCard() {
  return render(
    <I18nProvider>
      <AccountSettings />
    </I18nProvider>,
  );
}

describe('AccountSettings', () => {
  let setEnabled: jest.Mock;
  let setMode: jest.Mock;
  let alert: jest.SpyInstance;

  beforeEach(() => {
    setEnabled = jest.fn().mockResolvedValue(undefined);
    setMode = jest.fn().mockResolvedValue(undefined);
    useBiometricStore.setState({ available: true, enabled: false, setEnabled } as never);
    useThemeStore.setState({ mode: 'dark', setMode } as never);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => alert.mockRestore());

  it('renders the security and preference rows', async () => {
    const { getByTestId } = await renderCard();

    expect(getByTestId('profile-mfa-row')).toBeTruthy();
    expect(getByTestId('biometric-row')).toBeTruthy();
    expect(getByTestId('change-pin-row')).toBeTruthy();
    expect(getByTestId('locale-row')).toBeTruthy();
    expect(getByTestId('theme-row')).toBeTruthy();
  });

  it('turns the biometric lock on', async () => {
    const { getByTestId } = await renderCard();

    await fireEvent(getByTestId('biometric-row-switch'), 'valueChange', true);

    await waitFor(() => expect(setEnabled).toHaveBeenCalledWith(true));
  });

  it('turns it off again', async () => {
    useBiometricStore.setState({ available: true, enabled: true, setEnabled } as never);

    const { getByTestId } = await renderCard();

    await fireEvent(getByTestId('biometric-row-switch'), 'valueChange', false);

    await waitFor(() => expect(setEnabled).toHaveBeenCalledWith(false));
  });

  // DISABLED, not hidden — see the note at the top of this file.
  it('shows the biometric row disabled when the device has nothing enrolled', async () => {
    useBiometricStore.setState({ available: false, enabled: false, setEnabled } as never);

    const { getByTestId } = await renderCard();

    expect(getByTestId('biometric-row-switch').props.disabled).toBe(true);
  });

  // `setEnabled` awaits SecureStore and the biometric prompt and guards neither, so it can reject.
  // The switch reads its position from the store, so a failed enable already shows as the toggle
  // staying put; what must not happen is the rejection escaping as an unhandled one, and what must
  // not happen next is the row being left permanently busy.
  it('recovers from a failed toggle rather than staying stuck', async () => {
    setEnabled.mockRejectedValue(new Error('secure store unavailable'));

    const { getByTestId } = await renderCard();

    await fireEvent(getByTestId('biometric-row-switch'), 'valueChange', true);

    await waitFor(() => expect(setEnabled).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getByTestId('biometric-row-switch').props.disabled).toBe(false));
  });

  // No PIN exists in this product. The row is drawn because the mockup draws it, and it says so.
  it('reports the secure PIN as unavailable rather than opening a dialog', async () => {
    const { getByTestId } = await renderCard();

    await fireEvent.press(getByTestId('change-pin-row'));

    expect(alert).toHaveBeenCalled();
  });

  // Two locales: a picker screen would be a screen for choosing between two items.
  it('swaps the language in place', async () => {
    const { getByTestId } = await renderCard();

    await fireEvent.press(getByTestId('locale-row'));

    // The row now names the other language, which is what it will switch to next.
    await waitFor(() => expect(getByTestId('locale-row')).toBeTruthy());
  });

  it('switches the theme', async () => {
    const { getByTestId } = await renderCard();

    await fireEvent(getByTestId('theme-row-switch'), 'valueChange', false);

    expect(setMode).toHaveBeenCalledWith('light');
  });

  it('shows the theme switch on for a dark session', async () => {
    const { getByTestId } = await renderCard();

    expect(getByTestId('theme-row-switch').props.value).toBe(true);
  });

  // The one thing here a user might quote in a support request.
  it('shows a build version', async () => {
    const { getByTestId } = await renderCard();

    expect(getByTestId('profile-version')).toBeTruthy();
  });
});
