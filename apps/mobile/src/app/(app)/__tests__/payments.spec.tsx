// Behaviour of the FINANCE approval queue.
//
// REWRITTEN 2026-09-08 with the screen (mockup 09_finance/02_payments/01_fn_payment). It pinned a
// list of payment references with an expand-in-place detail; the drawing gives the queue vendor
// cards and a full-screen detail whose Approve sits behind a confirmation.
//
// WHAT THESE ASSERT is the money path and the rules around it: that the PENDING filter goes to the
// server rather than to the page, that a cancelled confirmation does not approve, and that an
// offline approval says so instead of pretending to queue — §17.4 makes financial writes
// online-only and `SYNC_PUSHABLE_ENTITY_TYPES` has no `payment`, so `mutate` throws by design.
//
// THE VENDOR'S NAME COMES FROM PROCUREMENT, matched on `invoice_id`. It was briefly joined into
// `GET /finance/payments` on 2026-09-08 and reverted the same day: finance may not query
// `procurement.*` (master PHASE 7 line 3216). The tests below pin the lookup, that it costs one
// request rather than one per row, and the em dash a payment gets when the index has nothing.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import { useProjectStore } from '../../../store/projectStore';
import PaymentsScreen from '../payments';
import { paletteFor } from '../../../theme/palette';
import { useThemeStore } from '../../../store/themeStore';

jest.mock('../../../api/client', () => ({ get: jest.fn(), mutate: jest.fn() }));
jest.mock('../../../lib/biometric', () => ({ authenticate: jest.fn() }));

/* eslint-disable @typescript-eslint/no-require-imports */
const client = require('../../../api/client') as { get: jest.Mock; mutate: jest.Mock };
const bio = require('../../../lib/biometric') as { authenticate: jest.Mock };
/* eslint-enable @typescript-eslint/no-require-imports */

function payment(id: string, over: Record<string, unknown> = {}) {
  return {
    payment_id: id,
    invoice_id: `inv-${id}`,
    project_id: 'proj-1',
    amount: '1420000.0000',
    currency_code: 'THB',
    payment_date: '2026-09-30',
    payment_reference: null,
    status: 'PENDING' as const,
    ...over,
  };
}

/** The procurement row a payment's `invoice_id` points at. */
function invoice(paymentId: string, over: Record<string, unknown> = {}) {
  return {
    invoice_id: `inv-${paymentId}`,
    po_id: `po-${paymentId}`,
    vendor_id: 'v-1',
    invoice_number: 'INV-2026-0891',
    amount: '1420000.0000',
    currency_code: 'THB',
    invoice_date: '2026-09-01',
    due_date: '2026-09-30',
    status: 'APPROVED' as const,
    vendor_name: 'Modernist Concrete',
    ...over,
  };
}

const FORECAST = Array.from({ length: 13 }, (_, i) => ({
  period_start: `2026-09-${String(i + 1).padStart(2, '0')}`,
  period_end: `2026-09-${String(i + 2).padStart(2, '0')}`,
  inflow: '0.0000',
  outflow: '0.0000',
  net_flow: '0.0000',
  cumulative_net: i >= 2 ? '-450000.0000' : '100000.0000',
}));

function route(path: string, _params?: Record<string, string>) {
  if (path.startsWith('/projects/mine')) {
    return Promise.resolve({
      items: [{ project_id: 'proj-1', project_code: 'SKY-01', project_name: 'Skybridge Central' }],
    });
  }
  if (path.startsWith('/finance/payments')) return Promise.resolve([payment('p1'), payment('p2')]);
  if (path.startsWith('/procurement/vendor-invoices')) {
    return Promise.resolve({ items: [invoice('p1'), invoice('p2')] });
  }
  if (path.startsWith('/finance/cashflow-forecast')) return Promise.resolve(FORECAST);
  return Promise.resolve({ items: [] });
}

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
    bio.authenticate.mockReset();
    client.get.mockImplementation(route);
    client.mutate.mockResolvedValue({});
    bio.authenticate.mockResolvedValue('unlocked');
    useProjectStore.setState({
      active: { projectId: 'proj-1', projectCode: 'SKY', projectName: 'Skybridge Central' },
    } as never);
  });

  it('carries no project bar, and asks for the queue across every project', async () => {
    // Removed 2026-09-08 (PO). `listPayments('PENDING')` sends no `project_id`, so the endpoint's
    // project predicate is null and matches all — ten pending rows across five projects in the
    // seeded tenant. A bar announcing ONE active project claimed a scope this screen does not have.
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('payment-item-p1')).toBeTruthy());
    expect(queryByTestId('project-context-bar')).toBeNull();
    const call = client.get.mock.calls.find((c) => String(c[0]).startsWith('/finance/payments'));
    expect(call?.[1]).toEqual({ status: 'PENDING' });
  });

  it('asks the SERVER for the pending rows, and counts what it got back', async () => {
    // The endpoint pages at 20 and a tenant holds more, so a count over the page this screen
    // received would be a count of the page.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('payment-item-p1')).toBeTruthy());
    const call = client.get.mock.calls.find((c) => String(c[0]).startsWith('/finance/payments'));
    expect(call?.[1]).toEqual({ status: 'PENDING' });
    // The word is capitalised by `textTransform`, so the tree still carries the message file's
    // ordinary "Pending" — which is the string a screen reader announces.
    expect(getByTestId('payments-screen')).toHaveTextContent(/Pending/);
    expect(getByTestId('payments-screen')).toHaveTextContent(/2 items awaiting/);
  });

  it('places each payment by its project CODE, resolved once for the page', async () => {
    // A payment carries `project_id`, a UUID. The drawing's card wants "Project P-204", and
    // `getMyProjects()` is the one request that turns one into the other.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('payment-item-p1')).toHaveTextContent(/SKY-01/));
    expect(
      client.get.mock.calls.filter((c) => String(c[0]).startsWith('/projects/mine')),
    ).toHaveLength(1);
  });

  it('keeps a payment on a project this role cannot see, with an em dash for the code', async () => {
    // A payment on a project the reader is not a member of still belongs in the tenant's queue.
    client.get.mockImplementation((path: string, params?: Record<string, string>) =>
      path.startsWith('/projects/mine') ? Promise.resolve({ items: [] }) : route(path, params),
    );
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('payment-item-p1')).toBeTruthy());
    expect(getByTestId('payment-item-p1')).toHaveTextContent(/—/);
  });

  it('names the vendor by looking the payment up in the procurement index', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('payment-item-p1')).toHaveTextContent(/Modernist/));
    expect(getByTestId('payment-item-p1')).toHaveTextContent(/INV-2026-0891/);
    // ONE request for the page, never one per row drawn.
    expect(
      client.get.mock.calls.filter((c) => String(c[0]).startsWith('/procurement/vendor-invoices')),
    ).toHaveLength(1);
  });

  it('keeps a payment the index cannot name, with em dashes', async () => {
    // A payment queue that hides a payment is worse than one that shows it without a name — and
    // the index is empty whenever procurement is unreachable.
    client.get.mockImplementation((path: string) =>
      path.startsWith('/procurement/vendor-invoices')
        ? Promise.reject(new Error('offline'))
        : route(path),
    );
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('payment-item-p1')).toBeTruthy());
    expect(getByTestId('payment-item-p1')).toHaveTextContent(/—/);
    expect(getByTestId('payment-item-p1')).not.toHaveTextContent(/Modernist/);
  });

  it('opens the detail for the row that was tapped', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('payment-item-p1')).toBeTruthy());
    await fireEvent.press(getByTestId('payment-item-p1'));

    await waitFor(() => expect(getByTestId('payment-detail')).toBeTruthy());
    expect(getByTestId('payment-detail')).toHaveTextContent(/Modernist/);
    expect(getByTestId('payment-mfa-note')).toBeTruthy();
  });

  it('approves only after the confirmation succeeds', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('payment-item-p1')).toBeTruthy());
    await fireEvent.press(getByTestId('payment-item-p1'));
    await fireEvent.press(getByTestId('approve-payment-button'));

    await waitFor(() =>
      expect(client.mutate).toHaveBeenCalledWith(
        'PATCH',
        '/finance/payments/p1/approve',
        {},
        'payment',
        'p1',
      ),
    );
    // …and the row leaves the queue it is no longer in.
    await waitFor(() => expect(queryByTestId('payment-item-p1')).toBeNull());
  });

  it('marks Dispute as the destructive half of the pair', async () => {
    // The drawing gives it `border-mobile-danger text-mobile-danger`: an outline button whose whole
    // point is that it does not look like Approve. Asserted on the resolved styles because a colour
    // is the entire content of this requirement.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('payment-item-p1')).toBeTruthy());
    await fireEvent.press(getByTestId('payment-item-p1'));
    await waitFor(() => expect(getByTestId('payment-dispute-button')).toBeTruthy());

    // Resolved against the token rather than a literal, so a palette change moves both together.
    const flat = (style: unknown): Record<string, unknown> =>
      Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
    const danger = paletteFor(useThemeStore.getState().mode).danger;
    expect(flat(getByTestId('payment-dispute-button').props.style)['borderColor']).toBe(danger);
  });

  it('does NOT approve when the user backs out of the confirmation', async () => {
    bio.authenticate.mockResolvedValue('cancelled');
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('payment-item-p1')).toBeTruthy());
    await fireEvent.press(getByTestId('payment-item-p1'));
    await fireEvent.press(getByTestId('approve-payment-button'));

    await waitFor(() => expect(bio.authenticate).toHaveBeenCalled());
    expect(client.mutate).not.toHaveBeenCalled();
  });

  it('approves anyway when the device has no biometric to offer', async () => {
    // Refusing here would lock a finance officer out of the one action the role exists for, and
    // since the server carries no step-up guard it would buy no security either — see the screen.
    bio.authenticate.mockResolvedValue('unavailable');
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('payment-item-p1')).toBeTruthy());
    await fireEvent.press(getByTestId('payment-item-p1'));
    await fireEvent.press(getByTestId('approve-payment-button'));

    await waitFor(() => expect(client.mutate).toHaveBeenCalled());
  });

  it('keeps the row when the approval fails, rather than pretending it queued', async () => {
    // §17.4 makes financial writes online-only and `mutate` throws instead of enqueuing. Dropping
    // the row here would tell a finance officer a payment was approved when it was not.
    client.mutate.mockRejectedValue(new Error('offline'));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('payment-item-p1')).toBeTruthy());
    await fireEvent.press(getByTestId('payment-item-p1'));
    await fireEvent.press(getByTestId('approve-payment-button'));

    await waitFor(() => expect(client.mutate).toHaveBeenCalled());
    await fireEvent.press(getByTestId('payment-detail-back'));
    await waitFor(() => expect(getByTestId('payment-item-p1')).toBeTruthy());
  });

  it('reads the analysis module off the forecast for one project', async () => {
    // The module is the 13-week forecast for the ACTIVE project — advice about somewhere, not a
    // portfolio position, which is why the queue above it is tenant-wide and this is not.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('payments-analysis')).toHaveTextContent(/week 3/));
    expect(getByTestId('payments-analysis')).toHaveTextContent(/Skybridge Central/);
  });

  it('draws the confidence its own drawing carries', async () => {
    // THE ADR-099 GUARD, and the entry that record is least comfortable with: this module reads a
    // DETERMINISTIC forecast. Drawn on the product owner's instruction of 2026-09-08. The Home card
    // shows 92% and this one 94% — two drawings, two numbers, one register entry keyed by screen,
    // so neither screen can quietly inherit the other's.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('payments-analysis')).toHaveTextContent(/94%/));
    expect(getByTestId('payments-analysis')).not.toHaveTextContent(/92%/);
  });

  it('asks for no forecast until a project has been chosen', async () => {
    useProjectStore.setState({ active: null } as never);
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('payments-analysis')).toBeTruthy());
    expect(client.get.mock.calls.some((c) => String(c[0]).includes('cashflow-forecast'))).toBe(
      false,
    );
  });

  it('keeps the screen usable when the list request fails offline', async () => {
    client.get.mockImplementation(() => Promise.reject(new Error('offline')));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('payments-empty')).toBeTruthy());
  });

  it('draws the raise-payment control, and it writes nothing', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('payments-add')).toBeTruthy());
    await fireEvent.press(getByTestId('payments-add'));

    expect(client.mutate).not.toHaveBeenCalled();
  });
});
