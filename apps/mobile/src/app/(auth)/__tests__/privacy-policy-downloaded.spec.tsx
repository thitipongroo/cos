// Behaviour of the privacy-policy download receipt.
//
// THE DIGEST HERE IS A REAL CHECK, and that is the whole reason this screen has one where the
// inquiry receipt does not. The server publishes the document's SHA-256 through
// /privacy/policy/metadata BEFORE the transfer, and lib/legalDownload.ts recomputes it over the
// bytes that landed — so `verified` answers "is this the policy the platform published", which a
// reader can act on. A hash of something the device itself produced would have answered nothing.
//
// SO THE FAILED CHECK IS THE CASE THAT MATTERS. A mismatch means the reader is holding a file that
// is not the published notice, and the screen has to say so in the two places a reader looks — the
// glyph at the top and the integrity card — rather than showing a green tick over a warning
// sentence. These tests read both from the same render for exactly that reason.
//
// WHAT THE DRAWING SHOWS THAT THIS DOES NOT: "v2.4.0" and "COS_Privacy_Policy_Oct2023.pdf" belong to
// no edition of this document; "Source: Secure Vault" describes no system this platform has; and
// "VIEW DATA PORTAL" leads behind AuthGate, where a pre-auth reader cannot go. Every value here
// comes from the transfer that just happened.
//
// AND OPEN PDF HANDS THE SERVER URL TO THE SYSTEM BROWSER. Opening the local file would need a
// content:// provider on Android and a share sheet on iOS — neither installed, and adding one to
// open a document the browser already renders is a dependency for nothing.

import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from '../../../i18n';
import PrivacyPolicyDownloadedScreen from '../privacy-policy-downloaded';

const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

const mockOpenBrowser = jest.fn();
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (url: string) => mockOpenBrowser(url),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const RECEIPT = {
  fileName: 'cos-privacy-policy-v1.0.0.pdf',
  version: '1.0.0',
  sizeBytes: '184320',
  sha256: 'a3f1c9d2e4b5760819aabbccddeeff00112233445566778899aabbccddeeff00',
  verified: 'true',
  downloadedAt: '2026-08-20T09:00:00Z',
};

function renderScreen(params: Record<string, string> = RECEIPT) {
  mockParams = params;
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <I18nProvider>
        <PrivacyPolicyDownloadedScreen />
      </I18nProvider>
    </SafeAreaProvider>,
  );
}

describe('PrivacyPolicyDownloadedScreen', () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockOpenBrowser.mockReset().mockResolvedValue(undefined);
  });

  it('renders the receipt for the file that was written', async () => {
    const { getByTestId, getByText } = await renderScreen();

    expect(getByTestId('privacy-policy-downloaded')).toBeTruthy();
    expect(getByText('cos-privacy-policy-v1.0.0.pdf')).toBeTruthy();
  });

  // The size is MEASURED ON DISK and shown in human units — the byte count is what the check was
  // run over, and the reader is being told what they are holding.
  it('states the size of what landed, in units a reader can use', async () => {
    const { getByText } = await renderScreen();

    expect(getByText(/180/)).toBeTruthy();
  });

  // ── THE INTEGRITY CHECK ──────────────────────────────────────────────────────────────────────

  // The full digest, and SELECTABLE: a hash a reader cannot copy is a hash they cannot check, which
  // makes it decoration on the one screen where it is the point.
  it('shows the whole digest, and lets it be copied', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('privacy-downloaded-sha').props.children).toBe(RECEIPT.sha256);
    expect(getByTestId('privacy-downloaded-sha').props.selectable).toBe(true);
  });

  it('says the file matches what the platform published', async () => {
    const { getByText, queryByText } = await renderScreen();

    // The icon stub renders the glyph name, which is how a test reads WHICH mark a screen drew.
    expect(getByText('verified-user')).toBeTruthy();
    expect(queryByText('gpp-maybe')).toBeNull();
  });

  // THE CASE THAT MATTERS: the reader is holding a file that is not the published notice.
  it('warns in both places when the digest does not match', async () => {
    const { getByText, queryByText } = await renderScreen({ ...RECEIPT, verified: 'false' });

    // The top glyph and the integrity card must not disagree — a green tick over a warning sentence
    // is a screen arguing with itself about whether to trust the file.
    expect(getByText('error-outline')).toBeTruthy();
    expect(getByText('gpp-maybe')).toBeTruthy();
    expect(queryByText('check-circle')).toBeNull();
    expect(queryByText('verified-user')).toBeNull();
  });

  // `verified` crosses as a STRING in the route params, so anything that is not exactly 'true' is
  // not a pass — an absent flag must never read as a successful check.
  it.each([['false'], [''], ['TRUE'], ['1']])(
    'treats a verified flag of %p as unverified',
    async (flag) => {
      const { getByText } = await renderScreen({ ...RECEIPT, verified: flag });

      expect(getByText('gpp-maybe')).toBeTruthy();
    },
  );

  it('treats a receipt with no flag at all as unverified', async () => {
    const { verified: _drop, ...withoutFlag } = RECEIPT;

    const { getByText } = await renderScreen(withoutFlag);

    expect(getByText('gpp-maybe')).toBeTruthy();
  });

  // ── WHAT IT WILL NOT CLAIM ───────────────────────────────────────────────────────────────────

  it('prints none of the drawing invented figures', async () => {
    const { queryByText } = await renderScreen();

    expect(queryByText(/v2\.4\.0/)).toBeNull();
    expect(queryByText(/Oct2023/)).toBeNull();
    expect(queryByText(/Secure Vault/i)).toBeNull();
  });

  // Every portal screen is behind AuthGate and one renders the signed-in reader's own record —
  // there is nowhere for a pre-auth reader to go, so the second action returns to the policy.
  it('offers the way back to the policy rather than a portal it cannot reach', async () => {
    const { getByTestId, queryByText } = await renderScreen();

    expect(queryByText(/DATA PORTAL/i)).toBeNull();

    await fireEvent.press(getByTestId('privacy-downloaded-back'));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  // ── OPENING IT ───────────────────────────────────────────────────────────────────────────────

  // The SERVER url, not the local file: the browser already renders it, and a content:// provider
  // plus a share sheet would be a dependency added to do what is already done.
  it('opens the published document in the system browser', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('privacy-downloaded-open'));

    expect(mockOpenBrowser).toHaveBeenCalledTimes(1);
    expect(String(mockOpenBrowser.mock.calls[0][0])).toMatch(/^https?:\/\//);
    expect(String(mockOpenBrowser.mock.calls[0][0])).not.toMatch(/^file:/);
  });

  // ── THE TIMESTAMP ────────────────────────────────────────────────────────────────────────────

  it('states when the file was downloaded', async () => {
    const { getByText } = await renderScreen();

    expect(getByText(/2026/)).toBeTruthy();
  });

  // A receipt reached without one shows NO date line, rather than a divider over an empty slot or
  // a date invented at render time — which would say the file was fetched now, whenever now is.
  it('shows no date line when the receipt carries no timestamp', async () => {
    const { queryByText } = await renderScreen({ ...RECEIPT, downloadedAt: '' });

    expect(queryByText(/2026/)).toBeNull();
  });
});
