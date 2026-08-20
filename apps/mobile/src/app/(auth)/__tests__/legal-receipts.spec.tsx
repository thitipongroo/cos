// Behaviour of the two pre-auth receipts.
//
// A DOWNLOAD RECEIPT STATES WHAT WAS WRITTEN, INCLUDING A BAD ANSWER. `verified` is passed through
// even when FALSE — a reader handed a file whose digest does not match the one the server published
// needs to be told, and a receipt that only ever shows a tick is a receipt that cannot warn. The
// screen changes its glyph, its tone and its wording on that one boolean, so all three are asserted.
//
// A PRIVACY INQUIRY RECEIPT CARRIES A REFERENCE, AND IT IS SELECTABLE. It is the only handle a data
// subject has on a request they made from a phone; a number they cannot copy is a number they will
// mistype when they follow it up.
//
// The two exits differ, and each is right for its screen. The inquiry receipt DISMISSES the whole
// stack: the form and the policy behind it are finished business. The download receipt goes BACK to
// the document it came from, which the reader may still be reading.

import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from '../../../i18n';
import PrivacyContactSentScreen from '../privacy-contact-sent';
import TermsOfUseDownloadedScreen from '../terms-of-use-downloaded';

const mockBack = jest.fn();
const mockDismissAll = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    push: jest.fn(),
    back: mockBack,
    replace: jest.fn(),
    dismissAll: mockDismissAll,
  }),
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve()),
  maybeCompleteAuthSession: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const browser = require('expo-web-browser') as { openBrowserAsync: jest.Mock };

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const SHA = 'a'.repeat(64);

function renderSent() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <I18nProvider>
        <PrivacyContactSentScreen />
      </I18nProvider>
    </SafeAreaProvider>,
  );
}

function renderDownloaded() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <I18nProvider>
        <TermsOfUseDownloadedScreen />
      </I18nProvider>
    </SafeAreaProvider>,
  );
}

describe('PrivacyContactSentScreen', () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockDismissAll.mockReset();
    mockParams = { reference: 'PI-2026-0001', receivedAt: '2026-08-20T09:00:00Z' };
  });

  it('confirms the inquiry was received', async () => {
    const { getByTestId } = await renderSent();

    expect(getByTestId('privacy-contact-sent')).toBeTruthy();
  });

  // The only handle a data subject has on a request made from a phone.
  it('shows the reference the server issued', async () => {
    const { getByTestId } = await renderSent();

    expect(String(getByTestId('privacy-contact-reference').props.children)).toBe('PI-2026-0001');
  });

  // A number they cannot copy is a number they will mistype when they follow it up.
  it('lets the reference be copied', async () => {
    const { getByTestId } = await renderSent();

    expect(getByTestId('privacy-contact-reference').props.selectable).toBe(true);
  });

  it('still reads as a receipt when no reference came through', async () => {
    mockParams = {};

    const { getByTestId } = await renderSent();

    expect(getByTestId('privacy-contact-sent')).toBeTruthy();
  });

  // The form and the policy behind it are finished business.
  it('dismisses the whole stack rather than stepping back into the form', async () => {
    const { getByTestId } = await renderSent();

    await fireEvent.press(getByTestId('privacy-contact-sent-done'));

    expect(mockDismissAll).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe('TermsOfUseDownloadedScreen', () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockDismissAll.mockReset();
    browser.openBrowserAsync.mockReset();
    browser.openBrowserAsync.mockResolvedValue(undefined);
    mockParams = {
      fileName: 'terms-v2.pdf',
      version: '2.0',
      sizeBytes: '248312',
      sha256: SHA,
      verified: 'true',
      downloadedAt: '2026-08-20T09:00:00Z',
    };
  });

  it('states what was written', async () => {
    const { getByTestId, getByText } = await renderDownloaded();

    expect(getByTestId('terms-of-use-downloaded')).toBeTruthy();
    expect(getByText('terms-v2.pdf')).toBeTruthy();
  });

  it('shows the digest that was checked', async () => {
    const { getByTestId } = await renderDownloaded();

    expect(getByTestId('terms-downloaded-sha')).toBeTruthy();
  });

  // A receipt that only ever shows a tick is a receipt that cannot warn.
  it('draws a verified download differently from an unverified one', async () => {
    const good = await renderDownloaded();

    mockParams = { ...mockParams, verified: 'false' };
    const bad = await renderDownloaded();

    expect(good.queryAllByTestId('icon-check-circle').length).toBeGreaterThan(0);
    expect(bad.queryAllByTestId('icon-check-circle')).toHaveLength(0);
    expect(bad.queryAllByTestId('icon-error-outline').length).toBeGreaterThan(0);
  });

  it('marks a digest mismatch on the assurance line too, not only in the hero', async () => {
    mockParams = { ...mockParams, verified: 'false' };

    const { queryAllByTestId } = await renderDownloaded();

    expect(queryAllByTestId('icon-verified-user')).toHaveLength(0);
    expect(queryAllByTestId('icon-gpp-maybe').length).toBeGreaterThan(0);
  });

  it('opens the document it is a receipt for', async () => {
    const { getByTestId } = await renderDownloaded();

    await fireEvent.press(getByTestId('terms-downloaded-open'));

    expect(browser.openBrowserAsync).toHaveBeenCalledTimes(1);
  });

  // The reader may still be reading the terms; this goes back to them rather than clearing the stack.
  it('returns to the document rather than dismissing everything', async () => {
    const { getByTestId } = await renderDownloaded();

    await fireEvent.press(getByTestId('terms-downloaded-back'));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockDismissAll).not.toHaveBeenCalled();
  });

  it('offers the same way back from the top bar', async () => {
    const { getByTestId } = await renderDownloaded();

    await fireEvent.press(getByTestId('terms-downloaded-back-nav'));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
