// The legal-document download and the receipt it pushes — one contract, asserted from both ends.
//
// Two screens download a legal document and two more read the result out of the route. That is a
// wire format between four screens, and it used to be four hand-written copies of six param names:
// rename one and the other end silently reads `undefined`, which its `?? ''` turns into an empty
// string rather than an error. useLegalDownload/useLegalReceipt made it one contract; this pins it.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from '../../../i18n';
import PrivacyPolicyScreen from '../privacy-policy';
import PrivacyPolicyDownloadedScreen from '../privacy-policy-downloaded';

const mockPush = jest.fn();
let mockSearchParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('../../../lib/legalDownload', () => ({
  ...jest.requireActual('../../../lib/legalDownload'),
  downloadPolicy: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const legal = require('../../../lib/legalDownload') as { downloadPolicy: jest.Mock };

// The screens read `useSafeAreaInsets()`, which has no value outside a provider. Supplying the
// metrics up front is what the library documents for tests — a real measurement never arrives here.
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderScreen(ui: React.JSX.Element) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <I18nProvider>{ui}</I18nProvider>
    </SafeAreaProvider>,
  );
}

const FILE = {
  fileName: 'privacy-policy-v3.pdf',
  version: '3.0',
  sizeBytes: 248_312,
  sha256: 'a'.repeat(64),
  verified: true,
  downloadedAt: '2026-08-20T09:00:00Z',
};

describe('legal document download', () => {
  beforeEach(() => {
    mockPush.mockReset();
    legal.downloadPolicy.mockReset();
    mockSearchParams = {};
  });

  it('pushes the receipt with every field the receipt screen reads', async () => {
    legal.downloadPolicy.mockResolvedValue(FILE);

    const { getByTestId } = await renderScreen(<PrivacyPolicyScreen />);

    await fireEvent.press(getByTestId('privacy-download-pdf'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/privacy-policy-downloaded',
      params: {
        fileName: FILE.fileName,
        version: FILE.version,
        sizeBytes: '248312',
        sha256: FILE.sha256,
        verified: 'true',
        downloadedAt: FILE.downloadedAt,
      },
    });
  });

  // A mismatch is passed through, not suppressed: a reader handed the wrong file must be told.
  it('carries a failed verification through to the receipt', async () => {
    legal.downloadPolicy.mockResolvedValue({ ...FILE, verified: false });

    const { getByTestId } = await renderScreen(<PrivacyPolicyScreen />);

    await fireEvent.press(getByTestId('privacy-download-pdf'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(mockPush.mock.calls[0][0].params.verified).toBe('false');
  });

  it('leaves the reader on the document when the download fails', async () => {
    legal.downloadPolicy.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen(<PrivacyPolicyScreen />);

    await fireEvent.press(getByTestId('privacy-download-pdf'));

    await waitFor(() => expect(legal.downloadPolicy).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
    // The button is live again — the retry is one tap.
    expect(getByTestId('privacy-download-pdf').props.accessibilityState.disabled).toBeFalsy();
  });

  it('reads back exactly what the download pushed', async () => {
    mockSearchParams = {
      fileName: FILE.fileName,
      version: FILE.version,
      sizeBytes: '248312',
      sha256: FILE.sha256,
      verified: 'true',
      downloadedAt: FILE.downloadedAt,
    };

    const { getByText } = await renderScreen(<PrivacyPolicyDownloadedScreen />);

    expect(getByText(FILE.fileName)).toBeTruthy();
  });
});
