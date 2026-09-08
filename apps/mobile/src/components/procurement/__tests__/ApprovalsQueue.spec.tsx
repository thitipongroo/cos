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
});
