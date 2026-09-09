// The PROC_MANAGER approvals queue (mockup 11_proc_manager/02_rfqs/01_pom_rfqs).

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import ApprovalsQueue from '../ApprovalsQueue';

jest.mock('../../../api/client', () => ({ get: jest.fn(), post: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock; post: jest.Mock };

const PO = {
  po_id: 'po-1',
  po_number: 'PO-2024-112',
  vendor_id: 'v-1',
  project_id: 'p-1',
  status: 'PENDING_APPROVAL',
  total_amount: '85000.0000',
  currency_code: 'THB',
  updated_at: '2026-09-01T00:00:00.000Z',
};
const RFQ = {
  rfq_id: 'rfq-1',
  rfq_number: 'RFQ-2024-089',
  project_id: 'p-1',
  status: 'EVALUATED',
  deadline: '2026-09-20T10:00:00.000Z',
};

function route(pos: unknown[] = [PO], rfqs: unknown[] = [RFQ]) {
  return (path: string) => {
    if (path.startsWith('/procurement/purchase-orders')) return Promise.resolve({ items: pos });
    if (path.startsWith('/procurement/rfqs')) return Promise.resolve({ items: rfqs });
    if (path.startsWith('/procurement/vendors/directory')) {
      return Promise.resolve([{ vendor_id: 'v-1', vendor_name: 'Siam Materials Co.' }]);
    }
    if (path.startsWith('/projects')) {
      return Promise.resolve({ items: [{ project_id: 'p-1', project_name: 'Sukhumvit 45' }] });
    }
    return Promise.resolve({ items: [] });
  };
}

async function renderScreen() {
  return render(
    <I18nProvider>
      <ApprovalsQueue />
    </I18nProvider>,
  );
}

describe('ApprovalsQueue', () => {
  beforeEach(() => {
    client.get.mockReset();
    client.post.mockReset();
    client.get.mockImplementation(route());
  });

  it('lists both kinds of decision — a purchase order and an RFQ', async () => {
    // `fetchPendingApprovals` asks for PENDING_APPROVAL and EVALUATED, the two states that mean
    // "waiting on a person". Neither is a badge; both are real statuses on real tables.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('approval-po-po-1')).toHaveTextContent(/PO-2024-112/));
    expect(getByTestId('approval-rfq-rfq-1')).toHaveTextContent(/RFQ-2024-089/);
  });

  it('names the vendor and the project from their indexes, not from the row', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() =>
      expect(getByTestId('approval-po-po-1')).toHaveTextContent(/Siam Materials Co\./),
    );
    expect(getByTestId('approval-po-po-1')).toHaveTextContent(/Sukhumvit 45/);
  });

  it('says an RFQ has several bids rather than naming a vendor it has not chosen', async () => {
    // An RFQ in EVALUATED has quotations from several vendors and no winner — that IS the decision
    // it is waiting for. Printing one vendor there would answer the question the row is asking.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('approval-rfq-rfq-1')).toBeTruthy());
    expect(getByTestId('approval-rfq-rfq-1')).toHaveTextContent(/Multiple bids/i);
  });

  it('prints no amount on an RFQ, which has no total until it is awarded', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('approval-rfq-rfq-1')).toBeTruthy());
    expect(getByTestId('approval-rfq-rfq-1')).not.toHaveTextContent(/฿/);
    // …while the purchase order, which has one, prints it.
    expect(getByTestId('approval-po-po-1')).toHaveTextContent(/85,000/);
  });

  it('filters by kind and counts each chip', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('approval-filter-ALL')).toHaveTextContent(/\(2\)/));
    await fireEvent.press(getByTestId('approval-filter-PO'));
    expect(queryByTestId('approval-rfq-rfq-1')).toBeNull();
    expect(getByTestId('approval-po-po-1')).toBeTruthy();
  });

  it('never calls approve, because this role cannot', async () => {
    // THE GUARD ON THE HEADER'S LONGEST NOTE. `POST /purchase-orders/:poId/approve` is
    // @Roles(PROJECT_MANAGER, FINANCE, EXECUTIVE, TENANT_ADMIN) — PROC_MANAGER would get a 403 —
    // and the RFQ award needs a quotation id that only the AWARDING endpoint can supply. The button
    // is drawn and says so. If someone wires it, this fails and the reason gets read again.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('approval-approve-po-po-1')).toBeTruthy());
    await fireEvent.press(getByTestId('approval-approve-po-po-1'));

    expect(client.post).not.toHaveBeenCalled();
  });

  it('never fetches the quotations endpoint, which awards rather than reads', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('approval-rfq-rfq-1')).toBeTruthy());
    expect(
      client.get.mock.calls.filter((c) =>
        /\/procurement\/rfqs\/[^/]+\/quotations/.test(String(c[0])),
      ),
    ).toHaveLength(0);
  });

  it('distinguishes an empty queue from a queue it could not read', async () => {
    // "Nothing is waiting for a decision" is a claim a manager acts on. An unreachable queue must
    // not make it.
    client.get.mockImplementation(route([], []));
    const empty = await renderScreen();
    await waitFor(() => expect(empty.getByTestId('approvals-empty')).toHaveTextContent(/Nothing/i));

    client.get.mockRejectedValue(new Error('offline'));
    const failed = await renderScreen();
    await waitFor(() =>
      expect(failed.getByTestId('approvals-empty')).toHaveTextContent(/could not be read/i),
    );
    // …and no chip carries a count it does not have.
    expect(failed.getByTestId('approval-filter-ALL')).not.toHaveTextContent(/\(/);
  });
  // ── The 2026-09-09 rebuild: the countdown stopped being drawn ───────────────────────────────
  //
  // `APPROVAL_COUNTDOWN` printed "4h remaining" on every row until this date, purchase orders
  // included. `procurement.rfqs.deadline` is a real column, so an RFQ's countdown is now measured
  // and a purchase order — which has no decision deadline — carries no chip at all. Deadlines here
  // are relative to the clock so the assertion holds whenever the suite runs.
  const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

  it('measures an RFQ countdown from its real deadline', async () => {
    client.get.mockImplementation(route([PO], [{ ...RFQ, deadline: hoursFromNow(4) }]));
    const { getByTestId } = await renderScreen();

    // Rounded up, so 4 hours reads as 4 and never as 3.
    await waitFor(() => expect(getByTestId('approval-countdown-rfq-rfq-1')).toHaveTextContent(/4/));
  });

  it('draws no countdown on a purchase order, which has no decision deadline', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('approval-po-po-1')).toBeTruthy());
    expect(queryByTestId('approval-countdown-po-po-1')).toBeNull();
  });

  it('says overdue rather than counting backwards past the deadline', async () => {
    client.get.mockImplementation(route([PO], [{ ...RFQ, deadline: hoursFromNow(-1) }]));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('approval-countdown-rfq-rfq-1')).toBeTruthy());
    expect(getByTestId('approval-countdown-rfq-rfq-1')).not.toHaveTextContent(/-/);
  });

  it('counts and filters Urgent by the measured deadline, not by kind', async () => {
    // Two RFQs: one due in three hours, one in a week. The chip must say 1 — a count over the whole
    // queue — and pressing it must leave only the urgent row.
    client.get.mockImplementation(
      route(
        [PO],
        [
          { ...RFQ, deadline: hoursFromNow(3) },
          { ...RFQ, rfq_id: 'rfq-2', rfq_number: 'RFQ-2024-090', deadline: hoursFromNow(24 * 7) },
        ],
      ),
    );
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('approval-filter-URGENT')).toHaveTextContent(/1/));

    await fireEvent.press(getByTestId('approval-filter-URGENT'));
    await waitFor(() => expect(queryByTestId('approval-rfq-rfq-2')).toBeNull());
    expect(getByTestId('approval-rfq-rfq-1')).toBeTruthy();
    // The purchase order has no deadline, so it is not urgent either.
    expect(queryByTestId('approval-po-po-1')).toBeNull();
  });

  // The drawing's bottom bar. It is the row button n times and the route refuses this role, so it
  // draws and says so — and it must not offer to approve nothing.
  it('offers the bulk bar with the visible count, and posts nothing', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('approve-all')).toHaveTextContent(/2/));
    await fireEvent.press(getByTestId('approve-all'));
    expect(client.post).not.toHaveBeenCalled();
  });

  it('hides the bulk bar when there is nothing to approve', async () => {
    client.get.mockImplementation(route([], []));
    const { queryByTestId, getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('approvals-empty')).toBeTruthy());
    expect(queryByTestId('approve-all')).toBeNull();
  });

  // The drawing labels the second button COMPARE on an RFQ and DETAILS on a purchase order —
  // different words because they are different acts.
  it('offers Compare on an RFQ and Details on a purchase order', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('approval-rfq-rfq-1')).toBeTruthy());
    expect(getByTestId('approval-details-rfq-rfq-1')).toHaveTextContent(/Compare/i);
    expect(getByTestId('approval-details-po-po-1')).toHaveTextContent(/Details/i);
  });
});
