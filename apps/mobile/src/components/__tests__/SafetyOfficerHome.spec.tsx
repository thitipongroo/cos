// Behaviour of the Safety Officer's Home.
//
// THIS DASHBOARD IS MOSTLY HONEST ABSENCE, AND THAT IS THE DESIGN. The drawing has three KPI tiles;
// only one of them can be filled:
//
//   OPEN INCIDENTS   real — `GET /safety/compliance` returns `open_incidents`, a COUNT(*) over
//                    site_ops.incidents where status = 'OPEN'.
//   COMPLIANCE 94%   THERE IS NO COMPLIANCE SCORE IN THIS PLATFORM. The endpoint named "compliance"
//                    returns four counts and no percentage, and no formula for one exists anywhere
//                    in the specs.
//   SAFE HOURS       nothing records working hours against a lost-time injury; "LTI" appears
//                    nowhere in the specs at all.
//
// A substitute was available and deliberately NOT taken: `high_critical_incidents` and
// `expired_permits` are real and would fill those two slots — but they are not what the tiles say
// they are, and a safety dashboard that answers a question with a different question is worse than
// one that says it cannot answer. The tests below therefore assert that the two tiles stay EMPTY and
// EXPLAINED, because the pressure on a screen like this is always to put something in the hole.
//
// THE CHECKLIST IS HALF REAL AND DRAWN THAT WAY. Its rows come from `GET /safety/checklists` and are
// the project's actual items; its boxes are all UNTICKED, because `site_ops.inspections` records ONE
// result per checklist and not a per-item state — so a tick would assert something no record
// supports, on the one screen where an unearned tick means someone believes a check was done.
//
// AND IT LOADS ON FOCUS, NOT ON MOUNT: a load fired once immediately after sign-in can lose the race
// with the session and leave the dashboard permanently empty, with no way to retry but killing the
// app.

import { render, fireEvent, waitFor, within } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import { useProjectStore } from '../../store/projectStore';
import SafetyOfficerHome from '../SafetyOfficerHome';

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  // Required INSIDE the factory: jest hoists jest.mock above the imports, so a `useEffect` bound at
  // module scope is not initialised when the factory runs.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const react = require('react') as typeof import('react');
  return {
    useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
    // The real one needs a navigation container; the screen only wants "run this when the tab is
    // shown", and on a mounted test tree that is the mount.
    useFocusEffect: (callback: () => void | (() => void)) => react.useEffect(callback, [callback]),
  };
});

jest.mock('../../api/client', () => ({ get: jest.fn(), post: jest.fn(), mutate: jest.fn() }));
jest.mock('../../api/safety', () => ({
  getCompliance: jest.fn(),
  listIncidents: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../api/client') as { get: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const safety = require('../../api/safety') as {
  getCompliance: jest.Mock;
  listIncidents: jest.Mock;
};

function compliance(over: Record<string, unknown> = {}) {
  return {
    open_incidents: 4,
    high_critical_incidents: 1,
    expired_permits: 0,
    pending_permits: 2,
    ...over,
  };
}

function incident(over: Record<string, unknown> = {}) {
  return {
    incident_id: 'i-1',
    project_id: 'proj-1',
    task_id: null,
    incident_type: 'FALL',
    severity: 'HIGH',
    reported_by: 'u-1',
    status: 'OPEN',
    acknowledged_by: null,
    acknowledged_at: null,
    created_at: '2026-08-19T08:00:00Z',
    ...over,
  };
}

function renderHome() {
  return render(
    <I18nProvider>
      <SafetyOfficerHome />
    </I18nProvider>,
  );
}

describe('SafetyOfficerHome', () => {
  beforeEach(() => {
    mockPush.mockReset();
    client.get.mockReset().mockResolvedValue({ items: [] });
    safety.getCompliance.mockReset().mockResolvedValue(compliance());
    safety.listIncidents.mockReset().mockResolvedValue([]);
    useProjectStore.setState({
      active: { projectId: 'proj-1', projectName: 'Riverside Tower' },
    } as never);
  });

  it('renders the dashboard once the figures land', async () => {
    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('kpi-open-incidents')).toBeTruthy());
    expect(getByTestId('home-checklist-card')).toBeTruthy();
    expect(getByTestId('home-report-incident-fab')).toBeTruthy();
  });

  // ── THE ONE TILE THAT CAN BE FILLED ──────────────────────────────────────────────────────────

  it('shows the open incident count the query answers', async () => {
    safety.getCompliance.mockResolvedValue(compliance({ open_incidents: 4 }));

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('kpi-open-incidents')).toBeTruthy());
    expect(within(getByTestId('kpi-open-incidents')).getByText('4')).toBeTruthy();
  });

  // "No open incidents" and "not loaded" are different facts and must not print the same — on this
  // screen the first one is what sends a safety officer home for the day.
  it('shows a dash rather than a zero when the count has not arrived', async () => {
    safety.getCompliance.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('kpi-open-incidents')).toBeTruthy());
    expect(within(getByTestId('kpi-open-incidents')).getByText('—')).toBeTruthy();
  });

  it('shows a real zero as zero', async () => {
    safety.getCompliance.mockResolvedValue(compliance({ open_incidents: 0 }));

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('kpi-open-incidents')).toBeTruthy());
    expect(within(getByTestId('kpi-open-incidents')).getByText('0')).toBeTruthy();
  });

  it('opens the incidents list from the tile', async () => {
    const { getByTestId } = await renderHome();
    await waitFor(() => expect(getByTestId('kpi-open-incidents')).toBeTruthy());

    await fireEvent.press(getByTestId('kpi-open-incidents'));

    expect(mockPush).toHaveBeenCalledWith('/incidents');
  });

  // ── THE TWO TILES THAT CANNOT ───────────────────────────────────────────────────────────────
  //
  // Drawn with the mockup's own label and stating plainly that they are not ready (PO 2026-08-13).
  // The failure mode being guarded is a later change quietly filling them with a number that fits.

  it.each([
    ['kpi-compliance', 'kpi-compliance-unavailable'],
    ['kpi-safe-hours', 'kpi-safe-hours-unavailable'],
  ])('draws %s and says it is not ready', async (tile, note) => {
    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId(tile)).toBeTruthy());
    expect(getByTestId(note)).toBeTruthy();
  });

  // The two real figures the endpoint DOES return are the ones that were offered for these slots
  // and refused. Neither may appear on a tile that says something else.
  it('never fills the empty tiles with the figures it happens to have', async () => {
    safety.getCompliance.mockResolvedValue(
      compliance({ high_critical_incidents: 94, expired_permits: 12 }),
    );

    const { getByTestId } = await renderHome();
    await waitFor(() => expect(getByTestId('kpi-compliance')).toBeTruthy());

    expect(within(getByTestId('kpi-compliance')).queryByText('94')).toBeNull();
    expect(within(getByTestId('kpi-safe-hours')).queryByText('12')).toBeNull();
  });

  // ── THE CHECKLIST ────────────────────────────────────────────────────────────────────────────

  it('lists the project checklist rows', async () => {
    client.get.mockResolvedValue({
      items: [
        {
          checklist_id: 'c-1',
          checklist_name: 'Daily',
          items: [{ item_id: 'i1', description: 'Scaffold tags checked' }],
        },
      ],
    });

    const { getByText } = await renderHome();

    await waitFor(() => expect(getByText('Scaffold tags checked')).toBeTruthy());
  });

  // Every box unticked, because nothing stores whether an item was done. A ticked box on a SAFETY
  // checklist is a record that a check happened.
  it('leaves every box unticked, because nothing records that a check happened', async () => {
    client.get.mockResolvedValue({
      items: [
        {
          checklist_id: 'c-1',
          checklist_name: 'Daily',
          items: [{ description: 'Scaffold tags checked' }, { description: 'Edge protection' }],
        },
      ],
    });

    const { getByTestId, getAllByText, queryByText } = await renderHome();
    await waitFor(() => expect(getByTestId('home-checklist-card')).toBeTruthy());

    expect(getAllByText('check-box-outline-blank').length).toBe(2);
    expect(queryByText('check-box')).toBeNull();
  });

  // The drawing's "6/8 TASKS" chip cannot exist: inspections record ONE result per checklist, not a
  // per-item state, so nothing can count six of eight. The chip's place carries the explanation.
  it('explains the progress chip rather than inventing a fraction', async () => {
    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('home-checklist-progress-unavailable')).toBeTruthy());
  });

  // A malformed template is a server-side data problem, and this is the screen a safety officer
  // opens the app to — it renders no rows rather than crashing.
  it('survives a checklist template that is not readable', async () => {
    client.get.mockResolvedValue({
      items: [{ checklist_id: 'c-1', checklist_name: 'Daily', items: '{not json' }],
    });

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('home-checklist-empty')).toBeTruthy());
  });

  // The template is stored as JSONB and can arrive as a STRING; both are the same list.
  it('reads a template that arrived as a JSON string', async () => {
    client.get.mockResolvedValue({
      items: [
        {
          checklist_id: 'c-1',
          checklist_name: 'Daily',
          items: JSON.stringify([{ description: 'Harness inspected' }]),
        },
      ],
    });

    const { getByText } = await renderHome();

    await waitFor(() => expect(getByText('Harness inspected')).toBeTruthy());
  });

  // An item with no wording still needs to be countable — a blank row would silently shorten the
  // checklist a reader is working down.
  it('numbers an item that carries no description', async () => {
    client.get.mockResolvedValue({
      items: [{ checklist_id: 'c-1', checklist_name: 'Daily', items: [{}] }],
    });

    const { getByText } = await renderHome();

    await waitFor(() => expect(getByText('#1')).toBeTruthy());
  });

  it('says the checklist is empty when the project has none', async () => {
    client.get.mockResolvedValue({ items: [] });

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('home-checklist-empty')).toBeTruthy());
  });

  it('opens the inspections screen from the checklist card', async () => {
    const { getByTestId } = await renderHome();
    await waitFor(() => expect(getByTestId('home-checklist-card')).toBeTruthy());

    await fireEvent.press(getByTestId('home-checklist-card'));

    expect(mockPush).toHaveBeenCalledWith('/inspections');
  });

  // ── RECENT INCIDENTS ─────────────────────────────────────────────────────────────────────────

  // SEVERITY FIRST, then newest. A safety dashboard ordered by time alone would push a critical
  // incident off the preview because three trivial ones were logged after it.
  it('puts the worst incident first, not the newest', async () => {
    safety.listIncidents.mockResolvedValue([
      incident({ incident_id: 'i-low', severity: 'LOW', created_at: '2026-08-20T09:00:00Z' }),
      incident({
        incident_id: 'i-critical',
        severity: 'CRITICAL',
        created_at: '2026-08-18T09:00:00Z',
      }),
    ]);

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('home-incident-i-critical')).toBeTruthy());
    expect(getByTestId('home-incident-i-low')).toBeTruthy();
  });

  // Three, because this is a preview inside a dashboard — the list behind "View all" is the list.
  it('previews only the first three', async () => {
    safety.listIncidents.mockResolvedValue([
      incident({ incident_id: 'i-1' }),
      incident({ incident_id: 'i-2' }),
      incident({ incident_id: 'i-3' }),
      incident({ incident_id: 'i-4' }),
    ]);

    const { getByTestId, queryByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('home-incident-i-1')).toBeTruthy());
    expect(queryByTestId('home-incident-i-4')).toBeNull();
  });

  it('says there are none rather than showing an empty space', async () => {
    safety.listIncidents.mockResolvedValue([]);

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('home-no-incidents')).toBeTruthy());
  });

  it('opens the full list from View all', async () => {
    const { getByTestId } = await renderHome();
    await waitFor(() => expect(getByTestId('home-incidents-view-all')).toBeTruthy());

    await fireEvent.press(getByTestId('home-incidents-view-all'));

    expect(mockPush).toHaveBeenCalledWith('/incidents');
  });

  // The drawing's "+ REPORT NEW". It opens Incidents, which is where an incident is created.
  it('reports a new incident from the FAB', async () => {
    const { getByTestId } = await renderHome();
    await waitFor(() => expect(getByTestId('home-report-incident-fab')).toBeTruthy());

    await fireEvent.press(getByTestId('home-report-incident-fab'));

    expect(mockPush).toHaveBeenCalledWith('/incidents');
  });

  // ── SCOPE ────────────────────────────────────────────────────────────────────────────────────

  // Scoped to the site the bar above names. An unscoped dashboard would count another project's
  // incidents under this project's heading.
  it('scopes every figure to the site the bar names', async () => {
    const { getByTestId } = await renderHome();
    await waitFor(() => expect(getByTestId('kpi-open-incidents')).toBeTruthy());

    expect(safety.getCompliance).toHaveBeenCalledWith('proj-1');
    expect(safety.listIncidents).toHaveBeenCalledWith({ projectId: 'proj-1' });
    expect(client.get).toHaveBeenCalledWith('/safety/checklists', { project_id: 'proj-1' });
  });

  // Unscoped while no project is chosen, which is the honest thing to show then.
  it('asks unscoped while no site is chosen', async () => {
    useProjectStore.setState({ active: null } as never);

    const { getByTestId } = await renderHome();
    await waitFor(() => expect(getByTestId('kpi-open-incidents')).toBeTruthy());

    expect(safety.getCompliance).toHaveBeenCalledWith(undefined);
    expect(safety.listIncidents).toHaveBeenCalledWith(undefined);
  });

  // ── RULE 40 ──────────────────────────────────────────────────────────────────────────────────

  // Each catch resolves, so the dashboard settles offline rather than holding a skeleton forever —
  // which on this screen would be indistinguishable from a site with nothing wrong.
  it('settles even when every request fails', async () => {
    client.get.mockRejectedValue(new Error('offline'));
    safety.getCompliance.mockRejectedValue(new Error('offline'));
    safety.listIncidents.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('kpi-open-incidents')).toBeTruthy());
    expect(getByTestId('home-no-incidents')).toBeTruthy();
  });
});
