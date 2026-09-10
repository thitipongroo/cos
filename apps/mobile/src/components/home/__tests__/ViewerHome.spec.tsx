// The VIEWER Home dashboard (mockup/mobile/role_viewer/01_home/01_dashboard).
//
// What is worth pinning here is the LINE BETWEEN REAL AND DRAWN, because it is invisible on screen:
// the project count and the project cards come from the offline cache, and the two tiles beside
// them do not — a later edit that swapped either way would render perfectly. The other half is the
// three-valued project state (loading, ready-and-empty, failed), which PmHome shipped wrong once
// and had photographed.
//
// THE ISSUE TILE TOOK THREE ANSWERS. It counted `local_issues` and printed a confident 0 for a role
// whose device never fills that table; it fetched `GET /site/issues` and drew an em dash for a
// measured 403; it drew a registered 47 for one day. ADR-103 opened the route on 2026-09-11 and it
// reads the endpoint again. Two of the three wrong answers rendered perfectly, which is why the
// assertions below pin the DASH and forbid the ZERO rather than just checking a number appears.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { I18nProvider } from '../../../i18n';
import ViewerHome from '../ViewerHome';
import {
  VIEWER_PORTFOLIO_BUDGET,
  VIEWER_HOME_PROJECT_CARDS,
  VIEWER_SITE_ACTIVITY,
} from '../../../lib/mockupFigures';

jest.mock('../../../hooks/useCollection', () => ({ useCollection: jest.fn(() => []) }));
jest.mock('../../../api/projects', () => ({
  refreshProjectsCache: jest.fn(async () => undefined),
}));
jest.mock('../../../api/client', () => ({ get: jest.fn() }));
// One `push` across the module, not a fresh jest.fn() per call — the redraw gave two of the three
// tiles a real destination, and a per-call mock cannot tell "went to /projects" from "went nowhere".
// `mock`-prefixed so jest's factory hoisting allows the reference.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useCollection } = require('../../../hooks/useCollection') as { useCollection: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { refreshProjectsCache } = require('../../../api/projects') as {
  refreshProjectsCache: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock };

const PROJECT = {
  id: 'p-1',
  projectId: 'proj-1',
  projectCode: 'RVT-01',
  projectName: 'Riverside Tower',
  status: 'ACTIVE',
};
const SECOND = { ...PROJECT, id: 'p-2', projectCode: 'HBR-02', projectName: 'Harbour Works' };
const THIRD = { ...PROJECT, id: 'p-3', projectCode: 'APX-03', projectName: 'Apex Yard' };

/**
 * The projects the offline cache holds, and what `GET /site/issues?status=OPEN` answers.
 *
 * Pass `null` for `issues` to leave the request hanging — that is the state the tile must show a
 * dash for, and it is the one a screenshot caught it getting wrong.
 */
function withData(projects: unknown[], issues: unknown[] | null = []): void {
  useCollection.mockImplementation(() => projects);
  client.get.mockImplementation(() =>
    issues === null ? new Promise(() => undefined) : Promise.resolve({ items: issues }),
  );
}

function renderHome() {
  return render(
    <I18nProvider>
      <ViewerHome />
    </I18nProvider>,
  );
}

describe('ViewerHome', () => {
  beforeEach(() => {
    useCollection.mockReset();
    refreshProjectsCache.mockReset();
    refreshProjectsCache.mockResolvedValue(undefined);
    client.get.mockReset();
    mockPush.mockReset();
  });

  it('counts the cached projects and the open issues the endpoint returns', async () => {
    withData([PROJECT, SECOND], [{ id: 'i-1' }, { id: 'i-2' }, { id: 'i-3' }]);

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('viewer-kpi-projects')).toBeTruthy());
    // REAL: two cached projects.
    expect(getByTestId('viewer-kpi-projects')).toHaveTextContent(/2/);
    // REAL since ADR-103 opened `GET /site/issues` to this role.
    await waitFor(() => expect(getByTestId('viewer-kpi-issues')).toHaveTextContent(/3/));
    // The endpoint does the filtering; the screen must not re-decide what "open" means.
    expect(client.get).toHaveBeenCalledWith('/site/issues', { status: 'OPEN' });
  });

  it('dashes the issue tile until the request answers, and never shows a zero', async () => {
    withData([PROJECT], null);

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('viewer-kpi-issues')).toBeTruthy());
    expect(getByTestId('viewer-kpi-issues')).toHaveTextContent(/—/);
  });

  it('keeps the dash when the request fails', async () => {
    useCollection.mockImplementation(() => [PROJECT]);
    client.get.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('viewer-kpi-issues')).toBeTruthy());
    // A failed request and an empty portfolio are different answers. The tile said "0" once and it
    // was photographed; it must never say it again.
    expect(getByTestId('viewer-kpi-issues')).toHaveTextContent(/—/);
  });

  it('prints the drawn budget through the money layer, not as a literal', async () => {
    withData([PROJECT]);

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('viewer-kpi-budget')).toBeTruthy());
    const tile = getByTestId('viewer-kpi-budget');
    // The 2026-09-11 redraw writes `฿ 142.5 M`, which is `compactMoneyLabel`'s own output. Asserted
    // on the DIGITS and the scale suffix rather than on a formatted string: the symbol and the
    // decimal separator are the locale's, and pinning them here would pin the test to one locale.
    expect(tile).toHaveTextContent(/142[.,]5/);
    // A hardcoded string would survive a currency change; the amount in the register must not.
    expect(VIEWER_PORTFOLIO_BUDGET.value.amount).toBe(142_500_000);
    expect(VIEWER_PORTFOLIO_BUDGET.value.currency).toBe('THB');
  });

  it('lists at most as many project cards as the register has figures for', async () => {
    withData([PROJECT, SECOND, THIRD]);

    const { queryByTestId } = await renderHome();

    await waitFor(() => expect(queryByTestId('viewer-project-p-1')).toBeTruthy());
    expect(queryByTestId('viewer-project-p-2')).toBeTruthy();
    // Three cached, two drawn — the third is not shown on Home; /projects lists them all.
    expect(VIEWER_HOME_PROJECT_CARDS.value).toHaveLength(2);
    expect(queryByTestId('viewer-project-p-3')).toBeNull();
  });

  it('prints the real lifecycle status on a card, not the drawing’s "On Track"', async () => {
    withData([{ ...PROJECT, status: 'ON_HOLD' }]);

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('viewer-project-p-1')).toBeTruthy());
    expect(getByTestId('viewer-project-p-1')).toHaveTextContent(/ON_HOLD/);
    expect(getByTestId('viewer-project-p-1')).not.toHaveTextContent(/On Track/);
  });

  it('says the portfolio is empty when the refresh succeeded and returned nothing', async () => {
    withData([]);

    const { getByTestId, queryByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('viewer-no-projects')).toBeTruthy());
    expect(queryByTestId('viewer-projects-failed')).toBeNull();
  });

  it('says the list did not load when the refresh failed with nothing cached', async () => {
    withData([]);
    refreshProjectsCache.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('viewer-projects-failed')).toBeTruthy());
    // The two sentences are different answers and must never both appear.
    expect(queryByTestId('viewer-no-projects')).toBeNull();
  });

  it('says nothing about a failure when the cache already answered', async () => {
    withData([PROJECT]);
    refreshProjectsCache.mockRejectedValue(new Error('offline'));

    const { queryByTestId, getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('viewer-project-p-1')).toBeTruthy());
    // Offline over a warm cache is the ordinary case (§17.4), not something to report.
    expect(queryByTestId('viewer-projects-failed')).toBeNull();
  });

  it('foots the AI card with a record set this repository has, and no confidence', async () => {
    withData([PROJECT]);

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('viewer-insight')).toBeTruthy());
    // ADR-098 amendment 2: the source names something this repo HAS. The drawing foots nothing on
    // this card, and the card makes no confidence claim, so no CONF half is drawn.
    expect(getByTestId('viewer-insight-foot')).toHaveTextContent(/assigned projects/i);
    expect(getByTestId('viewer-insight-foot')).not.toHaveTextContent(/CONF/);
  });

  // ── THE 2026-09-11 REDRAW ────────────────────────────────────────────────────────────────────
  //
  // The KPI tiles were three panels of text before the redraw. Each is now a control with its own
  // way onward, and the difference is invisible in a screenshot — a tile that lost its `onPress`
  // photographs identically and simply stops working.

  it('makes every KPI tile a labelled control with a way onward', async () => {
    withData([PROJECT]);

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('viewer-kpi-projects')).toBeTruthy());
    for (const id of ['projects', 'issues', 'budget']) {
      const tile = getByTestId(`viewer-kpi-${id}`);
      expect(tile.props.accessibilityRole).toBe('button');
      expect(String(tile.props.accessibilityLabel ?? '').length).toBeGreaterThan(0);
    }
    // The two counted tiles name what the press does; the drawing writes VIEW and TRACK.
    expect(getByTestId('viewer-kpi-projects')).toHaveTextContent(/View/i);
    expect(getByTestId('viewer-kpi-issues')).toHaveTextContent(/Track/i);
  });

  it('sends the two tiles that have a destination to it, and says so on the one that has none', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    withData([PROJECT]);

    const { getByTestId } = await renderHome();
    await waitFor(() => expect(getByTestId('viewer-kpi-projects')).toBeTruthy());

    fireEvent.press(getByTestId('viewer-kpi-projects'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/projects'));

    fireEvent.press(getByTestId('viewer-kpi-budget'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/budget'));

    // ADR-103 opened `GET /site/issues` so the COUNT is real, and §32.7 still keeps `/issues` off
    // this role's bar because its create button is not role-gated. Opening a read route did not
    // open the screen, so TRACK still says so on the press rather than navigating.
    mockPush.mockClear();
    fireEvent.press(getByTestId('viewer-kpi-issues'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('draws the activity feed as rows that respond, one per registered entry', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    withData([PROJECT]);

    const { getByTestId } = await renderHome();
    await waitFor(() => expect(getByTestId('viewer-activity')).toBeTruthy());

    VIEWER_SITE_ACTIVITY.value.forEach((_entry, index) => {
      expect(getByTestId(`viewer-activity-${index}`).props.accessibilityRole).toBe('button');
    });
    // Each entry is a different kind of record and no one screen opens all three, so the row is
    // drawn and says so on the press — never a line of text pretending to be a link.
    fireEvent.press(getByTestId('viewer-activity-0'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    alert.mockRestore();
  });
});
