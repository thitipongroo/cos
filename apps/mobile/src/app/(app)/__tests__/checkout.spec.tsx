// Behaviour and render tests for CheckoutScreen (PromptPay / Thai QR Mobile Checkout)

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import { useLocaleStore } from '../../../store/localeStore';
import CheckoutScreen from '../checkout';

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: jest.fn(),
  }),
}));

describe('CheckoutScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useLocaleStore.setState({ locale: 'en' });
  });

  async function renderScreen() {
    return await render(
      <I18nProvider>
        <CheckoutScreen />
      </I18nProvider>,
    );
  }

  it('renders checkout screen with header and summary details', async () => {
    const { getByTestId, getByText } = await renderScreen();

    expect(getByTestId('checkout-screen')).toBeTruthy();
    expect(getByTestId('checkout-back-btn')).toBeTruthy();
    expect(getByTestId('checkout-summary-card')).toBeTruthy();
    expect(getByTestId('checkout-txn-id')).toBeTruthy();
    expect(getByText('TXN-2026-PP-9941')).toBeTruthy();
    expect(getByTestId('checkout-amount')).toBeTruthy();
    expect(getByText('฿1,450,200.00')).toBeTruthy();
    expect(getByText('0-1055-61008-91-0')).toBeTruthy();
    expect(getByText('INV-2026-0891')).toBeTruthy();
    expect(getByText('PRJ-BKK-01')).toBeTruthy();
  });

  it('renders PromptPay Thai QR visual and status badge', async () => {
    const { getByTestId, getByText } = await renderScreen();

    expect(getByTestId('checkout-qr-card')).toBeTruthy();
    expect(getByTestId('checkout-qr-svg')).toBeTruthy();
    expect(getByText('THAI QR PAYMENT')).toBeTruthy();
  });

  it('renders the initial countdown timer', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('checkout-timer-text')).toHaveTextContent('15:00');
  });

  it('simulates payment when bank scan button is pressed', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    const simulateBtn = getByTestId('checkout-simulate-pay-btn');
    fireEvent.press(simulateBtn);

    await waitFor(() => {
      expect(getByTestId('checkout-success-badge')).toBeTruthy();
      expect(queryByTestId('checkout-simulate-pay-btn')).toBeNull();
    });
  });

  it('navigates back when cancel button is pressed', async () => {
    const { getByTestId } = await renderScreen();

    const cancelBtn = getByTestId('checkout-cancel-btn');
    fireEvent.press(cancelBtn);

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('navigates back when top back button is pressed', async () => {
    const { getByTestId } = await renderScreen();

    const backBtn = getByTestId('checkout-back-btn');
    fireEvent.press(backBtn);

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['en', '← Back'],
    ['th', '← กลับ'],
  ] as const)('labels the top back button for a screen reader (%s)', async (locale, label) => {
    useLocaleStore.setState({ locale });
    const { getByTestId } = await renderScreen();

    expect(getByTestId('checkout-back-btn').props.accessibilityLabel).toBe(label);
  });
});
