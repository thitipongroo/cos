// Behaviour of the full role picker — the overflow the invite form pushes to.
//
// The invite form shows four roles; the rest live here. So the contract between the two screens is
// what matters: this one HANDS BACK its answer through a store and goes back, rather than pushing a
// new invite form. A push would leave the half-filled invitation behind on the stack and start a
// fresh one, losing the name and contact already typed.
//
// It is a RADIO GROUP — one role, and Confirm is off until one is chosen. Confirming nothing would
// hand the invite form a null and clear a role the admin had already picked.
//
// The info control opens the real permission breakdown rather than describing the role here. A
// second description of what a role may do is a second thing to keep in step with the server.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { CosRole } from '@cos/types';
import { I18nProvider } from '../../../i18n';
import { useInviteRoleStore } from '../../../store/inviteRoleStore';
import RolesSelectionScreen from '../roles-selection';

const mockBack = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
}));

function renderScreen() {
  return render(
    <I18nProvider>
      <RolesSelectionScreen />
    </I18nProvider>,
  );
}

describe('RolesSelectionScreen', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    mockBack.mockReset();
    mockPush.mockReset();
    mockParams = {};
    useInviteRoleStore.setState({ pendingRole: null } as never);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => alert.mockRestore());

  it('offers the roles the invite form had no room for', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId(`roles-select-${CosRole.FINANCE}`)).toBeTruthy();
    expect(getByTestId(`roles-select-${CosRole.SAFETY_OFFICER}`)).toBeTruthy();
  });

  // One role, and Confirm is off until there is one.
  it('opens with nothing chosen and Confirm off', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('roles-confirm').props.accessibilityState.disabled).toBe(true);
  });

  it('opens on the role the invite form already had', async () => {
    mockParams = { role: CosRole.FINANCE };

    const { getByTestId } = await renderScreen();

    expect(getByTestId(`roles-select-${CosRole.FINANCE}`).props.accessibilityState.selected).toBe(
      true,
    );
    expect(getByTestId('roles-confirm').props.accessibilityState.disabled).toBe(false);
  });

  it('marks exactly one role as chosen', async () => {
    const { getByTestId, getAllByTestId } = await renderScreen();

    await fireEvent.press(getByTestId(`roles-select-${CosRole.FINANCE}`));

    await waitFor(() =>
      expect(getByTestId(`roles-select-${CosRole.FINANCE}`).props.accessibilityState.selected).toBe(
        true,
      ),
    );
    const chosen = getAllByTestId(/^roles-select-/).filter(
      (r) => r.props.accessibilityState.selected === true,
    );
    expect(chosen).toHaveLength(1);
  });

  it('moves the choice rather than adding to it', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId(`roles-select-${CosRole.FINANCE}`));
    await fireEvent.press(getByTestId(`roles-select-${CosRole.SAFETY_OFFICER}`));

    await waitFor(() =>
      expect(
        getByTestId(`roles-select-${CosRole.SAFETY_OFFICER}`).props.accessibilityState.selected,
      ).toBe(true),
    );
    expect(getByTestId(`roles-select-${CosRole.FINANCE}`).props.accessibilityState.selected).toBe(
      false,
    );
  });

  // THE CONTRACT: hand the answer back and go back. Pushing a new invite form would abandon the
  // half-filled one and lose the name and contact already typed.
  it('hands the choice back and returns, rather than pushing a new form', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId(`roles-select-${CosRole.FINANCE}`));
    await fireEvent.press(getByTestId('roles-confirm'));

    expect(useInviteRoleStore.getState().pendingRole).toBe(CosRole.FINANCE);
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  // Confirming nothing would hand the invite form a null and clear a role already picked.
  it('confirms nothing when nothing is chosen', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('roles-confirm'));

    expect(useInviteRoleStore.getState().pendingRole).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('narrows the list by name', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('roles-search'), 'finance');

    await waitFor(() => expect(getByTestId(`roles-select-${CosRole.FINANCE}`)).toBeTruthy());
    expect(queryByTestId(`roles-select-${CosRole.SAFETY_OFFICER}`)).toBeNull();
  });

  // A second description of what a role may do is a second thing to keep in step with the server.
  it('opens the real permission breakdown for the chosen role', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId(`roles-select-${CosRole.FINANCE}`));
    await fireEvent.press(getByTestId('roles-info'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/role-permissions',
      params: { role: CosRole.FINANCE },
    });
  });

  it('asks for a role first rather than opening an empty breakdown', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('roles-info'));

    expect(alert).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
