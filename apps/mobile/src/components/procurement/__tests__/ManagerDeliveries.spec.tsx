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

  it('says so when nothing has been delivered', async () => {
    client.get.mockImplementation(route([]));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('deliveries-empty')).toBeTruthy());
  });
});
