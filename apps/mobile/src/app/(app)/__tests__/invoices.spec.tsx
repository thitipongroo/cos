// Behaviour of the FINANCE AP queue.
//
// REWRITTEN 2026-09-08 with the screen (mockup 09_finance/04_invoices/01_fn_invoice). It pinned a
// wrapped row of raw status chips over a list of invoice numbers; the drawing gives the screen a
// scrolling filter row with counts, a matching banner, and cards an AP clerk acts on.
//
// WHAT THESE ASSERT, beyond the rendering:
//   · the chip COUNTS come from the server's own total, not from the rows this screen received —
//     the endpoint caps a page at 100, so a count over the page is a count of the page
//   · Approve is offered only from RECEIVED/VERIFIED and Dispute only outside PAID/DISPUTED, which
//     are the exact guards `procurement.service.ts` answers 422 on
//   · "Over PO" is measured against the purchase order's own `total_amount` and is silent when the
//     invoice is within it
//   · the detail and its note SURVIVED the redraw — the drawing has neither, and ADR-085 keeps
//     composition outside a mockup's authority

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { I18nProvider } from '../../../i18n';
import InvoicesScreen from '../invoices';

jest.mock('../../../api/client', () => ({ get: jest.fn(), post: jest.fn() }));

/* eslint-disable @typescript-eslint/no-require-imports */
const client = require('../../../api/client') as { get: jest.Mock; post: jest.Mock };
/* eslint-enable @typescript-eslint/no-require-imports */

function invoice(id: string, over: Record<string, unknown> = {}) {
  return {
    invoice_id: id,
    po_id: `po-${id}`,
    vendor_id: 'v-1',
    invoice_number: `INV-2026-${id}`,
    amount: '450000.0000',
    currency_code: 'THB',
    invoice_date: '2026-04-01',
    due_date: '2026-04-15',
    status: 'VERIFIED' as const,
    vendor_name: 'Siam Concrete',
    ...over,
  };
}

function po(id: string, over: Record<string, unknown> = {}) {
  return {
    po_id: `po-${id}`,
    po_number: `PO-2026-${id}`,
    vendor_id: 'v-1',
    project_id: 'proj-1',
    status: 'PARTIALLY_DELIVERED',
    total_amount: '450000.0000',
    currency_code: 'THB',
    updated_at: '2026-04-01T00:00:00Z',
    ...over,
  };
}

/** Counts keyed by status, for the five `limit=1` requests the chips make. */
const COUNTS: Record<string, number> = {
  RECEIVED: 5,
  VERIFIED: 6,
  DISPUTED: 2,
  APPROVED: 1,
  PAID: 0,
};

/**
 * The default wiring.
 *
 * `limit=1` is the count request and answers with a total only; anything else is the visible list.
 */
function route(rows: unknown[] = [invoice('941')], pos: unknown[] = [po('941')]) {
  return (path: string, params?: Record<string, string>) => {
    if (path.startsWith('/procurement/vendor-invoices/')) {
      return Promise.resolve({ ...invoice('941'), note: 'chase the vendor' });
    }
    if (path.startsWith('/procurement/vendor-invoices')) {
      if (params?.limit === '1') {
        return Promise.resolve({ items: [], total: COUNTS[params.status ?? ''] ?? 0 });
      }
      const visible = params?.status
        ? (rows as Array<{ status: string }>).filter((r) => r.status === params.status)
        : rows;
      return Promise.resolve({ items: visible, total: visible.length });
    }
    if (path.startsWith('/procurement/purchase-orders')) {
      return Promise.resolve({ items: pos, total: pos.length });
    }
    return Promise.resolve({ items: [] });
  };
}

function renderScreen() {
  return render(
    <I18nProvider>
      <InvoicesScreen />
    </I18nProvider>,
  );
}

describe('InvoicesScreen', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    client.get.mockReset();
    client.post.mockReset();
    client.get.mockImplementation(route());
    client.post.mockResolvedValue({});
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => alert.mockRestore());

  it('counts each chip from the SERVER, not from the rows it received', async () => {
    // One invoice comes back in the list; the DISPUTED chip must still say 2.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('filter-DISPUTED')).toHaveTextContent(/\(2\)/));
    expect(getByTestId('filter-VERIFIED')).toHaveTextContent(/\(6\)/);
    // All is the five statuses summed, because every invoice is in exactly one.
    expect(getByTestId('filter-ALL')).toHaveTextContent(/\(14\)/);
  });

  it('shows no number at all on a chip whose count could not be read', async () => {
    // A zero it did not get would read as "nothing is disputed", which is a different claim.
    client.get.mockImplementation((path: string, params?: Record<string, string>) =>
      path.startsWith('/procurement/vendor-invoices') && params?.status === 'DISPUTED'
        ? Promise.reject(new Error('offline'))
        : route()(path, params),
    );
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('filter-VERIFIED')).toHaveTextContent(/6/));
    expect(getByTestId('filter-DISPUTED')).not.toHaveTextContent(/\d/);
  });

  it('sends the chosen status to the server rather than filtering the page', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('invoice-item-941')).toBeTruthy());
    await fireEvent.press(getByTestId('filter-DISPUTED'));

    await waitFor(() => {
      const list = client.get.mock.calls.filter(
        (c) =>
          String(c[0]) === '/procurement/vendor-invoices' &&
          (c[1] as Record<string, string>)?.limit !== '1',
      );
      expect(list.at(-1)?.[1]).toEqual({ page: '1', limit: '100', status: 'DISPUTED' });
    });
  });

  it('names the PO by its number, resolved once for the page', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('invoice-item-941')).toHaveTextContent(/#PO-2026-941/));
    expect(
      client.get.mock.calls.filter((c) => String(c[0]).startsWith('/procurement/purchase-orders')),
    ).toHaveLength(1);
  });

  it('does not label the card with the order delivery state', async () => {
    // "Invoiced", "Partly delivered" and the rest came off the PO and were real. They came off the
    // card on the product owner's instruction of 2026-09-08: the card is a decision to approve or
    // dispute, and the order's own progress is not part of it. The `poStatus` messages went with
    // them — nothing else read those keys.
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('invoice-item-941')).toBeTruthy());
    expect(queryByTestId('invoice-po-status-941')).toBeNull();
    expect(getByTestId('invoice-item-941')).not.toHaveTextContent(/Partly delivered/i);
    // The PO reference itself stays — that is what the clerk matches against.
    expect(getByTestId('invoice-item-941')).toHaveTextContent(/#PO-2026-941/);
  });

  it('measures Over PO against the order total, and stays silent when within it', async () => {
    // 473,400 against a 450,000 order is +5.2%.
    client.get.mockImplementation(route([invoice('812', { amount: '473400.0000' })], [po('812')]));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('invoice-item-812')).toHaveTextContent(/\+5\.2%/));

    client.get.mockImplementation(route());
    const second = await renderScreen();
    await waitFor(() => expect(second.getByTestId('invoice-item-941')).toBeTruthy());
    expect(second.getByTestId('invoice-item-941')).not.toHaveTextContent(/Over PO/);
  });

  it('offers Approve only where the server would accept it', async () => {
    // RECEIVED and VERIFIED approve; APPROVED and PAID do not — `procurement.service.ts` answers
    // 422 on the rest, and a button that cannot work should not be under the reader's finger.
    client.get.mockImplementation(
      route(
        [
          invoice('a', { status: 'RECEIVED' }),
          invoice('b', { status: 'APPROVED' }),
          invoice('c', { status: 'PAID' }),
        ],
        [po('a'), po('b'), po('c')],
      ),
    );
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('invoice-approve-a')).toBeTruthy());
    expect(queryByTestId('invoice-approve-b')).toBeNull();
    expect(queryByTestId('invoice-approve-c')).toBeNull();
    // Dispute is the inverse pair: everything but PAID and DISPUTED.
    expect(getByTestId('invoice-dispute-b')).toBeTruthy();
    expect(queryByTestId('invoice-dispute-c')).toBeNull();
  });

  it('approves against the invoice that was pressed, then re-reads the list', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('invoice-approve-941')).toBeTruthy());
    const before = client.get.mock.calls.length;
    await fireEvent.press(getByTestId('invoice-approve-941'));

    await waitFor(() =>
      expect(client.post).toHaveBeenCalledWith('/procurement/vendor-invoices/941/approve', {}),
    );
    // Not optimistic: approving moves the row into another chip, so the redraw is the server's.
    await waitFor(() => expect(client.get.mock.calls.length).toBeGreaterThan(before));
  });

  it('says the write failed rather than pretending it queued', async () => {
    // §17.4 keeps vendor invoices online-only, so `post` throws instead of enqueuing.
    client.post.mockRejectedValue(new Error('offline'));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('invoice-dispute-941')).toBeTruthy());
    await fireEvent.press(getByTestId('invoice-dispute-941'));

    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0]?.[1]).toMatch(/offline/i);
  });

  it('sorts by due date, and swaps to the issue date when asked', async () => {
    client.get.mockImplementation(
      route(
        [
          invoice('late', { due_date: '2026-05-30', invoice_date: '2026-01-01' }),
          invoice('soon', { due_date: '2026-04-01', invoice_date: '2026-03-01' }),
        ],
        [po('late'), po('soon')],
      ),
    );
    const { getByTestId, getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('invoice-item-soon')).toBeTruthy());
    const order = () => getAllByTestId(/^invoice-item-/).map((n) => n.props.testID);
    expect(order()).toEqual(['invoice-item-soon', 'invoice-item-late']);

    await fireEvent.press(getByTestId('invoices-sort'));
    expect(order()).toEqual(['invoice-item-late', 'invoice-item-soon']);
  });

  it('draws the whole matching banner, confidence included', async () => {
    // THE ADR-099 GUARD, and the register's most uncomfortable entry: three-way matching does not
    // exist in backend/src AT ALL, so this is a confidence on a process that never ran rather than
    // on a calculation dressed as one. Drawn on the product owner's instruction of 2026-09-08.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('invoices-matching')).toHaveTextContent(/98%/));
    expect(getByTestId('invoices-matching')).toHaveTextContent(/96%/);
    // The references carry their own prefixes — "PO #PO-2026-882" said it twice (PO 2026-09-08).
    expect(getByTestId('invoices-matching')).toHaveTextContent(/#PO-2026-882/);
    expect(getByTestId('invoices-matching')).not.toHaveTextContent(/PO #PO/);
    // The per-card score and the GRN are drawn too, and stay put whatever the API returns.
    expect(getByTestId('invoice-item-941')).toHaveTextContent(/99% match/);
    expect(getByTestId('invoice-item-941')).toHaveTextContent(/#GRN-1049/);
  });

  it('foots the banner with a source that names records this repository has', async () => {
    // `01-fn-invoice` foots the card "แหล่งข้อมูล: ERP DB & Central OCR Ledger". NEITHER EXISTS
    // HERE, and a provenance line is the one piece of drawn text that changes how much of the
    // screen a reader believes — so the drawn figures above it keep the drawing's shape while the
    // source names what actually served them. ADR-098's second amendment, applied a fourth time.
    const { getByTestId } = await renderScreen();

    await waitFor(() =>
      expect(getByTestId('invoices-matching')).toHaveTextContent(
        /vendor invoices and purchase orders/i,
      ),
    );
    expect(getByTestId('invoices-matching')).not.toHaveTextContent(/OCR|ERP/i);
  });

  it('brackets every chip count, including All', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('filter-ALL')).toHaveTextContent(/\(14\)/));
    expect(getByTestId('filter-DISPUTED')).toHaveTextContent(/\(2\)/);
  });

  it('shows the discrepancy box only on a disputed invoice', async () => {
    client.get.mockImplementation(
      route([invoice('812', { status: 'DISPUTED' }), invoice('941')], [po('812'), po('941')]),
    );
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('invoice-discrepancy-812')).toBeTruthy());
    expect(queryByTestId('invoice-discrepancy-941')).toBeNull();
  });

  it('keeps the detail and its note that the drawing has no room for', async () => {
    // ADR-085: a mockup is authoritative for style, not composition. `GET .../:id` and
    // `POST .../note` are reviewed working capability and a redraw does not remove them.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('invoice-item-941')).toBeTruthy());
    await fireEvent.press(getByTestId('invoice-open-941'));

    await waitFor(() => expect(getByTestId('invoice-detail')).toBeTruthy());
    expect(getByTestId('invoice-note-input').props.value).toBe('chase the vendor');
    expect(getByTestId('invoice-detail')).toHaveTextContent(/#PO-2026-941/);

    await fireEvent.changeText(getByTestId('invoice-note-input'), 'called, awaiting credit note');
    await fireEvent.press(getByTestId('save-note-button'));

    await waitFor(() =>
      expect(client.post).toHaveBeenCalledWith('/procurement/vendor-invoices/941/note', {
        note: 'called, awaiting credit note',
      }),
    );
    await waitFor(() => expect(getByTestId('note-saved')).toBeTruthy());
  });

  it('stays on the list when the detail cannot be fetched', async () => {
    client.get.mockImplementation((path: string, params?: Record<string, string>) =>
      path.startsWith('/procurement/vendor-invoices/')
        ? Promise.reject(new Error('offline'))
        : route()(path, params),
    );
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('invoice-item-941')).toBeTruthy());
    await fireEvent.press(getByTestId('invoice-open-941'));

    await waitFor(() => expect(queryByTestId('invoice-detail')).toBeNull());
    expect(getByTestId('invoices-list')).toBeTruthy();
  });

  it('says the list is truncated rather than letting it read as the whole filter', async () => {
    client.get.mockImplementation((path: string, params?: Record<string, string>) => {
      if (path.startsWith('/procurement/vendor-invoices') && params?.limit === '100') {
        return Promise.resolve({ items: [invoice('941')], total: 340 });
      }
      return route()(path, params);
    });
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('invoices-truncated')).toHaveTextContent(/340/));
  });

  it('says the list is empty rather than showing nothing at all', async () => {
    client.get.mockImplementation(route([], []));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('invoices-empty')).toBeTruthy());
  });

  it('settles into an empty list when the fetch fails offline', async () => {
    client.get.mockImplementation(() => Promise.reject(new Error('offline')));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('invoices-empty')).toBeTruthy());
  });

  it('draws the two scan controls, and neither of them writes', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('invoice-scan')).toBeTruthy());
    await fireEvent.press(getByTestId('invoice-scan'));
    await fireEvent.press(getByTestId('invoice-scan-icon'));

    expect(alert).toHaveBeenCalledTimes(2);
    expect(alert.mock.calls[0]?.[1]).toMatch(/does not exist yet/i);
    expect(client.post).not.toHaveBeenCalled();
  });

  it('draws the chat control on a disputed invoice, and it writes nothing', async () => {
    client.get.mockImplementation(route([invoice('812', { status: 'DISPUTED' })], [po('812')]));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('invoice-chat-812')).toBeTruthy());
    await fireEvent.press(getByTestId('invoice-chat-812'));

    expect(alert).toHaveBeenCalled();
    expect(client.post).not.toHaveBeenCalled();
  });

  it('counts what is due now, and says nothing when nothing is', async () => {
    // Compared as date strings — `due_date` is a Postgres DATE, and parsing it into a Date would
    // put it at midnight UTC and shift a Bangkok reader's "today".
    // Dates are literal rather than relative to the clock: one long past, one far enough ahead
    // that the assertion cannot rot into passing for the wrong reason.
    client.get.mockImplementation(
      route(
        [invoice('old', { due_date: '2020-01-01' }), invoice('later', { due_date: '2099-01-01' })],
        [po('old'), po('later')],
      ),
    );
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('invoices-screen')).toHaveTextContent(/1 due now/));
    expect(getByTestId('invoice-item-old')).toHaveTextContent(/Overdue/);
    expect(getByTestId('invoice-item-later')).not.toHaveTextContent(/Overdue/);
  });
});
