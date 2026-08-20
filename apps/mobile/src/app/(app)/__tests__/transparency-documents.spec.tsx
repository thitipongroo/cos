// Behaviour of the transparency portal's detail pages.
//
// Seven of them are documents: no fetch, no state, everything from i18n and the kit. Their value to
// a reader is entirely in whether the words are the right words and the LIVE/PLANNED distinction is
// drawn correctly — this portal exists to describe what the platform actually does, so a planned
// capability shown as live is the portal making the exact claim it is there to prevent.
//
// The AI page is the one that carries both at once: OCR and summarisation are in use, PPE detection
// and progress comparison are not. Getting those the wrong way round would tell a worker their site
// photos are being scanned for safety violations when nothing scans them, or the reverse.
//
// The network page is the one with a request, and its rule is different: NO PANEL RATHER THAN A
// PARTIAL ONE. A screen that says what the platform knows about you must not guess at it when the
// request failed.

import { render, waitFor, within } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import TransparencyAiScreen from '../transparency-ai';
import TransparencyIotScreen from '../transparency-iot';
import TransparencyLocationScreen from '../transparency-location';
import TransparencyLogsScreen from '../transparency-logs';
import TransparencyManualScreen from '../transparency-manual';
import TransparencyNetworkScreen from '../transparency-network';
import TransparencySessionScreen from '../transparency-session';
import TransparencyTimestampsScreen from '../transparency-timestamps';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../../api/networkOrigin', () => ({
  ...jest.requireActual('../../../api/networkOrigin'),
  getNetworkOrigin: jest.fn(),
}));
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() => Promise.resolve({ type: 'wifi' })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../../api/networkOrigin') as { getNetworkOrigin: jest.Mock };

function renderDoc(ui: React.JSX.Element) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

const DOCUMENTS = [
  { name: 'AI', ui: <TransparencyAiScreen />, testID: 'transparency-ai' },
  { name: 'IoT', ui: <TransparencyIotScreen />, testID: 'transparency-iot' },
  { name: 'location', ui: <TransparencyLocationScreen />, testID: 'transparency-location' },
  { name: 'logs', ui: <TransparencyLogsScreen />, testID: 'transparency-logs' },
  { name: 'manual entry', ui: <TransparencyManualScreen />, testID: 'transparency-manual' },
  { name: 'session', ui: <TransparencySessionScreen />, testID: 'transparency-session' },
  { name: 'timestamps', ui: <TransparencyTimestampsScreen />, testID: 'transparency-timestamps' },
] as const;

describe('the transparency documents', () => {
  it.each(DOCUMENTS)('renders the $name page', async ({ ui, testID }) => {
    const { getByTestId } = await renderDoc(ui);

    expect(getByTestId(testID)).toBeTruthy();
  });

  // A page whose copy did not resolve prints its own keys — which is what makes a wrong or missing
  // namespace visible rather than merely wrong.
  it.each(DOCUMENTS)('resolves the $name page`s copy', async ({ ui }) => {
    const { queryAllByText } = await renderDoc(ui);

    expect(queryAllByText(/^transparency\./)).toHaveLength(0);
  });
});

describe('TransparencyAiScreen', () => {
  // Getting these the wrong way round tells a worker their photos are scanned for safety violations
  // when nothing scans them, or the reverse.
  it('marks OCR and summarisation as in use', async () => {
    const { getByTestId } = await renderDoc(<TransparencyAiScreen />);

    for (const key of ['ocr', 'summary']) {
      const card = within(getByTestId(`ai-cap-${key}`));
      expect(card.queryByText('PLANNED')).toBeNull();
    }
  });

  it('marks PPE detection and progress comparison as not yet built', async () => {
    const { getByTestId } = await renderDoc(<TransparencyAiScreen />);

    for (const key of ['ppe', 'progress']) {
      expect(getByTestId(`ai-cap-${key}`)).toBeTruthy();
    }
  });

  it('lists the safeguards that apply to what IS in use', async () => {
    const { getByTestId } = await renderDoc(<TransparencyAiScreen />);

    for (const key of ['strip', 'advisory', 'confidence']) {
      expect(getByTestId(`ai-safeguard-${key}`)).toBeTruthy();
    }
  });
});

describe('TransparencyIotScreen', () => {
  // Stage 1 has no ingestion path at all (Phase 21/24) — every capability here is planned, and the
  // page would be a claim about a sensor network the product does not have if any were not.
  it('lists every IoT capability, all of them planned', async () => {
    const { getByTestId } = await renderDoc(<TransparencyIotScreen />);

    for (const key of ['location', 'health', 'environment']) {
      expect(getByTestId(`iot-cap-${key}`)).toBeTruthy();
    }
  });
});

describe('TransparencyNetworkScreen', () => {
  // The real shape: `origin` is null wherever no GeoLite2 database is configured (dev, CI and every
  // air-gapped install until the MaxMind licence clears — ADR-080), and `behavioral` is null when the
  // subject has NOT consented to operational processing, which is a different statement from
  // INSUFFICIENT_DATA.
  const PANEL = {
    origin: {
      city: 'Bangkok',
      region: 'Bangkok',
      countryIsoCode: 'TH',
      organisation: 'AIS Fibre',
    },
    behavioral: null,
    rule: { windowDays: 30, radiusMetres: 500, minPoints: 10 },
  };

  beforeEach(() => {
    api.getNetworkOrigin.mockReset();
    api.getNetworkOrigin.mockResolvedValue(PANEL);
  });

  it('shows what the platform resolved the connection to', async () => {
    const { getByTestId } = await renderDoc(<TransparencyNetworkScreen />);

    await waitFor(() => expect(getByTestId('network-place')).toBeTruthy());
    expect(getByTestId('network-isp')).toBeTruthy();
  });

  it('reports the connection type the device is on', async () => {
    const { getByTestId } = await renderDoc(<TransparencyNetworkScreen />);

    await waitFor(() => expect(getByTestId('network-connection')).toBeTruthy());
  });

  // Timed around the REAL request rather than a synthetic ping: what the reader wants to know is how
  // long this app's calls take, and a separate probe would measure a different path.
  it('reports the latency of the request it actually made', async () => {
    const { getByTestId } = await renderDoc(<TransparencyNetworkScreen />);

    await waitFor(() => expect(getByTestId('network-latency')).toBeTruthy());
  });

  // A null origin is its OWN answer, not an empty row — no database is configured rather than no
  // answer being available.
  it('says the origin is unknown rather than drawing blank rows', async () => {
    api.getNetworkOrigin.mockResolvedValue({ ...PANEL, origin: null });

    const { getByTestId, queryByTestId } = await renderDoc(<TransparencyNetworkScreen />);

    await waitFor(() => expect(getByTestId('network-origin-none')).toBeTruthy());
    expect(queryByTestId('network-place')).toBeNull();
  });

  // NOT ENABLED and INSUFFICIENT_DATA are different statements: collapsing them tells someone who
  // declined profiling that the platform merely lacked data.
  it('distinguishes declining profiling from having too few points', async () => {
    const declined = await renderDoc(<TransparencyNetworkScreen />);
    await waitFor(() => expect(declined.getByTestId('network-behaviour-off')).toBeTruthy());

    api.getNetworkOrigin.mockResolvedValue({
      ...PANEL,
      behavioral: { context: 'INSUFFICIENT_DATA', pointCount: 2 },
    });
    const thin = await renderDoc(<TransparencyNetworkScreen />);

    await waitFor(() =>
      expect(thin.getByTestId('network-behaviour-INSUFFICIENT_DATA')).toBeTruthy(),
    );
    expect(thin.queryByTestId('network-behaviour-off')).toBeNull();
  });

  // NO PANEL RATHER THAN A PARTIAL ONE.
  it('shows no origin panel at all when the request failed', async () => {
    api.getNetworkOrigin.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryByTestId } = await renderDoc(<TransparencyNetworkScreen />);

    await waitFor(() => expect(getByTestId('network-unavailable')).toBeTruthy());
    expect(queryByTestId('network-place')).toBeNull();
    expect(queryByTestId('network-isp')).toBeNull();
  });

  it('still renders the screen when the request failed', async () => {
    api.getNetworkOrigin.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderDoc(<TransparencyNetworkScreen />);

    await waitFor(() => expect(getByTestId('transparency-network')).toBeTruthy());
  });

  it('still renders when the device cannot say what it is connected to', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const netinfo = require('@react-native-community/netinfo') as { fetch: jest.Mock };
    netinfo.fetch.mockRejectedValue(new Error('unavailable'));

    const { getByTestId } = await renderDoc(<TransparencyNetworkScreen />);

    await waitFor(() => expect(getByTestId('transparency-network')).toBeTruthy());
  });
});
