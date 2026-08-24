// Behaviour of the safety incident screen, around the two pieces it now shares.
//
// The severity row became <SeverityPicker /> and the "+" became <Fab /> on 2026-08-20. Both are
// used by more than one screen now, so what has to be pinned HERE is that this screen still gets
// its own answers out of them: the incident form accents the chosen severity with the primary blue
// (the inspection form uses danger red), and its FAB toggles the composer open and shut rather than
// navigating — which is why its glyph changes and the others' do not.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import { useProjectStore } from '../../../store/projectStore';
import IncidentsScreen from '../incidents';

// `useFocusEffect` reaches for a navigation object that only exists under a NavigationContainer.
// Running the callback as a plain effect is what it does on this screen — load on arrival — without
// standing up a navigator the test has nothing else to say about.
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react') as typeof import('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  };
});

jest.mock('../../../hooks/useCollection', () => ({ useCollection: jest.fn(() => []) }));
jest.mock('../../../api/safety', () => ({
  ...jest.requireActual('../../../api/safety'),
  fetchIncidents: jest.fn().mockResolvedValue([]),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useCollection } = require('../../../hooks/useCollection') as { useCollection: jest.Mock };

const PROJECT_ID = 'proj-1';

function incident(n: number, over: Partial<Record<string, unknown>> = {}) {
  return {
    id: `local-${n}`,
    incidentId: `srv-${n}`,
    projectId: PROJECT_ID,
    incidentType: `Type ${n}`,
    severity: 'MEDIUM',
    // The feed shows OPEN and IN_PROGRESS only — see applyIncidentFilter.
    status: 'OPEN',
    description: '',
    occurredAt: '2026-08-19T09:00:00Z',
    offlineSyncStatus: 'SYNCED',
    ...over,
  };
}

function renderScreen() {
  return render(
    <I18nProvider>
      <IncidentsScreen />
    </I18nProvider>,
  );
}

function flatten(style: unknown): Record<string, unknown> {
  return Object.assign({}, ...(Array.isArray(style) ? style : [style])) as Record<string, unknown>;
}

describe('IncidentsScreen', () => {
  beforeEach(() => {
    useCollection.mockReset();
    useCollection.mockReturnValue([]);
    useProjectStore.setState({
      active: { projectId: PROJECT_ID, projectName: 'Riverside Tower' },
    } as never);
  });

  it('renders a card per incident on the active project', async () => {
    useCollection.mockReturnValue([incident(1), incident(2)]);

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('incident-item')).toHaveLength(2));
  });

  // NOT a test that another project's rows are hidden: that scoping is done in SQL by
  // useCollection, which is mocked here, so such a test would only be asserting the mock.
  it('leaves out incidents that are already closed', async () => {
    useCollection.mockReturnValue([incident(1), incident(2, { status: 'RESOLVED' })]);

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('incident-item')).toHaveLength(1));
  });

  it('narrows the feed to the critical incidents', async () => {
    useCollection.mockReturnValue([incident(1), incident(2, { severity: 'CRITICAL' })]);

    const { getAllByTestId, getByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('incident-item')).toHaveLength(2));
    await fireEvent.press(getByTestId('incident-filter-critical'));

    await waitFor(() => expect(getAllByTestId('incident-item')).toHaveLength(1));
  });

  // The FAB opens the composer in place, so the same button closes it — which is why <Fab /> takes
  // its icon as a prop at all.
  it('opens the composer from the floating action, and closes it again', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('incident-fab')).toBeTruthy());
    expect(queryByTestId('incident-composer')).toBeNull();

    await fireEvent.press(getByTestId('incident-fab'));
    await waitFor(() => expect(getByTestId('incident-composer')).toBeTruthy());

    await fireEvent.press(getByTestId('incident-fab'));
    await waitFor(() => expect(queryByTestId('incident-composer')).toBeNull());
  });

  it('offers the whole severity scale in the composer, one selected', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('incident-fab'));
    await waitFor(() => expect(getByTestId('severity-picker')).toBeTruthy());

    const selected = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].filter(
      (level) => getByTestId(`severity-${level}`).props.accessibilityState.selected === true,
    );

    expect(selected).toEqual(['MEDIUM']);
  });

  it('moves the selection to the severity that was pressed', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('incident-fab'));
    await waitFor(() => expect(getByTestId('severity-CRITICAL')).toBeTruthy());
    await fireEvent.press(getByTestId('severity-CRITICAL'));

    await waitFor(() =>
      expect(getByTestId('severity-CRITICAL').props.accessibilityState.selected).toBe(true),
    );
    expect(getByTestId('severity-MEDIUM').props.accessibilityState.selected).toBe(false);
  });

  // The accent is this screen's, not the picker's — the inspection form fills the same control red.
  it('accents the chosen severity with the screen`s primary, not the danger colour', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('incident-fab'));
    await waitFor(() => expect(getByTestId('severity-MEDIUM')).toBeTruthy());

    const chosen = flatten(getByTestId('severity-MEDIUM').props.style).backgroundColor;
    const unchosen = flatten(getByTestId('severity-LOW').props.style).backgroundColor;

    expect(chosen).not.toBe(unchosen);
    expect(chosen).not.toBe('transparent');
  });

  it('says a site must be chosen before an incident can be filed', async () => {
    useProjectStore.setState({ active: null } as never);

    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('incident-fab'));

    await waitFor(() => expect(getByTestId('incident-needs-project')).toBeTruthy());
  });
});
