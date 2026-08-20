// Behaviour of the sign-in screen — the one screen every user of this product passes through, and
// until now the largest one with no test at all.
//
// What is pinned here is the Path A phone/OTP flow: the number is assembled from the country's dial
// code and the national digits (the field takes 0812345678 and the API must receive +66812345678 —
// §20.5), the screen advances to the code step only when the request succeeds, and a failure leaves
// the caller on the step they were on with a message rather than moving them forward.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from '../../../i18n';
import { useAuthStore } from '../../../store/authStore';
import LoginScreen from '../login';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

// Path B (Keycloak OIDC) is stubbed out: `makeRedirectUri` reads the expo-constants manifest, which
// a jest run has no app.json for, and this spec is about Path A. The office button is still
// rendered and asserted — only the OIDC machinery behind it is inert.
jest.mock('expo-auth-session', () => ({
  useAutoDiscovery: () => null,
  makeRedirectUri: () => 'cos://oauth2redirect',
  useAuthRequest: () => [null, null, jest.fn()],
  exchangeCodeAsync: jest.fn(),
}));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));
// The screen picks the dial code from the device region on mount. TH keeps the fixtures below
// honest — the E.164 assertions are +66.
jest.mock('expo-localization', () => ({ getLocales: () => [{ regionCode: 'TH' }] }));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

// Thailand's `nationalDigits` is 10 — the leading 0 is part of what a Thai user types, and the
// button stays disabled until all ten are in. `toE164` is what drops the 0.
const NATIONAL = '0812345678';
const E164 = '+66812345678';

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <I18nProvider>
        <LoginScreen />
      </I18nProvider>
    </SafeAreaProvider>,
  );
}

describe('LoginScreen', () => {
  let requestOtp: jest.Mock;
  let verifyOtp: jest.Mock;

  beforeEach(() => {
    requestOtp = jest.fn().mockResolvedValue({ resendCooldownSeconds: 30 });
    verifyOtp = jest.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ requestOtp, verifyOtp } as never);
  });

  it('opens on the phone step, with no code field yet', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    expect(getByTestId('phone-input')).toBeTruthy();
    expect(queryByTestId('otp-input')).toBeNull();
  });

  // §20.5: the field takes national digits and the API takes E.164. Getting this wrong sends an OTP
  // to a number that does not exist, which looks to the user like the SMS never arrived.
  it('sends the number in E.164, not as the digits that were typed', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('phone-input'), NATIONAL);
    await fireEvent.press(getByTestId('request-otp-button'));

    await waitFor(() => expect(requestOtp).toHaveBeenCalledWith(E164));
  });

  it('moves on to the code step once the request succeeds', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('phone-input'), NATIONAL);
    await fireEvent.press(getByTestId('request-otp-button'));

    await waitFor(() => expect(getByTestId('otp-input')).toBeTruthy());
  });

  it('keeps the caller on the phone step when the SMS could not be sent', async () => {
    requestOtp.mockRejectedValue(new Error('no route to host'));

    const { getByTestId, queryByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('phone-input'), NATIONAL);
    await fireEvent.press(getByTestId('request-otp-button'));

    await waitFor(() => expect(getByTestId('login-error')).toBeTruthy());
    expect(queryByTestId('otp-input')).toBeNull();
  });

  it('verifies the code against the same number the OTP was sent to', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('phone-input'), NATIONAL);
    await fireEvent.press(getByTestId('request-otp-button'));
    await waitFor(() => expect(getByTestId('otp-input')).toBeTruthy());

    await fireEvent.changeText(getByTestId('otp-input'), ' 123456 ');
    await fireEvent.press(getByTestId('verify-otp-button'));

    // Trimmed — a code pasted from an SMS carries whitespace often enough to matter.
    await waitFor(() => expect(verifyOtp).toHaveBeenCalledWith(E164, '123456'));
  });

  it('reports a wrong code rather than failing silently', async () => {
    verifyOtp.mockRejectedValue(new Error('invalid otp'));

    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('phone-input'), NATIONAL);
    await fireEvent.press(getByTestId('request-otp-button'));
    await waitFor(() => expect(getByTestId('otp-input')).toBeTruthy());

    await fireEvent.changeText(getByTestId('otp-input'), '000000');
    await fireEvent.press(getByTestId('verify-otp-button'));

    await waitFor(() => expect(getByTestId('login-error')).toBeTruthy());
  });

  // ADR-050: office sign-in is the secondary action on this same screen, not a separate route.
  it('offers the office sign-in alongside the phone form', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('office-login-button')).toBeTruthy();
  });
});
