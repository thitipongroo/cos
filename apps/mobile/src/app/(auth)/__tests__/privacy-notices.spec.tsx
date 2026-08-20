// Behaviour of the five privacy notices.
//
// Each is a thin declaration over <PrivacyDetailScreen /> — the shell's own rules are covered in its
// spec — so what only these files decide is WHAT EACH NOTICE SAYS: its i18n namespace, and which
// practices it lists.
//
// THE NAMESPACE IS THE WHOLE NOTICE. Every card's title and body resolve under
// `privacy.detail.<screen>.cards.<id>`, so a screen declaring the wrong one renders another notice's
// text under this notice's heading. Nothing about it would look broken — the words would simply be
// the wrong words, in a document that has to be accurate by law. A missing key renders as the key
// itself, which is what makes that detectable here.
//
// AND THE COMING-SOON CARDS ARE THE POINT OF THE COLLECTION NOTICE. Geofencing, IoT and on-device AI
// are drawn because the mockup lists them, and labelled because there is no code behind them
// (PO 2026-08-17). A reader has to be able to tell what is collected from them TODAY apart from what
// is planned; an unlabelled card is this notice claiming a practice the product does not have.

import { render, fireEvent, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from '../../../i18n';
import PrivacyDataCollectionScreen from '../privacy-data-collection';
import PrivacyDataUsageScreen from '../privacy-data-usage';
import PrivacyPdpaGdprScreen from '../privacy-pdpa-gdpr';
import PrivacyTechnicalSecurityScreen from '../privacy-technical-security';
import PrivacyUserRightsScreen from '../privacy-user-rights';

const mockBack = jest.fn();
const mockDismissAll = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: mockBack,
    replace: jest.fn(),
    dismissAll: mockDismissAll,
  }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderNotice(ui: React.JSX.Element) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <I18nProvider>{ui}</I18nProvider>
    </SafeAreaProvider>,
  );
}

const NOTICES = [
  {
    name: 'data collection',
    ui: <PrivacyDataCollectionScreen />,
    testID: 'privacy-data-collection',
  },
  { name: 'data usage', ui: <PrivacyDataUsageScreen />, testID: 'privacy-data-usage' },
  { name: 'PDPA & GDPR', ui: <PrivacyPdpaGdprScreen />, testID: 'privacy-pdpa-gdpr' },
  {
    name: 'technical security',
    ui: <PrivacyTechnicalSecurityScreen />,
    testID: 'privacy-technical-security',
  },
  { name: 'user rights', ui: <PrivacyUserRightsScreen />, testID: 'privacy-user-rights' },
] as const;

describe('the privacy notices', () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockDismissAll.mockReset();
  });

  it.each(NOTICES)('renders the $name notice', async ({ ui, testID }) => {
    const { getByTestId } = await renderNotice(ui);

    expect(getByTestId(testID)).toBeTruthy();
  });

  it.each(NOTICES)('offers a way back from the $name notice', async ({ ui, testID }) => {
    const { getByTestId } = await renderNotice(ui);

    await fireEvent.press(getByTestId(`${testID}-back`));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  // THE NAMESPACE. A wrong one renders another notice's text under this heading, and nothing about
  // it looks broken — the words are simply the wrong words. An unresolved key would print itself.
  it.each(NOTICES)('resolves the $name notice`s own copy', async ({ ui, testID }) => {
    const { getByTestId, queryAllByText } = await renderNotice(ui);

    expect(getByTestId(testID)).toBeTruthy();
    expect(queryAllByText(/^privacy\.detail\./)).toHaveLength(0);
  });
});

describe('PrivacyDataCollectionScreen', () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockDismissAll.mockReset();
  });

  it('lists what is collected today', async () => {
    const { getByTestId } = await renderNotice(<PrivacyDataCollectionScreen />);

    for (const id of ['identity', 'location', 'technicalLogs', 'aiOcr']) {
      expect(getByTestId(`privacy-data-collection-card-${id}`)).toBeTruthy();
    }
  });

  // Drawn because the mockup lists them, labelled because there is no code behind them.
  it('lists what is only planned, and chips every one of them', async () => {
    const { getByTestId } = await renderNotice(<PrivacyDataCollectionScreen />);

    for (const id of ['geofencing', 'iot', 'onDeviceAi']) {
      const card = within(getByTestId(`privacy-data-collection-card-${id}`));
      expect(card.getByText('Coming soon')).toBeTruthy();
    }
  });

  // The distinction the whole notice turns on: a live practice must NOT carry the chip.
  it('leaves the live practices unchipped', async () => {
    const { getByTestId } = await renderNotice(<PrivacyDataCollectionScreen />);

    for (const id of ['identity', 'location', 'technicalLogs', 'aiOcr']) {
      const card = within(getByTestId(`privacy-data-collection-card-${id}`));
      expect(card.queryByText('Coming soon')).toBeNull();
    }
  });
});

describe('PrivacyUserRightsScreen', () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockDismissAll.mockReset();
  });

  // The only notice with an action, and it DISMISSES: the reader came here from the login screen to
  // read before signing in, so the way out is back to signing in, not back through the document.
  it('offers the sign-in action the other four do not', async () => {
    const rights = await renderNotice(<PrivacyUserRightsScreen />);
    const usage = await renderNotice(<PrivacyDataUsageScreen />);

    expect(rights.getByTestId('privacy-user-rights-cta')).toBeTruthy();
    expect(usage.queryByTestId('privacy-data-usage-cta')).toBeNull();
  });

  it('clears the stack rather than stepping back through the notice', async () => {
    const { getByTestId } = await renderNotice(<PrivacyUserRightsScreen />);

    await fireEvent.press(getByTestId('privacy-user-rights-cta'));

    expect(mockDismissAll).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
  });
});
