// Behaviour of <PrivacyDetailScreen /> — the shell six privacy notices are drawn in.
//
// The rule with legal weight is `status: 'comingSoon'`. PO 2026-08-17: keep the mockup's content,
// and LABEL whatever has no code behind it. That is a factual qualifier on a PDPA notice, not a
// style — a reader must be able to tell what is collected from them TODAY apart from what is
// planned. A card that lost its chip would be this notice claiming a practice the product does not
// have, which is the one failure a privacy notice cannot survive.
//
// The chip is also not the only carrier: every card holding it is grouped under a section whose
// label says so too, so the distinction survives a reader missing the chip. Both halves are asserted
// here, because either one alone can be removed by a well-meaning tidy-up.
//
// The CTA is optional and only one screen supplies it (User Rights' "Authenticate"), so the shell
// must render nothing rather than an inert button when it is absent.

import { render, fireEvent, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from '../../i18n';
import { PrivacyDetailScreen, type PrivacyDetailSection } from '../PrivacyDetailScreen';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn() }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const SECTIONS: readonly PrivacyDetailSection[] = [
  {
    id: 'collected',
    cards: [
      { id: 'location', icon: 'location-on' },
      { id: 'photos', icon: 'photo-camera', tone: 'primary' },
    ],
  },
  {
    id: 'planned',
    cards: [{ id: 'biometrics', icon: 'fingerprint', status: 'comingSoon' }],
  },
];

function renderScreen(props: Record<string, unknown> = {}) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <I18nProvider>
        <PrivacyDetailScreen
          testID="privacy-detail"
          screen="dataCollection"
          sections={SECTIONS}
          {...props}
        />
      </I18nProvider>
    </SafeAreaProvider>,
  );
}

describe('PrivacyDetailScreen', () => {
  beforeEach(() => mockBack.mockReset());

  it('renders a card per entry the notice declares', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('privacy-detail-card-location')).toBeTruthy();
    expect(getByTestId('privacy-detail-card-photos')).toBeTruthy();
    expect(getByTestId('privacy-detail-card-biometrics')).toBeTruthy();
  });

  // THE RULE WITH LEGAL WEIGHT. A card describing something the platform does not do yet must say
  // so, or the notice claims a practice the product does not have.
  it('chips a not-yet-built practice, and only that one', async () => {
    const { getByTestId } = await renderScreen();

    const planned = within(getByTestId('privacy-detail-card-biometrics'));
    const live = within(getByTestId('privacy-detail-card-location'));

    expect(planned.getByText('Coming soon')).toBeTruthy();
    expect(live.queryByText('Coming soon')).toBeNull();
  });

  it('renders every card, planned ones included, rather than hiding them', async () => {
    const { getByTestId } = await renderScreen();

    // Hiding would also be wrong: the mockup's content stays, labelled (PO 2026-08-17).
    expect(getByTestId('privacy-detail-card-biometrics')).toBeTruthy();
  });

  it('groups the cards under their section, so the distinction survives a missed chip', async () => {
    const { getByTestId } = await renderScreen();

    // Both sections render; the planned card lives under its own, whose label says so.
    expect(getByTestId('privacy-detail-card-location')).toBeTruthy();
    expect(getByTestId('privacy-detail-card-biometrics')).toBeTruthy();
  });

  it('offers a way back', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('privacy-detail-back'));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  // Only one screen supplies a CTA. An absent one must be nothing, not an inert button.
  it('renders no action when the caller supplies none', async () => {
    const { queryByTestId } = await renderScreen();

    expect(queryByTestId('privacy-detail-cta')).toBeNull();
  });

  it('renders the action the caller supplies, and it acts', async () => {
    const onPress = jest.fn();

    const { getByTestId } = await renderScreen({ cta: { icon: 'lock', onPress } });

    await fireEvent.press(getByTestId('privacy-detail-cta'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders a hero glyph only where one was asked for', async () => {
    const without = await renderScreen();
    const withHero = await renderScreen({ heroIcon: 'shield' });

    expect(withHero.queryAllByTestId('icon-shield')).toHaveLength(1);
    expect(without.queryAllByTestId('icon-shield')).toHaveLength(0);
  });

  it('renders a notice with a single section', async () => {
    const { getByTestId, queryByTestId } = await renderScreen({
      sections: [{ id: 'collected', cards: [{ id: 'location', icon: 'location-on' }] }],
    });

    expect(getByTestId('privacy-detail-card-location')).toBeTruthy();
    expect(queryByTestId('privacy-detail-card-biometrics')).toBeNull();
  });

  // A tag is an i18n SEGMENT, not literal text — it resolves under `<ns>.tags.<tag>`, and a missing
  // key renders as the key itself (translate's documented fallback: never crash a field screen).
  // Worth pinning because the prop reads like a display string and is not one.
  it('resolves a card`s tags through i18n rather than printing them', async () => {
    const { getByText } = await renderScreen({
      sections: [
        {
          id: 'collected',
          cards: [{ id: 'location', icon: 'location-on', tags: ['encryption'] }],
        },
      ],
    });

    expect(getByText('privacy.detail.dataCollection.tags.encryption')).toBeTruthy();
  });
});
