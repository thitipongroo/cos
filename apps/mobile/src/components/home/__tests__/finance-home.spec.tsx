// Behaviour of the FINANCE Home dashboard (mockup 09_finance/01_home/01_fn_dashboard).
//
// WHAT THESE TESTS ARE FOR. Three of the figures on this screen come from one endpoint that this
// app had never read before — the 13-week cash flow forecast — and they are read by the SAME pure
// functions the nightly alert sweep grades with. The value of that sharing is only real if the two
// keep agreeing, so the tests below assert the readings rather than the rendering: which week the
// card names, which word the tile shows, and that a screen with no answer prints a placeholder
// instead of a number.

import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import { useProjectStore } from '../../../store/projectStore';
import FinanceHome from '../FinanceHome';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('../../../api/client', () => ({ get: jest.fn() }));

/* eslint-disable @typescript-eslint/no-require-imports */
const client = require('../../../api/client') as { get: jest.Mock };
/* eslint-enable @typescript-eslint/no-require-imports */

function payment(id: string, amount: string, date: string) {
  return {
    payment_id: id,
    invoice_id: `inv-${id}`,
    project_id: 'proj-1',
    amount,
    currency_code: 'THB',
    payment_date: date,
    payment_reference: null,
    status: 'PENDING' as const,
  };
}

/**
 * The procurement row that names a payment.
 *
 * The name is NOT on the payment: finance may not query `procurement.*` (master PHASE 7 line
 * 3216), so the queue matches `GET /procurement/vendor-invoices` on `invoice_id`.
 */
function invoice(id: string, vendor = 'Siam Concrete') {
  return {
    invoice_id: `inv-${id}`,
    po_id: `po-${id}`,
    vendor_id: 'v-1',
    invoice_number: `INV-${id}`,
    amount: '0.0000',
    currency_code: 'THB',
    invoice_date: '2026-09-01',
    due_date: '2026-09-30',
    status: 'APPROVED' as const,
    vendor_name: vendor,
  };
}

/** A 13-week forecast whose cumulative net first goes negative in `week`, or never when null. */
function forecast(week: number | null, depth = '-450000.0000') {
  return Array.from({ length: 13 }, (_, i) => ({
    period_start: `2026-09-${String(i + 1).padStart(2, '0')}`,
    period_end: `2026-09-${String(i + 2).padStart(2, '0')}`,
    inflow: '0.0000',
    outflow: '0.0000',
    net_flow: '0.0000',
    cumulative_net: week !== null && i >= week ? depth : '12400000.0000',
  }));
}

function route(path: string) {
  if (path.startsWith('/finance/payments')) {
    return Promise.resolve([
      payment('p1', '850000.0000', '2026-09-08'),
      payment('p2', '120500.0000', '2026-09-09'),
    ]);
  }
  if (path.startsWith('/procurement/vendor-invoices')) {
    return Promise.resolve({ items: [invoice('p1'), invoice('p2')] });
  }
  if (path.startsWith('/finance/cashflow-forecast')) return Promise.resolve(forecast(2));
  return Promise.resolve({ items: [] });
}

function renderHome() {
  return render(
    <I18nProvider>
      <FinanceHome />
    </I18nProvider>,
  );
}

describe('FinanceHome', () => {
  beforeEach(() => {
    mockPush.mockReset();
    client.get.mockReset();
    client.get.mockImplementation(route);
    useProjectStore.setState({
      active: { projectId: 'proj-1', projectCode: 'SKY', projectName: 'Skybridge Central' },
    } as never);
  });

  it('sums what is waiting for approval, in decimal.js and not on the page', async () => {
    // 850,000 + 120,500 = 970,500. The endpoint is asked for PENDING so the sum is over the tenant,
    // not over whichever twenty rows came back first.
    const { getByTestId } = await renderHome();

    // IN FULL, with the cents (PO 2026-09-08). The card is screen-wide and this is the figure
    // someone reads before deciding what to approve, so it is not abbreviated the way the two
    // half-width tiles below it are.
    await waitFor(() =>
      expect(getByTestId('kpi-pending-approvals')).toHaveTextContent(/฿ 970,500\.00/),
    );
    const call = client.get.mock.calls.find((c) => String(c[0]).startsWith('/finance/payments'));
    expect(call?.[1]).toEqual({ status: 'PENDING' });
  });

  it('names the week the money runs out, one-based for a reader', async () => {
    // `firstShortfallWeek` is ZERO-based, matching the array; a forecast that turns negative at
    // index 2 is "week 3" on screen. An off-by-one here names the wrong week on a finance card.
    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('finance-forecast')).toHaveTextContent(/week 3/));
    expect(getByTestId('finance-forecast')).toHaveTextContent(/450,000/);
  });

  it('says the position holds when the money never runs out', async () => {
    client.get.mockImplementation((path: string) =>
      path.startsWith('/finance/cashflow-forecast') ? Promise.resolve(forecast(null)) : route(path),
    );
    const { getByTestId } = await renderHome();

    await waitFor(() =>
      expect(getByTestId('finance-forecast')).toHaveTextContent(/stays positive/i),
    );
    // …and the cash tile agrees, because both read the same function.
    expect(getByTestId('finance-cash-risk')).toHaveTextContent(/healthy/i);
  });

  it('grades the cash tile with the SAME rule the nightly alert uses', async () => {
    // Negative at index 2 is HIGH by `gradeCashflowRisk`'s bands. The screen an operator opens to
    // check an alert must not disagree with the alert.
    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('finance-cash-risk')).toHaveTextContent(/at risk/i));
  });

  it('carries no project bar, because almost nothing on this screen is about one project', async () => {
    // Removed 2026-09-08 (PO). The pending total, its delta and the whole queue are tenant-wide
    // reads; a bar announcing ONE active project claimed a scope the screen does not have. The two
    // figures that ARE per project say so on themselves — see the test below.
    const { queryByTestId } = await renderHome();

    await waitFor(() => expect(queryByTestId('kpi-pending-approvals')).toBeTruthy());
    expect(queryByTestId('project-context-bar')).toBeNull();
  });

  it('reads the forecast for ONE project, because it is advice about somewhere', async () => {
    // Not a portfolio position scoped too narrowly — advice. "Delay the secondary material orders"
    // means nothing addressed to five sites at once (PO 2026-09-08). A sum across projects was
    // built and removed the same day.
    const { getByTestId } = await renderHome();

    await waitFor(() =>
      expect(getByTestId('finance-forecast')).toHaveTextContent(/Skybridge Central/),
    );
    const asked = client.get.mock.calls
      .map((c) => String(c[0]))
      .filter((path) => path.includes('cashflow-forecast'));
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('proj-1');
  });

  it('asks for no forecast at all until a project has been chosen', async () => {
    // `GET /finance/cashflow-forecast/` with an empty id is a request whose answer is undefined.
    useProjectStore.setState({ active: null } as never);
    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('finance-forecast')).toBeTruthy());
    expect(client.get.mock.calls.some((c) => String(c[0]).includes('cashflow-forecast'))).toBe(
      false,
    );
  });

  it('counts the pending total over EVERY project, unlike the forecast beside it', async () => {
    // The screen's two scopes, asserted together so the difference is deliberate rather than
    // accidental: the money and the queue are tenant-wide reads with no `project_id`; the forecast
    // is one project. Verified against the seeded tenant on 2026-09-08 — ฿9,822,524.00 there is the
    // sum of five projects' pending payments, to the baht.
    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('kpi-pending-approvals')).toBeTruthy());
    const call = client.get.mock.calls.find((c) => String(c[0]).startsWith('/finance/payments'));
    expect(call?.[1]).toEqual({ status: 'PENDING' });
    expect(String(call?.[1] ?? {})).not.toContain('project');
  });

  it('prints an em dash rather than a zero it could not verify', async () => {
    client.get.mockImplementation((path: string) =>
      path.startsWith('/finance/payments') ? Promise.reject(new Error('offline')) : route(path),
    );
    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('kpi-pending-approvals')).toHaveTextContent(/—/));
  });

  it('lists the queue worst-dated first', async () => {
    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('finance-queue-p1')).toBeTruthy());
    expect(getByTestId('finance-queue-p1')).toHaveTextContent(/Siam Concrete/);
    expect(getByTestId('finance-queue-p1')).toHaveTextContent(/INV-p1/);
  });

  it('keeps a payment the index cannot name, with an em dash for the name', async () => {
    // A payment queue that hides a payment is worse than one that shows it without a vendor name,
    // and the index is empty whenever procurement is unreachable.
    client.get.mockImplementation((path: string) =>
      path.startsWith('/procurement/vendor-invoices')
        ? Promise.reject(new Error('offline'))
        : route(path),
    );
    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('finance-queue-p1')).toBeTruthy());
    expect(getByTestId('finance-queue-p1')).toHaveTextContent(/—/);
    expect(getByTestId('finance-queue-p1')).not.toHaveTextContent(/Siam/);
  });

  it('says so rather than showing an empty queue as nothing pending', async () => {
    client.get.mockImplementation((path: string) =>
      path.startsWith('/finance/payments') ? Promise.resolve([]) : route(path),
    );
    const { getByTestId } = await renderHome();

    await waitFor(() =>
      expect(getByTestId('finance-queue-empty')).toHaveTextContent(/Nothing is/i),
    );
  });

  it('sends both queue controls to the payments screen', async () => {
    // The pending CARD is one of them since 2026-09-08 — the "Review queue" link beside its delta
    // was removed and the card itself carries the gesture, marked by its plated chevron.
    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('kpi-pending-approvals')).toBeTruthy());
    await fireEvent.press(getByTestId('kpi-pending-approvals'));
    expect(mockPush).toHaveBeenCalledWith('/payments');

    await fireEvent.press(getByTestId('finance-view-all'));
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  // ─── The drawing's own furniture (PO corrections, 2026-09-08) ─────────────

  it('makes the whole pending card the control, with no REVIEW QUEUE button', async () => {
    // The drawing marks the tile itself `role="button"` and puts a small trailing affordance at
    // its foot; the filled button that stood here was never in it.
    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('kpi-pending-approvals')).toBeTruthy());
    expect(getByTestId('kpi-pending-approvals').props.accessibilityRole).toBe('button');

    await fireEvent.press(getByTestId('kpi-pending-approvals'));
    expect(mockPush).toHaveBeenCalledWith('/payments');
  });

  it('puts the minus behind the currency symbol on a negative position', async () => {
    // `฿ -712,524.00`, not `-฿712,524.00` — these figures sit in a column where every other one
    // starts with the symbol (PO 2026-09-08).
    client.get.mockImplementation((path: string) =>
      path.startsWith('/finance/cashflow-forecast')
        ? Promise.resolve(forecast(2, '-712524.0000'))
        : route(path),
    );
    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('kpi-cash-flow')).toHaveTextContent(/฿ -712,524\.00/));
    expect(getByTestId('kpi-cash-flow')).not.toHaveTextContent(/-฿/);
  });

  it('draws the forecast confidence and its model link, and the link writes nothing', async () => {
    // THE ADR-099 GUARD, and the entry that record is least comfortable with: this card reads a
    // DETERMINISTIC forecast. Drawn on the product owner's instruction of 2026-09-08.
    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('finance-forecast')).toHaveTextContent(/92%/i));
    // A CHEVRON ALONE since 2026-09-08 — the words competed with a long project name on one row.
    // The label stays on the control, which is where a screen reader needs it.
    expect(getByTestId('finance-view-model')).toBeTruthy();
    expect(getByTestId('finance-view-model')).not.toHaveTextContent(/view model/i);

    await fireEvent.press(getByTestId('finance-view-model'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('prints the drawn figures unchanged, whatever the API returns', async () => {
    // THE ADR-099 GUARD. If either ever starts tracking an endpoint, this fails and the decision
    // gets revisited rather than drifting.
    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('kpi-pending-approvals')).toHaveTextContent(/\+12%/));
    expect(getByTestId('kpi-burn-rate')).toHaveTextContent(/1\.2 M/);
  });
});
