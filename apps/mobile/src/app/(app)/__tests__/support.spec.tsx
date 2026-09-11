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

import { Alert } from 'react-native';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CosRole } from '@cos/types';
import { I18nProvider } from '../../../i18n';
import { SUPPORT_HELP_CATEGORIES, SUPPORT_TOP_FAQS } from '../../../lib/mockupFigures';
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

  // No help_article table, no search endpoint — a live box returning nothing would be the screen
  // pretending to a corpus it does not have.
  it('says search is not built yet on a tap, and nothing on the page', async () => {
    // It carried a standing `COMING SOON` chip until 2026-09-10. The drawing has no such chip and
    // the product owner ruled out standing notes about what is unbuilt — so the state is stated on
    // a press and nowhere else. There is still no `help_article`/`faq` table and no search endpoint.
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByTestId, queryByText } = await renderScreen();

    await waitFor(() => expect(getByTestId('support-search')).toBeTruthy());
    expect(queryByText(/coming soon/i)).toBeNull();

    await fireEvent.press(getByTestId('support-search'));
    expect(alert).toHaveBeenCalled();
    alert.mockRestore();
  });

  // ── THE 2026-09-11 SPLIT ─────────────────────────────────────────────────────────────────────
  //
  // This screen and its pre-auth twin stopped being one document on 2026-09-11. Anything about
  // getting IN — the emergency numbers, field troubleshooting, the FIELD ASSISTANT panel — is the
  // pre-auth screen's job now and is tested in `(auth)/__tests__/support-preauth.spec.tsx`. The two
  // assertions below are what that costs, written down rather than left as an absence.

  it('carries no emergency pair — that is the pre-auth screen’s job now', async () => {
    const { queryByTestId } = await renderScreen();

    await waitFor(() => expect(queryByTestId('support')).toBeTruthy());
    expect(queryByTestId('support-call-center')).toBeNull();
    // AND THE CONSEQUENCE, stated where it will be seen: the IT Hotline card was this screen's only
    // route to `/support-hotline`, so a signed-in user can no longer reach it from Support. Help
    // Chat survives through the footer's LIVE CHAT. Flagged to the product owner when the split was
    // taken; if it comes back, this assertion is the one to delete.
    expect(queryByTestId('support-it-hotline')).toBeNull();
  });

  it('carries no field troubleshooting — also the pre-auth screen’s job', async () => {
    const { queryByTestId } = await renderScreen();

    await waitFor(() => expect(queryByTestId('support')).toBeTruthy());
    expect(queryByTestId('support-topic-login')).toBeNull();
  });

  it('shows the backend status once the probe answers', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('support-status')).toBeTruthy());
  });

  it('still renders when the health probe says the backend is down', async () => {
    health.checkBackendHealth.mockResolvedValue(false);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('support-status')).toBeTruthy());
    expect(getByTestId('support-article')).toBeTruthy();
  });

  it('adds no cards of its own — the route is a frame', async () => {
    const { queryByTestId } = await renderScreen();

    await waitFor(() => expect(queryByTestId('support')).toBeTruthy());
    // YOUR SESSION, DEVICE DIAGNOSTICS and WHAT YOUR ROLE CAN OPEN were all REAL, and all three were
    // removed by the product owner on 2026-09-11: a diagnostics dump belongs to the conversation
    // about not being able to sign in, which is the pre-auth screen's job since the split. The
    // screen IS the drawing now. These three assertions are what stops one drifting back.
    expect(queryByTestId('support-context')).toBeNull();
    expect(queryByTestId('support-diagnostics')).toBeNull();
    expect(queryByTestId('support-modules')).toBeNull();
  });

  // ── THE 2026-09-11 REDRAW ────────────────────────────────────────────────────────────────────
  //
  // `mockup/mobile/support_center/01_dashboard` was redrawn and adds three sections, all of them
  // drawn rather than read: there is no help_article, faq or article model in the schema, no
  // `backend/src/modules/support/`, and no controller prefix for any of them (measured 2026-09-11).

  it('draws every Quick Help tile the register holds', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('support')).toBeTruthy());
    for (const category of SUPPORT_HELP_CATEGORIES.value) {
      const tile = getByTestId(`support-category-${category.key}`);
      expect(tile.props.accessibilityRole).toBe('button');
      // The drawing puts a chevron on every tile; a tile without one reads as a panel.
      expect(tile).toHaveTextContent(/chevron-right/);
    }
  });

  it('draws every Top FAQ row and the View all control', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('support')).toBeTruthy());
    for (const id of SUPPORT_TOP_FAQS.value) {
      expect(getByTestId(`support-faq-${id}`).props.accessibilityRole).toBe('button');
    }
    expect(getByTestId('support-faq-view-all')).toBeTruthy();
  });

  it('answers on every drawn section rather than leaving one dead', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('support-article')).toBeTruthy());

    // Pressed across ALL of them, not sampled. The FAQ rows matter most here: the drawing gives
    // each an `expand_more` and gives none of them a body, so a row that "expanded" would open onto
    // nothing — which is the drawn dead control this project refuses.
    const ids = [
      // The status card is REAL — it prints a live `GET /health/live` probe — but the chevron the
      // redraw put on it has no status page behind it, so the card itself answers on a press.
      'support-status',
      ...SUPPORT_HELP_CATEGORIES.value.map((c) => `support-category-${c.key}`),
      ...SUPPORT_TOP_FAQS.value.map((id) => `support-faq-${id}`),
      'support-faq-view-all',
      'support-article',
    ];
    for (const id of ids) {
      alert.mockClear();
      fireEvent.press(getByTestId(id));
      await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    }
    alert.mockRestore();
  });

  it('renders no FAQ answer panel, because the drawing gives the rows no body', async () => {
    const { queryByTestId } = await renderScreen();

    await waitFor(() => expect(queryByTestId('support')).toBeTruthy());
    // The drawing puts `expand_more` on each of the four and gives none of them a body, so each row
    // says so on a press instead of opening onto nothing. The pre-auth screen's TROUBLESHOOTING
    // list is the one that really expands — its four answers are written copy that exists.
    for (const id of SUPPORT_TOP_FAQS.value) {
      expect(queryByTestId(`support-faq-${id}-answer`)).toBeNull();
    }
  });

  it('sends Live Chat to the chat screen rather than raising a note', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('support-live-chat')).toBeTruthy());

    // `/help-chat` exists on both sides of login, so this half of the footer is real.
    fireEvent.press(getByTestId('support-live-chat'));
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('says so on the press when no support address is configured', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByTestId, queryByText } = await renderScreen();
    await waitFor(() => expect(getByTestId('support-email')).toBeTruthy());

    // EXPO_PUBLIC_SUPPORT_EMAIL is unset in the test environment, which is the case that matters:
    // the button says so on a press and the PAGE says nothing — the same treatment the priority
    // line's phone number has had since 2026-09-10.
    fireEvent.press(getByTestId('support-email'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(queryByText(/24\/7/)).toBeNull();
    alert.mockRestore();
  });
});
