// Behaviour of the PRE-AUTH Support Centre.
//
// The two support routes are deliberately not the same screen (PO 2026-08-17). Everything shared is
// in <SupportCenterDocument />; what THIS route adds is the FIELD ASSISTANT panel, and nothing else.
//
// The panel exists because before sign-in the app knows nothing — no name, no role, no site, no
// queue depth — so the post-auth diagnostics have nothing to report. What it CAN say is whether the
// platform answered, which is the question someone locked out is actually asking. That is why the
// panel is here and not there, and why the post-auth route drops it rather than carrying it over.
//
// It is also why this route has a back control of its own: it is reached from the login screen,
// which is outside the app shell, so there is no TopBar to supply one.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from '../../../i18n';
import SupportScreen from '../support';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn() }),
}));

jest.mock('../../../api/health', () => ({ checkBackendHealth: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const health = require('../../../api/health') as { checkBackendHealth: jest.Mock };

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <I18nProvider>
        <SupportScreen />
      </I18nProvider>
    </SafeAreaProvider>,
  );
}

describe('SupportScreen (pre-auth)', () => {
  beforeEach(() => {
    mockBack.mockReset();
    health.checkBackendHealth.mockReset();
    health.checkBackendHealth.mockResolvedValue(true);
  });

  it('renders the support centre', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('support')).toBeTruthy());
  });

  // WHAT THIS ROUTE ADDS, and the post-auth twin deliberately does not carry over.
  it('carries the field assistant panel', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('support-assistant')).toBeTruthy());
  });

  // Before sign-in there is no session to describe — no name, no role, no site, no queue depth.
  it('says nothing about who is asking, because it cannot know', async () => {
    const { queryByTestId } = await renderScreen();

    await waitFor(() => expect(queryByTestId('support')).toBeTruthy());
    expect(queryByTestId('support-context')).toBeNull();
    expect(queryByTestId('support-diagnostics')).toBeNull();
    expect(queryByTestId('support-modules')).toBeNull();
  });

  // The one thing it CAN answer, and the question someone locked out is actually asking.
  it('reports whether the platform answered', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('support-status')).toBeTruthy());
  });

  it('still renders when the platform did not answer', async () => {
    health.checkBackendHealth.mockResolvedValue(false);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('support-status')).toBeTruthy());
    expect(getByTestId('support-assistant')).toBeTruthy();
  });

  // Same call as the post-auth route: there is no help_article table and no search endpoint.
  it('leaves search disabled here too', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('support-search')).toBeTruthy());
    expect(getByTestId('support-search').props.editable).toBe(false);
  });

  it('offers the contact routes the deployment configured', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('support-call-center')).toBeTruthy());
  });

  // Reached from login, which is outside the app shell — so there is no TopBar to supply a back
  // control and this route carries its own.
  it('carries its own way back', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('support-back'));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
