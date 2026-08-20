// Behaviour of the PM finance dashboard.
//
// The three tiles are the largest numbers in the product, so what is asserted here is the DIFFERENCE
// between "no money" and "no answer". A failed `/projects/mine` used to be drawn as an empty
// portfolio — zeroed tiles are a claim about someone's money, and a request that failed supports no
// claim. The screen now says the request failed instead, and that has to stay said.
//
// The per-project rows come from `settledBudgetRows`, extracted 2026-08-20 and shared with the PM
// home. Its rule is asserted at the unit level in portfolioFinance.spec.ts; what is asserted here is
// that this screen still gets it — a project whose budget request was rejected is LEFT OUT rather
// than entered at zero.

import { render, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import FinanceScreen from '../finance';

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react') as typeof import('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  };
});

jest.mock('../../../api/client', () => ({ get: jest.fn() }));
jest.mock('../../../api/projects', () => ({
  ...jest.requireActual('../../../api/projects'),
  getMyProjects: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../../api/projects') as { getMyProjects: jest.Mock };

function project(n: number) {
  return { project_id: `p-${n}`, project_name: `Project ${n}`, project_code: `PRJ-${n}` };
}

function budget(total: string) {
  return {
    budget: {
      total_budget_amount: total,
      total_budget_currency: 'THB',
      allocated_amount: '900000.0000',
      committed_amount: '400000.0000',
      actual_amount: '350000.0000',
    },
  };
}

/** Budgets by project id; anything else (the cost ledger) answers empty. */
function respond(budgets: Record<string, unknown>) {
  client.get.mockImplementation((path: string) => {
    const match = /^\/finance\/budget\/(.+)$/.exec(path);
    if (match) {
      const answer = budgets[match[1]!];
      return answer === undefined ? Promise.reject(new Error('404')) : Promise.resolve(answer);
    }
    return Promise.resolve({ items: [] });
  });
}

function renderScreen() {
  return render(
    <I18nProvider>
      <FinanceScreen />
    </I18nProvider>,
  );
}

describe('FinanceScreen', () => {
  beforeEach(() => {
    client.get.mockReset();
    api.getMyProjects.mockReset();
    api.getMyProjects.mockResolvedValue([project(1), project(2)]);
    respond({ 'p-1': budget('1000000.0000'), 'p-2': budget('500000.0000') });
  });

  it('renders a row per budgeted project', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('finance-project-p-1')).toBeTruthy());
    expect(getByTestId('finance-project-p-2')).toBeTruthy();
  });

  it('shows the three portfolio tiles', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('tile-total-budget')).toBeTruthy());
    expect(getByTestId('tile-committed')).toBeTruthy();
    expect(getByTestId('tile-actual')).toBeTruthy();
  });

  // A 404 means the project was never budgeted. Entering it at zero would read as "budgeted at
  // nothing" and would drag the portfolio figures towards a number nobody's data supports.
  it('leaves out a project whose budget was never created', async () => {
    respond({ 'p-1': budget('1000000.0000') });

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('finance-project-p-1')).toBeTruthy());
    expect(queryByTestId('finance-project-p-2')).toBeNull();
  });

  it('says the portfolio is empty when the manager has no projects', async () => {
    api.getMyProjects.mockResolvedValue([]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('finance-empty')).toBeTruthy());
  });

  // THE DISTINCTION THIS SCREEN EXISTS TO KEEP: a request that failed is not an empty portfolio.
  it('reports a failure rather than drawing an empty portfolio', async () => {
    api.getMyProjects.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('finance-failed')).toBeTruthy());
    expect(queryByTestId('finance-empty')).toBeNull();
  });

  it('offers the material-request action the role can actually take', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('finance-fab')).toBeTruthy());
  });
});
