// Behaviour of the Site Worker's quick-action sheet.
//
// TWO ACTIONS CLOSE BEFORE THEY ACT, and both for the same reason: a modal left mounted over the
// screen it just opened swallows the first tap on that screen, and `onRequestClose` would then pop
// the wrong thing. So the order is asserted, not just the outcome — closing after navigating would
// pass a "did it navigate" test while leaving the user tapping a screen that cannot hear them.
//
// The sheet is Issues' and Report's entry point since both left the bottom bar on 2026-08-09, so its
// three routes are the only way to those screens for this role.
//
// THE PROJECT BAR CHANGES THE SITE (PO 2026-08-11). It carries the same arrow as on every other
// screen, so it has to keep the same promise — an earlier version drew the bar and made it inert,
// which is a control that looks like the one the user already knows and is not.

import { render, fireEvent } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import { useProjectStore } from '../../store/projectStore';
import { QuickActionsMenu } from '../QuickActionsMenu';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

let mockStatus = 'idle';
jest.mock('../../hooks/useSyncStatus', () => ({ useSyncStatus: () => mockStatus }));
jest.mock('../../hooks/usePendingCount', () => ({ usePendingCount: () => 0 }));

function renderMenu(props: Record<string, unknown> = {}) {
  const onClose = jest.fn();
  const utils = render(
    <I18nProvider>
      <QuickActionsMenu visible onClose={onClose} {...props} />
    </I18nProvider>,
  );
  return { onClose, utils };
}

describe('QuickActionsMenu', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockStatus = 'idle';
    useProjectStore.setState({
      active: { projectId: 'p-1', projectName: 'Riverside Tower', projectCode: 'PRJ-1' },
      openPicker: jest.fn(),
    } as never);
  });

  it('draws nothing while it is closed', async () => {
    const { utils } = renderMenu({ visible: false });
    const { queryByTestId } = await utils;

    expect(queryByTestId('quick-actions-screen')).toBeNull();
  });

  it('offers the three actions', async () => {
    const { utils } = renderMenu();
    const { getByTestId } = await utils;

    expect(getByTestId('quick-action-reportIssue')).toBeTruthy();
    expect(getByTestId('quick-action-safetyChecklist')).toBeTruthy();
    expect(getByTestId('quick-action-logActivity')).toBeTruthy();
  });

  // Issues and Report left the bottom bar; this sheet is how this role reaches them.
  it.each([
    ['reportIssue', '/issues'],
    ['safetyChecklist', '/safety-checklist'],
    ['logActivity', '/report'],
  ])('sends %s to %s', async (key, route) => {
    const { utils } = renderMenu();
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId(`quick-action-${key}`));

    expect(mockPush).toHaveBeenCalledWith(route);
  });

  // ORDER, not just outcome: closing after navigating leaves a modal over the screen it opened,
  // swallowing the first tap on it.
  it('closes before it navigates', async () => {
    const { onClose, utils } = renderMenu();
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('quick-action-reportIssue'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(mockPush.mock.invocationCallOrder[0]!);
  });

  it('closes on the close control without navigating anywhere', async () => {
    const { onClose, utils } = renderMenu();
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('quick-actions-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('names the site the worker is on', async () => {
    const { utils } = renderMenu();
    const { getByTestId, getByText } = await utils;

    expect(getByTestId('quick-actions-project')).toBeTruthy();
    expect(getByText('Riverside Tower')).toBeTruthy();
  });

  // Nothing chosen yet — the bar has no site to name, so it is absent rather than blank.
  it('draws no project bar before a site is chosen', async () => {
    useProjectStore.setState({ active: null, openPicker: jest.fn() } as never);

    const { utils } = renderMenu();
    const { queryByTestId } = await utils;

    expect(queryByTestId('quick-actions-project')).toBeNull();
  });

  // It carries the same arrow as everywhere else, so it keeps the same promise.
  it('opens the picker from the project bar, closing first', async () => {
    const openPicker = jest.fn();
    useProjectStore.setState({
      active: { projectId: 'p-1', projectName: 'Riverside Tower', projectCode: 'PRJ-1' },
      openPicker,
    } as never);

    const { onClose, utils } = renderMenu();
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('quick-actions-project'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(openPicker).toHaveBeenCalledTimes(1);
    expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(
      openPicker.mock.invocationCallOrder[0]!,
    );
  });

  // The building is the more specific answer where there is one; the code is the fallback.
  it('names the building under the project when there is one', async () => {
    useProjectStore.setState({
      active: {
        projectId: 'p-1',
        projectName: 'Riverside Tower',
        projectCode: 'PRJ-1',
        buildingName: 'Block B',
      },
      openPicker: jest.fn(),
    } as never);

    const { utils } = renderMenu();
    const { getByText, queryByText } = await utils;

    expect(getByText('Block B')).toBeTruthy();
    expect(queryByText('PRJ-1')).toBeNull();
  });

  it('falls back to the project code where there is not', async () => {
    const { utils } = renderMenu();
    const { getByText } = await utils;

    expect(getByText('PRJ-1')).toBeTruthy();
  });

  // The overlay carries its own sync pill, because its bar replaces the TopBar while it is up.
  it('carries the labelled sync pill', async () => {
    const { utils } = renderMenu();
    const { getByTestId } = await utils;

    expect(getByTestId('quick-actions-sync-pill')).toBeTruthy();
  });
});
