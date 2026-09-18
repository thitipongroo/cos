// Behaviour of the safety-officer permit queue.
//
// The asymmetry is the point: a PENDING permit can always be REJECTED, but a SAFETY_PERMIT may not
// be APPROVED by this role — that decision sits a tier above. Drawing an approve button on one
// would offer an action the server refuses, so the button is absent rather than disabled. An
// already-decided permit offers neither.
//
// The floating "+" became the shared <Fab /> on 2026-08-20; it navigates here, unlike the incident
// screen's, which toggles a composer. That is why its icon is fixed and the other's is a prop.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { I18nProvider } from '../../../i18n';
import PermitsScreen from '../permits';
import { PERMIT_RISK_ANALYSIS } from '../../../lib/mockupFigures';

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react') as typeof import('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
    useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  };
});

jest.mock('../../../api/safety', () => ({
  ...jest.requireActual('../../../api/safety'),
  listPermits: jest.fn(),
  approvePermit: jest.fn(),
  rejectPermit: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../../api/safety') as {
  listPermits: jest.Mock;
  approvePermit: jest.Mock;
  rejectPermit: jest.Mock;
};

function permit(id: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    permit_id: id,
    project_id: 'proj-1',
    permit_type: 'WORK_PERMIT',
    permit_number: `PN-${id}`,
    issued_by: null,
    valid_from: '2026-08-01',
    valid_until: '2026-09-01',
    status: 'PENDING',
    linked_task_id: null,
    created_by: null,
    created_at: '2026-08-19T09:00:00Z',
    ...over,
  };
}

function renderScreen() {
  return render(
    <I18nProvider>
      <PermitsScreen />
    </I18nProvider>,
  );
}

describe('PermitsScreen', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockPush.mockReset();
    api.listPermits.mockReset();
    api.approvePermit.mockReset();
    api.rejectPermit.mockReset();
    api.approvePermit.mockResolvedValue(undefined);
    api.rejectPermit.mockResolvedValue(undefined);
    api.listPermits.mockResolvedValue([permit('pm-1')]);
  });

  afterEach(() => alert.mockRestore());

  it('renders a card per permit', async () => {
    api.listPermits.mockResolvedValue([permit('pm-1'), permit('pm-2')]);

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('permit-item')).toHaveLength(2));
  });

  it('offers both decisions on a pending work permit', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('permit-approve-pm-1')).toBeTruthy());
    expect(getByTestId('permit-reject-pm-1')).toBeTruthy();
  });

  // The tier rule: this role may refuse a safety permit but may not grant one.
  it('offers reject but NOT approve on a pending safety permit', async () => {
    api.listPermits.mockResolvedValue([permit('pm-1', { permit_type: 'SAFETY_PERMIT' })]);

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('permit-reject-pm-1')).toBeTruthy());
    expect(queryByTestId('permit-approve-pm-1')).toBeNull();
  });

  it('offers neither decision on a permit that is already active', async () => {
    api.listPermits.mockResolvedValue([permit('pm-1', { status: 'ACTIVE' })]);

    const { getAllByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('permit-item')).toHaveLength(1));
    expect(queryByTestId('permit-approve-pm-1')).toBeNull();
    expect(queryByTestId('permit-reject-pm-1')).toBeNull();
  });

  it('approves the permit whose button was pressed', async () => {
    api.listPermits.mockResolvedValue([permit('pm-1'), permit('pm-2')]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('permit-approve-pm-2')).toBeTruthy());
    await fireEvent.press(getByTestId('permit-approve-pm-2'));

    await waitFor(() => expect(api.approvePermit).toHaveBeenCalledWith('pm-2'));
    expect(api.rejectPermit).not.toHaveBeenCalled();
  });

  it('rejects the permit whose button was pressed', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('permit-reject-pm-1')).toBeTruthy());
    await fireEvent.press(getByTestId('permit-reject-pm-1'));

    await waitFor(() => expect(api.rejectPermit).toHaveBeenCalledWith('pm-1'));
    expect(api.approvePermit).not.toHaveBeenCalled();
  });

  // THE TYPE TABS AND THE PENDING PILL WENT ON 2026-09-17 (R23, D43): the Stitch screen has
  // neither, and the product owner chose the drawing. Every permit on the active project is listed.
  it('lists every permit on the project, with no filter row to narrow it', async () => {
    api.listPermits.mockResolvedValue([
      permit('pm-1'),
      permit('pm-2', { permit_type: 'ENTRY_PERMIT', status: 'ACTIVE' }),
    ]);

    const { getAllByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('permit-item')).toHaveLength(2));
    expect(queryByTestId('permit-type-tab-ENTRY_PERMIT')).toBeNull();
    expect(queryByTestId('permit-filter-pending')).toBeNull();
  });

  // The Safety Analysis card is DRAWN in full (D40) — confidence, source line and all — and is
  // entered through its footer alone (R22, D38).
  it('draws the safety analysis card and opens the dialog from its footer', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('permits-analysis')).toBeTruthy());
    expect(getByTestId('permits-analysis-foot')).toHaveTextContent(
      new RegExp(String(PERMIT_RISK_ANALYSIS.value.confidence)),
    );
    await fireEvent.press(getByTestId('permits-analysis-foot'));
    expect(alert).toHaveBeenCalled();
  });

  // Unlike the incident screen's, this FAB navigates — the request form is a route.
  it('opens the request form from the floating action', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('permit-fab')).toBeTruthy());
    await fireEvent.press(getByTestId('permit-fab'));

    expect(mockPush).toHaveBeenCalledWith('/permit-request');
  });

  it('keeps the screen usable when the list fails offline', async () => {
    api.listPermits.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('permits-screen')).toBeTruthy());
  });
});
