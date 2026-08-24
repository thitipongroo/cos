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
    await fireEvent.press(getByTestId('po-option-po-2'));

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

  // ── RECORDING A DELIVERY ─────────────────────────────────────────────────────────────────────
  //
  // ONE CLIENT ID FOR THE PAYLOAD, THE QUEUE KEY AND THE SERVER'S delivery_id (ADR-051 / G-M11).
  //
  // The queue key used to be the PO id, which meant two deliveries against the same order shared one
  // identity in the outbox — and that the server had no way to recognise a replay. A replayed
  // delivery is not merely a duplicate row: `delivery_items` are the quantities `sumDeliveredQuantity`
  // adds up to decide whether a PO line is fulfilled, so a double-applied delivery can CLOSE A
  // PURCHASE ORDER ON GOODS THAT ARRIVED ONCE. `recordDelivery` is idempotent on `client_id`, which
  // only works if the id is fresh per delivery and the same in both places.

  it('gives each delivery its own identity, in the payload and in the queue', async () => {
    mockEndpoints();

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('po-option-po-1')).toBeTruthy());
    await fireEvent.press(getByTestId('po-option-po-1'));

    await fireEvent.press(getByTestId('record-delivery-button'));

    await waitFor(() => expect(client.mutate).toHaveBeenCalledTimes(1));
    const [method, path, body, entity, entityId] = client.mutate.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
      string,
      string,
    ];
    expect(method).toBe('POST');
    expect(path).toBe('/procurement/deliveries');
    expect(entity).toBe('delivery');
    // The SAME id in the body and as the queue key — that identity is what makes the replay
    // recognisable at the other end.
    expect(body['client_id']).toBe(entityId);
    expect(body['po_id']).toBe('po-1');
  });

  // Two deliveries against the same order must not share one identity — that was the defect.
  it('gives a second delivery on the same order a different identity', async () => {
    mockEndpoints();

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('po-option-po-1')).toBeTruthy());
    await fireEvent.press(getByTestId('po-option-po-1'));

    await fireEvent.press(getByTestId('record-delivery-button'));
    await waitFor(() => expect(client.mutate).toHaveBeenCalledTimes(1));
    await fireEvent.press(getByTestId('record-delivery-button'));
    await waitFor(() => expect(client.mutate).toHaveBeenCalledTimes(2));

    const first = (client.mutate.mock.calls[0][2] as Record<string, unknown>)['client_id'];
    const second = (client.mutate.mock.calls[1][2] as Record<string, unknown>)['client_id'];
    expect(first).not.toBe(second);
  });

  // QUANTITIES ONLY WHERE ONE WAS ENTERED. A blank field is "this line did not arrive", not "nought
  // of it arrived" — and sending a zero would count towards fulfilment as a delivered quantity.
  it('sends only the lines a quantity was entered against', async () => {
    withLines([
      { line_id: 'l-1', description: 'Ready-mix concrete C30', quantity: '40', unit: 'm3' },
      { line_id: 'l-2', description: 'Rebar 16mm', quantity: '200', unit: 'kg' },
    ]);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('po-option-po-1')).toBeTruthy());
    await fireEvent.press(getByTestId('po-option-po-1'));
    await waitFor(() => expect(getByTestId('delivery-qty-l-1')).toBeTruthy());

    await fireEvent.changeText(getByTestId('delivery-qty-l-1'), '40');
    await fireEvent.press(getByTestId('record-delivery-button'));

    await waitFor(() => expect(client.mutate).toHaveBeenCalledTimes(1));
    expect((client.mutate.mock.calls[0][2] as Record<string, unknown>)['items']).toEqual([
      { line_id: 'l-1', quantity_received: '40' },
    ]);
  });

  // Whitespace is not a quantity: a field holding a stray space would otherwise become a delivered
  // quantity of "" against a line nobody meant to receive.
  it('treats a field of whitespace as nothing entered', async () => {
    withLines([
      { line_id: 'l-1', description: 'Ready-mix concrete C30', quantity: '40', unit: 'm3' },
    ]);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('po-option-po-1')).toBeTruthy());
    await fireEvent.press(getByTestId('po-option-po-1'));
    await waitFor(() => expect(getByTestId('delivery-qty-l-1')).toBeTruthy());

    await fireEvent.changeText(getByTestId('delivery-qty-l-1'), '   ');
    await fireEvent.press(getByTestId('record-delivery-button'));

    await waitFor(() => expect(client.mutate).toHaveBeenCalledTimes(1));
    expect((client.mutate.mock.calls[0][2] as Record<string, unknown>)['items']).toEqual([]);
  });

  // A NOTE-ONLY DELIVERY IS VALID, which is the whole reason the lines failing to load does not
  // block the form: a driver is standing at the gate and the record has to be makeable either way.
  it('records a note-only delivery when the lines never arrived', async () => {
    client.get.mockImplementation((path: string) => {
      if (path.startsWith('/procurement/deliveries')) return Promise.resolve({ items: DELIVERIES });
      if (path.startsWith('/procurement/purchase-orders/'))
        return Promise.reject(new Error('offline'));
      if (path.startsWith('/procurement/purchase-orders')) return Promise.resolve({ items: POS });
      return Promise.resolve({ items: [] });
    });

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('po-option-po-1')).toBeTruthy());
    await fireEvent.press(getByTestId('po-option-po-1'));

    await fireEvent.changeText(getByTestId('delivery-note-input'), 'Two pallets, driver waiting');
    await fireEvent.press(getByTestId('record-delivery-button'));

    await waitFor(() => expect(client.mutate).toHaveBeenCalledTimes(1));
    expect(client.mutate.mock.calls[0][2]).toMatchObject({
      delivery_note: 'Two pallets, driver waiting',
      items: [],
    });
  });

  // An empty note is OMITTED rather than sent as '', so the column stays null instead of holding a
  // blank string that reads as a note somebody wrote and left empty.
  it('omits the note entirely when none was written', async () => {
    mockEndpoints();

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('po-option-po-1')).toBeTruthy());
    await fireEvent.press(getByTestId('po-option-po-1'));

    await fireEvent.press(getByTestId('record-delivery-button'));

    await waitFor(() => expect(client.mutate).toHaveBeenCalledTimes(1));
    expect(
      (client.mutate.mock.calls[0][2] as Record<string, unknown>)['delivery_note'],
    ).toBeUndefined();
  });

  it('confirms the delivery was recorded, and empties the form', async () => {
    mockEndpoints();

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('po-option-po-1')).toBeTruthy());
    await fireEvent.press(getByTestId('po-option-po-1'));

    await fireEvent.changeText(getByTestId('delivery-note-input'), 'Two pallets');
    await fireEvent.press(getByTestId('record-delivery-button'));

    await waitFor(() => expect(getByTestId('delivery-saved')).toBeTruthy());
    expect(getByTestId('delivery-note-input').props.value).toBe('');
  });

  // ── THE PICKER ───────────────────────────────────────────────────────────────────────────────

  // No PO, no form: a delivery is against an order, and there is no such thing as a delivery with
  // nothing to receive it into.
  it('shows no form until a purchase order is picked', async () => {
    mockEndpoints();

    const { getByTestId, queryByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('po-option-po-1')).toBeTruthy());

    expect(queryByTestId('record-delivery-button')).toBeNull();
    expect(queryByTestId('delivery-note-input')).toBeNull();
  });

  // A RADIO, not a row of buttons: exactly one order is chosen and the form below belongs to it, so
  // a screen reader has to be able to say which.
  it('says which purchase order the form belongs to', async () => {
    mockEndpoints();

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('po-option-po-1')).toBeTruthy());

    expect(getByTestId('po-option-po-1').props.accessibilityRole).toBe('radio');
    expect(getByTestId('po-option-po-1').props.accessibilityState.selected).toBe(false);

    await fireEvent.press(getByTestId('po-option-po-1'));

    expect(getByTestId('po-option-po-1').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('po-option-po-2').props.accessibilityState.selected).toBe(false);
  });

  // SWITCHING ORDERS CLEARS WHAT WAS TYPED. Quantities carried across would be entered against one
  // order and recorded against another — the exact shape of error this screen exists to prevent.
  it('clears the quantities when a different order is picked', async () => {
    withLines([
      { line_id: 'l-1', description: 'Ready-mix concrete C30', quantity: '40', unit: 'm3' },
    ]);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('po-option-po-1')).toBeTruthy());
    await fireEvent.press(getByTestId('po-option-po-1'));
    await waitFor(() => expect(getByTestId('delivery-qty-l-1')).toBeTruthy());
    await fireEvent.changeText(getByTestId('delivery-qty-l-1'), '40');

    await fireEvent.press(getByTestId('po-option-po-2'));

    await waitFor(() => expect(getByTestId('delivery-qty-l-1').props.value).toBe(''));
  });

  it('names an order by its PO number, and falls back to a short id', async () => {
    client.get.mockImplementation((path: string) => {
      if (path.startsWith('/procurement/deliveries')) return Promise.resolve({ items: [] });
      if (path.startsWith('/procurement/purchase-orders/'))
        return Promise.resolve({ po: POS[0], line_items: [] });
      if (path.startsWith('/procurement/purchase-orders'))
        return Promise.resolve({
          items: [{ po_id: '9f8a1234-0000-4000-8000-abcdefabcdef', status: 'SENT' }],
        });
      return Promise.resolve({ items: [] });
    });

    const { getByText, queryByText } = await renderScreen();

    await waitFor(() => expect(getByText('9f8a1234')).toBeTruthy());
    expect(queryByText('9f8a1234-0000-4000-8000-abcdefabcdef')).toBeNull();
  });

  // ── THE LINES ────────────────────────────────────────────────────────────────────────────────

  it('lists what was ordered, with the ordered quantity as the hint', async () => {
    withLines([
      { line_id: 'l-1', description: 'Ready-mix concrete C30', quantity: '40', unit: 'm3' },
    ]);

    const { getByTestId, getByText } = await renderScreen();
    await waitFor(() => expect(getByTestId('po-option-po-1')).toBeTruthy());
    await fireEvent.press(getByTestId('po-option-po-1'));

    await waitFor(() => expect(getByText('Ready-mix concrete C30')).toBeTruthy());
    // The ORDERED quantity is the placeholder, so a full delivery is one tap of the keyboard away
    // and a partial one is never pre-filled with a number nobody checked.
    expect(getByTestId('delivery-qty-l-1').props.placeholder).toBe('40');
    expect(getByTestId('delivery-qty-l-1').props.value).toBe('');
  });

  // The lines failing to load is SAID, not silently absent: without the notice the form looks like
  // an order with no lines on it, and the receiver would record nothing.
  it('says the lines could not be fetched rather than showing an order with none', async () => {
    client.get.mockImplementation((path: string) => {
      if (path.startsWith('/procurement/deliveries')) return Promise.resolve({ items: [] });
      if (path.startsWith('/procurement/purchase-orders/'))
        return Promise.reject(new Error('offline'));
      if (path.startsWith('/procurement/purchase-orders')) return Promise.resolve({ items: POS });
      return Promise.resolve({ items: [] });
    });

    const { getByTestId, getByText } = await renderScreen();
    await waitFor(() => expect(getByTestId('po-option-po-1')).toBeTruthy());
    await fireEvent.press(getByTestId('po-option-po-1'));

    // The notice names BOTH facts: the lines are missing AND a note-only record is still possible.
    // Half of it would leave the receiver at the gate deciding whether to walk away.
    await waitFor(() => expect(getByText(/PO lines unavailable/)).toBeTruthy());
    expect(getByText(/note-only/)).toBeTruthy();
    expect(getByTestId('record-delivery-button')).toBeTruthy();
  });
});

/** Answer the picker, the list, and the PO detail with the given line items. */
function withLines(lines: unknown[]) {
  client.get.mockImplementation((path: string) => {
    if (path.startsWith('/procurement/deliveries')) return Promise.resolve({ items: DELIVERIES });
    if (path.startsWith('/procurement/purchase-orders/'))
      return Promise.resolve({ po: POS[0], line_items: lines });
    if (path.startsWith('/procurement/purchase-orders')) return Promise.resolve({ items: POS });
    return Promise.resolve({ items: [] });
  });
}
