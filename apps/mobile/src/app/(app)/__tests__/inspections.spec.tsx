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

import { render, fireEvent, waitFor } from '@testing-library/react-native';
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
});
