// RFQs screen — PROCUREMENT_OFFICER (mockup 10_proc_officer/02_rfqs/01_po_rfqs).
//
// The screen had four assertions inside `list-screens.spec.tsx` until 2026-09-08, because it WAS a
// list screen: a `<FetchListScreen />` printing a number and a status. It is now a queue with
// counted chips, per-row quotation fetches and a real deadline countdown, and those tests moved here
// with it — a shared spec file for "every plain list" cannot describe a screen that stopped being
// one.

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import RfqsScreen from '../rfqs';

jest.mock('../../../api/client', () => ({ get: jest.fn(), post: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock; post: jest.Mock };

const HOUR = 3_600_000;

function rfq(over: Partial<Record<string, unknown>> = {}) {
  return {
    rfq_id: 'r-1',
    rfq_number: 'RFQ-2026-088',
    project_id: 'p-1',
    status: 'PUBLISHED',
    deadline: new Date(Date.now() + 18 * HOUR).toISOString(),
    ...over,
  };
}

/**
 * One route table for the whole screen.
 *
 * Two endpoints answer here — the RFQ list and the caller's projects.
 *
 * THERE IS NO THIRD, and that is asserted below rather than assumed. A per-row call to
 * `GET /procurement/rfqs/:rfqId/quotations` was written and removed on 2026-09-08: it is a step of
 * the award workflow wearing a `@Get`, and rendering a list must never reach it.
 */
function route(rows: unknown[] = [rfq()]) {
  return (path: string) => {
    if (path.startsWith('/procurement/rfqs')) {
      return Promise.resolve({ items: rows, total: rows.length });
    }
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
      <RfqsScreen />
    </I18nProvider>,
  );
}

describe('RfqsScreen', () => {
  beforeEach(() => {
    client.get.mockReset();
    client.post.mockReset();
    client.get.mockImplementation(route());
  });

  it('asks for one page big enough to be the whole tenant', async () => {
    // 45 RFQs in the seeded tenant against a server cap of 100: one request, not a page of one.
    await renderScreen();

    await waitFor(() =>
      expect(
        client.get.mock.calls.some(
          (c) => c[0] === '/procurement/rfqs' && (c[1] as { limit?: string })?.limit === '100',
        ),
      ).toBe(true),
    );
  });

  it('shows an RFQ by its number, with the project it belongs to', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('rfq-item-r-1')).toHaveTextContent(/#RFQ-2026-088/));
    // The project name is joined client-side from `/projects/mine`, not drawn.
    expect(getByTestId('rfq-item-r-1')).toHaveTextContent(/Sukhumvit 45/);
  });

  it('counts the deadline in hours from the real column', async () => {
    // `procurement.rfqs.deadline` is a real timestamptz. The countdown is measured, not drawn.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('rfq-item-r-1')).toHaveTextContent(/18h remaining/));
  });

  it('says the deadline passed rather than counting backwards', async () => {
    client.get.mockImplementation(
      route([rfq({ deadline: new Date(Date.now() - 5 * HOUR).toISOString() })]),
    );
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('rfq-item-r-1')).toHaveTextContent(/Deadline passed/));
  });

  it('draws no countdown at all on an RFQ that carries no deadline', async () => {
    client.get.mockImplementation(route([rfq({ deadline: null })]));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('rfq-item-r-1')).toBeTruthy());
    expect(getByTestId('rfq-item-r-1')).not.toHaveTextContent(/remaining|passed/i);
  });

  it('brackets every chip count, All included', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('rfq-filter-ALL')).toHaveTextContent(/\(1\)/));
    expect(getByTestId('rfq-filter-PUBLISHED')).toHaveTextContent(/\(1\)/);
    expect(getByTestId('rfq-filter-AWARDED')).toHaveTextContent(/\(0\)/);
  });

  it('filters the list by the chip that is on', async () => {
    client.get.mockImplementation(
      route([rfq(), rfq({ rfq_id: 'r-2', rfq_number: 'RFQ-2026-085', status: 'AWARDED' })]),
    );
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('rfq-item-r-2')).toBeTruthy());
    await fireEvent.press(getByTestId('rfq-filter-AWARDED'));
    expect(queryByTestId('rfq-item-r-1')).toBeNull();
    expect(getByTestId('rfq-item-r-2')).toBeTruthy();
  });

  it('searches the number and the project name, not the drawn material', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('rfq-item-r-1')).toBeTruthy());
    await fireEvent.changeText(getByTestId('rfq-search'), 'sukhumvit');
    expect(getByTestId('rfq-item-r-1')).toBeTruthy();
    await fireEvent.changeText(getByTestId('rfq-search'), 'nothing matches this');
    expect(queryByTestId('rfq-item-r-1')).toBeNull();
  });

  it('offers Award only on an EVALUATED RFQ, which is the transition the endpoint accepts', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('rfq-quotes-r-1')).toBeTruthy());
    expect(queryByTestId('rfq-award-r-1')).toBeNull();

    client.get.mockImplementation(route([rfq({ status: 'EVALUATED' })]));
    const second = await renderScreen();
    await waitFor(() => expect(second.getByTestId('rfq-award-r-1')).toBeTruthy());
  });

  it('never touches the quotations endpoint, which awards rather than reads', async () => {
    // `compareQuotations` asserts the RFQ is CLOSED, 422s on an RFQ with no quotations, and MARKS
    // THE LOWEST ONE SELECTED. A list that fetched it per row would award every closed RFQ in the
    // tenant by being looked at. This assertion is the guard on that, and it is the reason the card
    // shows no quote count: nothing else can produce one.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('rfq-item-r-1')).toBeTruthy());
    expect(
      client.get.mock.calls.filter((c) =>
        /\/procurement\/rfqs\/[^/]+\/quotations/.test(String(c[0])),
      ),
    ).toHaveLength(0);
  });

  it('says so when there are no RFQs', async () => {
    client.get.mockImplementation(route([]));
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('rfqs-empty')).toBeTruthy());
    expect(queryByTestId('rfq-item-r-1')).toBeNull();
  });

  it('keeps the drawn banner honest about where its figures came from', async () => {
    // THE ADR-099 GUARD. `01_po_rfqs` foots this banner "CONF : 95% | e-GP Benchmark". There is no
    // e-GP integration in this repository, so the source names the records this screen actually
    // read — the same carve-out ADR-098's second amendment opened.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('rfq-analysis')).toBeTruthy());
    expect(getByTestId('rfq-analysis')).toHaveTextContent(/RFQS AND THEIR QUOTATIONS/i);
    expect(getByTestId('rfq-analysis')).not.toHaveTextContent(/e-GP|benchmark/i);
  });
});
