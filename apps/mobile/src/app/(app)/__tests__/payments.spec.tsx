// Behaviour of the FINANCE payments list, pinned BEFORE the row-memoization refactor.
//
// The expand-on-tap and the PENDING-only approve button are the two things a careless memo() breaks:
// both depend on state that lives OUTSIDE the row (expandedId) or on a field of the row itself, so a
// row memoized on the wrong props keeps rendering its old answer. These tests fail loudly if that
// happens.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import PaymentsScreen from '../payments';

jest.mock('../../../api/client', () => ({ get: jest.fn(), mutate: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock; mutate: jest.Mock };

const PENDING = {
  payment_id: 'pay-1111-2222',
  payment_reference: 'PAY-0001',
  amount: '1500.0000',
  currency_code: 'THB',
  invoice_id: 'inv-9',
  payment_date: '2026-08-19T00:00:00Z',
  status: 'PENDING',
};

const PROCESSED = {
  payment_id: 'pay-3333-4444',
  payment_reference: 'PAY-0002',
  status: 'PROCESSED',
};

function renderScreen() {
  return render(
    <I18nProvider>
      <PaymentsScreen />
    </I18nProvider>,
  );
}

describe('PaymentsScreen', () => {
  beforeEach(() => {
    client.get.mockReset();
    client.mutate.mockReset();
    client.mutate.mockResolvedValue(undefined);
  });

  it('renders one row per payment returned by the API', async () => {
    client.get.mockResolvedValue({ items: [PENDING, PROCESSED] });

    const { getAllByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('payment-item')).toHaveLength(2));
    expect(getByText('PAY-0001')).toBeTruthy();
    expect(getByText('PAY-0002')).toBeTruthy();
  });

  it('shows the approve control only on a PENDING payment', async () => {
    client.get.mockResolvedValue({ items: [PENDING, PROCESSED] });

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('payment-item')).toHaveLength(2));
    expect(getAllByTestId('approve-payment-button')).toHaveLength(1);
  });

  it('expands a row on tap and collapses it on a second tap', async () => {
    client.get.mockResolvedValue({ items: [PENDING] });

    const { getByText, queryByTestId, getByTestId } = await renderScreen();

    await waitFor(() => expect(getByText('PAY-0001')).toBeTruthy());
    expect(queryByTestId('payment-detail')).toBeNull();

    fireEvent.press(getByText('PAY-0001'));
    await waitFor(() => expect(getByTestId('payment-detail')).toBeTruthy());

    fireEvent.press(getByText('PAY-0001'));
    await waitFor(() => expect(queryByTestId('payment-detail')).toBeNull());
  });

  it('drops an approved payment from the pending view', async () => {
    client.get.mockResolvedValue({ items: [PENDING, PROCESSED] });

    const { getAllByTestId, getByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('payment-item')).toHaveLength(2));
    fireEvent.press(getByTestId('approve-payment-button'));

    await waitFor(() => expect(getAllByTestId('payment-item')).toHaveLength(1));
    expect(client.mutate).toHaveBeenCalledWith(
      'PATCH',
      '/finance/payments/pay-1111-2222/approve',
      {},
      'payment',
      'pay-1111-2222',
    );
  });

  it('keeps the screen usable when the list request fails offline', async () => {
    client.get.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryAllByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('payments-screen')).toBeTruthy());
    expect(queryAllByTestId('payment-item')).toHaveLength(0);
  });
});
