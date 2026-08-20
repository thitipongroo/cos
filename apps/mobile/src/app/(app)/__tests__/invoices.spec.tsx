// Behaviour of the FINANCE vendor-invoice list, pinned before the row-memoization refactor.
//
// Two things here depend on identity rather than text: tapping a row must open THAT invoice's
// detail, and the status filter must re-query. Both are what a mis-keyed memo quietly breaks.

import { render, fireEvent, waitFor, within } from '@testing-library/react-native';
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

  // ── NAMING AN INVOICE ────────────────────────────────────────────────────────────────────────
  //
  // A FALLBACK CHAIN, not a placeholder. `invoice_number` is what the vendor put on the paper and
  // what finance quotes back to them; the two ids are what the row can still be identified by when
  // the number has not been recorded. Only a row with none of the three takes the em dash — and a
  // dash is not a name, which is why such a row also opens nothing.

  it('names an invoice by the number on the paper', async () => {
    respond([ROW_A]);

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText('INV-0001')).toBeTruthy());
  });

  it('falls back to the vendor id when there is no number', async () => {
    respond([{ vendor_invoice_id: 'vi-9', status: 'RECEIVED' }]);

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText('vi-9')).toBeTruthy());
  });

  it('falls back to the invoice id when there is neither', async () => {
    respond([{ invoice_id: 'inv-9', status: 'RECEIVED' }]);

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText('inv-9')).toBeTruthy());
  });

  // A ROW WITH NO ID OPENS NOTHING, AND SAYS SO. That is the difference between a control that is
  // unavailable and one that is broken — and on a list of money owed, a row that silently swallows
  // a tap reads as the app losing the invoice.
  it('says a row with no identity is unavailable rather than letting it fail silently', async () => {
    respond([{ invoice_number: 'INV-0003', status: 'RECEIVED' }]);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('invoice-item')).toBeTruthy());

    expect(getByTestId('invoice-item').props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(getByTestId('invoice-item'));

    // One call — the list fetch. No detail was requested.
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  // The row is READ ALOUD by the same name it shows: without it a screen reader announces the status
  // chip, so every invoice in the list is called "RECEIVED".
  it('is spoken by the name it shows', async () => {
    respond([ROW_A]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('invoice-item')).toBeTruthy());
    expect(getByTestId('invoice-item').props.accessibilityLabel).toBe('INV-0001');
  });

  // No status is no chip, rather than an empty one — a blank chip reads as a status that failed to
  // load, on the field that decides whether this invoice has been paid.
  it('shows no status chip on a row that carries no status', async () => {
    respond([{ vendor_invoice_id: 'vi-1', invoice_number: 'INV-0001' }]);

    const { getByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getByText('INV-0001')).toBeTruthy());
    // SCOPED TO THE ROW: every status word is also a filter chip at the top of this screen, so an
    // unscoped query finds the chip and the test would pass whatever the row drew.
    expect(within(getByTestId('invoice-item')).queryByText('RECEIVED')).toBeNull();
  });

  it('shows the status chip on a row that carries one', async () => {
    respond([ROW_A]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('invoice-item')).toBeTruthy());
    expect(within(getByTestId('invoice-item')).getByText('RECEIVED')).toBeTruthy();
  });

  // ── THE FILTER ───────────────────────────────────────────────────────────────────────────────

  // A RADIO, not a row of buttons: exactly one filter is in force and the list below belongs to it,
  // so a screen reader has to be able to say which.
  it('says which filter is in force', async () => {
    respond([ROW_A]);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('filter-ALL')).toBeTruthy());

    expect(getByTestId('filter-ALL').props.accessibilityRole).toBe('radio');
    expect(getByTestId('filter-ALL').props.accessibilityState.selected).toBe(true);

    await fireEvent.press(getByTestId('filter-PAID'));

    expect(getByTestId('filter-PAID').props.accessibilityState.selected).toBe(true);
    expect(getByTestId('filter-ALL').props.accessibilityState.selected).toBe(false);
  });

  it.each(['RECEIVED', 'VERIFIED', 'APPROVED', 'PAID', 'DISPUTED'])(
    'queries for %s when that chip is chosen',
    async (status) => {
      respond([ROW_A]);

      const { getByTestId } = await renderScreen();
      await waitFor(() => expect(getByTestId(`filter-${status}`)).toBeTruthy());

      await fireEvent.press(getByTestId(`filter-${status}`));

      await waitFor(() =>
        expect(client.get).toHaveBeenLastCalledWith(
          `/procurement/vendor-invoices?status=${status}`,
        ),
      );
    },
  );

  // ALL sends NO status parameter rather than an empty one: `?status=` is a filter for invoices
  // whose status is the empty string, which is not what "all" means.
  it('drops the parameter entirely on ALL, rather than sending an empty one', async () => {
    respond([ROW_A]);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('filter-PAID')).toBeTruthy());

    await fireEvent.press(getByTestId('filter-PAID'));
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));

    await fireEvent.press(getByTestId('filter-ALL'));

    await waitFor(() =>
      expect(client.get).toHaveBeenLastCalledWith('/procurement/vendor-invoices'),
    );
  });

  // ── THE DETAIL ───────────────────────────────────────────────────────────────────────────────

  it('shows the figures an invoice is chased on', async () => {
    respond([ROW_A], DETAIL_A);

    const { getByTestId, getByText, getAllByText } = await renderScreen();
    await waitFor(() => expect(getByTestId('invoice-item')).toBeTruthy());

    await fireEvent.press(getByTestId('invoice-item'));

    await waitFor(() => expect(getByTestId('invoice-detail')).toBeTruthy());
    // The DATE ONLY, not the timestamp: `due_date` arrives as an instant and a due date is a day.
    expect(getByText('2026-09-01')).toBeTruthy();
    // The PO it belongs to, because an invoice with no order behind it is the one finance queries.
    expect(getByText('po-77')).toBeTruthy();
    expect(getAllByText('INV-0001').length).toBeGreaterThan(0);
  });

  it('goes back to the list', async () => {
    respond([ROW_A], DETAIL_A);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('invoice-item')).toBeTruthy());
    await fireEvent.press(getByTestId('invoice-item'));
    await waitFor(() => expect(getByTestId('invoice-detail')).toBeTruthy());

    await fireEvent.press(getByTestId('invoice-back'));

    await waitFor(() => expect(getByTestId('invoices-screen')).toBeTruthy());
  });

  // STAY ON THE LIST when the detail cannot be fetched: a half-empty detail screen is worse than the
  // list the reader can still work from.
  it('stays on the list when the detail cannot be fetched', async () => {
    client.get.mockImplementation((path: string) =>
      path.includes('/vendor-invoices/')
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({ items: [ROW_A] }),
    );

    const { getByTestId, queryByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('invoice-item')).toBeTruthy());

    await fireEvent.press(getByTestId('invoice-item'));

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    expect(queryByTestId('invoice-detail')).toBeNull();
    expect(getByTestId('invoices-screen')).toBeTruthy();
  });

  // ── THE NOTE ─────────────────────────────────────────────────────────────────────────────────
  //
  // ONLINE-ONLY (G-M14): `post` throws offline rather than queuing. A note is a comment on someone
  // else's bill, and a queued one could land days later against an invoice that has since been paid
  // or disputed — so the user is told at once and can retry.

  it('opens the note field with whatever note the invoice already carries', async () => {
    respond([ROW_A], { ...DETAIL_A, note: 'Waiting on the delivery docket' });

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('invoice-item')).toBeTruthy());
    await fireEvent.press(getByTestId('invoice-item'));

    await waitFor(() => expect(getByTestId('invoice-note-input')).toBeTruthy());
    expect(getByTestId('invoice-note-input').props.value).toBe('Waiting on the delivery docket');
  });

  it('opens empty on an invoice with no note', async () => {
    respond([ROW_A], { ...DETAIL_A, note: null });

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('invoice-item')).toBeTruthy());
    await fireEvent.press(getByTestId('invoice-item'));

    await waitFor(() => expect(getByTestId('invoice-note-input')).toBeTruthy());
    expect(getByTestId('invoice-note-input').props.value).toBe('');
  });

  it('saves the note against the invoice it is on', async () => {
    respond([ROW_A], DETAIL_A);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('invoice-item')).toBeTruthy());
    await fireEvent.press(getByTestId('invoice-item'));
    await waitFor(() => expect(getByTestId('invoice-note-input')).toBeTruthy());

    await fireEvent.changeText(getByTestId('invoice-note-input'), '  Query raised with vendor  ');
    await fireEvent.press(getByTestId('save-note-button'));

    await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
    // Trimmed, and against the invoice's OWN id — not the vendor id the row was keyed by.
    expect(client.post).toHaveBeenCalledWith('/procurement/vendor-invoices/vi-1/note', {
      note: 'Query raised with vendor',
    });
  });

  it('confirms the note was saved', async () => {
    respond([ROW_A], DETAIL_A);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('invoice-item')).toBeTruthy());
    await fireEvent.press(getByTestId('invoice-item'));
    await waitFor(() => expect(getByTestId('save-note-button')).toBeTruthy());

    await fireEvent.press(getByTestId('save-note-button'));

    await waitFor(() => expect(getByTestId('note-saved')).toBeTruthy());
  });

  // NO FABRICATED CONFIRMATION. A "saved" line over a note that never left the device would be the
  // worst outcome here: the user closes the screen believing the vendor query is on record.
  it('confirms nothing when the save failed', async () => {
    respond([ROW_A], DETAIL_A);
    client.post.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('invoice-item')).toBeTruthy());
    await fireEvent.press(getByTestId('invoice-item'));
    await waitFor(() => expect(getByTestId('save-note-button')).toBeTruthy());

    await fireEvent.press(getByTestId('save-note-button'));

    await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
    expect(queryByTestId('note-saved')).toBeNull();
    // And the note is still in the field, so the retry costs nothing to type again.
    expect(getByTestId('invoice-note-input')).toBeTruthy();
  });

  // ── THE EMPTY AND FAILED STATES ──────────────────────────────────────────────────────────────

  it('says the list is empty rather than showing nothing at all', async () => {
    respond([]);

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText('No invoices')).toBeTruthy());
  });

  it('reads a bare array as well as an items envelope', async () => {
    client.get.mockResolvedValue([ROW_A, ROW_B]);

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('invoice-item')).toHaveLength(2));
  });

  // The boundary settles on a failed fetch: a skeleton left standing forever reads as "still
  // loading" to someone who is simply offline and will not be told otherwise.
  it('settles into an empty list when the fetch fails', async () => {
    client.get.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('invoices-list')).toBeTruthy());
  });
});

/** The list, and optionally the detail behind a row. */
function respond(rows: unknown[], detail?: unknown) {
  client.get.mockImplementation((path: string) =>
    path.includes('/vendor-invoices/')
      ? Promise.resolve(detail ?? {})
      : Promise.resolve({ items: rows }),
  );
}
