// Behaviour of the terms-of-use notice.
//
// The clauses are an ACCORDION that opens on the first one rather than fully collapsed — a reader
// lands on prose instead of six closed bars. Only one is open at a time, and pressing the open one
// closes it, so the control is a toggle rather than a one-way opener.
//
// The download is the same flow the privacy policy uses (ADR-092) and is covered end to end in
// legal-download.spec.tsx; what is asserted here is that this screen HAS it, so a refactor cannot
// quietly leave the terms without the copy PDPA-adjacent record-keeping expects.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from '../../../i18n';
import TermsOfUseScreen from '../terms-of-use';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn() }),
}));

jest.mock('../../../lib/legalDownload', () => ({
  ...jest.requireActual('../../../lib/legalDownload'),
  downloadTerms: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const legal = require('../../../lib/legalDownload') as { downloadTerms: jest.Mock };

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const FIRST = 'acceptance';
const SECOND = 'license';

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <I18nProvider>
        <TermsOfUseScreen />
      </I18nProvider>
    </SafeAreaProvider>,
  );
}

describe('TermsOfUseScreen', () => {
  beforeEach(() => {
    mockBack.mockReset();
    legal.downloadTerms.mockReset();
    legal.downloadTerms.mockResolvedValue({
      fileName: 'terms-v2.pdf',
      version: '2.0',
      sizeBytes: 100,
      sha256: 'a'.repeat(64),
      verified: true,
      downloadedAt: '2026-08-20T09:00:00Z',
    });
  });

  it('renders every clause', async () => {
    const { getByTestId } = await renderScreen();

    for (const id of ['acceptance', 'license', 'responsibilities', 'ownership', 'liability']) {
      expect(getByTestId(`terms-section-${id}`)).toBeTruthy();
    }
  });

  // Opens on the first clause: a reader lands on prose, not on six closed bars.
  it('opens on the first clause rather than fully collapsed', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    expect(getByTestId(`terms-section-${FIRST}-body`)).toBeTruthy();
    expect(queryByTestId(`terms-section-${SECOND}-body`)).toBeNull();
  });

  it('opens the clause that was pressed and closes the one that was open', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await fireEvent.press(getByTestId(`terms-section-${SECOND}`));

    await waitFor(() => expect(getByTestId(`terms-section-${SECOND}-body`)).toBeTruthy());
    expect(queryByTestId(`terms-section-${FIRST}-body`)).toBeNull();
  });

  // A toggle, not a one-way opener.
  it('closes the open clause on a second press', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await fireEvent.press(getByTestId(`terms-section-${FIRST}`));

    await waitFor(() => expect(queryByTestId(`terms-section-${FIRST}-body`)).toBeNull());
  });

  it('shows the summary tiles above the clauses', async () => {
    const { getAllByTestId } = await renderScreen();

    expect(getAllByTestId(/^terms-summary-/).length).toBeGreaterThan(0);
  });

  // The flow itself is covered in legal-download.spec.tsx; this is that the screen still offers it.
  it('offers the download, and it reaches the terms document', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('terms-download-pdf'));

    await waitFor(() => expect(legal.downloadTerms).toHaveBeenCalledTimes(1));
  });

  it('offers a way back from the notice', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('terms-of-use-back'));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  // Agreeing returns rather than navigating on: this notice is opened FROM somewhere, and the
  // acceptance belongs to whatever opened it.
  it('returns on agree rather than navigating somewhere new', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('terms-agree'));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('stays on the notice when the download fails', async () => {
    legal.downloadTerms.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('terms-download-pdf'));

    await waitFor(() => expect(legal.downloadTerms).toHaveBeenCalledTimes(1));
    expect(getByTestId('terms-of-use')).toBeTruthy();
  });
});
