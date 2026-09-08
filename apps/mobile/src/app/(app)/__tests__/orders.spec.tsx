// Orders screen — PROCUREMENT_OFFICER (mockup 10_proc_officer/03_orders/01_po_order).
//
// REWRITTEN 2026-09-08 with the screen. The previous file tested a plain list — one row per PO, a
// short-id fallback, a detail view — against `testID="order-item"` with no id on it. The screen is
// now a queue with counted chips, a vendor index, a delivery-stage stepper and a real approval, so
// the assertions changed with it. WHAT WAS KEPT: every claim about the detail view, because that
// view is unchanged and is capability the drawing does not show (ADR-085).

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import OrdersScreen from '../orders';

jest.mock('../../../api/client', () => ({ get: jest.fn(), post: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock; post: jest.Mock };

function po(over: Record<string, unknown> = {}) {
  return {
    po_id: 'po-1',
    po_number: 'PO-8821',
    vendor_id: 'v-1',
    project_id: 'p-1',
    status: 'ACKNOWLEDGED',
    total_amount: '1234000.0000',
    currency_code: 'THB',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

/**
 * The screen's four endpoints in one table.
 *
 * The vendor DIRECTORY is the interesting one: the PO list carries `vendor_id` and no name, and the
 * screen indexes the directory rather than asking the backend to join. A test that stubbed only the
 * order list would show a card with no vendor and prove nothing about that decision.
 */
function route(
  rows: unknown[] = [po()],
  deliveries: unknown[] = [],
  vendors: unknown[] = [{ vendor_id: 'v-1', vendor_name: 'Structural Steel Co., Ltd.' }],
) {
  return (path: string) => {
    if (path.startsWith('/procurement/purchase-orders/')) {
      return Promise.resolve({ po: rows[0], line_items: [] });
    }
    if (path.startsWith('/procurement/purchase-orders')) {
      return Promise.resolve({ items: rows, total: rows.length });
    }
    if (path.startsWith('/procurement/deliveries')) {
      return Promise.resolve({ items: deliveries, total: deliveries.length });
    }
    if (path.startsWith('/procurement/vendors/directory')) return Promise.resolve(vendors);
    // `/projects`, NOT `/projects/mine`. This role is a member of no project — it buys for the
    // whole tenant — so asking "which are mine" returned nothing and the first capture named no
    // project anywhere.
    if (path.startsWith('/projects')) {
      return Promise.resolve({ items: [{ project_id: 'p-1', project_name: 'Sukhumvit 45' }] });
    }
    return Promise.resolve({ items: [] });
  };
}

async function renderScreen() {
  return render(
    <I18nProvider>
      <OrdersScreen />
    </I18nProvider>,
  );
}

describe('OrdersScreen', () => {
  beforeEach(() => {
    client.get.mockReset();
    client.post.mockReset();
    client.post.mockResolvedValue(undefined);
    client.get.mockImplementation(route());
  });

  it('renders one card per purchase order returned by the API', async () => {
    client.get.mockImplementation(route([po(), po({ po_id: 'po-2', po_number: 'PO-8904' })]));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('order-item-po-1')).toBeTruthy());
    expect(getByTestId('order-item-po-2')).toBeTruthy();
  });

  it('names the vendor from the directory index, not from the order row', async () => {
    // `procurement.purchase_orders` carries `vendor_id` and no name. One directory request serves
    // the whole screen — see the API module's note on why this is not a backend join.
    const { getByTestId } = await renderScreen();

    await waitFor(() =>
      expect(getByTestId('order-item-po-1')).toHaveTextContent(/Structural Steel Co\./),
    );
    expect(
      client.get.mock.calls.filter((c) =>
        String(c[0]).startsWith('/procurement/vendors/directory'),
      ),
    ).toHaveLength(1);
  });

  it('renders no vendor line at all when the directory has no such vendor', async () => {
    // An order pointing at a deactivated vendor is a real row. It must still list, and it must not
    // invent a name or print an id where a name belongs.
    client.get.mockImplementation(route([po()], [], []));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('order-item-po-1')).toBeTruthy());
    expect(getByTestId('order-item-po-1')).not.toHaveTextContent(/v-1/);
  });

  it('prints the money through decimal.js, spaced after the symbol', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('order-item-po-1')).toHaveTextContent(/1,234,000/));
  });

  it('shows the stage the order is genuinely at, and never a percentage', async () => {
    // THE DRAWING PRINTS "Delivery Progress 65%". A real percentage needs received-vs-ordered
    // quantities, which costs two requests per row; the card shows the ordinal stage from the
    // order's own status instead. A drawn 65% would be a fabricated measurement.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('order-stage-po-1')).toBeTruthy());
    expect(getByTestId('order-item-po-1')).not.toHaveTextContent(/%/);
  });

  it('counts the deliveries actually recorded against the order', async () => {
    client.get.mockImplementation(
      route(
        [po()],
        [
          { delivery_id: 'd-1', po_id: 'po-1', delivered_at: '2026-09-01T00:00:00.000Z' },
          { delivery_id: 'd-2', po_id: 'po-1', delivered_at: '2026-09-02T00:00:00.000Z' },
        ],
      ),
    );
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('order-stage-po-1')).toHaveTextContent(/2 deliveries/));
  });

  it('draws no stage bar for a status it has no opinion about', async () => {
    client.get.mockImplementation(route([po({ status: 'CANCELLED' })]));
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('order-item-po-1')).toBeTruthy());
    expect(queryByTestId('order-stage-po-1')).toBeNull();
  });

  it('offers Approve only on PENDING_APPROVAL, the one state the endpoint accepts', async () => {
    const { queryByTestId } = await renderScreen();
    await waitFor(() => expect(queryByTestId('order-item-po-1')).toBeTruthy());
    expect(queryByTestId('order-approve-po-1')).toBeNull();

    client.get.mockImplementation(route([po({ status: 'PENDING_APPROVAL' })]));
    const second = await renderScreen();
    await waitFor(() => expect(second.getByTestId('order-approve-po-1')).toBeTruthy());
  });

  it('approves through the real endpoint and reloads rather than guessing', async () => {
    // A PO approval is a financial mutation (§17.4, online-required), so the redraw is the one the
    // server agrees with — not an optimistic flip of the chip.
    client.get.mockImplementation(route([po({ status: 'PENDING_APPROVAL' })]));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('order-approve-po-1')).toBeTruthy());
    const before = client.get.mock.calls.length;
    await fireEvent.press(getByTestId('order-approve-po-1'));

    await waitFor(() =>
      expect(client.post).toHaveBeenCalledWith('/procurement/purchase-orders/po-1/approve', {
        tier: 'TENANT_ADMIN',
      }),
    );
    await waitFor(() => expect(client.get.mock.calls.length).toBeGreaterThan(before));
  });

  it('brackets every chip count and filters by the one that is on', async () => {
    client.get.mockImplementation(
      route([po(), po({ po_id: 'po-2', po_number: 'PO-8904', status: 'PAID' })]),
    );
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('order-filter-ALL')).toHaveTextContent(/\(2\)/));
    await fireEvent.press(getByTestId('order-filter-PAID'));
    expect(queryByTestId('order-item-po-1')).toBeNull();
    expect(getByTestId('order-item-po-2')).toBeTruthy();
  });

  it('searches the number and the vendor name', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('order-item-po-1')).toBeTruthy());
    await fireEvent.changeText(getByTestId('order-search'), 'structural');
    expect(getByTestId('order-item-po-1')).toBeTruthy();
    await fireEvent.changeText(getByTestId('order-search'), 'nothing at all');
    expect(queryByTestId('order-item-po-1')).toBeNull();
  });

  it('counts the whole tenant in the header, not the page it rendered', async () => {
    client.get.mockImplementation((path: string) =>
      path === '/procurement/purchase-orders'
        ? Promise.resolve({ items: [po()], total: 42 })
        : route()(path),
    );
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('orders-count')).toHaveTextContent(/42/));
  });

  it('says so when there are no orders', async () => {
    client.get.mockImplementation(route([]));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('orders-empty')).toBeTruthy());
  });

  // ── the detail view, unchanged by the rewrite ────────────────────────────────────────────────
  it('opens the order that was tapped and lists what was ordered', async () => {
    client.get.mockImplementation((path: string) =>
      path.startsWith('/procurement/purchase-orders/po-1')
        ? Promise.resolve({
            po: po(),
            line_items: [
              { line_id: 'l-1', description: 'Deformed bar DB16', quantity: '12', unit: 'TON' },
            ],
          })
        : route()(path),
    );
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('order-item-po-1')).toBeTruthy());
    await fireEvent.press(getByTestId('order-item-po-1'));

    await waitFor(() => expect(getByTestId('order-detail-screen')).toBeTruthy());
    expect(getByTestId('order-line')).toHaveTextContent(/Deformed bar DB16/);
    expect(getByTestId('order-line')).toHaveTextContent(/12 TON/);
  });

  it('says an order has no lines rather than showing an empty detail', async () => {
    const { getByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getByTestId('order-item-po-1')).toBeTruthy());
    await fireEvent.press(getByTestId('order-item-po-1'));

    await waitFor(() => expect(getByTestId('order-detail-screen')).toBeTruthy());
    expect(getByText('No line items')).toBeTruthy();
  });

  it('goes back to the list', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('order-item-po-1')).toBeTruthy());
    await fireEvent.press(getByTestId('order-item-po-1'));
    await waitFor(() => expect(getByTestId('order-detail-screen')).toBeTruthy());

    await fireEvent.press(getByTestId('order-detail-back'));
    await waitFor(() => expect(getByTestId('orders-screen')).toBeTruthy());
    expect(queryByTestId('order-detail-screen')).toBeNull();
  });
});
