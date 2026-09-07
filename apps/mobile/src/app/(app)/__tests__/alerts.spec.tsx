// What `/alerts` is, and what it stopped being.
//
// REWRITTEN 2026-09-07 with the screen. This file used to pin the risk feed — one card per project
// from `GET /analytics/executive`, banded by `executiveSeverityOf`, sorted worst-first. That screen
// was DELETED by product-owner decision: `mockup/mobile/08_executive/02_alerts/02_ex_alerts` is the
// previous `02_tasks` drawing with four `<nav>` labels changed and a byte-identical body, so the
// drawing behind the tab named "Alerts" draws the TASK ROLL-UP, and the product owner chose the
// drawing over §20.7.1's own definition of the page.
//
// The behaviour of the roll-up itself is covered by `components/__tests__/exec-tasks.spec.tsx`,
// which is unchanged and did not have to move. What is asserted HERE is the thing that change could
// silently undo: that this route renders that screen, and that the screen is not now reachable
// twice under two names.

import { render } from '@testing-library/react-native';
import { CosRole } from '@cos/types';
import { I18nProvider } from '../../../i18n';
import { drawerLinksFor } from '../../../lib/drawerLinks';
import AlertsScreen from '../alerts';

jest.mock('../../../api/client', () => ({ get: jest.fn(async () => ({ items: [] })) }));
jest.mock('../../../api/projects', () => ({ getMyProjects: jest.fn(async () => []) }));
jest.mock('../../../api/schedule', () => ({
  getPortfolioTaskSummary: jest.fn(async () => ({
    overdue_count: 0,
    due_this_week_count: 0,
    blocked_count: 0,
  })),
  getPortfolioCriticalPath: jest.fn(async () => ({ projects: [], tasks: [] })),
}));

describe('AlertsScreen', () => {
  it('renders the portfolio task roll-up, which is what its drawing draws', async () => {
    const { getByTestId } = await render(
      <I18nProvider>
        <AlertsScreen />
      </I18nProvider>,
    );

    expect(getByTestId('exec-tasks-screen')).toBeTruthy();
  });

  it('leaves the executive no second route to the same screen', async () => {
    // `/tasks` renders the same component for this role. Offering it in the drawer as well would be
    // one screen under two names — the `dashboard` mistake, which shipped a fifth tab.
    expect(drawerLinksFor(CosRole.EXECUTIVE).map((link) => link.route)).not.toContain('/tasks');
    expect(drawerLinksFor(CosRole.EXECUTIVE).map((link) => link.route)).not.toContain('/alerts');
  });
});
