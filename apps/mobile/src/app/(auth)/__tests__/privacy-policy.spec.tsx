// Behaviour of the PRE-AUTH privacy policy — the one a reader sees before they have an account.
//
// TWO ROUTES, ONE DOCUMENT. This and its (app) twin both mount <PrivacyPolicyDocument />; the policy
// text, its version and its effective date live there and are not duplicated. What this file is, is
// the pre-auth CHROME — its own app bar, because there is no (app) shell out here, and its own
// safe-area insets. So what these tests check is the chrome and the wiring, not the copy.
//
// THE FIVE ROWS PUSH REAL SCREENS, AND THE ROUTE NAMES ARE MAPPED RATHER THAN INTERPOLATED. The
// section ids are the policy's own vocabulary (`compliance`, `security`, `rights`) and the routes are
// named for what the mockup calls the screens (`pdpa-gdpr`, `technical-security`, `user-rights`) —
// `/(auth)/privacy-${id}` would push three routes that do not exist. The map makes a renamed section
// a compile error; these tests make a re-interpolated one a test failure.
//
// THE DATA-COLLECTION CARD DOES NOT OPEN THE TRANSPARENCY PORTAL HERE, which is the one thing its
// (app) twin adds. Every portal screen sits behind AuthGate and one of them renders the signed-in
// user's own record — there is nowhere for a pre-auth reader to go.
//
// AND THE DOWNLOAD IS OFFERED HERE, unlike post-auth: a reader with no account has no ADR-078
// account-holder export to use instead, so this is their only copy.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from '../../../i18n';
import PrivacyPolicyScreen from '../privacy-policy';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
}));

const mockDownloadPolicy = jest.fn();
jest.mock('../../../lib/legalDownload', () => ({
  downloadPolicy: (...args: unknown[]) => mockDownloadPolicy(...args),
}));

// The real provider renders NO CHILDREN without metrics, so a screen reading insets needs them
// supplied — this route has its own app bar and pads it by the notch, which is the point of them.
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <I18nProvider>
        <PrivacyPolicyScreen />
      </I18nProvider>
    </SafeAreaProvider>,
  );
}

describe('PrivacyPolicyScreen (pre-auth)', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockBack.mockReset();
    mockDownloadPolicy.mockReset().mockResolvedValue(undefined);
  });

  it('renders the one copy of the policy', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('privacy-policy')).toBeTruthy();
    expect(getByTestId('privacy-section-collection')).toBeTruthy();
  });

  // ITS OWN APP BAR, because there is no (app) shell out here — the post-auth twin has none, since
  // <TopBar /> supplies the title and the back control there and §32.7 names a screen ONCE.
  it('carries its own app bar, which the post-auth twin does not', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('privacy-policy-back')).toBeTruthy();
  });

  it('goes back rather than pushing a route', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('privacy-policy-back'));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── THE FIVE SECTION SCREENS ─────────────────────────────────────────────────────────────────
  //
  // Mapped, not interpolated. Three of these five would be broken routes under `privacy-${id}`.

  it.each([
    ['collection', '/(auth)/privacy-data-collection'],
    ['usage', '/(auth)/privacy-data-usage'],
    ['compliance', '/(auth)/privacy-pdpa-gdpr'],
    ['security', '/(auth)/privacy-technical-security'],
    ['rights', '/(auth)/privacy-user-rights'],
  ])('opens the %s section at its own route', async (id, route) => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId(`privacy-section-${id}`));

    expect(mockPush).toHaveBeenCalledWith(route);
  });

  // The rows LEAD SOMEWHERE rather than expanding: this screen's own drawing carries EMPTY accordion
  // bodies, and the section screens are what fills them (PO 2026-08-17).
  it('pushes rather than expanding, unlike the post-auth twin', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('privacy-section-usage'));

    expect(queryByTestId('privacy-section-usage-body')).toBeNull();
  });

  // The one thing the (app) twin adds and this cannot: every portal screen is behind AuthGate.
  it('does not offer the transparency portal to a reader with no account', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('privacy-section-collection'));

    expect(mockPush).not.toHaveBeenCalledWith('/transparency');
  });

  // ── THE TWO ACTIONS A PRE-AUTH READER HAS ────────────────────────────────────────────────────

  // A reader with no account has no ADR-078 export route, so a free-text request to the DPO is how
  // they reach a person at all.
  it('opens the DPO contact form', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('privacy-contact-link'));

    expect(mockPush).toHaveBeenCalledWith('/(auth)/privacy-contact');
  });

  // ENABLED here, unlike post-auth where the same control is drawn disabled with a coming-soon chip:
  // this is the reader's only copy of the notice they are being asked to accept.
  it('offers a real download, not a disabled one', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('privacy-download-pdf').props.accessibilityState.disabled).toBeFalsy();

    await fireEvent.press(getByTestId('privacy-download-pdf'));

    await waitFor(() => expect(mockDownloadPolicy).toHaveBeenCalledTimes(1));
  });

  // THE RECEIPT IS A ROUTE THIS SCREEN CHOOSES, not one the fetcher knows: `downloadPolicy` is handed
  // only the base URL, and the hook pushes the receipt afterwards. The two legal documents land on
  // different receipts and share the one helper, so the route has to come from the caller.
  it('lands on its own receipt, carrying what was downloaded', async () => {
    mockDownloadPolicy.mockResolvedValue({
      fileName: 'privacy-policy-v2.pdf',
      version: '2.0',
      sizeBytes: 184_320,
      sha256: 'abc123',
      verified: true,
      downloadedAt: '2026-08-20T09:00:00Z',
    });

    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('privacy-download-pdf'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(mockPush.mock.calls[0][0]).toMatchObject({
      pathname: '/(auth)/privacy-policy-downloaded',
      // The receipt states what the reader actually got — a hash they can check, and whether this
      // app checked it. A receipt without them would be a page saying "downloaded" and nothing more.
      params: { fileName: 'privacy-policy-v2.pdf', sha256: 'abc123', verified: 'true' },
    });
  });

  // A download that failed pushes NOTHING: a receipt for a file that never arrived is a page
  // asserting the reader holds a copy of the notice they were asked to accept.
  it('issues no receipt when the download failed', async () => {
    mockDownloadPolicy.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('privacy-download-pdf'));

    await waitFor(() => expect(mockDownloadPolicy).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
  });

  // A failed download must not leave the control spinning: the reader is offline, and a button that
  // never comes back reads as an app that has stopped.
  it('comes back from a download that failed', async () => {
    mockDownloadPolicy.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('privacy-download-pdf'));

    await waitFor(() =>
      expect(getByTestId('privacy-download-pdf').props.accessibilityState.disabled).toBeFalsy(),
    );
  });
});
