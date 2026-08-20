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

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import FinanceScreen from '../finance';

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react') as typeof import('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
    useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
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
    mockPush.mockReset();
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

  // ── THE TREND ARROWS ─────────────────────────────────────────────────────────────────────────
  //
  // THE COLOUR FOLLOWS WHAT THE ARROW SAYS, NOT WHICH TILE IT IS ON. The drawing colours Commit
  // Costs up/orange and Actual Spent down/green — but those are its sample figures, and a rule read
  // off them would tell a manager that a jump in spending is the good news whenever the sample
  // happened to point that way. Up is amber and down is green on BOTH tiles.
  //
  // AND A TREND NEEDS A BASELINE. `project_budgets` holds current aggregates and no history; the
  // arrows are computed from the dated cost ledger, so a portfolio with no previous window has no
  // direction to report and shows an em dash rather than a flat arrow — which would state that
  // spending held steady.

  it('reads a rise in commitments as a rise, in the warning tone', async () => {
    respondWithLedger({ 'p-1': budget('1000000.0000') }, [
      ...ledgerEntries('PURCHASE_ORDER', 5, '200000'),
      ...ledgerEntries('PURCHASE_ORDER', 40, '100000'),
    ]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('tile-committed')).toBeTruthy());
    expect(within(getByTestId('tile-committed'))).toContain('trending-up');
  });

  // The SAME rule on the other tile: a fall in invoices reads as a fall, and takes the same green a
  // fall in commitments would.
  it('reads a fall in actual spend as a fall, in the same tone a fall always takes', async () => {
    respondWithLedger({ 'p-1': budget('1000000.0000') }, [
      ...ledgerEntries('INVOICE', 5, '50000'),
      ...ledgerEntries('INVOICE', 40, '200000'),
    ]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('tile-actual')).toBeTruthy());
    expect(within(getByTestId('tile-actual'))).toContain('trending-down');
  });

  // A rise on the OTHER tile takes the same amber. If the tone came from the tile rather than the
  // direction, this is where it would show.
  it('reads a rise in actual spend as a rise too', async () => {
    respondWithLedger({ 'p-1': budget('1000000.0000') }, [
      ...ledgerEntries('INVOICE', 5, '200000'),
      ...ledgerEntries('INVOICE', 40, '100000'),
    ]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('tile-actual')).toBeTruthy());
    expect(within(getByTestId('tile-actual'))).toContain('trending-up');
  });

  // No previous window, no direction. A flat arrow would state that spending held steady.
  it('shows a dash rather than a flat arrow when there is no baseline', async () => {
    respondWithLedger(
      { 'p-1': budget('1000000.0000') },
      ledgerEntries('PURCHASE_ORDER', 5, '200000'),
    );

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('tile-committed')).toBeTruthy());
    const tile = within(getByTestId('tile-committed'));
    expect(tile).toContain('—');
    expect(tile).not.toContain('trending-flat');
    expect(tile).not.toContain('trending-up');
  });

  it('shows a dash on both tiles when the ledger is empty', async () => {
    respondWithLedger({ 'p-1': budget('1000000.0000') }, []);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('tile-committed')).toBeTruthy());
    expect(within(getByTestId('tile-committed'))).toContain('—');
    expect(within(getByTestId('tile-actual'))).toContain('—');
  });

  // The two tiles read DIFFERENT source types: a purchase order is a commitment and an invoice is
  // actual spend, and a screen that summed them into one arrow would report the same movement twice.
  it('keeps the two ledgers apart', async () => {
    respondWithLedger({ 'p-1': budget('1000000.0000') }, [
      ...ledgerEntries('PURCHASE_ORDER', 5, '200000'),
      ...ledgerEntries('PURCHASE_ORDER', 40, '100000'),
    ]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('tile-committed')).toBeTruthy());
    // Commitments moved; invoices did not, so the actual tile has no baseline of its own.
    expect(within(getByTestId('tile-committed'))).toContain('trending-up');
    expect(within(getByTestId('tile-actual'))).toContain('—');
  });

  // ── PAGING THE LEDGER ────────────────────────────────────────────────────────────────────────

  // The endpoint caps `limit` at 100 and two 30-day windows across five projects run past that — so
  // the screen pages until a short page comes back. Stopping at page one would compute the arrows
  // from a slice of the ledger and report a movement that is an artefact of the page size.
  it('pages the ledger until a short page comes back', async () => {
    const full = Array.from({ length: 100 }, () => ledgerEntries('INVOICE', 5, '1000')[0]!);
    let page = 0;
    client.get.mockImplementation((path: string) => {
      const match = /^\/finance\/budget\/(.+)$/.exec(path);
      if (match) return Promise.resolve(budget('1000000.0000'));
      page += 1;
      return Promise.resolve({ items: page === 1 ? full : [] });
    });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('finance-screen')).toBeTruthy());
    await waitFor(() => expect(page).toBeGreaterThanOrEqual(2));
  });

  // And it stops: a server that answered a full page forever would otherwise be an unbounded loop on
  // a screen someone opened to glance at a number.
  it('stops paging rather than looping on a server that never runs out', async () => {
    const full = Array.from({ length: 100 }, () => ledgerEntries('INVOICE', 5, '1000')[0]!);
    let pages = 0;
    client.get.mockImplementation((path: string) => {
      if (/^\/finance\/budget\//.test(path)) return Promise.resolve(budget('1000000.0000'));
      pages += 1;
      return Promise.resolve({ items: full });
    });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('finance-screen')).toBeTruthy());
    await waitFor(() => expect(pages).toBe(10));
    expect(pages).toBeLessThanOrEqual(10);
  });

  it('reads a bare array from the ledger as well as an items envelope', async () => {
    client.get.mockImplementation((path: string) => {
      if (/^\/finance\/budget\//.test(path)) return Promise.resolve(budget('1000000.0000'));
      return Promise.resolve([
        ...ledgerEntries('PURCHASE_ORDER', 5, '200000'),
        ...ledgerEntries('PURCHASE_ORDER', 40, '100000'),
      ]);
    });
    api.getMyProjects.mockResolvedValue([project(1)]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('tile-committed')).toBeTruthy());
    expect(within(getByTestId('tile-committed'))).toContain('trending-up');
  });

  // ── MIXED CURRENCY ───────────────────────────────────────────────────────────────────────────

  // SILENCE HERE WOULD LET THREE TILES STAND FOR A PORTFOLIO THEY DO NOT COVER. A project budgeted
  // in another currency cannot be added to the total — there is no rate anywhere in this product to
  // convert it with — so it is excluded, and the exclusion is stated.
  it('says how many projects the totals leave out', async () => {
    api.getMyProjects.mockResolvedValue([project(1), project(2)]);
    respond({
      'p-1': budget('1000000.0000'),
      'p-2': {
        budget: {
          total_budget_amount: '500000.0000',
          total_budget_currency: 'USD',
          allocated_amount: '0',
          committed_amount: '0',
          actual_amount: '0',
        },
      },
    });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('finance-mixed-currency')).toBeTruthy());
  });

  it('says nothing about currency when the portfolio is in one', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('tile-total-budget')).toBeTruthy());
    expect(queryByTestId('finance-mixed-currency')).toBeNull();
  });

  // ── WHAT EACH TILE OPENS ─────────────────────────────────────────────────────────────────────
  //
  // Each opens where its own figure comes from, and nothing opens a screen this role may not read
  // (§6.4). A tile that opened the wrong screen would be worse than an inert one: the manager would
  // read another figure believing it explained this one.

  it.each([
    ['tile-committed', '/orders'],
    ['tile-actual', '/invoices'],
  ])('%s opens %s', async (testID, route) => {
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId(testID)).toBeTruthy());

    await fireEvent.press(getByTestId(testID));

    expect(mockPush).toHaveBeenCalledWith(route);
  });

  // Total Budget is already the sum of the cards below it, so it SCROLLS to them rather than
  // pushing a screen that would restate the same figure.
  //
  // WHAT IS ASSERTED IS THE ABSENCE OF A PUSH, not the scroll: `scrollTo` is called on a ref to the
  // real ScrollView instance, which this environment gives no handle on — an injected spy sits on
  // the test node, not on the instance the screen holds, so it would never be called and the test
  // would pass either way. The scroll is left to the screenshot rig; what this pins is that the tile
  // does not navigate, which is the part §6.4 cares about.
  it('does not navigate away from the budget total', async () => {
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('tile-total-budget')).toBeTruthy());

    await fireEvent.press(getByTestId('tile-total-budget'));

    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── THE PROJECT ROWS ─────────────────────────────────────────────────────────────────────────

  it('opens a project analytics from its own card', async () => {
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('finance-project-p-1')).toBeTruthy());

    await fireEvent.press(getByTestId('finance-project-p-1'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(String(JSON.stringify(mockPush.mock.calls[0][0]))).toContain('p-1');
  });

  it('draws a bar per budgeted project', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('finance-bar-p-1')).toBeTruthy());
    expect(getByTestId('finance-bar-p-2')).toBeTruthy();
  });
});

/** A dated ledger entry `daysAgo` days back. */
function ledgerEntries(sourceType: string, daysAgo: number, amount: string) {
  const date = new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
  return [{ source_type: sourceType, amount, transaction_date: date }];
}

/** Budgets by project id, plus a fixed cost ledger for every other path. */
function respondWithLedger(budgets: Record<string, unknown>, ledger: unknown[]) {
  api.getMyProjects.mockResolvedValue([project(1)]);
  let served = false;
  client.get.mockImplementation((path: string) => {
    const match = /^\/finance\/budget\/(.+)$/.exec(path);
    if (match) {
      const answer = budgets[match[1]!];
      return answer === undefined ? Promise.reject(new Error('404')) : Promise.resolve(answer);
    }
    // One page, then empty — the screen stops on a short page.
    if (served) return Promise.resolve({ items: [] });
    served = true;
    return Promise.resolve({ items: ledger });
  });
}

/** A node's own text and glyph names, joined. */
function within(node: { props: Record<string, unknown> }): string {
  const walk = (n: unknown): string[] => {
    if (typeof n === 'string' || typeof n === 'number') return [String(n)];
    if (!n || typeof n !== 'object') return [];
    const el = n as { props?: { children?: unknown; name?: unknown } };
    const glyph = typeof el.props?.name === 'string' ? [el.props.name] : [];
    return [...glyph, ...[el.props?.children].flat(4).flatMap(walk)];
  };
  return walk({ props: node.props }).join(' ');
}
