// Behaviour of the FINANCE budget screen.
//
// REWRITTEN 2026-09-08 with the screen (mockup 09_finance/03_budget/01_fn_budget). It pinned a
// `<ProjectPicker />` over five key/value rows printing raw `1000000.0000` strings; the drawing
// gives the screen three KPI cards, a forecast module and a per-category breakdown.
//
// WHAT THESE ASSERT is the arithmetic, because every figure on this screen is money someone will
// act on. `budget_lines` carries no actual, so a category's spend is `GET /finance/cost-transactions`
// summed by `budget_line_id` — and the tests below hold the three things that sum must never do:
// stop at page one, add two currencies together, or count a cost that belongs to no category.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { I18nProvider } from '../../../i18n';
import { useProjectStore } from '../../../store/projectStore';
import BudgetScreen from '../budget';

jest.mock('../../../api/client', () => ({ get: jest.fn() }));

/* eslint-disable @typescript-eslint/no-require-imports */
const client = require('../../../api/client') as { get: jest.Mock };
/* eslint-enable @typescript-eslint/no-require-imports */

function line(id: string, name: string, allocated: string, currency = 'THB') {
  return {
    line_id: id,
    line_name: name,
    allocated_amount: allocated,
    currency_code: currency,
    boq_category_id: null,
  };
}

function budget(over: { lines?: unknown[]; actual?: string; total?: string } = {}) {
  return {
    budget: {
      total_budget_amount: over.total ?? '124500000.0000',
      total_budget_currency: 'THB',
      allocated_amount: '124500000.0000',
      committed_amount: '0.0000',
      actual_amount: over.actual ?? '84200000.0000',
    },
    lines: over.lines ?? [
      line('l-1', 'Structural Phase', '45000000.0000'),
      line('l-2', 'MEP Services', '30000000.0000'),
    ],
    variance_percentage: '0.0000',
  };
}

function cost(id: string, lineId: string | null, amount: string, currency = 'THB') {
  return {
    transaction_id: id,
    project_id: 'proj-1',
    budget_line_id: lineId,
    amount,
    currency_code: currency,
    transaction_date: '2026-09-01',
    description: null,
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

/** The default wiring: one budget, two costs on one page, a forecast that dips in week 3. */
function route(costs: unknown[] = [cost('c1', 'l-1', '42100000.0000')]) {
  return (path: string) => {
    if (path.startsWith('/finance/budget/')) return Promise.resolve(budget());
    if (path.startsWith('/finance/cost-transactions')) {
      return Promise.resolve({ items: costs, total: costs.length });
    }
    if (path.startsWith('/finance/cashflow-forecast')) return Promise.resolve(FORECAST);
    return Promise.resolve({ items: [] });
  };
}

function renderScreen() {
  return render(
    <I18nProvider>
      <BudgetScreen />
    </I18nProvider>,
  );
}

describe('BudgetScreen', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    client.get.mockReset();
    client.get.mockImplementation(route());
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    useProjectStore.setState({
      active: { projectId: 'proj-1', projectCode: 'SKY', projectName: 'Skybridge Central' },
    } as never);
  });

  afterEach(() => alert.mockRestore());

  it('asks for nothing at all until a project has been chosen', async () => {
    // `GET /finance/budget/` with an empty id is a request whose answer is undefined.
    useProjectStore.setState({ active: null } as never);
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('budget-empty')).toHaveTextContent(/Select a project/i));
    expect(client.get).not.toHaveBeenCalled();
  });

  it('takes the two KPI percentages against the TOTAL, not the allocation', async () => {
    // The drawing's own arithmetic: 84.2 / 124.5 = 68%, and the remainder 40.3 is 32% of it.
    // Against `allocated_amount` those would be different numbers on a finance screen.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('budget-kpi-total')).toHaveTextContent(/124\.5/));
    expect(getByTestId('budget-kpi-actual')).toHaveTextContent(/84\.2/);
    expect(getByTestId('budget-kpi-actual')).toHaveTextContent(/68%/);
    expect(getByTestId('budget-kpi-remaining')).toHaveTextContent(/40\.3/);
    expect(getByTestId('budget-kpi-remaining')).toHaveTextContent(/32%/);
  });

  it('sums a category from EVERY page of cost transactions, not the first', async () => {
    // The endpoint caps a page at 100. A project with more costs than that would otherwise show a
    // spend that is neither the spend nor to date.
    const first = Array.from({ length: 100 }, (_, i) => cost(`a${i}`, 'l-1', '100000.0000'));
    const second = [cost('b1', 'l-1', '2100000.0000')];
    client.get.mockImplementation((path: string, params?: Record<string, string>) => {
      if (path.startsWith('/finance/cost-transactions')) {
        const rows = params?.page === '1' ? first : second;
        return Promise.resolve({ items: rows, total: 101 });
      }
      return route()(path);
    });
    const { getByTestId } = await renderScreen();

    // 100 x 100,000 + 2,100,000 = 12,100,000 — the second page is 17% of the answer.
    await waitFor(() => expect(getByTestId('budget-line-l-1')).toHaveTextContent(/12,100,000/));
    const pages = client.get.mock.calls.filter((c) =>
      String(c[0]).startsWith('/finance/cost-transactions'),
    );
    expect(pages).toHaveLength(2);
    expect(pages[0]?.[1]).toEqual({ project_id: 'proj-1', page: '1', limit: '100' });
  });

  it('says the spend is partial rather than presenting a capped walk as the total', async () => {
    // Every page comes back full, so the walk hits its cap. The rows are most-recent-first, which
    // means a capped answer UNDERSTATES every category — it must not read as a spend to date.
    client.get.mockImplementation((path: string) => {
      if (path.startsWith('/finance/cost-transactions')) {
        return Promise.resolve({
          items: Array.from({ length: 100 }, (_, i) => cost(`x${i}`, 'l-1', '1000.0000')),
          total: 9999,
        });
      }
      return route()(path);
    });
    const { getByTestId } = await renderScreen();

    await waitFor(() =>
      expect(getByTestId('budget-coverage')).toHaveTextContent(/2000 most recent/),
    );
    expect(getByTestId('budget-coverage')).toHaveTextContent(/9999/);
  });

  it('never adds one currency to another, and says how many it left out', async () => {
    client.get.mockImplementation(
      route([cost('c1', 'l-1', '1000000.0000'), cost('c2', 'l-1', '500.0000', 'USD')]),
    );
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('budget-line-l-1')).toHaveTextContent(/1,000,000/));
    expect(getByTestId('budget-coverage')).toHaveTextContent(/another currency/i);
  });

  it('keeps an unattributed cost out of every category, and no longer captions it', async () => {
    // `resolveBudgetLine` returns null when a PO's items map to no line. Those costs belong to the
    // project total and to no category; folding them into one would be inventing an attribution.
    // The caption that used to name the total went on 2026-09-08 (PO): it said nothing about
    // whether the figures above are right, and every category already shows what it shows.
    client.get.mockImplementation(
      route([cost('c1', 'l-1', '1000000.0000'), cost('c2', null, '250000.0000')]),
    );
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('budget-line-l-1')).toHaveTextContent(/1,000,000/));
    expect(getByTestId('budget-line-l-1')).not.toHaveTextContent(/1,250,000/);
    expect(queryByTestId('budget-coverage')).toBeNull();
  });

  it('still warns when the figures themselves are understated', async () => {
    // The two caveats that survived say the numbers are WRONG, not that data is missing: a capped
    // walk covers only the most recent rows, and a foreign-currency cost is left out of every sum.
    // Dropping those with the unattributed note would have made the screen quietly lie.
    client.get.mockImplementation(
      route([cost('c1', 'l-1', '1000000.0000'), cost('c2', 'l-1', '500.0000', 'USD')]),
    );
    const { getByTestId } = await renderScreen();

    await waitFor(() =>
      expect(getByTestId('budget-coverage')).toHaveTextContent(/another currency/i),
    );
  });

  it('marks a category over its allocation, with the overrun in place of the drawn code', async () => {
    client.get.mockImplementation(route([cost('c1', 'l-2', '31500000.0000')]));
    const { getByTestId } = await renderScreen();

    // 31.5 of 30.0 is 105%, which is 5% over.
    await waitFor(() => expect(getByTestId('budget-line-l-2')).toHaveTextContent(/105%/));
    expect(getByTestId('budget-line-l-2')).toHaveTextContent(/Over allocation by 5%/);
    expect(getByTestId('budget-line-l-2')).not.toHaveTextContent(/Code:/);
  });

  it('prints the drawn category code where there is nothing to say instead', async () => {
    // THE ADR-099 GUARD. `boq_category_id` is a UUID; if this ever starts tracking a real code the
    // test fails and the register entry gets revisited rather than drifting.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('budget-line-l-2')).toHaveTextContent(/Code: 09-000/));
  });

  it('shows an em dash for a category no cost could be read for', async () => {
    client.get.mockImplementation((path: string) =>
      path.startsWith('/finance/cost-transactions')
        ? Promise.reject(new Error('offline'))
        : route()(path),
    );
    const { getByTestId } = await renderScreen();

    // The allocation is still worth reading, so the card stays; only the spend is unknown.
    await waitFor(() => expect(getByTestId('budget-line-l-1')).toHaveTextContent(/45,000,000/));
    expect(getByTestId('budget-line-l-1')).toHaveTextContent(/—/);
    expect(getByTestId('budget-line-l-1')).not.toHaveTextContent(/0%/);
  });

  it('reads the forecast module off the cash flow endpoint', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('budget-forecast')).toHaveTextContent(/week 3/));
    expect(getByTestId('budget-forecast')).toHaveTextContent(/Skybridge Central/);
  });

  it('draws the confidence its own drawing carries, and keeps the source honest beside it', async () => {
    // THE ADR-099 GUARD. The card reads a DETERMINISTIC forecast, so the percentage claims a model
    // that never ran; drawn on the product owner's instruction of 2026-09-08 and registered.
    // The source line is NOT taken from the drawing — "ERP & Schedule" names integrations this
    // platform does not have, which is the carve-out ADR-098's second amendment keeps.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('budget-forecast')).toHaveTextContent(/94%/));
    expect(getByTestId('budget-forecast')).not.toHaveTextContent(/ERP/);
  });

  it('clears the figures when the budget cannot be read, rather than leaving the last project up', async () => {
    // `GET /finance/budget/:id` answers 404 for an unbudgeted project. Showing the previous
    // project's numbers under this one's name is the one wrong thing this screen could do.
    client.get.mockImplementation((path: string) =>
      path.startsWith('/finance/budget/') ? Promise.reject(new Error('404')) : route()(path),
    );
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('budget-empty')).toBeTruthy());
    expect(queryByTestId('budget-figures')).toBeNull();
  });

  it('says so rather than drawing an empty breakdown when a budget has no lines', async () => {
    client.get.mockImplementation((path: string) =>
      path.startsWith('/finance/budget/') ? Promise.resolve(budget({ lines: [] })) : route()(path),
    );
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('budget-no-lines')).toBeTruthy());
    expect(queryByTestId('budget-lines')).toBeNull();
  });

  it('draws the four controls that have no process, and none of them writes', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('budget-line-l-1')).toBeTruthy());
    for (const id of [
      'budget-amend',
      'budget-expand-all',
      'budget-deep-report',
      'budget-line-details-l-1',
    ]) {
      await fireEvent.press(getByTestId(id));
    }

    expect(alert).toHaveBeenCalledTimes(4);
    // The message is the shared one, and it is a dialog — never a label on the screen.
    expect(alert.mock.calls[0]?.[1]).toMatch(/does not exist yet/i);
  });

  it('calls a zero denominator 0%, not an unknown', async () => {
    // A budget of zero leaves 0% of itself. That is a fact about the budget, not a gap in the data
    // (PO 2026-09-08), and the em dash is reserved for the figures nobody could read.
    client.get.mockImplementation((path: string) =>
      path.startsWith('/finance/budget/')
        ? Promise.resolve(budget({ total: '0.0000', actual: '0.0000' }))
        : route()(path),
    );
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('budget-kpi-remaining')).toHaveTextContent(/0%/));
  });

  it('shows a category nothing was charged to as zero, not as unknown', async () => {
    // The walk covers every recorded cost on the project, so a line with no matching transaction
    // is a line nothing has been charged to — a measured zero (PO 2026-09-08).
    client.get.mockImplementation(route([cost('c1', 'l-1', '1000000.0000')]));
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('budget-line-l-1')).toHaveTextContent(/1,000,000/));
    expect(getByTestId('budget-line-l-2')).toHaveTextContent(/฿ 0\.00/);
    expect(getByTestId('budget-line-l-2')).toHaveTextContent(/0%/);
  });
});
