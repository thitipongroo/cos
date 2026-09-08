// Behaviour of the Home screen, pinned before app/(app)/home.tsx is split into per-role files.
//
// The thing the split can break and nothing else would catch is the ROLE DISPATCH: HomeScreen is a
// switch over the signed-in role, and moving six components into six files makes six chances to
// export or import the wrong one. Each test below therefore asserts a marker only that role's home
// draws, plus the endpoints it is supposed to reach — the second half of what a move can break, if
// a component ends up importing a different helper than it had.

import { render, waitFor } from '@testing-library/react-native';
import { CosRole } from '@cos/types';
import { I18nProvider } from '../../../i18n';
import { useAuthStore } from '../../../store/authStore';
import HomeScreen from '../home';

jest.mock('../../../api/client', () => ({ get: jest.fn(), mutate: jest.fn() }));
jest.mock('../../../hooks/useCollection', () => ({ useCollection: jest.fn(() => []) }));
jest.mock('../../../hooks/usePendingCount', () => ({ usePendingCount: jest.fn(() => 0) }));
jest.mock('../../../api/projects', () => ({
  refreshProjectsCache: jest.fn(async () => undefined),
  // PmHome awaits all three before its KPI region leaves <LoadingBoundary>, and the boundary does
  // not mount its children while loading — so a spec that stubs only getMyProjects never sees a KPI.
  getMyProjects: jest.fn(async () => [
    { project_id: 'proj-1', project_code: 'RVT-01', project_name: 'Riverside Tower' },
  ]),
  // ProcurementHome reads the TENANT list, not the caller's own: that role is a member of no
  // project, so `mine` answers nothing for it (2026-09-08).
  listProjects: jest.fn(async () => [{ project_id: 'proj-1', project_name: 'Riverside Tower' }]),
  getProjectProgress: jest.fn(async () => ({ progress_percent: 42 })),
  getProjectPhases: jest.fn(async () => []),
}));
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const react = require('react') as typeof import('react');
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    // NOT a no-op. PmHome loads on FOCUS rather than on mount (its own comment explains why), so a
    // stubbed-out useFocusEffect leaves it loading forever and its <LoadingBoundary> never mounts a
    // single KPI. Under test the screen is focused the moment it mounts, so an effect is the
    // faithful stand-in.
    useFocusEffect: (callback: () => void | (() => void)) => react.useEffect(callback, []),
    useLocalSearchParams: () => ({}),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock; mutate: jest.Mock };

/** Every endpoint any role home reaches answers with an empty, well-shaped payload by default. */
function emptyEndpoints() {
  client.get.mockImplementation((path: string) => {
    // A BARE ARRAY, which is what the endpoint really answers (`ExecutiveDashboardRow[]` — see
    // analytics.executive.controller.ts). This stub said `{ items: [] }` until 2026-09-05 and no
    // test noticed, because the old ExecHome mapped the body inside a promise chain whose offline
    // `.catch` swallowed the resulting TypeError. The rewrite maps during render, where the same
    // wrong shape takes the screen down — so the stub now has to be right.
    if (path.startsWith('/analytics/executive')) return Promise.resolve([]);
    if (path.startsWith('/site/issues')) return Promise.resolve({ items: [] });
    if (path.startsWith('/finance/payments')) return Promise.resolve({ items: [] });
    // A REAL budget shape, not {}: portfolioFinance reads `currency` off every row and calls
    // .toUpperCase() on it, so an empty object takes the PM home down before a KPI is drawn.
    if (path.startsWith('/finance/budget'))
      return Promise.resolve({
        budget: {
          total_budget_amount: '1000000.0000',
          total_budget_currency: 'THB',
          allocated_amount: '900000.0000',
          committed_amount: '400000.0000',
          actual_amount: '350000.0000',
        },
        lines: [],
        variance_percentage: '2.5000',
      });
    if (path.startsWith('/procurement/')) return Promise.resolve({ items: [] });
    return Promise.resolve({ items: [] });
  });
}

function renderHome(role: CosRole | null) {
  useAuthStore.setState({ role } as never);
  return render(
    <I18nProvider>
      <HomeScreen />
    </I18nProvider>,
  );
}

/** The paths reached, flattened — asserted against rather than call-order, which is not contractual. */
function pathsCalled(): string[] {
  return client.get.mock.calls.map((c) => String(c[0]));
}

describe('HomeScreen role dispatch', () => {
  beforeEach(() => {
    client.get.mockReset();
    client.mutate.mockReset();
    emptyEndpoints();
  });

  it('gives SITE_WORKER the field home, with its shift and task tiles', async () => {
    const { getByTestId } = await renderHome(CosRole.SITE_WORKER);

    await waitFor(() => expect(getByTestId('home-screen')).toBeTruthy());
    expect(getByTestId('stat-my-tasks')).toBeTruthy();
    expect(getByTestId('stat-shift-hours')).toBeTruthy();
    expect(getByTestId('home-quick-action-fab')).toBeTruthy();
  });

  // REWRITTEN 2026-09-05 with the screen (ADR-098 / ADR-099). It asserted `kpi-actual` and
  // `kpi-open-critical`, which were the four-tile version's markers; the drawing this screen now
  // implements has two tiles, a budget hero with a spend bar, the project list and the locations
  // panel. `/site/issues` left with the open-critical tile — risk is derived from the analytics rows
  // themselves, by the mapping alerts.tsx documents, so the screen makes one fewer request.
  it('gives EXECUTIVE the portfolio dashboard its mockup draws', async () => {
    const { getByTestId } = await renderHome(CosRole.EXECUTIVE);

    await waitFor(() => expect(getByTestId('kpi-active-projects')).toBeTruthy());
    expect(getByTestId('kpi-risk-alerts')).toBeTruthy();
    expect(getByTestId('kpi-budget')).toBeTruthy();
    // NOT `kpi-budget-bar`, since 2026-09-07. This stub answers `/analytics/executive` with `[]`, so
    // there is no budget to divide by and the track is deliberately EMPTY — drawing a segment there
    // would be a claim about a portfolio the screen has no figures for. The bar's own two segments
    // are asserted in exec-home.spec.tsx, which has rows to compute them from.
    expect(getByTestId('exec-home-locations')).toBeTruthy();

    await waitFor(() =>
      expect(pathsCalled().some((p) => p.startsWith('/analytics/executive'))).toBe(true),
    );
  });

  it('draws the two AI-panel actions and says neither works yet', async () => {
    // Master §Phase 10 makes this role read-only on mobile and neither button has an endpoint, so
    // they are drawn with the `more.tsx` "soon" treatment rather than omitted (PO 2026-09-04).
    // Asserting they EXIST is what stops a later tidy-up from silently deleting the drawing.
    const { getByTestId } = await renderHome(CosRole.EXECUTIVE);

    await waitFor(() => expect(getByTestId('exec-home-mitigation')).toBeTruthy());
    expect(getByTestId('exec-home-dismiss')).toBeTruthy();
  });

  // REWRITTEN 2026-09-08 with the screen (mockup 09_finance/01_home/01_fn_dashboard). It asserted
  // `kpi-pending-payments` and `kpi-overdue-invoices`, which were the two-count version's markers;
  // the drawing this screen now implements leads with what the approvals are WORTH, adds the cash
  // position and the forecast, and lists the queue itself. The overdue-invoice tile went with the
  // rewrite, and `/analytics/executive` with it — this screen no longer reads that endpoint at all.
  it('gives FINANCE the approvals dashboard its mockup draws', async () => {
    const { getByTestId } = await renderHome(CosRole.FINANCE);

    await waitFor(() => expect(getByTestId('kpi-pending-approvals')).toBeTruthy());
    expect(getByTestId('kpi-cash-flow')).toBeTruthy();
    expect(getByTestId('kpi-burn-rate')).toBeTruthy();
    expect(getByTestId('finance-forecast')).toBeTruthy();
  });

  it('asks the SERVER for pending payments, never filters the page it got', async () => {
    // The endpoint pages at 20 and a tenant holds more, so a total computed over page one is a
    // total of page one — the defect `finance.repository.ts` records against its own query, on a
    // screen whose headline figure is that total. Asserted on the URL, because a filtered page and
    // a filtered query produce the same number whenever the tenant is small enough to fit.
    await renderHome(CosRole.FINANCE);

    await waitFor(() =>
      expect(pathsCalled().some((p) => p.startsWith('/finance/payments'))).toBe(true),
    );
    // The status rides in `get()`'s SECOND argument, not in the path — `api/analytics.ts` builds its
    // ids into the URL, this one does not — so the assertion reads the params rather than the string.
    const call = client.get.mock.calls.find((c) => String(c[0]).startsWith('/finance/payments'));
    expect(call?.[1]).toEqual({ status: 'PENDING' });
  });

  it('shows an em dash rather than a zero it could not verify', async () => {
    // A zero here would read as "nothing is waiting for approval" on a finance dashboard. Losing
    // the queue must produce the placeholder, not a number.
    client.get.mockImplementation((path: string) =>
      path.startsWith('/finance/payments')
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({ items: [] }),
    );

    const { getByTestId } = await renderHome(CosRole.FINANCE);
    await waitFor(() => expect(getByTestId('kpi-pending-approvals')).toHaveTextContent(/—/));
  });

  it('gives PROCUREMENT_OFFICER the four queue tiles the drawing lays out', async () => {
    // REBUILT 2026-09-08 for `10_proc_officer/01_home/01_po_dashboard`. The tiles were committed
    // spend, open RFQs, RFQs closing within 24h, POs awaiting ack and deliveries; the drawing is a
    // 2x2 bento of the four QUEUES — requests to approve, RFQs running, awards with no order open
    // yet, deliveries arriving today.
    const { getByTestId } = await renderHome(CosRole.PROCUREMENT_OFFICER);

    await waitFor(() => expect(getByTestId('kpi-requests')).toBeTruthy());
    expect(getByTestId('kpi-rfqs')).toBeTruthy();
    expect(getByTestId('kpi-awaitingPo')).toBeTruthy();
    expect(getByTestId('kpi-deliveries')).toBeTruthy();

    await waitFor(() =>
      expect(pathsCalled().some((p) => p.startsWith('/procurement/purchase-requests'))).toBe(true),
    );
    expect(pathsCalled().some((p) => p.startsWith('/procurement/rfqs'))).toBe(true);
    expect(pathsCalled().some((p) => p.startsWith('/procurement/purchase-orders'))).toBe(true);
    expect(pathsCalled().some((p) => p.startsWith('/procurement/deliveries'))).toBe(true);
  });

  it('shows a dash on a queue tile whose request was lost, never a zero', async () => {
    // "Not loaded" and "none" are different answers, and on a screen whose whole job is to say what
    // is waiting, a 0 the request never returned states the second one. Losing the queue must
    // produce the placeholder.
    client.get.mockImplementation((path: string) =>
      path.startsWith('/procurement/purchase-requests')
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({ items: [] }),
    );

    const { getByTestId } = await renderHome(CosRole.PROCUREMENT_OFFICER);
    await waitFor(() => expect(getByTestId('kpi-requests')).toHaveTextContent(/—/));
    // …while a tile whose own request DID land keeps its real zero.
    expect(getByTestId('kpi-deliveries')).toHaveTextContent(/0/);
  });

  it('gives PROC_MANAGER the same home as PROCUREMENT_OFFICER', async () => {
    const { getByTestId } = await renderHome(CosRole.PROC_MANAGER);

    await waitFor(() => expect(getByTestId('kpi-requests')).toBeTruthy());
    expect(getByTestId('kpi-awaitingPo')).toBeTruthy();
  });

  it('gives PROJECT_MANAGER the project KPIs and the blockers panel', async () => {
    const { getByTestId } = await renderHome(CosRole.PROJECT_MANAGER);

    await waitFor(() => expect(getByTestId('kpi-active-projects')).toBeTruthy());
    expect(getByTestId('kpi-total-variance')).toBeTruthy();
  });

  it('falls back to the minimal home for a role with no home of its own', async () => {
    const { getByTestId, queryByTestId } = await renderHome(CosRole.VIEWER);

    await waitFor(() => expect(getByTestId('home-screen')).toBeTruthy());
    expect(getByTestId('pending-sync-count')).toBeTruthy();
    // None of the role-specific markers belong here.
    expect(queryByTestId('kpi-active-projects')).toBeNull();
    expect(queryByTestId('stat-my-tasks')).toBeNull();
  });

  it('falls back to the minimal home when no role is known yet', async () => {
    const { getByTestId } = await renderHome(null);

    await waitFor(() => expect(getByTestId('pending-sync-count')).toBeTruthy());
  });
});
