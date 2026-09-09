// The CRM manager's home dashboard (mockup mockup/mobile/12_crm_manager/01_home/01_dashboard).
//
// The role rendered `<MinimalHome />` until 2026-09-09. What these tests hold is the arithmetic —
// three figures on this screen are computed rather than fetched, and each one has a way of being
// quietly wrong that renders perfectly:
//
//   the pipeline total   summing in floating point instead of decimal.js
//   the win rate         counting OPEN deals as losses
//   "no closed deals"    printing 0% for a team that has simply not closed anything yet
//
// The drawn half is held too, by the ADR-099 guard at the bottom: if any of it ever starts tracking
// an endpoint, the test fails and the decision gets revisited rather than drifting.

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import CrmHome from '../CrmHome';

jest.mock('../../../api/client', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock; post: jest.Mock };

function lead(id: string, status: 'NEW' | 'QUALIFIED' | 'DISQUALIFIED') {
  return {
    lead_id: id,
    contact_name: null,
    company: null,
    status,
    source: null,
    assigned_to: null,
    created_at: '2026-09-01T00:00:00.000Z',
  };
}

function oppty(id: string, status: 'OPEN' | 'WON' | 'LOST', value: string | null) {
  return {
    opportunity_id: id,
    lead_id: 'l-1',
    title: `Oppty ${id}`,
    value,
    status,
    expected_close_date: null,
    assigned_to: null,
    created_at: '2026-09-01T00:00:00.000Z',
  };
}

function customer(id: string) {
  return {
    customer_id: id,
    opportunity_id: null,
    company_name: `Customer ${id}`,
    customer_type: null,
    status: 'ACTIVE',
    created_at: '2026-09-01T00:00:00.000Z',
  };
}

function route(over: { leads?: unknown[]; oppties?: unknown[]; customers?: unknown[] } = {}) {
  return (path: string) => {
    if (path.startsWith('/crm/leads')) {
      return Promise.resolve(over.leads ?? [lead('l-1', 'NEW'), lead('l-2', 'QUALIFIED')]);
    }
    if (path.startsWith('/crm/opportunities')) {
      return Promise.resolve(over.oppties ?? [oppty('o-1', 'OPEN', '1000000.0000')]);
    }
    if (path.startsWith('/crm/customers'))
      return Promise.resolve(over.customers ?? [customer('c-1')]);
    return Promise.resolve([]);
  };
}

async function renderScreen() {
  return render(
    <I18nProvider>
      <CrmHome />
    </I18nProvider>,
  );
}

describe('CrmHome', () => {
  beforeEach(() => {
    client.get.mockReset();
    client.post.mockReset();
    client.get.mockImplementation(route());
  });

  it('sums only the OPEN opportunities into the pipeline total', async () => {
    // A won deal is revenue, not pipeline; a lost one is neither. Only OPEN is money still in play.
    client.get.mockImplementation(
      route({
        oppties: [
          oppty('o-1', 'OPEN', '1000000.0000'),
          oppty('o-2', 'WON', '5000000.0000'),
          oppty('o-3', 'LOST', '9000000.0000'),
        ],
      }),
    );
    const { getByTestId } = await renderScreen();

    // Compact from a million up (PO 2026-09-09), so ฿1,000,000 reads "฿ 1 M".
    await waitFor(() => expect(getByTestId('kpi-pipeline')).toHaveTextContent(/1 M/));
    expect(getByTestId('kpi-pipeline')).not.toHaveTextContent(/5 M/);
    expect(getByTestId('kpi-pipeline')).not.toHaveTextContent(/9 M/);
  });

  it('adds the values in decimal, not floating point', async () => {
    // 0.1 + 0.2 in IEEE-754 is 0.30000000000000004. `value` is a DECIMAL string precisely so that
    // this cannot happen (§14), and the sum must go through decimal.js to keep that promise.
    client.get.mockImplementation(
      route({ oppties: [oppty('o-1', 'OPEN', '0.1'), oppty('o-2', 'OPEN', '0.2')] }),
    );
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('kpi-pipeline')).toBeTruthy());
    expect(getByTestId('kpi-pipeline')).not.toHaveTextContent(/0\.30000000000000004/);
  });

  it('abbreviates from a million up and prints the exact figure below it', async () => {
    // PO decision 2026-09-09, and the drawing's own "฿ 128.4 M". The threshold matters because an
    // amount someone acts on has to stay exact: below a million the tile keeps `formatMoney`'s
    // output, which is the invoice format, and only above it does the figure get scaled.
    client.get.mockImplementation(route({ oppties: [oppty('o-1', 'OPEN', '128400000.0000')] }));
    const big = await renderScreen();
    await waitFor(() => expect(big.getByTestId('kpi-pipeline')).toHaveTextContent(/128\.4 M/));

    client.get.mockImplementation(route({ oppties: [oppty('o-1', 'OPEN', '999999.0000')] }));
    const small = await renderScreen();
    await waitFor(() => expect(small.getByTestId('kpi-pipeline')).toHaveTextContent(/999,999/));
    expect(small.getByTestId('kpi-pipeline')).not.toHaveTextContent(/ M/);
  });

  it('contributes nothing for an opportunity nobody has priced', async () => {
    // A null value is an unknown amount, not zero — but it must not break the sum either.
    client.get.mockImplementation(
      route({ oppties: [oppty('o-1', 'OPEN', '750000.0000'), oppty('o-2', 'OPEN', null)] }),
    );
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('kpi-pipeline')).toHaveTextContent(/750,000/));
  });

  it('counts a lead as active unless it was disqualified', async () => {
    client.get.mockImplementation(
      route({
        leads: [
          lead('l-1', 'NEW'),
          lead('l-2', 'QUALIFIED'),
          lead('l-3', 'DISQUALIFIED'),
          lead('l-4', 'DISQUALIFIED'),
        ],
      }),
    );
    const { getByTestId } = await renderScreen();

    // 2 active of 4 total — and the snapshot circle below shows all 4, which is a different figure.
    await waitFor(() => expect(getByTestId('kpi-leads')).toHaveTextContent(/2/));
    expect(getByTestId('stage-lead')).toHaveTextContent(/4/);
  });

  it('leaves OPEN deals out of the win-rate denominator', async () => {
    // 1 won, 1 lost, 8 still open. The rate is 50% — not 10%. Counting open deals as losses would
    // drop the number every time somebody opened an opportunity, which is backwards.
    client.get.mockImplementation(
      route({
        oppties: [
          oppty('o-1', 'WON', '1000.0000'),
          oppty('o-2', 'LOST', '1000.0000'),
          ...Array.from({ length: 8 }, (_, i) => oppty(`open-${i}`, 'OPEN', '1000.0000')),
        ],
      }),
    );
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('kpi-win-rate')).toHaveTextContent(/50%/));
    expect(getByTestId('kpi-win-rate')).not.toHaveTextContent(/10%/);
  });

  it('says there are no closed deals rather than printing a zero win rate', async () => {
    // 0% is a claim about performance. A team with nothing closed has not performed badly; it has
    // not finished anything yet, and those are different sentences.
    client.get.mockImplementation(route({ oppties: [oppty('o-1', 'OPEN', '1000.0000')] }));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('kpi-win-rate')).toHaveTextContent(/No closed deals/i));
    expect(getByTestId('kpi-win-rate')).not.toHaveTextContent(/0%/);
  });

  it('shows the loader in place of the tiles while the requests are still out', async () => {
    // Rule 40: <KpiRegion /> swaps the whole tile block for a <LoadingState />, so during the
    // initial load the tiles are NOT mounted and there is no dash to find. The dash belongs to the
    // case below — settled, but with nothing to show. This test was written the other way round
    // first and was asserting a behaviour the component does not have.
    client.get.mockImplementation(() => new Promise(() => {}));
    const { queryByTestId, getByTestId } = await renderScreen();

    expect(getByTestId('home-screen')).toBeTruthy();
    expect(queryByTestId('kpi-pipeline')).toBeNull();
  });

  it('keeps its dash when the requests fail, rather than claiming a total of zero', async () => {
    client.get.mockImplementation(() => Promise.reject(new Error('offline')));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('kpi-pipeline')).toHaveTextContent(/—/));
    expect(getByTestId('kpi-leads')).toHaveTextContent(/—/);
  });

  it('counts each snapshot stage from its own endpoint', async () => {
    client.get.mockImplementation(
      route({
        leads: [lead('l-1', 'NEW'), lead('l-2', 'NEW'), lead('l-3', 'DISQUALIFIED')],
        oppties: [oppty('o-1', 'OPEN', '1.0'), oppty('o-2', 'WON', '1.0')],
        customers: [customer('c-1'), customer('c-2'), customer('c-3'), customer('c-4')],
      }),
    );
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('stage-lead')).toHaveTextContent(/3/));
    expect(getByTestId('stage-oppty')).toHaveTextContent(/2/);
    expect(getByTestId('stage-contract')).toHaveTextContent(/4/);
  });

  // ── the drawn half ───────────────────────────────────────────────────────────────────────

  it('posts nothing from any drawn control', async () => {
    // None of these has an endpoint: no CRM AI report exists, the action rows have no last-activity
    // field behind them, and §20.7.10 still defers the kanban.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('crm-intelligence-act')).toBeTruthy());
    for (const id of [
      'crm-intelligence-act',
      'crm-action-HIGH_PRIORITY',
      'crm-action-FOLLOW_UP',
      'crm-kanban',
    ]) {
      await fireEvent.press(getByTestId(id));
    }
    expect(client.post).not.toHaveBeenCalled();
  });

  it('names records this repository has as the intelligence source', async () => {
    // The drawing's source line reads "Historical Lead Velocity & Email Sentiment" — an integration
    // this platform does not have. ADR-098's second amendment forbids naming one.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('crm-intelligence-foot')).toHaveTextContent(/SOURCE/));
    expect(getByTestId('crm-intelligence-foot')).not.toHaveTextContent(/Sentiment/i);
  });

  it('keeps the confidence in the card foot, not the drawing’s header chip', async () => {
    // §32.7's AI card footer, chosen over the drawing on 2026-09-08 and again on 2026-09-09.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('crm-intelligence-foot')).toHaveTextContent(/92/));
  });

  it('keeps the drawn figures drawn, whatever the API returns', async () => {
    // THE ADR-099 GUARD. Both deltas and both action rows are registered figures; if any of them
    // ever starts tracking an endpoint this fails and the decision is revisited.
    client.get.mockImplementation(route({ oppties: [], leads: [], customers: [] }));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('kpi-pipeline')).toHaveTextContent(/\+12\.5%/));
    expect(getByTestId('crm-action-HIGH_PRIORITY')).toHaveTextContent(/Skyline Tower A/);
    expect(getByTestId('crm-action-FOLLOW_UP')).toHaveTextContent(/Siam Materials/);
  });
});
