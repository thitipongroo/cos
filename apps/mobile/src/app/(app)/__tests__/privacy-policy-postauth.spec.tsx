// Behaviour of the POST-AUTH privacy policy.
//
// PDPA §23 makes the notice a standing disclosure, not a one-time consent screen, so a signed-in
// user needs the same notice they were shown before signing up. This route mounts the SAME
// <PrivacyPolicyDocument /> as the pre-auth one: there is exactly one copy of the policy text in the
// app, and that is the point of the twin rather than a second document.
//
// Two things differ, both consequences of being inside the app shell. It has no app bar of its own —
// <TopBar /> supplies the title, the breadcrumb and the back control — and it takes its accent from
// the palette rather than pinning dark, because §32.7 scopes the cyan to the auth entry screens.
//
// And it adds one thing the pre-auth route cannot: the Data Collection card opens the Transparency
// Portal (PO 2026-08-04), which is the deep version of that section and is only reachable once
// signed in. The download and DPO-contact actions are NOT passed here — those belong to the
// pre-auth route, where a reader has no account-holder export route (ADR-078) to use instead.

import { render, fireEvent } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import PrivacyPolicyScreen from '../privacy-policy';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

function renderScreen() {
  return render(
    <I18nProvider>
      <PrivacyPolicyScreen />
    </I18nProvider>,
  );
}

describe('PrivacyPolicyScreen (post-auth)', () => {
  beforeEach(() => mockPush.mockReset());

  it('renders the one copy of the policy', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('privacy-policy')).toBeTruthy();
  });

  it('renders the policy sections', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('privacy-section-collection')).toBeTruthy();
  });

  // No app bar of its own: TopBar supplies the title and the back control, and §32.7 names a screen
  // ONCE. A back control here would be the second one on the same screen.
  it('carries no app bar of its own', async () => {
    const { queryByTestId } = await renderScreen();

    expect(queryByTestId('privacy-policy-back')).toBeNull();
  });

  // THE ONE THING THIS ROUTE ADDS: the deep version of the section, only reachable signed in.
  it('opens the transparency portal from the data-collection card', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('privacy-section-collection'));

    expect(mockPush).toHaveBeenCalledWith('/transparency');
  });

  // The download and the DPO contact belong to the PRE-AUTH route: signed in, a reader has the
  // account-holder export routes (ADR-078) instead of a free-text request. The controls are still
  // DRAWN here — the document renders them disabled with a coming-soon chip when it is handed no
  // handler — which is the same call the rest of the app makes: a control with nothing behind it
  // says so rather than vanishing or doing nothing.
  it('draws the download disabled here, because no handler is passed', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('privacy-download-pdf').props.accessibilityState.disabled).toBe(true);
  });

  // Post-auth does NOT pass `onSection`: the five rows keep their accordion instead of navigating,
  // because the section screens are pre-auth routes behind AuthGate.
  it('keeps the sections as an accordion rather than routing to the pre-auth screens', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('privacy-section-usage'));

    expect(getByTestId('privacy-section-usage-body')).toBeTruthy();
    expect(queryByTestId('privacy-section-collection-body')).toBeNull();
  });
});
