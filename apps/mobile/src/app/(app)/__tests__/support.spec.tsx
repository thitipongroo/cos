// Behaviour of the post-auth Support Centre — the one way in from a signed-in screen (PO 2026-08-17).
//
// What this route adds over its pre-auth twin is the three answers a support call actually asks for,
// and the reason each is real rather than drawn: WHO is asking (the session already knows, so the
// person on the phone does not have to say), WHICH SITE they are on, and the DIAGNOSTICS — network,
// queued changes, unresolved conflicts. The pre-auth FIELD ASSISTANT panel is deliberately not
// carried over: it exists to say something when the app knows nothing else, and here the app knows
// these.
//
// SEARCH STAYS DISABLED on both routes (PO 2026-08-09, re-affirmed 2026-08-17). There is no
// help_article table and no search endpoint, so a live-looking box that returns nothing would be the
// screen pretending to have a corpus it does not have.
//
// The role's module list comes from `drawerLinksFor` — the same source the drawer derives from, so
// "should I be able to see X?" cannot be answered here differently from what the user can open.

import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CosRole } from '@cos/types';
import { I18nProvider } from '../../../i18n';
import { drawerLinksFor } from '../../../lib/drawerLinks';
import { useAuthStore } from '../../../store/authStore';
import { useOfflineStore } from '../../../store/offlineStore';
import { useProjectStore } from '../../../store/projectStore';
import SupportScreen from '../support';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

let mockOnline = true;
let mockPending = 0;
let mockConflicts: unknown[] = [];

// The hook returns a NetworkStatus object, not a boolean.
jest.mock('../../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: mockOnline, connectionType: null }),
}));
jest.mock('../../../hooks/usePendingCount', () => ({ usePendingCount: () => mockPending }));
jest.mock('../../../hooks/useConflicts', () => ({ useConflicts: () => mockConflicts }));
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

describe('SupportScreen (post-auth)', () => {
  beforeEach(() => {
    mockOnline = true;
    mockPending = 0;
    mockConflicts = [];
    health.checkBackendHealth.mockReset();
    health.checkBackendHealth.mockResolvedValue(true);
    useAuthStore.setState({
      displayName: 'Waraporn Klinhom',
      role: CosRole.SITE_ENGINEER,
    } as never);
    useProjectStore.setState({
      active: { projectId: 'p-1', projectName: 'Riverside Tower' },
    } as never);
    useOfflineStore.setState({ localDbStatus: 'OK' } as never);
  });

  it('renders the support centre', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('support')).toBeTruthy());
  });

  // The session already knows who is asking.
  it('says who is asking', async () => {
    const { getByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getByTestId('support-context')).toBeTruthy());
    expect(getByText('Waraporn Klinhom')).toBeTruthy();
  });

  it('names the site they are on', async () => {
    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText('Riverside Tower')).toBeTruthy());
  });

  // A placeholder would read as a site called something; the line says there is none.
  it('says no site is selected rather than printing a placeholder', async () => {
    useProjectStore.setState({ active: null } as never);

    const { getByTestId, queryByText } = await renderScreen();

    await waitFor(() => expect(getByTestId('support-context')).toBeTruthy());
    expect(queryByText('Riverside Tower')).toBeNull();
  });

  // The three numbers a support call asks for.
  it('shows the diagnostics', async () => {
    mockPending = 3;

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('support-diagnostics')).toBeTruthy());
  });

  it('shows the diagnostics offline too, which is when they matter most', async () => {
    mockOnline = false;
    mockPending = 5;

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('support-diagnostics')).toBeTruthy());
  });

  // The same source the drawer derives from, so the two cannot disagree about what a role can open.
  it('lists the role`s own modules, from the drawer`s source', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('support-modules')).toBeTruthy());
    expect(drawerLinksFor(CosRole.SITE_ENGINEER).length).toBeGreaterThan(0);
  });

  it('lists a different set for a different role', async () => {
    useAuthStore.setState({ displayName: 'Somchai Jaidee', role: CosRole.TENANT_ADMIN } as never);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('support-modules')).toBeTruthy());
  });

  // No help_article table, no search endpoint — a live box returning nothing would be the screen
  // pretending to a corpus it does not have.
  it('leaves search disabled, because there is nothing to search', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('support-search')).toBeTruthy());
    expect(getByTestId('support-search').props.editable).toBe(false);
  });

  it('offers the contact routes the deployment configured', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('support-call-center')).toBeTruthy());
  });

  it('shows the backend status once the probe answers', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('support-status')).toBeTruthy());
  });

  it('still renders when the health probe says the backend is down', async () => {
    health.checkBackendHealth.mockResolvedValue(false);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('support-status')).toBeTruthy());
    expect(getByTestId('support-diagnostics')).toBeTruthy();
  });
});
