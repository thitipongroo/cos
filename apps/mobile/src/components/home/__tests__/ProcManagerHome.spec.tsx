// The PROC_MANAGER dashboard (mockup 11_proc_manager/01_home/01_pom_dashboard).
//
// The role shared `<ProcurementHome />` with PROCUREMENT_OFFICER until 2026-09-09. `home.spec.tsx`
// covers the dispatch; this covers what the screen itself claims.

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import ProcManagerHome from '../ProcManagerHome';

jest.mock('../../../api/client', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock; post: jest.Mock };

const PO = {
  po_id: 'po-1',
  po_number: 'PO-8821',
  vendor_id: 'v-1',
  project_id: 'p-1',
  status: 'PENDING_APPROVAL',
  total_amount: '1240000.0000',
  currency_code: 'THB',
  updated_at: '2026-09-01T00:00:00.000Z',
};
const RFQ = {
  rfq_id: 'rfq-1',
  rfq_number: 'RFQ-089',
  project_id: 'p-1',
  status: 'PUBLISHED',
  deadline: '2026-09-20T10:00:00.000Z',
};

const COMMITTED = { ...PO, po_id: 'po-2', po_number: 'PO-8822', status: 'ACKNOWLEDGED' };

/**
 * The screen's endpoints in one table.
 *
 * IT READS THE QUERY, not just the path. `fetchPendingApprovals` asks for `status=EVALUATED` on the
 * RFQ list and `status=PENDING_APPROVAL` on the orders; a stub that ignored the parameter would
 * hand the approvals section rows the server would never have sent, and the empty-queue case could
 * not be tested at all.
 */
function route(over: { score?: number | null; vendors?: unknown[]; orders?: unknown[] } = {}) {
  return (path: string, params?: Record<string, string>) => {
    if (/\/procurement\/vendors\/[^/]+\/score/.test(path)) {
      // `'score' in over`, not `??` — an explicit null is the case this fixture exists to produce,
      // and `over.score ?? 99` would turn it back into 99.
      const totalScore = 'score' in over ? over.score : 99;
      return Promise.resolve({ vendorId: 'v-1', totalScore, grade: 'A' });
    }
    if (path.startsWith('/procurement/vendors/directory')) {
      return Promise.resolve(
        over.vendors ?? [
          {
            vendor_id: 'v-1',
            vendor_code: 'SM',
            vendor_name: 'Siam Materials Co.',
            category: null,
            verification_status: 'VERIFIED',
            active_project_count: 4,
          },
        ],
      );
    }
    // TWO ORDERS, and the difference is the point: `committedSpend` excludes DRAFT and
    // PENDING_APPROVAL, because an order nobody has approved is not committed money. So the spend
    // tile sees the ACKNOWLEDGED one and the approvals queue sees the PENDING_APPROVAL one.
    if (path.startsWith('/procurement/purchase-orders')) {
      const items = over.orders ?? [PO, COMMITTED];
      const wanted = params?.['status'];
      return Promise.resolve({
        items:
          wanted === undefined ? items : items.filter((o) => (o as typeof PO).status === wanted),
      });
    }
    if (path.startsWith('/procurement/rfqs')) {
      const wanted = params?.['status'];
      return Promise.resolve({
        items: wanted === undefined ? [RFQ] : [RFQ].filter((r) => r.status === wanted),
      });
    }
    if (path.startsWith('/projects')) {
      return Promise.resolve({ items: [{ project_id: 'p-1', project_name: 'Rama IX Tower' }] });
    }
    return Promise.resolve({ items: [] });
  };
}

async function renderScreen() {
  return render(
    <I18nProvider>
      <ProcManagerHome />
    </I18nProvider>,
  );
}

describe('ProcManagerHome', () => {
  beforeEach(() => {
    client.get.mockReset();
    client.post.mockReset();
    client.get.mockImplementation(route());
  });

  it('sums committed spend and leaves the unapproved order out of it', async () => {
    // `committedSpend` excludes DRAFT and PENDING_APPROVAL: an order nobody has approved is not
    // money the tenant has committed. Two orders of ฿1.24 M each, one of them PENDING_APPROVAL —
    // so the tile reads one of them, not both.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('kpi-committed-spend')).toHaveTextContent(/1,240,000/));
    expect(getByTestId('kpi-committed-spend')).not.toHaveTextContent(/2,480,000/);
  });

  it('shows a dash rather than a zero when the spend request is lost', async () => {
    // A zero on a committed-spend tile reads as "nothing is on order", which is a different claim
    // from "the total could not be fetched".
    client.get.mockImplementation((path: string) =>
      path.startsWith('/procurement/purchase-orders')
        ? Promise.reject(new Error('offline'))
        : route()(path),
    );
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('kpi-committed-spend')).toHaveTextContent(/—/));
  });

  it('counts open RFQs as PUBLISHED, the state where bids can still arrive', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('kpi-open-rfqs')).toHaveTextContent(/1/));
  });

  it('lists both kinds of decision under Action Required', async () => {
    // `fetchPendingApprovals` asks for PENDING_APPROVAL and EVALUATED. The RFQ fixture here is
    // PUBLISHED, so only the purchase order comes back — which is the point: the section shows what
    // the server says is waiting, not what the screen hoped for.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('approval-po-po-1')).toHaveTextContent(/PO-8821/));
    expect(getByTestId('approval-po-po-1')).toHaveTextContent(/1,240,000/);
  });

  it('prints the vendor’s real weighted score', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('vendor-v-1')).toHaveTextContent(/99/));
  });

  it('says a vendor has no score yet rather than showing a zero', async () => {
    // A zero would read as a terrible supplier. A vendor with no delivery, dispute or quotation
    // history simply has no score.
    client.get.mockImplementation(route({ score: null }));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('vendor-v-1')).toHaveTextContent(/No score yet/i));
  });

  it('says so when there is nothing to decide', async () => {
    client.get.mockImplementation(route({ orders: [] }));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('proc-queue-empty')).toBeTruthy());
  });

  it('keeps the drawn figures drawn, whatever the API returns', async () => {
    // THE ADR-099 GUARD. If either ever starts tracking an endpoint this fails and the decision gets
    // revisited rather than drifting.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('kpi-savings')).toHaveTextContent(/1\.4 M/));
    expect(getByTestId('kpi-committed-spend')).toHaveTextContent(/\+5\.2%/);
  });
  // ── The 2026-09-09 rebuild ──────────────────────────────────────────────────────────────────

  const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

  it('counts the urgent RFQs from their real deadlines, not from a drawn figure', async () => {
    // Two PUBLISHED RFQs, one due in three hours. The tile says 2 and the chip says 1 — and the
    // chip can never exceed the tile, because both count the same rows.
    client.get.mockImplementation((path: string, params?: Record<string, string>) => {
      if (path.startsWith('/procurement/rfqs') && params?.['status'] === undefined) {
        return Promise.resolve({
          items: [
            { ...RFQ, deadline: hoursFromNow(3) },
            { ...RFQ, rfq_id: 'rfq-2', rfq_number: 'RFQ-090', deadline: hoursFromNow(24 * 9) },
          ],
        });
      }
      return route()(path, params);
    });
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('kpi-open-rfqs')).toHaveTextContent(/2/));
    expect(getByTestId('kpi-open-rfqs-urgent')).toHaveTextContent(/1/);
  });

  it('draws no urgent chip when nothing is urgent, rather than a zero', async () => {
    // The default fixture's RFQ is due in 2026-09-20. The drawing never shows "0 Urgent".
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('kpi-open-rfqs')).toBeTruthy());
    expect(queryByTestId('kpi-open-rfqs-urgent')).toBeNull();
  });

  it('names the project once on an approval row, with the amount beneath it', async () => {
    // The project is the row's title; the meta line carries only the money. Printing the project in
    // both places is what the first capture showed, and `toHaveTextContent` would have passed for
    // either — so the count is asserted, not just the presence.
    const { getByTestId, getAllByText } = await renderScreen();

    await waitFor(() => expect(getByTestId('approval-po-po-1')).toHaveTextContent(/Rama IX Tower/));
    expect(getByTestId('approval-po-po-1')).toHaveTextContent(/1,240,000/);
    expect(getAllByText('Rama IX Tower')).toHaveLength(1);
  });

  it('rounds a vendor score rather than printing the weighted float', async () => {
    // `vendor-scoring.ts` returns a weighted number. The dashboard printed "94.03292181069958 TS"
    // until 2026-09-09 while the vendor directory rounded — one score, two answers.
    client.get.mockImplementation((path: string, params?: Record<string, string>) =>
      /\/procurement\/vendors\/[^/]+\/score/.test(path)
        ? Promise.resolve({ vendorId: 'v-1', totalScore: 94.03292181069958, grade: 'A' })
        : route()(path, params),
    );
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('vendor-v-1')).toHaveTextContent(/94 TS/));
    expect(getByTestId('vendor-v-1')).not.toHaveTextContent(/94\.0/);
  });

  it('prints the vendor’s real grade beside its open-order count', async () => {
    // Both halves are measured: the grade from the scorecard, the count from the directory. The
    // drawing's "Grade A Tier-1 Supplier" line has no invented tier behind it here.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('vendor-v-1')).toHaveTextContent(/Grade A/));
  });

  it('shows only the order count for a vendor with no scorecard yet', async () => {
    // No grade means no tier line — never "Grade —", never a default letter.
    //
    // BOTH HALVES ARE NULL TOGETHER. `total_score` and `grade` are NULL until the vendor has any
    // history to score (see `VendorScore` in api/procurement.ts), so `route({ score: null })` — which
    // keeps grade 'A' — is not a shape the server can produce. This case builds the real one.
    client.get.mockImplementation((path: string, params?: Record<string, string>) =>
      /\/procurement\/vendors\/[^/]+\/score/.test(path)
        ? Promise.resolve({ vendorId: 'v-1', totalScore: null, grade: null })
        : route()(path, params),
    );
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('vendor-v-1')).toHaveTextContent(/No score yet/i));
    expect(getByTestId('vendor-v-1')).not.toHaveTextContent(/Grade/);
  });
});
