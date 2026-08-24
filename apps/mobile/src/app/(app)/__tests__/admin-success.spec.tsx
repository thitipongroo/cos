// Behaviour of the two tenant-admin confirmation screens.
//
// Both exist to say what actually happened, and both are reached with `replace` rather than `push`
// — the work is finished and there is nothing behind them to return to. So every onward action here
// is a REPLACE too: leaving a spent form on the stack is how someone comes back to it later and
// submits it twice.
//
// The invitation receipt shows the contact VERBATIM, unmasked (PO 2026-07-29). An admin who has just
// sent an invitation needs to be able to read back the number or address they typed and catch a
// mistake while it still costs nothing; a masked receipt makes the typo discoverable only when the
// invitation never arrives.

import { render, fireEvent } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import InvitationSuccessScreen from '../invitation-success';
import PermissionSuccessScreen from '../permission-success';

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: mockReplace }),
}));

function renderInvitation() {
  return render(
    <I18nProvider>
      <InvitationSuccessScreen />
    </I18nProvider>,
  );
}

function renderPermission() {
  return render(
    <I18nProvider>
      <PermissionSuccessScreen />
    </I18nProvider>,
  );
}

describe('InvitationSuccessScreen', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    mockParams = {
      method: 'phone',
      contact: '+66812345678',
      role: 'SITE_WORKER',
      projects: 'Riverside Tower',
    };
  });

  it('confirms the invitation', async () => {
    const { getByTestId } = await renderInvitation();

    expect(getByTestId('invitation-success')).toBeTruthy();
  });

  // UNMASKED, on purpose: a typo caught here costs nothing, and a masked receipt makes it
  // discoverable only when the invitation never arrives.
  it('shows the number that was actually sent to, in full', async () => {
    const { getByText } = await renderInvitation();

    expect(getByText('+66812345678')).toBeTruthy();
  });

  it('shows an email recipient in full too', async () => {
    mockParams = { ...mockParams, method: 'email', contact: 'somchai@example.com' };

    const { getByText } = await renderInvitation();

    expect(getByText('somchai@example.com')).toBeTruthy();
  });

  it('names the projects the invitation was scoped to', async () => {
    const { getByText } = await renderInvitation();

    expect(getByText('Riverside Tower')).toBeTruthy();
  });

  it('renders with no projects named', async () => {
    mockParams = { ...mockParams, projects: '' };

    const { getByTestId } = await renderInvitation();

    expect(getByTestId('invitation-success')).toBeTruthy();
  });

  // REPLACE, not push — a spent form left on the stack gets submitted twice.
  it('starts a fresh invitation by replacing, not stacking', async () => {
    const { getByTestId } = await renderInvitation();

    await fireEvent.press(getByTestId('invitation-success-invite-another'));

    expect(mockReplace).toHaveBeenCalledWith('/invite-user');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('returns home by replacing too', async () => {
    const { getByTestId } = await renderInvitation();

    await fireEvent.press(getByTestId('invitation-success-dashboard'));

    expect(mockReplace).toHaveBeenCalledWith('/home');
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('PermissionSuccessScreen', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    mockParams = { user_id: 'u-1', display_name: 'Waraporn Klinhom' };
  });

  it('confirms the change', async () => {
    const { getByTestId } = await renderPermission();

    expect(getByTestId('permission-success')).toBeTruthy();
  });

  it('names the colleague whose permissions changed', async () => {
    const { getByText } = await renderPermission();

    expect(getByText(/Waraporn Klinhom/)).toBeTruthy();
  });

  // The screen is reachable with only an id; it must still read as a sentence rather than as a blank.
  it('still reads as a confirmation when no name came through', async () => {
    mockParams = { user_id: 'u-1' };

    const { getByTestId } = await renderPermission();

    expect(getByTestId('permission-success')).toBeTruthy();
  });

  it('returns to the user list by replacing', async () => {
    const { getByTestId } = await renderPermission();

    await fireEvent.press(getByTestId('perm-success-users'));

    expect(mockReplace).toHaveBeenCalledWith('/users');
    expect(mockPush).not.toHaveBeenCalled();
  });

  // The profile is opened with the id AND the name, so it does not have to re-fetch a row the
  // previous screen already had.
  it('opens the profile with what it already knows', async () => {
    const { getByTestId } = await renderPermission();

    await fireEvent.press(getByTestId('perm-success-profile'));

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/user-profile',
      params: { user_id: 'u-1', display_name: 'Waraporn Klinhom' },
    });
  });
});
