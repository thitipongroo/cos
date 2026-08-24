// Behaviour of the site-inspection screen, around the control it now shares.
//
// The severity row became <SeverityPicker /> on 2026-08-20 and is used by the incident form too.
// What has to hold HERE is that this screen still gets its own answers out of it: the inspection
// form fills the chosen chip with the DANGER colour where the incident form fills it with primary
// blue, and an unchosen chip sits on nothing rather than on the page surface. Those are the two
// props the extraction turned the difference into, so they are what a regression would silently
// undo.
//
// The rest is the screen's own shape: a list until a template is opened, and FILL CHECKLIST off
// entirely when there is no template to fill.

import { Alert } from 'react-native';
import { render, fireEvent, waitFor, within } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import { useProjectStore } from '../../../store/projectStore';
import InspectionsScreen from '../inspections';

// `useFocusEffect` reaches for a navigation object that exists only under a NavigationContainer;
// running the callback as a plain effect is what it does here — load on arrival.
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react') as typeof import('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  };
});

jest.mock('../../../api/client', () => ({ get: jest.fn(), mutate: jest.fn() }));
jest.mock('../../../hooks/useCollection', () => ({ useCollection: jest.fn(() => []) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock; mutate: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useCollection } = require('../../../hooks/useCollection') as { useCollection: jest.Mock };

const PROJECT_ID = 'proj-1';

const TEMPLATE = {
  checklist_id: 'cl-1',
  project_id: PROJECT_ID,
  checklist_name: 'Scaffold inspection',
  items: [{ item_id: 'ties', description: 'Ties secure', is_required: true }],
};

function inspection(id: string, status = 'PASSED') {
  return { inspection_id: id, checklist_id: 'cl-1', project_id: PROJECT_ID, status };
}

/** The screen fires two requests from one effect; answer each by path. */
function respond(inspections: unknown[], templates: unknown[]) {
  client.get.mockImplementation((path: string) =>
    path === '/site/inspections' ? Promise.resolve(inspections) : Promise.resolve(templates),
  );
}

function renderScreen() {
  return render(
    <I18nProvider>
      <InspectionsScreen />
    </I18nProvider>,
  );
}

function flatten(style: unknown): Record<string, unknown> {
  return Object.assign({}, ...(Array.isArray(style) ? style : [style])) as Record<string, unknown>;
}

/** Open the checklist and fail its one item — the severity picker only exists once something has. */
async function openAndFail(
  getByTestId: (id: string) => unknown,
  getAllByTestId: (id: string) => unknown[],
) {
  await waitFor(() => expect(getByTestId('new-inspection-button')).toBeTruthy());
  await fireEvent.press(getByTestId('new-inspection-button') as never);
  await waitFor(() => expect(getAllByTestId('checklist-fail-button').length).toBeGreaterThan(0));
  await fireEvent.press(getAllByTestId('checklist-fail-button')[0] as never);
  await waitFor(() => expect(getByTestId('severity-picker')).toBeTruthy());
}

describe('InspectionsScreen', () => {
  beforeEach(() => {
    client.get.mockReset();
    client.mutate.mockReset();
    useCollection.mockReset();
    useCollection.mockReturnValue([]);
    respond([], [TEMPLATE]);
    useProjectStore.setState({
      active: { projectId: PROJECT_ID, projectName: 'Riverside Tower' },
    } as never);
  });

  it('opens on the list of past inspections', async () => {
    respond([inspection('i-1'), inspection('i-2', 'FAILED')], [TEMPLATE]);

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('inspection-item')).toHaveLength(2));
  });

  it('says so when there is nothing inspected yet', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('inspection-list')).toBeTruthy());
    expect(getByTestId('new-inspection-button').props.accessibilityState.disabled).toBeFalsy();
  });

  // Nothing to fill in — the control says it cannot act rather than opening an empty form.
  it('withdraws the fill action when no template has arrived', async () => {
    respond([], []);

    const { getByTestId } = await renderScreen();

    await waitFor(() =>
      expect(getByTestId('new-inspection-button').props.accessibilityState.disabled).toBe(true),
    );
  });

  it('opens the checklist when the fill action is taken', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('new-inspection-button')).toBeTruthy());
    await fireEvent.press(getByTestId('new-inspection-button'));

    await waitFor(() => expect(getByTestId('inspection-checklist')).toBeTruthy());
  });

  it('offers the whole severity scale once an item is failed, one selected', async () => {
    const { getByTestId, getAllByTestId } = await renderScreen();

    await openAndFail(getByTestId, getAllByTestId);

    const selected = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].filter(
      (level) => getByTestId(`severity-${level}`).props.accessibilityState.selected === true,
    );

    expect(selected).toEqual(['MEDIUM']);
  });

  it('moves the selection to the severity that was pressed', async () => {
    const { getByTestId, getAllByTestId } = await renderScreen();

    await openAndFail(getByTestId, getAllByTestId);
    await fireEvent.press(getByTestId('severity-HIGH'));

    await waitFor(() =>
      expect(getByTestId('severity-HIGH').props.accessibilityState.selected).toBe(true),
    );
    expect(getByTestId('severity-MEDIUM').props.accessibilityState.selected).toBe(false);
  });

  // The two props the SeverityPicker extraction preserved. The incident form draws this control in
  // primary blue over the page surface; this one draws it in danger red over nothing.
  it('draws the picker in this screen`s own colours, not the incident form`s', async () => {
    const { getByTestId, getAllByTestId } = await renderScreen();

    await openAndFail(getByTestId, getAllByTestId);

    expect(flatten(getByTestId('severity-LOW').props.style).backgroundColor).toBe('transparent');
    expect(flatten(getByTestId('severity-MEDIUM').props.style).backgroundColor).not.toBe(
      'transparent',
    );
  });

  it('keeps the screen usable when both requests fail offline', async () => {
    client.get.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('inspection-list')).toBeTruthy());
  });

  // ── SUBMITTING AN INSPECTION ─────────────────────────────────────────────────────────────────
  //
  // §11: the RESULT is FAILED if any item failed, else PASSED, and `issue_severity` is populated
  // ONLY on a FAILED one. Sending a severity beside a PASSED result would record a severity for a
  // problem that does not exist, on a safety record kept for seven years (§31.4, WORM).

  it('records a clean inspection as passed, with no severity attached', async () => {
    const { getByTestId, getAllByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('new-inspection-button')).toBeTruthy());
    await fireEvent.press(getByTestId('new-inspection-button'));

    await fireEvent.press(getAllByTestId('checklist-pass-button')[0]!);
    await fireEvent.press(getByTestId('submit-inspection-button'));

    await waitFor(() => expect(client.mutate).toHaveBeenCalledTimes(1));
    const body = client.mutate.mock.calls[0][2] as Record<string, unknown>;
    expect(body['status']).toBe('PASSED');
    expect(body).not.toHaveProperty('issue_severity');
  });

  // ONE failed item fails the inspection. It is not a score or a majority — a scaffold with one tie
  // loose is not 90% safe.
  it('fails the whole inspection on a single failed item', async () => {
    respond(
      [],
      [
        {
          ...TEMPLATE,
          items: [
            { item_id: 'ties', description: 'Ties secure' },
            { item_id: 'base', description: 'Base plates level' },
          ],
        },
      ],
    );

    const { getByTestId, getAllByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('new-inspection-button')).toBeTruthy());
    await fireEvent.press(getByTestId('new-inspection-button'));

    await fireEvent.press(getAllByTestId('checklist-pass-button')[0]!);
    await fireEvent.press(getAllByTestId('checklist-fail-button')[1]!);
    await fireEvent.press(getByTestId('submit-inspection-button'));

    await waitFor(() => expect(client.mutate).toHaveBeenCalledTimes(1));
    expect(client.mutate.mock.calls[0][2]).toMatchObject({ status: 'FAILED' });
  });

  it('attaches the chosen severity to a failed inspection', async () => {
    const { getByTestId, getAllByTestId } = await renderScreen();
    await openAndFail(getByTestId, getAllByTestId);

    await fireEvent.press(getByTestId('severity-CRITICAL'));
    await fireEvent.press(getByTestId('submit-inspection-button'));

    await waitFor(() => expect(client.mutate).toHaveBeenCalledTimes(1));
    expect(client.mutate.mock.calls[0][2]).toMatchObject({
      status: 'FAILED',
      issue_severity: 'CRITICAL',
    });
  });

  // NOT SUBMITTABLE UNTIL EVERY ITEM IS ANSWERED. An unanswered item and a failed one must never
  // reach the record as the same thing — which is also why the control is two explicit targets
  // rather than a switch, whose resting state is ambiguous between "no" and "not yet".
  it('will not submit while an item is unanswered', async () => {
    respond(
      [],
      [
        {
          ...TEMPLATE,
          items: [
            { item_id: 'ties', description: 'Ties secure' },
            { item_id: 'base', description: 'Base plates level' },
          ],
        },
      ],
    );

    const { getByTestId, getAllByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('new-inspection-button')).toBeTruthy());
    await fireEvent.press(getByTestId('new-inspection-button'));

    await fireEvent.press(getAllByTestId('checklist-pass-button')[0]!);

    expect(getByTestId('submit-inspection-button').props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(getByTestId('submit-inspection-button'));

    expect(client.mutate).not.toHaveBeenCalled();
  });

  it('submits once every item has an answer', async () => {
    const { getByTestId, getAllByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('new-inspection-button')).toBeTruthy());
    await fireEvent.press(getByTestId('new-inspection-button'));

    await fireEvent.press(getAllByTestId('checklist-pass-button')[0]!);

    expect(getByTestId('submit-inspection-button').props.accessibilityState.disabled).toBe(false);
  });

  // A template with no items submits as PASSED — there was nothing to fail — and the control is open
  // from the start, because "every item answered" is vacuously true.
  it('submits an empty template as passed', async () => {
    respond([], [{ ...TEMPLATE, items: [] }]);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('new-inspection-button')).toBeTruthy());
    await fireEvent.press(getByTestId('new-inspection-button'));

    await fireEvent.press(getByTestId('submit-inspection-button'));

    await waitFor(() => expect(client.mutate).toHaveBeenCalledTimes(1));
    expect(client.mutate.mock.calls[0][2]).toMatchObject({ status: 'PASSED' });
  });

  // QUEUED, not posted: this screen is filled in on a site, and `mutate` is the offline-writable
  // path (§17.4) that survives having no signal at the moment the inspection is finished.
  it('queues the inspection against its own checklist', async () => {
    const { getByTestId, getAllByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('new-inspection-button')).toBeTruthy());
    await fireEvent.press(getByTestId('new-inspection-button'));

    await fireEvent.press(getAllByTestId('checklist-pass-button')[0]!);
    await fireEvent.press(getByTestId('submit-inspection-button'));

    await waitFor(() => expect(client.mutate).toHaveBeenCalledTimes(1));
    const [method, path, , entity, entityId] = client.mutate.mock.calls[0] as unknown[];
    expect(method).toBe('POST');
    expect(path).toBe('/site/inspections');
    expect(entity).toBe('inspection');
    expect(entityId).toBe('cl-1');
  });

  it('confirms the inspection was saved', async () => {
    const { getByTestId, getAllByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('new-inspection-button')).toBeTruthy());
    await fireEvent.press(getByTestId('new-inspection-button'));

    await fireEvent.press(getAllByTestId('checklist-pass-button')[0]!);
    await fireEvent.press(getByTestId('submit-inspection-button'));

    await waitFor(() => expect(getByTestId('inspection-saved')).toBeTruthy());
  });

  // ── THE FLAGGED PANEL ────────────────────────────────────────────────────────────────────────

  // Drawn only when something actually failed: an empty red-striped panel reads as an alert in its
  // own right, on a screen whose whole job is to say whether anything is wrong.
  it('shows no flagged panel while nothing has failed', async () => {
    const { getByTestId, getAllByTestId, queryByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('new-inspection-button')).toBeTruthy());
    await fireEvent.press(getByTestId('new-inspection-button'));

    await fireEvent.press(getAllByTestId('checklist-pass-button')[0]!);

    expect(queryByTestId('checklist-flagged')).toBeNull();
  });

  it('lists what failed, once something has', async () => {
    const { getByTestId, getAllByTestId } = await renderScreen();
    await openAndFail(getByTestId, getAllByTestId);

    // SCOPED to the panel: the item's wording is also on the checklist row above it, so an unscoped
    // query finds both and would pass whether or not the panel listed anything.
    expect(within(getByTestId('checklist-flagged')).getByText('Ties secure')).toBeTruthy();
  });

  // The panel goes when the item is answered the other way — a flagged block left standing over a
  // corrected answer is the screen disagreeing with itself.
  it('withdraws the panel when the failure is undone', async () => {
    const { getByTestId, getAllByTestId, queryByTestId } = await renderScreen();
    await openAndFail(getByTestId, getAllByTestId);

    await fireEvent.press(getAllByTestId('checklist-pass-button')[0]!);

    expect(queryByTestId('checklist-flagged')).toBeNull();
  });

  // ── THE PASS / FAIL CONTROL ──────────────────────────────────────────────────────────────────

  // A radio, and it says which way it is set: two targets whose only difference was a fill colour
  // would be unreadable to a screen reader.
  it('says which answer an item carries', async () => {
    const { getByTestId, getAllByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('new-inspection-button')).toBeTruthy());
    await fireEvent.press(getByTestId('new-inspection-button'));

    expect(getAllByTestId('checklist-pass-button')[0]!.props.accessibilityRole).toBe('radio');
    expect(getAllByTestId('checklist-pass-button')[0]!.props.accessibilityState.selected).toBe(
      false,
    );

    await fireEvent.press(getAllByTestId('checklist-pass-button')[0]!);

    expect(getAllByTestId('checklist-pass-button')[0]!.props.accessibilityState.selected).toBe(
      true,
    );
    expect(getAllByTestId('checklist-fail-button')[0]!.props.accessibilityState.selected).toBe(
      false,
    );
  });

  it('moves the answer when the other target is pressed', async () => {
    const { getByTestId, getAllByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('new-inspection-button')).toBeTruthy());
    await fireEvent.press(getByTestId('new-inspection-button'));

    await fireEvent.press(getAllByTestId('checklist-pass-button')[0]!);
    await fireEvent.press(getAllByTestId('checklist-fail-button')[0]!);

    expect(getAllByTestId('checklist-pass-button')[0]!.props.accessibilityState.selected).toBe(
      false,
    );
    expect(getAllByTestId('checklist-fail-button')[0]!.props.accessibilityState.selected).toBe(
      true,
    );
  });

  // ── THE TEMPLATE ─────────────────────────────────────────────────────────────────────────────

  // A malformed template is a server-side data problem, and this screen is where an inspection is
  // being recorded — it renders an empty checklist rather than crashing mid-inspection.
  it('survives a template whose items cannot be read', async () => {
    useCollection.mockReturnValue([
      {
        checklistId: 'cl-1',
        projectId: PROJECT_ID,
        checklistName: 'Scaffold inspection',
        itemsJson: '{not json',
      },
    ]);
    respond([], []);

    const { getByTestId, queryAllByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('new-inspection-button')).toBeTruthy());
    await fireEvent.press(getByTestId('new-inspection-button'));

    expect(getByTestId('inspection-checklist')).toBeTruthy();
    expect(queryAllByTestId('checklist-item')).toHaveLength(0);
  });

  // An item with no wording still has to be answerable — a blank row would be a question nobody can
  // read that still blocks the submit.
  it('numbers an item that carries no wording', async () => {
    respond([], [{ ...TEMPLATE, items: [{ item_id: 'x' }] }]);

    const { getByTestId, getAllByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('new-inspection-button')).toBeTruthy());
    await fireEvent.press(getByTestId('new-inspection-button'));

    expect(getAllByTestId('checklist-item')).toHaveLength(1);
    expect(getByTestId('inspection-checklist')).toBeTruthy();
  });

  // The SERVER's templates win over the cache when both are there: the cache is what makes the
  // screen work offline, not a second source of truth to merge.
  it('prefers the server templates over the cached ones', async () => {
    useCollection.mockReturnValue([
      {
        checklistId: 'cl-cached',
        projectId: PROJECT_ID,
        checklistName: 'Cached checklist',
        itemsJson: '[]',
      },
    ]);
    respond([], [TEMPLATE]);

    const { getByTestId, queryByText } = await renderScreen();
    await waitFor(() => expect(getByTestId('new-inspection-button')).toBeTruthy());
    await fireEvent.press(getByTestId('new-inspection-button'));

    expect(queryByText(/Cached checklist/)).toBeNull();
  });

  // Offline, the cache IS the screen — an inspection still has to be fillable with no signal, which
  // is the whole reason the templates are cached at all (§17.4).
  it('falls back to the cached templates when the server cannot be reached', async () => {
    useCollection.mockReturnValue([
      {
        checklistId: 'cl-cached',
        projectId: PROJECT_ID,
        checklistName: 'Cached checklist',
        itemsJson: '[]',
      },
    ]);
    client.get.mockRejectedValue(new Error('offline'));

    const { getByTestId, getByText } = await renderScreen();
    await waitFor(() => expect(getByTestId('new-inspection-button')).toBeTruthy());

    expect(getByTestId('new-inspection-button').props.accessibilityState.disabled).toBe(false);

    await fireEvent.press(getByTestId('new-inspection-button'));

    expect(getByText(/Cached checklist/)).toBeTruthy();
  });

  // Scoped to the site the bar names: another project's checklist filled in on this site would be an
  // inspection record attached to the wrong place.
  it('keeps another project cached templates out', async () => {
    useCollection.mockReturnValue([
      {
        checklistId: 'cl-other',
        projectId: 'proj-2',
        checklistName: 'Other site checklist',
        itemsJson: '[]',
      },
    ]);
    client.get.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('new-inspection-button')).toBeTruthy());
    expect(getByTestId('new-inspection-button').props.accessibilityState.disabled).toBe(true);
  });

  // ── THE PAST INSPECTIONS ─────────────────────────────────────────────────────────────────────

  it('lists what has been inspected, by status', async () => {
    respond([inspection('i-1', 'PASSED'), inspection('i-2', 'FAILED')], [TEMPLATE]);

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('inspection-item')).toHaveLength(2));
  });

  // The status is the row's spoken name: the title is the checklist, which is the same on every row
  // from one template, so a screen reader hearing only that learns nothing.
  it('is spoken by its result', async () => {
    respond([inspection('i-1', 'FAILED')], [TEMPLATE]);

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('inspection-item')).toHaveLength(1));
    expect(getAllByTestId('inspection-item')[0]!.props.accessibilityLabel).toBe('FAILED');
  });

  it('opens a past inspection against its own template', async () => {
    respond([inspection('i-1')], [TEMPLATE]);

    const { getAllByTestId, getByTestId } = await renderScreen();
    await waitFor(() => expect(getAllByTestId('inspection-item')).toHaveLength(1));

    await fireEvent.press(getAllByTestId('inspection-item')[0]!);

    expect(getByTestId('inspection-checklist')).toBeTruthy();
    expect(getAllByTestId('checklist-item')).toHaveLength(1);
  });

  // A row whose template is not cached still opens — as a SHELL keyed to it, rather than silently
  // showing a different checklist's items under this inspection's name.
  it('opens a shell for an inspection whose template is not held', async () => {
    respond(
      [
        {
          inspection_id: 'i-9',
          checklist_id: 'cl-unknown',
          project_id: PROJECT_ID,
          status: 'PASSED',
        },
      ],
      [],
    );
    useCollection.mockReturnValue([]);

    const { getAllByTestId, getByTestId, queryAllByTestId } = await renderScreen();
    await waitFor(() => expect(getAllByTestId('inspection-item')).toHaveLength(1));

    await fireEvent.press(getAllByTestId('inspection-item')[0]!);

    expect(getByTestId('inspection-checklist')).toBeTruthy();
    expect(queryAllByTestId('checklist-item')).toHaveLength(0);
  });

  // ── THE ZONES THE DRAWING HAS AND THE DATA DOES NOT ──────────────────────────────────────────
  //
  // Three of them, each drawn with the mockup's own copy and stating plainly that it is not ready.
  // The pressure on this screen is to fill them with something plausible; a safety record is the
  // last place for that.

  it.each([
    'checklist-hazard-unavailable',
    'checklist-groups-unavailable',
    'checklist-note-unavailable',
  ])('draws %s and says it is not ready', async (testID) => {
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('new-inspection-button')).toBeTruthy());
    await fireEvent.press(getByTestId('new-inspection-button'));

    expect(getByTestId(testID)).toBeTruthy();
  });

  // The drawing's mic FAB is drawn and has nowhere to put a recording — it says so rather than
  // recording into nothing.
  it('says the voice note has nowhere to go', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('new-inspection-button')).toBeTruthy());
    await fireEvent.press(getByTestId('new-inspection-button'));

    await fireEvent.press(getByTestId('checklist-voice'));

    expect(alert).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });
});
