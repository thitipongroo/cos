// Behaviour of the FINANCE vendor-invoice list, pinned before the row-memoization refactor.
//
// Two things here depend on identity rather than text: tapping a row must open THAT invoice's
// detail, and the status filter must re-query. Both are what a mis-keyed memo quietly breaks.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import InvoicesScreen from '../invoices';

jest.mock('../../../api/client', () => ({ get: jest.fn(), post: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock; post: jest.Mock };

const ROW_A = { vendor_invoice_id: 'vi-1', invoice_number: 'INV-0001', status: 'RECEIVED' };
const ROW_B = { vendor_invoice_id: 'vi-2', invoice_number: 'INV-0002', status: 'APPROVED' };

const DETAIL_A = {
  invoice_id: 'vi-1',
  invoice_number: 'INV-0001',
  amount: '2500.0000',
  currency_code: 'THB',
  status: 'RECEIVED',
  due_date: '2026-09-01T00:00:00Z',
  po_id: 'po-77',
  note: '',
};

function renderScreen() {
  return render(
    <I18nProvider>
      <InvoicesScreen />
    </I18nProvider>,
  );
}

describe('InvoicesScreen', () => {
  beforeEach(() => {
    client.get.mockReset();
    client.post.mockReset();
    client.post.mockResolvedValue(undefined);
  });

  it('renders one row per vendor invoice', async () => {
    client.get.mockResolvedValue({ items: [ROW_A, ROW_B] });

    const { getAllByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('invoice-item')).toHaveLength(2));
    expect(getByText('INV-0001')).toBeTruthy();
    expect(getByText('INV-0002')).toBeTruthy();
  });

  it('opens the detail of the invoice that was tapped', async () => {
    client.get.mockImplementation((path: string) =>
      path.startsWith('/procurement/vendor-invoices/')
        ? Promise.resolve(DETAIL_A)
        : Promise.resolve({ items: [ROW_A, ROW_B] }),
    );

    const { getByText, getByTestId } = await renderScreen();

    await waitFor(() => expect(getByText('INV-0001')).toBeTruthy());
    await fireEvent.press(getByText('INV-0001'));

    await waitFor(() => expect(getByTestId('invoice-detail')).toBeTruthy());
    expect(client.get).toHaveBeenCalledWith('/procurement/vendor-invoices/vi-1');
  });

  it('re-queries with a status filter when one is chosen', async () => {
    client.get.mockResolvedValue({ items: [ROW_A] });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(client.get).toHaveBeenCalledWith('/procurement/vendor-invoices'));

    await fireEvent.press(getByTestId('filter-APPROVED'));

    await waitFor(() =>
      expect(client.get).toHaveBeenCalledWith('/procurement/vendor-invoices?status=APPROVED'),
    );
  });

  it('renders the screen with no rows when the request fails offline', async () => {
    client.get.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryAllByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('invoices-screen')).toBeTruthy());
    expect(queryAllByTestId('invoice-item')).toHaveLength(0);
  });
});
