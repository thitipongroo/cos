// Behaviour of the leasing portfolio screen.
//
// It shows sample properties (no API behind it yet — the list is a constant in the screen) and three
// filters. The filters are what can go wrong: "Logistics" is meant to include cold storage, and
// "Commercial" only the office buildings, so each filter is checked against the cards it leaves.
//
// The screen's own text is in Thai and English (2026-11-12); the sample properties are data and
// stay as they are in both.

import { render, fireEvent } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import { useLocaleStore } from '../../../store/localeStore';
import MobilePortfolioLeasingScreen from '../portfolio-leasing';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn() }),
}));

const ALL = ['vanguard-tower', 'logipark-central', 'arctic-cold-store'];

function renderScreen() {
  return render(
    <I18nProvider>
      <MobilePortfolioLeasingScreen />
    </I18nProvider>,
  );
}

function shownCards(queryByTestId: (id: string) => unknown): string[] {
  return ALL.filter((id) => queryByTestId(`property-card-${id}`) !== null);
}

describe('MobilePortfolioLeasingScreen', () => {
  beforeEach(() => {
    mockBack.mockReset();
    useLocaleStore.setState({ locale: 'en' });
  });

  it('shows the portfolio with its three KPIs', async () => {
    const { getByTestId, getByText, getAllByText } = await renderScreen();

    expect(getByTestId('portfolio-leasing-screen')).toBeTruthy();
    expect(getByText('94.2%')).toBeTruthy();
    // 6.8 % twice: the portfolio's average cap rate, and Vanguard Tower's own yield.
    expect(getAllByText('6.8%')).toHaveLength(2);
    expect(getByText('14')).toBeTruthy();
  });

  it('lists every property by default', async () => {
    const { queryByTestId } = await renderScreen();

    expect(shownCards(queryByTestId)).toEqual(ALL);
  });

  it('shows each property with its location, type, occupancy, units and yield', async () => {
    const { getByText } = await renderScreen();

    expect(getByText('Vanguard Tower')).toBeTruthy();
    expect(getByText('London, UK • Commercial Office')).toBeTruthy();
    expect(getByText('84.2%')).toBeTruthy();
    expect(getByText('12 Units')).toBeTruthy();
    // LogiPark is fully let: no unit to offer.
    expect(getByText('0 Units')).toBeTruthy();
  });

  it('"Commercial" keeps only the office buildings', async () => {
    const { getByLabelText, queryByTestId } = await renderScreen();

    await fireEvent.press(getByLabelText('Office Assets'));

    expect(shownCards(queryByTestId)).toEqual(['vanguard-tower']);
  });

  // Cold storage counts as logistics: the filter matches "Logistics" OR "Storage" in the type.
  it('"Logistics" keeps the logistics hub and the cold store', async () => {
    const { getByLabelText, queryByTestId } = await renderScreen();

    await fireEvent.press(getByLabelText('Logistics Assets'));

    expect(shownCards(queryByTestId)).toEqual(['logipark-central', 'arctic-cold-store']);
  });

  it('"All Assets" brings every property back after a filter', async () => {
    const { getByLabelText, queryByTestId } = await renderScreen();

    await fireEvent.press(getByLabelText('Office Assets'));
    await fireEvent.press(getByLabelText('All Properties'));

    expect(shownCards(queryByTestId)).toEqual(ALL);
  });

  it('goes back', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('portfolio-back-btn'));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('labels the back button for a screen reader', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('portfolio-back-btn').props.accessibilityLabel).toBe('← Back');
  });

  // The filters match on the property type (data), not on the tab text, so they must still work
  // when the tabs read in Thai.
  it('reads in Thai, and its filters still work', async () => {
    useLocaleStore.setState({ locale: 'th' });
    const { getByTestId, getByText, getByLabelText, queryByTestId } = await renderScreen();

    expect(getByTestId('portfolio-back-btn').props.accessibilityLabel).toBe('← กลับ');
    expect(getByText('เป้าหมาย +1.4%')).toBeTruthy();
    expect(getByText('12 ยูนิต')).toBeTruthy();
    expect(getByText('ทั้งหมด')).toBeTruthy();

    await fireEvent.press(getByLabelText('ทรัพย์สินประเภทโลจิสติกส์'));
    expect(shownCards(queryByTestId)).toEqual(['logipark-central', 'arctic-cold-store']);

    await fireEvent.press(getByLabelText('ทรัพย์สินประเภทสำนักงาน'));
    expect(shownCards(queryByTestId)).toEqual(['vanguard-tower']);
  });

  // Pins the screen's English, word for word as it was before the text moved into en.json.
  it('keeps its English text and labels', async () => {
    const { getByText, getAllByText, getByLabelText } = await renderScreen();

    for (const text of [
      '+1.4% Target',
      'Avg Cap Rate',
      'In Portfolio',
      'All Assets',
      'Commercial',
      'Logistics',
    ])
      expect(getByText(text)).toBeTruthy();
    for (const text of ['Available', 'Gross Yield', 'Status', 'Active'])
      expect(getAllByText(text)).toHaveLength(3);
    for (const label of ['All Properties', 'Office Assets', 'Logistics Assets'])
      expect(getByLabelText(label)).toBeTruthy();
  });
});
