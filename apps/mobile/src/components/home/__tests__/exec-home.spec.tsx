// Behaviour of the EXECUTIVE Home dashboard (mockup 08_executive/01_home, ADR-098 / ADR-099).
//
// home.spec.tsx asserts the ROLE DISPATCH — that this component is the one EXECUTIVE gets. This file
// asserts what it draws, and specifically the split that ADR-099 created: the budget, the variance
// and the risk counts move with the API; the "+2 this month" delta and the region caption do not.
//
// Every render is awaited and every press is awaited — `render()` returns a promise under this
// preset, and an un-awaited `fireEvent` leaves act() work pending that empties the NEXT test's tree.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { I18nProvider } from '../../../i18n';
import ExecHome from '../ExecHome';
import { ACTIVE_PROJECTS_DELTA, ACTIVE_REGION } from '../../../lib/mockupFigures';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../../api/client', () => ({ get: jest.fn(), mutate: jest.fn() }));
jest.mock('../../../hooks/useCollection', () => ({ useCollection: jest.fn(() => []) }));
jest.mock('../../../api/projects', () => ({
  ...jest.requireActual('../../../api/projects'),
  refreshProjectsCache: jest.fn(async () => undefined),
  getMyProjects: jest.fn(),
}));
// The panel itself has its own spec; here it is stubbed down to the ONE thing this screen puts
// inside it — the `footer` slot, which carries the drawing's Mitigation and Dismiss buttons. A stub
// returning null would have hidden them, and did, until the buttons moved into the card on
// 2026-09-05.
jest.mock('../../PortfolioInsight', () => ({
  PortfolioInsight: ({ footer }: { footer?: React.ReactNode }) => footer ?? null,
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const client = require('../../../api/client') as { get: jest.Mock };
const projectsApi = require('../../../api/projects') as { getMyProjects: jest.Mock };
const collection = require('../../../hooks/useCollection') as { useCollection: jest.Mock };
/* eslint-enable @typescript-eslint/no-require-imports */

/** One `/analytics/executive` row. Utilisation over 100 is an overrun; `atRisk` is 0 | 1, never a boolean. */
function execRow(
  projectId: string,
  budget: string,
  actual: string,
  utilizationPct: number,
  atRisk: 0 | 1,
  overdueInvoiceCount = 0,
) {
  return {
    projectId,
    totalBudget: budget,
    totalActual: actual,
    totalCommitted: actual,
    utilizationPct,
    atRisk,
    overdueInvoiceCount,
  };
}

const PROJECTS = [
  { project_id: 'p-1', project_code: 'SKV45', project_name: 'Sukhumvit 45', progress_percent: 61 },
  {
    project_id: 'p-2',
    project_code: 'R9CT',
    project_name: 'Rama IX Tower',
    progress_percent: null,
  },
  {
    project_id: 'p-3',
    project_code: 'BNW2',
    project_name: 'Bangna Warehouse',
    progress_percent: 12,
  },
];

/** On track · at risk · over budget — one of each, so every card variant is drawn. */
const ROWS = [
  execRow('p-1', '1000.0000', '400.0000', 40, 0),
  execRow('p-2', '1000.0000', '900.0000', 90, 1, 2),
  execRow('p-3', '1000.0000', '1200.0000', 120, 1),
];

function renderScreen() {
  return render(
    <I18nProvider>
      <ExecHome />
    </I18nProvider>,
  );
}

describe('ExecHome', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    mockPush.mockReset();
    client.get.mockReset();
    projectsApi.getMyProjects.mockReset();
    collection.useCollection.mockReset();
    collection.useCollection.mockReturnValue([
      {
        id: '1',
        projectId: 'p-1',
        projectCode: 'SKV45',
        projectName: 'Sukhumvit 45',
        status: 'ACTIVE',
      },
      {
        id: '2',
        projectId: 'p-2',
        projectCode: 'R9CT',
        projectName: 'Rama IX Tower',
        status: 'ACTIVE',
      },
      {
        id: '3',
        projectId: 'p-3',
        projectCode: 'BNW2',
        projectName: 'Bangna',
        status: 'COMPLETED',
      },
    ]);
    client.get.mockResolvedValue(ROWS);
    projectsApi.getMyProjects.mockResolvedValue(PROJECTS);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => alert.mockRestore());

  it('counts only the ACTIVE projects in the cached list', async () => {
    const { getByTestId } = await renderScreen();
    // Three cached, two ACTIVE. The COMPLETED one must not be counted.
    await waitFor(() => expect(getByTestId('kpi-active-projects')).toHaveTextContent(/2/));
  });

  it('sums the portfolio budget and spend from the analytics rows', async () => {
    const { getByTestId } = await renderScreen();
    // 1000 + 1000 + 1000 budget against 400 + 900 + 1200 actual → 2500 spent of 3000, 16.7% left.
    // These totals are UNDER a million, which is the un-abbreviated half of the product owner's
    // rule: below ฿1,000,000 the hero prints the full grouped amount, cents and all.
    await waitFor(() => expect(getByTestId('kpi-budget')).toHaveTextContent(/3,000/));
    expect(getByTestId('kpi-budget')).toHaveTextContent(/2,500/);
    expect(getByTestId('kpi-budget')).toHaveTextContent(/16\.7/);
  });

  it('shortens the hero figures once the portfolio passes a million', async () => {
    // The other half of the same rule. ฿1,213,000,000 against ฿929,263,377 — the seeded tenant's
    // real totals — must read as a magnitude, not as fifteen digits in a 28px tile.
    //
    // BOTH IN MILLIONS (PO 2026-09-07). The budget would otherwise promote to `฿ 1.21 B` beside an
    // actual in `M`, and two units in one card cannot be compared at a glance.
    client.get.mockResolvedValue([execRow('p-1', '1213000000.0000', '929263377.0000', 76, 0)]);
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('kpi-budget')).toHaveTextContent(/1,213 M/));
    expect(getByTestId('kpi-budget')).toHaveTextContent(/929\.26 M/);
    // Neither the full grouped form nor a billion — a card showing both would show two figures.
    expect(getByTestId('kpi-budget')).not.toHaveTextContent(/1,213,000,000/);
    expect(getByTestId('kpi-budget')).not.toHaveTextContent(/B/);
  });

  it('keeps the exact amount at one million minus a satang', async () => {
    // The boundary the product owner set, asserted on the side that must NOT abbreviate.
    client.get.mockResolvedValue([execRow('p-1', '999999.9900', '100000.0000', 10, 0)]);
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('kpi-budget')).toHaveTextContent(/999,999\.99/));
  });

  it('marks both KPI tiles and every project card as leading somewhere', async () => {
    // The drawing puts a trailing mark on the two KPI tiles and a chevron on each project card.
    // Asserted through the icon stubs' testIDs, because a glyph has no text to match on.
    const { getByTestId, getAllByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('kpi-active-projects')).toBeTruthy());
    expect(getAllByTestId('icon-chevron-right').length).toBeGreaterThanOrEqual(2);
  });

  it('draws the project status as a pill rather than as coloured text', async () => {
    // The drawing gives the status a border and a tinted fill. The colour stays the status colour,
    // which is what the next assertion in this file relies on.
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('exec-home-project-p-3')).toHaveTextContent(/over/i));
  });

  it('splits risk into critical and warning by the rule alerts.tsx already documents', async () => {
    const { getByTestId } = await renderScreen();
    // p-3 is over 100% utilisation (critical); p-2 is flagged at-risk (warning); p-1 is neither.
    // A PLAIN COUNT since 2026-09-07, and no unit beside it: the heading names what is counted, so
    // the tile reads "RISKS / 2" rather than "05" or "2 Alerts".
    await waitFor(() => expect(getByTestId('kpi-risk-alerts')).toHaveTextContent(/2/));
    expect(getByTestId('kpi-risk-alerts')).not.toHaveTextContent(/02/);
    expect(getByTestId('kpi-risk-alerts')).not.toHaveTextContent(/Alerts/);
    expect(getByTestId('kpi-risk-alerts')).toHaveTextContent(/1/);
  });

  it('draws a card per project, with the status its own figures imply', async () => {
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('exec-home-project-p-1')).toBeTruthy());
    expect(getByTestId('exec-home-project-p-2')).toBeTruthy();
    expect(getByTestId('exec-home-project-p-3')).toBeTruthy();
    // p-3 spent 1200 of 1000 — the variance is +200 and the badge is the over-budget one.
    expect(getByTestId('exec-home-project-p-3')).toHaveTextContent(/200/);
  });

  it('says progress is not computable rather than drawing a zero', async () => {
    // §32.12 returns null when a project has no BOQ-linked task. Zero would read as "no work done".
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('exec-home-project-p-2')).toBeTruthy());
    expect(getByTestId('exec-home-project-p-1')).toHaveTextContent(/61/);
  });

  it('opens the portfolio when a project card is tapped', async () => {
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('exec-home-project-p-1')).toBeTruthy());
    await fireEvent.press(getByTestId('exec-home-project-p-1'));
    expect(mockPush).toHaveBeenCalledWith('/portfolio');
  });

  it('says so when the executive is a member of no project', async () => {
    projectsApi.getMyProjects.mockResolvedValue([]);
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('exec-home-projects-empty')).toBeTruthy());
  });

  it('shows em dashes, not zeros, when the analytics call fails', async () => {
    client.get.mockImplementation(() => Promise.reject(new Error('offline')));
    const { getByTestId } = await renderScreen();
    // A zero budget would read as "the portfolio has no money", which is not what "offline" means.
    await waitFor(() => expect(getByTestId('kpi-budget')).toHaveTextContent(/—/));
    expect(getByTestId('kpi-risk-alerts')).toHaveTextContent(/—/);
  });

  it('leaves the remaining share unknown rather than dividing by a zero budget', async () => {
    client.get.mockResolvedValue([execRow('p-1', '0.0000', '0.0000', 0, 0)]);
    const { getByTestId, queryByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('kpi-budget')).toHaveTextContent(/—/));
    // AND THE TRACK STAYS EMPTY. Both readings of a drawn bar would be a claim: full says every baht
    // is spent, empty says none is, and neither is what "there is no budget" means.
    expect(queryByTestId('kpi-budget-bar')).toBeNull();
    expect(queryByTestId('kpi-budget-bar-remaining')).toBeNull();
  });

  it('splits the budget track into spent and remaining, and the two fill it exactly', async () => {
    // ADDED 2026-09-07 with the two-segment bar. The single fill it replaced was sized to the
    // REMAINING share, so a bar that looked mostly full meant mostly UNSPENT — the opposite of how a
    // progress bar reads. Asserting the two widths together is what holds that: if the segments are
    // ever swapped again the spent share stops matching the ACTUAL line above it.
    client.get.mockResolvedValue([execRow('p-1', '1000.0000', '250.0000', 25, 0)]);
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('kpi-budget-bar')).toBeTruthy());
    const width = (id: string): unknown => {
      const style = getByTestId(id).props.style as Record<string, unknown>[];
      return style.flat().find((entry) => entry?.['width'] !== undefined)?.['width'];
    };
    expect(width('kpi-budget-bar')).toBe('25%');
    expect(width('kpi-budget-bar-remaining')).toBe('75%');
  });

  it('tolerates the wrapped {items} shape as well as the bare array', async () => {
    // The endpoint answers an array; the stub in home.spec.tsx claimed `{ items: [] }` for months and
    // nothing caught it, because the old screen mapped inside a promise chain that swallowed the
    // TypeError. Normalising here is what stops a shape change taking the screen down in render.
    client.get.mockResolvedValue({ items: ROWS });
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('kpi-budget')).toHaveTextContent(/3,000/));
  });

  it('prints the drawn figures unchanged, whatever the API returns', async () => {
    // THE ADR-099 GUARD. If either of these ever starts tracking an endpoint, this fails and the
    // decision gets revisited rather than drifting.
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('kpi-active-projects')).toBeTruthy());
    expect(getByTestId('kpi-active-projects')).toHaveTextContent(
      new RegExp(ACTIVE_PROJECTS_DELTA.value.replace('+', '\\+')),
    );
    expect(getByTestId('exec-home-locations')).toHaveTextContent(new RegExp(ACTIVE_REGION.value));
  });

  it('draws the filter control and admits it does nothing yet', async () => {
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('exec-home-filter')).toBeTruthy());
    await fireEvent.press(getByTestId('exec-home-filter'));
    expect(alert).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('offers Mitigation and Dismiss without letting either write', async () => {
    // Master §Phase 10 makes this role read-only on mobile. Both are drawn (PO 2026-09-04) and both
    // must stay inert — a press that reached an endpoint would breach that constraint silently.
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('exec-home-mitigation')).toBeTruthy());

    await fireEvent.press(getByTestId('exec-home-mitigation'));
    await fireEvent.press(getByTestId('exec-home-dismiss'));
    expect(alert).toHaveBeenCalledTimes(2);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('writes no state after the screen is unmounted mid-flight', async () => {
    // The `cancelled` guards in the effect, exercised where they actually matter: an executive who
    // leaves the tab before a slow portfolio query answers. Without them React logs a state update
    // on an unmounted component, and on a screen with four in-flight requests that is four warnings
    // and a real leak.
    let release: (value: never) => void = () => undefined;
    projectsApi.getMyProjects.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const view = await renderScreen();
    view.unmount();
    release([] as never);
    await waitFor(() => expect(true).toBe(true));
  });

  it('keeps the cached project count when the project list is unreachable', async () => {
    // `local_projects` is the offline cache and the Active-projects tile reads it, so that figure
    // must survive a failed `/projects/mine` — it is the one number this screen owns offline.
    projectsApi.getMyProjects.mockImplementation(() => Promise.reject(new Error('offline')));
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('kpi-active-projects')).toHaveTextContent(/2/));
    expect(getByTestId('exec-home-projects-empty')).toBeTruthy();
  });

  it('asks the analytics endpoint for the executive OWN projects, by id', async () => {
    // THE DEFECT THIS GUARDS. `GET /analytics/executive` filters `project_id IN ({projectIds})`, and
    // the controller turns a missing `projectIds` into an EMPTY ARRAY — so the IN clause matches
    // nothing and the endpoint answers 200 with []. The screen then renders every budget figure as
    // an em dash and looks exactly like being offline. The first capture of this dashboard was blank
    // for precisely that reason.
    await renderScreen();
    await waitFor(() => expect(client.get).toHaveBeenCalled());

    const analyticsCall = client.get.mock.calls.find((call: unknown[]) =>
      String(call[0]).startsWith('/analytics/executive'),
    );
    expect(analyticsCall).toBeDefined();
    const url = String(analyticsCall![0]);
    for (const project of PROJECTS) {
      expect(url).toContain(`projectIds=${project.project_id}`);
    }
  });

  it('does not call analytics at all when the executive has no projects', async () => {
    // Sending no ids would return [] and read as "the portfolio has no money" rather than "there is
    // no portfolio", so the call is skipped entirely.
    projectsApi.getMyProjects.mockResolvedValue([]);
    await renderScreen();
    await waitFor(() => expect(projectsApi.getMyProjects).toHaveBeenCalled());
    expect(
      client.get.mock.calls.filter((call: unknown[]) =>
        String(call[0]).startsWith('/analytics/executive'),
      ),
    ).toHaveLength(0);
  });
});
