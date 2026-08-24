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
    if (path.startsWith('/analytics/executive')) return Promise.resolve({ items: [] });
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

  it('gives EXECUTIVE the portfolio KPIs, from analytics and open issues', async () => {
    const { getByTestId } = await renderHome(CosRole.EXECUTIVE);

    await waitFor(() => expect(getByTestId('kpi-active-projects')).toBeTruthy());
    expect(getByTestId('kpi-budget')).toBeTruthy();
    expect(getByTestId('kpi-actual')).toBeTruthy();
    expect(getByTestId('kpi-open-critical')).toBeTruthy();

    await waitFor(() =>
      expect(pathsCalled().some((p) => p.startsWith('/analytics/executive'))).toBe(true),
    );
    expect(pathsCalled().some((p) => p.startsWith('/site/issues'))).toBe(true);
  });

  it('gives FINANCE the payment and invoice KPIs', async () => {
    const { getByTestId } = await renderHome(CosRole.FINANCE);

    await waitFor(() => expect(getByTestId('kpi-pending-payments')).toBeTruthy());
    expect(getByTestId('kpi-overdue-invoices')).toBeTruthy();

    await waitFor(() =>
      expect(pathsCalled().some((p) => p.startsWith('/finance/payments'))).toBe(true),
    );
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
