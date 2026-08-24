// Proves a real SCREEN renders under the render project — the class of file items 3-6 refactor.
// Kept deliberately behavioural: what a PROCUREMENT user sees for a list of purchase orders.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import OrdersScreen from '../orders';

jest.mock('../../../api/client', () => ({
  get: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { get } = require('../../../api/client') as { get: jest.Mock };

function renderScreen() {
  return render(
    <I18nProvider>
      <OrdersScreen />
    </I18nProvider>,
  );
}

describe('OrdersScreen', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('renders one row per purchase order returned by the API', async () => {
    get.mockResolvedValue({
      items: [
        { po_id: 'po-1', po_number: 'PO-0001', status: 'SENT' },
        { po_id: 'po-2', po_number: 'PO-0002', status: 'ACKNOWLEDGED' },
      ],
    });

    const { getByText } = await renderScreen();

    await waitFor(() => {
      expect(getByText('PO-0001')).toBeTruthy();
    });
    expect(getByText('PO-0002')).toBeTruthy();
  });

  it('stays on screen when the list request fails offline', async () => {
    get.mockRejectedValue(new Error('offline'));

    const { queryByText } = await renderScreen();

    await waitFor(() => {
      expect(queryByText('PO-0001')).toBeNull();
    });
  });

  // ── THE PO'S NAME ────────────────────────────────────────────────────────────────────────────
  //
  // `po_number` is what the supplier and the site office both call this order — it is on the paper
  // copy. The id is a fallback and a poor one, so it is TRUNCATED to eight characters: a full uuid
  // in a list of orders is a row nobody can read out over the phone, which is how a PO is chased.

  it('names an order by its PO number', async () => {
    get.mockResolvedValue({ items: [po()] });

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText('PO-0001')).toBeTruthy());
  });

  it('falls back to a short id on an order with no number yet', async () => {
    get.mockResolvedValue({
      items: [{ po_id: '9f8a1234-0000-4000-8000-abcdefabcdef', status: 'DRAFT' }],
    });

    const { getByText, queryByText } = await renderScreen();

    await waitFor(() => expect(getByText('9f8a1234')).toBeTruthy());
    expect(queryByText('9f8a1234-0000-4000-8000-abcdefabcdef')).toBeNull();
  });

  // The row is READ ALOUD by the same name it shows: a screen reader on an unlabelled row would
  // announce the status chip instead, so every order in the list would be called "SENT".
  it('is spoken by the same name it shows', async () => {
    get.mockResolvedValue({ items: [po()] });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('order-item')).toBeTruthy());
    expect(getByTestId('order-item').props.accessibilityLabel).toBe('PO-0001');
  });

  // ── THE TWO RESPONSE SHAPES ──────────────────────────────────────────────────────────────────
  //
  // The endpoint answers with `{ items }` or a bare array depending on where it is called from, and
  // a screen that read only one of them would show an empty list against a full response.

  it('reads a bare array as well as an items envelope', async () => {
    get.mockResolvedValue([po(), po({ po_id: 'po-2', po_number: 'PO-0002' })]);

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('order-item')).toHaveLength(2));
  });

  it('reads an envelope with no items as no orders, not as a crash', async () => {
    get.mockResolvedValue({});

    const { getByTestId, queryAllByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('orders-list')).toBeTruthy());
    expect(queryAllByTestId('order-item')).toHaveLength(0);
  });

  it('says the list is empty rather than showing nothing at all', async () => {
    get.mockResolvedValue({ items: [] });

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText('No purchase orders')).toBeTruthy());
  });

  // ── THE DETAIL ───────────────────────────────────────────────────────────────────────────────

  it('opens the order that was tapped', async () => {
    get.mockResolvedValueOnce({ items: [po()] });
    get.mockResolvedValueOnce(detail());

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('order-item')).toBeTruthy());

    await fireEvent.press(getByTestId('order-item'));

    await waitFor(() => expect(getByTestId('order-detail-screen')).toBeTruthy());
    expect(get).toHaveBeenLastCalledWith('/procurement/purchase-orders/po-1');
  });

  it('lists what was ordered, with the quantity and its unit', async () => {
    get.mockResolvedValueOnce({ items: [po()] });
    get.mockResolvedValueOnce(detail());

    const { getByTestId, getByText } = await renderScreen();
    await waitFor(() => expect(getByTestId('order-item')).toBeTruthy());

    await fireEvent.press(getByTestId('order-item'));

    await waitFor(() => expect(getByText('Ready-mix concrete C30')).toBeTruthy());
    // The quantity WITHOUT its unit is a number nobody can act on — 40 of what?
    expect(getByText('40 m3')).toBeTruthy();
  });

  // A PO with no lines is a real state (a draft raised and not yet filled), and it has to say so:
  // a detail screen that showed a header and then nothing reads as a failed load.
  it('says an order has no lines rather than showing an empty detail', async () => {
    get.mockResolvedValueOnce({ items: [po()] });
    get.mockResolvedValueOnce(detail({ line_items: [] }));

    const { getByTestId, getByText } = await renderScreen();
    await waitFor(() => expect(getByTestId('order-item')).toBeTruthy());

    await fireEvent.press(getByTestId('order-item'));

    await waitFor(() => expect(getByTestId('order-detail-screen')).toBeTruthy());
    expect(getByText('No line items')).toBeTruthy();
  });

  // The delivery-phase status is on BOTH the row and the detail — it is the answer to the question
  // that brought the reader here, and making them remember it from the list would be a screen that
  // shows everything about an order except whether it arrived.
  it('shows the delivery status on the detail as well as the row', async () => {
    get.mockResolvedValueOnce({ items: [po({ status: 'PARTIALLY_DELIVERED' })] });
    get.mockResolvedValueOnce(detail({ po: po({ status: 'PARTIALLY_DELIVERED' }) }));

    const { getByTestId, getByText } = await renderScreen();
    await waitFor(() => expect(getByTestId('order-item')).toBeTruthy());

    await fireEvent.press(getByTestId('order-item'));

    await waitFor(() => expect(getByTestId('order-detail-screen')).toBeTruthy());
    expect(getByText('PARTIALLY_DELIVERED')).toBeTruthy();
  });

  it('names the order on its own detail, by the same fallback rule', async () => {
    get.mockResolvedValueOnce({
      items: [{ po_id: '9f8a1234-0000-4000-8000-abcdefabcdef', status: 'DRAFT' }],
    });
    get.mockResolvedValueOnce(
      detail({ po: { po_id: '9f8a1234-0000-4000-8000-abcdefabcdef', status: 'DRAFT' } }),
    );

    const { getByTestId, getAllByText } = await renderScreen();
    await waitFor(() => expect(getByTestId('order-item')).toBeTruthy());

    await fireEvent.press(getByTestId('order-item'));

    await waitFor(() => expect(getByTestId('order-detail-screen')).toBeTruthy());
    expect(getAllByText('9f8a1234').length).toBeGreaterThan(0);
  });

  it('goes back to the list', async () => {
    get.mockResolvedValueOnce({ items: [po()] });
    get.mockResolvedValueOnce(detail());

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('order-item')).toBeTruthy());

    await fireEvent.press(getByTestId('order-item'));
    await waitFor(() => expect(getByTestId('order-detail-screen')).toBeTruthy());

    await fireEvent.press(getByTestId('order-back-button'));

    await waitFor(() => expect(getByTestId('orders-screen')).toBeTruthy());
  });

  // STAY ON THE LIST. A tap whose detail fetch failed leaves the reader where they were, rather
  // than on a half-empty detail screen — the list they can still read is better than a screen that
  // can only apologise.
  it('stays on the list when the detail cannot be fetched', async () => {
    get.mockResolvedValueOnce({ items: [po()] });
    get.mockRejectedValueOnce(new Error('offline'));

    const { getByTestId, queryByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('order-item')).toBeTruthy());

    await fireEvent.press(getByTestId('order-item'));

    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(queryByTestId('order-detail-screen')).toBeNull();
    expect(getByTestId('orders-screen')).toBeTruthy();
  });

  // Rule 40 — the first fetch goes through <LoadingBoundary />, and the boundary REPLACES the list
  // rather than covering it: there is nothing behind it to see, and a skeleton drawn over an empty
  // FlatList would still render that list's "No purchase orders" underneath, which says the
  // opposite of what the skeleton says.
  it('replaces the list with the loading state while the first fetch is in flight', async () => {
    get.mockReturnValue(new Promise(() => undefined));

    const { getByTestId, queryByTestId } = await renderScreen();

    expect(getByTestId('orders-screen')).toBeTruthy();
    expect(queryByTestId('orders-list')).toBeNull();
  });

  it('hands the list back once the orders arrive', async () => {
    get.mockResolvedValue({ items: [po()] });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('orders-list')).toBeTruthy());
  });

  // The boundary settles even when the fetch failed: a screen that kept its skeleton up forever
  // would read as "still loading" to someone who is simply offline and will not be told otherwise.
  it('settles into an empty list when the first fetch fails', async () => {
    get.mockRejectedValue(new Error('offline'));

    const { getByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getByTestId('orders-list')).toBeTruthy());
    expect(getByText('No purchase orders')).toBeTruthy();
  });
});

/** A purchase order row. */
function po(over: Record<string, unknown> = {}) {
  return { po_id: 'po-1', po_number: 'PO-0001', status: 'SENT', ...over };
}

/** A purchase order's detail — the row plus what was ordered on it. */
function detail(over: Record<string, unknown> = {}) {
  return {
    po: po(),
    line_items: [
      { line_id: 'l-1', description: 'Ready-mix concrete C30', quantity: '40', unit: 'm3' },
    ],
    ...over,
  };
}
