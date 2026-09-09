// The PROC_MANAGER delivery view (mockup 11_proc_manager/04_deliveries/01_pom_deliveries).

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import ManagerDeliveries from '../ManagerDeliveries';

jest.mock('../../../api/client', () => ({ get: jest.fn(), post: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock; post: jest.Mock };

const PO = {
  po_id: 'po-1',
  po_number: 'PO-8821',
  vendor_id: 'v-1',
  project_id: 'p-1',
  status: 'INVOICED',
  total_amount: '540000.0000',
  currency_code: 'THB',
  updated_at: '2026-09-01T00:00:00.000Z',
};

function delivery(over: Record<string, unknown> = {}) {
  return {
    delivery_id: 'del-1',
    po_id: 'po-1',
    delivery_note: 'DN-0982',
    delivered_at: new Date().toISOString(),
    notes: null,
    ...over,
  };
}

function route(dels: unknown[] = [delivery()]) {
  return (path: string) => {
    if (path.startsWith('/procurement/deliveries')) return Promise.resolve({ items: dels });
    if (path.startsWith('/procurement/purchase-orders')) return Promise.resolve({ items: [PO] });
    if (path.startsWith('/procurement/vendors/directory')) {
      return Promise.resolve([{ vendor_id: 'v-1', vendor_name: 'Millcon Steel PCL' }]);
    }
    return Promise.resolve({ items: [] });
  };
}

async function renderScreen() {
  return render(
    <I18nProvider>
      <ManagerDeliveries />
    </I18nProvider>,
  );
}

describe('ManagerDeliveries', () => {
  beforeEach(() => {
    client.get.mockReset();
    client.post.mockReset();
    client.get.mockImplementation(route());
  });

  it('counts today’s arrivals and what those orders are worth', async () => {
    // REAL on both halves: the row count comes from `delivered_at` on the device's current date,
    // and the value is summed in decimal.js over the orders those deliveries were recorded against.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('tile-arrivals')).toHaveTextContent(/1/));
    expect(getByTestId('tile-arrivals')).toHaveTextContent(/540,000/);
  });

  it('adds nothing for a delivery whose order is not on the page', async () => {
    // A guess would be worse than a smaller number: the tile says what it can prove.
    client.get.mockImplementation(route([delivery({ po_id: 'po-unknown' })]));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('tile-arrivals')).toHaveTextContent(/1/));
    expect(getByTestId('tile-arrivals')).not.toHaveTextContent(/540,000/);
  });

  it('does not count a delivery from another day as today’s', async () => {
    client.get.mockImplementation(route([delivery({ delivered_at: '2020-01-01T00:00:00.000Z' })]));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('delivery-item-del-1')).toBeTruthy());
    expect(getByTestId('tile-arrivals')).toHaveTextContent(/0/);
  });

  it('names the order and its vendor on the card', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('delivery-item-del-1')).toHaveTextContent(/PO-8821/));
    expect(getByTestId('delivery-item-del-1')).toHaveTextContent(/Millcon Steel PCL/);
  });

  it('draws the tiles it cannot measure, and says so nowhere on screen', async () => {
    // THE ADR-099 GUARD. `procurement.deliveries` has no status column, so nothing can be "awaiting
    // inspection", and no dispute table exists in any of the 24 schemas. Both tiles are registered
    // figures. What must NOT appear is any hint of that on the screen itself.
    const { getByTestId, queryByText } = await renderScreen();

    await waitFor(() => expect(getByTestId('tile-inspection')).toBeTruthy());
    expect(getByTestId('tile-disputes')).toBeTruthy();
    expect(queryByText(/coming soon/i)).toBeNull();
  });

  it('never posts anything from the GRN button, which has no endpoint', async () => {
    // §20.7.3 defines `/procurement/grn` and nothing implements it. A button that claimed to create
    // a goods-receipt record would be the worst kind of drawn control.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('delivery-grn-del-1')).toBeTruthy());
    await fireEvent.press(getByTestId('delivery-grn-del-1'));
    expect(client.post).not.toHaveBeenCalled();
  });

  // THE DRAWING GIVES THE LIST FOUR CARD SHAPES and the product owner asked for all four
  // (2026-09-09, "เหมือนแบบทุกตัวเลข"). The shape is drawn — no status column exists — but it is
  // assigned by POSITION, which is what lets the filter chips count honestly. Four rows, four
  // shapes, in the register's order.
  function four() {
    return [
      delivery({ delivery_id: 'del-1', delivery_note: 'DN-1' }),
      delivery({ delivery_id: 'del-2', delivery_note: 'DN-2' }),
      delivery({ delivery_id: 'del-3', delivery_note: 'DN-3' }),
      delivery({ delivery_id: 'del-4', delivery_note: 'DN-4' }),
    ];
  }

  it('draws all four of the drawing’s card shapes, one per row', async () => {
    client.get.mockImplementation(route(four()));
    const { getByTestId } = await renderScreen();

    // Card 1 — awaiting GRN: weigh, flag and the GRN button.
    await waitFor(() => expect(getByTestId('delivery-weigh-del-1')).toBeTruthy());
    expect(getByTestId('delivery-flag-del-1')).toBeTruthy();
    expect(getByTestId('delivery-grn-del-1')).toBeTruthy();

    // Card 2 — disputed: negotiate and photo evidence, and the credit note in place of the amount.
    expect(getByTestId('delivery-chat-del-2')).toBeTruthy();
    expect(getByTestId('delivery-photo-del-2')).toBeTruthy();
    expect(getByTestId('delivery-item-del-2')).toHaveTextContent(/14,350/);

    // Card 3 — in transit: GPS, the driver, and the fleet bar.
    expect(getByTestId('delivery-gps-del-3')).toBeTruthy();
    expect(getByTestId('delivery-call-del-3')).toBeTruthy();
    expect(getByTestId('delivery-progress-del-3')).toBeTruthy();

    // Card 4 — received: the receipt and the share square.
    expect(getByTestId('delivery-receipt-del-4')).toBeTruthy();
    expect(getByTestId('delivery-share-del-4')).toBeTruthy();
  });

  it('shows the order’s real amount on every card except the disputed one', async () => {
    // The fixture order is ฿540,000. The disputed card shows the drawn credit note instead, because
    // the drawing shows a negative number there — and that is the ONE place a real figure is
    // replaced, which is why it is pinned.
    client.get.mockImplementation(route(four()));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('delivery-item-del-1')).toHaveTextContent(/540,000/));
    expect(getByTestId('delivery-item-del-3')).toHaveTextContent(/540,000/);
    expect(getByTestId('delivery-item-del-4')).toHaveTextContent(/540,000/);
    expect(getByTestId('delivery-item-del-2')).not.toHaveTextContent(/540,000/);
  });

  it('filters by card shape and counts each chip against what the list shows', async () => {
    client.get.mockImplementation(route(four()));
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('delivery-filter-ALL')).toHaveTextContent(/4/));
    expect(getByTestId('delivery-filter-DISPUTED')).toHaveTextContent(/1/);

    await fireEvent.press(getByTestId('delivery-filter-DISPUTED'));
    await waitFor(() => expect(queryByTestId('delivery-item-del-1')).toBeNull());
    expect(getByTestId('delivery-item-del-2')).toBeTruthy();

    // The counts describe the whole list, so filtering must not move them.
    expect(getByTestId('delivery-filter-ALL')).toHaveTextContent(/4/);
  });

  it('never posts from any of the drawn controls, whichever card they are on', async () => {
    // None of these has an endpoint: no chat, no photo pipeline on a delivery, no GPS, no driver
    // record, and §20.7.3's /procurement/grn is unimplemented. Every one says so instead.
    client.get.mockImplementation(route(four()));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('delivery-weigh-del-1')).toBeTruthy());
    for (const id of [
      'delivery-weigh-del-1',
      'delivery-flag-del-1',
      'delivery-chat-del-2',
      'delivery-photo-del-2',
      'delivery-gps-del-3',
      'delivery-call-del-3',
      'delivery-receipt-del-4',
      'delivery-share-del-4',
    ]) {
      await fireEvent.press(getByTestId(id));
    }
    expect(client.post).not.toHaveBeenCalled();
  });

  it('draws the advisor’s action, the yard row and the fleet radar without an endpoint', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('advisor-adjust')).toBeTruthy());
    await fireEvent.press(getByTestId('advisor-adjust'));
    await fireEvent.press(getByTestId('warehouse-plan'));
    await fireEvent.press(getByTestId('delivery-radar'));

    expect(client.post).not.toHaveBeenCalled();
  });

  it('keeps the confidence in the card foot, not in the advisor’s header', async () => {
    // The drawing puts a "CONFIDENCE: 96%" chip beside the advisor's title. The project standard of
    // 2026-09-08 puts it in the foot, and the product owner chose the standard on 2026-09-09.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('logistics-advisor-foot')).toHaveTextContent(/96/));
    expect(getByTestId('logistics-advisor')).toHaveTextContent(/SOURCE/);
  });

  it('says so when nothing has been delivered', async () => {
    client.get.mockImplementation(route([]));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('deliveries-empty')).toBeTruthy());
  });
});
