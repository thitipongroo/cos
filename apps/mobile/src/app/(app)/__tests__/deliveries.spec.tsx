// Behaviour of the PROCUREMENT deliveries screen, pinned before the row-memoization refactor.
//
// The list itself is plain, but it shares the screen with a PO picker whose selection drives a
// second fetch. That is the combination a row memo can break: rows re-rendering off stale props
// while the picker moves on.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import DeliveriesScreen from '../deliveries';

jest.mock('../../../api/client', () => ({ get: jest.fn(), mutate: jest.fn(), post: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as {
  get: jest.Mock;
  mutate: jest.Mock;
  post: jest.Mock;
};

const DELIVERIES = [
  { delivery_id: 'del-11111111-aaaa', status: 'PENDING' },
  { delivery_id: 'del-22222222-bbbb', status: 'RECEIVED' },
];

const POS = [
  { po_id: 'po-1', po_number: 'PO-0001', status: 'SENT' },
  { po_id: 'po-2', po_number: 'PO-0002', status: 'ACKNOWLEDGED' },
];

function mockEndpoints() {
  client.get.mockImplementation((path: string) => {
    if (path.startsWith('/procurement/deliveries')) return Promise.resolve({ items: DELIVERIES });
    if (path.startsWith('/procurement/purchase-orders/'))
      return Promise.resolve({ po: POS[0], line_items: [] });
    if (path.startsWith('/procurement/purchase-orders')) return Promise.resolve({ items: POS });
    return Promise.resolve({ items: [] });
  });
}

function renderScreen() {
  return render(
    <I18nProvider>
      <DeliveriesScreen />
    </I18nProvider>,
  );
}

describe('DeliveriesScreen', () => {
  beforeEach(() => {
    client.get.mockReset();
    client.mutate.mockReset();
    client.post.mockReset();
  });

  it('renders one row per recorded delivery', async () => {
    mockEndpoints();

    const { getAllByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('delivery-item')).toHaveLength(2));
    // The row shows the first 8 characters of the delivery id.
    expect(getByText('del-1111')).toBeTruthy();
    expect(getByText('del-2222')).toBeTruthy();
  });

  it('offers a picker option per open purchase order', async () => {
    mockEndpoints();

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('po-option-po-1')).toBeTruthy());
    expect(getByTestId('po-option-po-2')).toBeTruthy();
  });

  it('fetches the line items of the purchase order that was picked', async () => {
    mockEndpoints();

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('po-option-po-2')).toBeTruthy());
    fireEvent.press(getByTestId('po-option-po-2'));

    await waitFor(() =>
      expect(client.get).toHaveBeenCalledWith('/procurement/purchase-orders/po-2'),
    );
  });

  it('renders the screen with no rows when the requests fail offline', async () => {
    client.get.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryAllByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('deliveries-screen')).toBeTruthy());
    expect(queryAllByTestId('delivery-item')).toHaveLength(0);
  });
});
