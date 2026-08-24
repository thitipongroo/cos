// Behaviour of the MFA enrolment screen (ADR-074 — Keycloak AIA over an OIDC round trip).
//
// This screen does not enrol anything itself: it hands the user to Keycloak with a `kc_action` and
// reads the answer that comes back. So what is worth pinning is the reading — which action it asks
// for, and what it does with each of the four answers Keycloak can give. Two of them look like
// success at the transport level and are not: `kc_action_status` of `cancelled` or `error` arrives
// inside a `type: 'success'` response, and treating those as enrolled would tell an admin their
// account is protected when it is not.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from '../../../i18n';
import MfaEnrollmentScreen from '../mfa-enrollment';

let mockAction: string | undefined;
let mockResponse: unknown = null;
let mockAnswer: unknown = null;
const mockAuthRequestArgs: unknown[] = [];

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ action: mockAction }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

// The OIDC round trip is replaced by a switch: pressing Enrol makes the pending answer the current
// response, which is what the real `promptAsync` eventually causes.
jest.mock('expo-auth-session', () => ({
  useAutoDiscovery: () => ({ authorizationEndpoint: 'https://kc.test/auth' }),
  makeRedirectUri: () => 'cos://oauth2redirect',
  useAuthRequest: (...args: unknown[]) => {
    mockAuthRequestArgs.push(args[0]);
    return [
      { url: 'https://kc.test/auth' },
      mockResponse,
      () => {
        mockResponse = mockAnswer;
        return Promise.resolve(mockAnswer);
      },
    ];
  },
}));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <I18nProvider>
        <MfaEnrollmentScreen />
      </I18nProvider>
    </SafeAreaProvider>,
  );
}

describe('MfaEnrollmentScreen', () => {
  beforeEach(() => {
    mockAction = undefined;
    mockResponse = null;
    mockAnswer = null;
    mockAuthRequestArgs.length = 0;
  });

  it('opens on the intro, with the enrol action live', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('mfa-enrollment')).toBeTruthy();
    expect(getByTestId('mfa-enroll-start').props.accessibilityState.disabled).toBe(false);
  });

  it('asks Keycloak to configure TOTP by default', async () => {
    await renderScreen();

    expect(
      (mockAuthRequestArgs[0] as { extraParams: Record<string, string> }).extraParams.kc_action,
    ).toBe('CONFIGURE_TOTP');
  });

  // Same screen, second job: `?action=recovery` asks for the recovery codes instead.
  it('asks for recovery codes when the route says so', async () => {
    mockAction = 'recovery';

    await renderScreen();

    expect(
      (mockAuthRequestArgs[0] as { extraParams: Record<string, string> }).extraParams.kc_action,
    ).toBe('CONFIGURE_RECOVERY_AUTHN_CODES');
  });

  it('shows the enrolled screen when Keycloak reports the action was done', async () => {
    mockAnswer = { type: 'success', params: { kc_action_status: 'success' } };

    const { getByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('mfa-enroll-start'));

    await waitFor(() => expect(getByTestId('mfa-success-dashboard')).toBeTruthy());
  });

  it('shows the codes screen when the recovery action was done', async () => {
    mockAction = 'recovery';
    mockAnswer = { type: 'success', params: { kc_action_status: 'success' } };

    const { getByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('mfa-enroll-start'));

    await waitFor(() => expect(getByTestId('mfa-downloaded-back')).toBeTruthy());
  });

  // The trap: a CANCELLED action arrives as a `type: 'success'` response. Reading only the type
  // would report an account as protected when the user backed out of the Keycloak page.
  it('does NOT report enrolment when the user cancelled inside Keycloak', async () => {
    mockAnswer = { type: 'success', params: { kc_action_status: 'cancelled' } };

    const { getByTestId, queryByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('mfa-enroll-start'));

    await waitFor(() =>
      expect(getByTestId('mfa-enroll-start').props.accessibilityState.busy).toBe(false),
    );
    expect(queryByTestId('mfa-success-dashboard')).toBeNull();
  });

  it('does NOT report enrolment when Keycloak reports the action errored', async () => {
    mockAnswer = { type: 'success', params: { kc_action_status: 'error' } };

    const { getByTestId, queryByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('mfa-enroll-start'));

    await waitFor(() =>
      expect(getByTestId('mfa-enroll-start').props.accessibilityState.busy).toBe(false),
    );
    expect(queryByTestId('mfa-success-dashboard')).toBeNull();
  });

  it('does NOT report enrolment when the round trip itself failed', async () => {
    mockAnswer = { type: 'error', params: {} };

    const { getByTestId, queryByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('mfa-enroll-start'));

    await waitFor(() =>
      expect(getByTestId('mfa-enroll-start').props.accessibilityState.busy).toBe(false),
    );
    expect(queryByTestId('mfa-success-dashboard')).toBeNull();
  });
});
