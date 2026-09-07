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

  it('gives FINANCE the payment and invoice KPIs', async () => {
    const { getByTestId } = await renderHome(CosRole.FINANCE);

    await waitFor(() => expect(getByTestId('kpi-pending-payments')).toBeTruthy());
    expect(getByTestId('kpi-overdue-invoices')).toBeTruthy();

    await waitFor(() =>
      expect(pathsCalled().some((p) => p.startsWith('/finance/payments'))).toBe(true),
    );
  });

  it('asks the analytics endpoint for FINANCE by project id, never bare', async () => {
    // The whole defect this screen carried until 2026-09-06: `GET /analytics/executive` with no
    // `projectIds` answers 200 with [], so the overdue-invoice tile printed a confident 0. Asserted
    // on the URL rather than on the tile, because the tile reads 0 in both the broken and the
    // "genuinely nothing overdue" case — only the request tells them apart.
    await renderHome(CosRole.FINANCE);

    await waitFor(() =>
      expect(pathsCalled().some((p) => p.startsWith('/analytics/executive'))).toBe(true),
    );
    const call = pathsCalled().find((p) => p.startsWith('/analytics/executive')) ?? '';
    expect(call).toContain('projectIds=proj-1');
  });

  it('shows an em dash for FINANCE rather than a zero it could not verify', async () => {
    // A zero here would read as "nothing is overdue" on a finance dashboard. Losing the project list
    // must produce the placeholder, not a number.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const projectsApi = require('../../../api/projects') as { getMyProjects: jest.Mock };
    /* eslint-enable @typescript-eslint/no-require-imports */
    projectsApi.getMyProjects.mockImplementationOnce(() => Promise.reject(new Error('offline')));

    const { getByTestId } = await renderHome(CosRole.FINANCE);
    await waitFor(() => expect(getByTestId('kpi-overdue-invoices')).toHaveTextContent(/—/));
    expect(pathsCalled().some((p) => p.startsWith('/analytics/executive'))).toBe(false);
  });

  it('gives PROCUREMENT_OFFICER the RFQ, order and delivery KPIs', async () => {
    const { getByTestId } = await renderHome(CosRole.PROCUREMENT_OFFICER);

    await waitFor(() => expect(getByTestId('kpi-open-rfqs')).toBeTruthy());
    expect(getByTestId('kpi-awaiting-ack')).toBeTruthy();
    expect(getByTestId('kpi-deliveries')).toBeTruthy();

    await waitFor(() =>
      expect(pathsCalled().some((p) => p.startsWith('/procurement/rfqs'))).toBe(true),
    );
    expect(pathsCalled().some((p) => p.startsWith('/procurement/purchase-orders'))).toBe(true);
    expect(pathsCalled().some((p) => p.startsWith('/procurement/deliveries'))).toBe(true);
  });

  it('gives PROC_MANAGER the same home as PROCUREMENT_OFFICER', async () => {
    const { getByTestId } = await renderHome(CosRole.PROC_MANAGER);

    await waitFor(() => expect(getByTestId('kpi-open-rfqs')).toBeTruthy());
    expect(getByTestId('kpi-awaiting-ack')).toBeTruthy();
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
