// Behaviour of the tenant-admin user list.
//
// Two things here are worth holding. The avatar's fallback, which PO 2026-08-20 settled: a person
// glyph when the name yields no initials, and the existing glyph for a deactivated account — so a
// row must never draw a literal "?" again. And the audit card, which counts accounts nobody has
// used in 30 days; it reads `last_seen_at`, so a test with hard-coded dates would rot.

import { Alert } from 'react-native';
import { render, fireEvent, waitFor, within } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import UsersScreen from '../users';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../../api/users', () => ({
  ...jest.requireActual('../../../api/users'),
  getUsers: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../../api/users') as { getUsers: jest.Mock };

const DAY_MS = 24 * 60 * 60 * 1000;
const seenDaysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

function user(over: Partial<Record<string, unknown>> = {}) {
  return {
    user_id: 'u-1',
    email: 'waraporn@example.com',
    phone_number: null,
    display_name: 'Waraporn Klinhom',
    photo_url: null,
    department: 'Engineering',
    role: 'SITE_ENGINEER',
    mfa_enabled: false,
    is_active: true,
    last_seen_at: seenDaysAgo(1),
    ...over,
  };
}

function renderScreen() {
  return render(
    <I18nProvider>
      <UsersScreen />
    </I18nProvider>,
  );
}

describe('UsersScreen', () => {
  beforeEach(() => {
    api.getUsers.mockReset();
    mockPush.mockReset();
  });

  it('renders a row per user the tenant returns', async () => {
    api.getUsers.mockResolvedValue([
      user(),
      user({ user_id: 'u-2', display_name: 'Somchai Jaidee' }),
    ]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('user-row-u-1')).toBeTruthy());
    expect(getByTestId('user-row-u-2')).toBeTruthy();
  });

  // PO 2026-08-20. Before it, these two cases drew "?" — a character no one chose to display.
  it('falls back to a person glyph when the name yields no initials', async () => {
    api.getUsers.mockResolvedValue([user({ display_name: '   ' })]);

    const { getByTestId, queryByText } = await renderScreen();

    await waitFor(() => expect(getByTestId('user-row-u-1')).toBeTruthy());
    expect(queryByText('?')).toBeNull();
    expect(getByTestId('icon-person')).toBeTruthy();
  });

  it('draws the glyph for a deactivated account even when the name reads fine', async () => {
    api.getUsers.mockResolvedValue([user({ is_active: false })]);

    const { getByTestId, queryByText } = await renderScreen();

    await waitFor(() => expect(getByTestId('user-row-u-1')).toBeTruthy());
    expect(queryByText('WK')).toBeNull();
    expect(getByTestId('icon-person')).toBeTruthy();
  });

  it('shows the initials of an active account whose name reads', async () => {
    api.getUsers.mockResolvedValue([user()]);

    const { getByText } = await renderScreen();

    // First and LAST part — the one rule, app-wide since 2026-08-20.
    await waitFor(() => expect(getByText('WK')).toBeTruthy());
  });

  it('filters the list down to one role', async () => {
    api.getUsers.mockResolvedValue([
      user(),
      user({ user_id: 'u-2', display_name: 'Somchai Jaidee', role: 'SITE_WORKER' }),
    ]);

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('user-row-u-2')).toBeTruthy());
    await fireEvent.press(getByTestId('filter-SITE_WORKER'));

    await waitFor(() => expect(queryByTestId('user-row-u-1')).toBeNull());
    expect(getByTestId('user-row-u-2')).toBeTruthy();
  });

  it('keeps the screen usable when the request fails offline', async () => {
    api.getUsers.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('users-error')).toBeTruthy());
  });

  it('shows the empty state when the tenant has no users', async () => {
    api.getUsers.mockResolvedValue([]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('users-empty')).toBeTruthy());
  });

  // ── THE AUDIT CARD ───────────────────────────────────────────────────────────────────────────
  //
  // IT COUNTS SOMETHING REAL. The mockup captions this card with "95% confidence" over an invented
  // finding; what the platform can actually answer is how many ACTIVE accounts nobody has used in 30
  // days, from `last_seen_at`. That is a real access-review question a tenant administrator acts on,
  // and it is the reason the card survived the ADR-085 pass while its figure did not.
  //
  // DORMANT MEANS ACTIVE AND UNUSED. A deactivated account is not dormant — it is already dealt
  // with, and counting it would pad the flag with work that is done.

  it('flags active accounts nobody has used in thirty days', async () => {
    api.getUsers.mockResolvedValue([
      user({ user_id: 'u-1', last_seen_at: seenDaysAgo(1) }),
      user({ user_id: 'u-2', display_name: 'Somchai Prasert', last_seen_at: seenDaysAgo(45) }),
    ]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('users-audit')).toBeTruthy());
    // Both places, because the badge and the sentence are read separately and a card that flagged
    // one in the badge and none in the body would be arguing with itself.
    const card = within(getByTestId('users-audit'));
    expect(card.getByText('1 FLAGGED')).toBeTruthy();
    expect(card.getByText(/1 users haven't signed in/)).toBeTruthy();
  });

  // Already dealt with. Counting it would flag work that is finished.
  it('does not flag an account that is already deactivated', async () => {
    api.getUsers.mockResolvedValue([
      user({ user_id: 'u-2', is_active: false, last_seen_at: seenDaysAgo(200) }),
    ]);

    const { getByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getByTestId('users-audit')).toBeTruthy());
    expect(getByText('ALL CLEAR')).toBeTruthy();
  });

  // The boundary, from the side that matters: 29 days is not yet a finding, and a card that flagged
  // it would train an administrator to dismiss the flag.
  it('does not flag an account inside the window', async () => {
    api.getUsers.mockResolvedValue([user({ last_seen_at: seenDaysAgo(29) })]);

    const { getByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getByTestId('users-audit')).toBeTruthy());
    expect(getByText('ALL CLEAR')).toBeTruthy();
  });

  // The review control is ALWAYS offered, flagged or not (mockup 01_users_dashboard): an
  // access review is a thing an administrator does on a schedule, not only when something is wrong.
  it('offers the review whether or not anything is flagged', async () => {
    api.getUsers.mockResolvedValue([user()]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('audit-review')).toBeTruthy());
  });

  // No card at all until the list has arrived: a card reading "all clear" over a list that has not
  // loaded is a clean bill of health for accounts nobody has looked at.
  it('shows no audit card before the users have arrived', async () => {
    api.getUsers.mockReturnValue(new Promise(() => undefined));

    const { queryByTestId } = await renderScreen();

    expect(queryByTestId('users-audit')).toBeNull();
  });

  it('shows no audit card when the request failed', async () => {
    api.getUsers.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('users-error')).toBeTruthy());
    expect(queryByTestId('users-audit')).toBeNull();
  });

  // ── SEARCH AND FILTER ────────────────────────────────────────────────────────────────────────

  it('finds a user by name', async () => {
    api.getUsers.mockResolvedValue([
      user({ user_id: 'u-1', display_name: 'Waraporn Klinhom' }),
      user({ user_id: 'u-2', display_name: 'Somchai Prasert' }),
    ]);

    const { getByTestId, queryByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('user-row-u-1')).toBeTruthy());

    await fireEvent.changeText(getByTestId('users-search'), 'somchai');

    expect(getByTestId('user-row-u-2')).toBeTruthy();
    expect(queryByTestId('user-row-u-1')).toBeNull();
  });

  // BY EMAIL TOO, because that is what an administrator has in front of them: the ticket says
  // "somchai@…", and searching a directory by the one identifier you were given is the whole task.
  it('finds a user by email', async () => {
    api.getUsers.mockResolvedValue([
      user({ user_id: 'u-1', email: 'waraporn@example.com' }),
      user({ user_id: 'u-2', display_name: 'Somchai Prasert', email: 'somchai@example.com' }),
    ]);

    const { getByTestId, queryByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('user-row-u-1')).toBeTruthy());

    await fireEvent.changeText(getByTestId('users-search'), 'somchai@');

    expect(getByTestId('user-row-u-2')).toBeTruthy();
    expect(queryByTestId('user-row-u-1')).toBeNull();
  });

  // An account with no email must not vanish from an unrelated search, and must not throw on one.
  it('keeps searching past a user with no email', async () => {
    api.getUsers.mockResolvedValue([
      user({ user_id: 'u-1', email: null, display_name: 'Waraporn Klinhom' }),
    ]);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('user-row-u-1')).toBeTruthy());

    await fireEvent.changeText(getByTestId('users-search'), 'waraporn');

    expect(getByTestId('user-row-u-1')).toBeTruthy();
  });

  it('says so when a search matches nobody, rather than showing an empty page', async () => {
    api.getUsers.mockResolvedValue([user()]);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('user-row-u-1')).toBeTruthy());

    await fireEvent.changeText(getByTestId('users-search'), 'nobody-by-that-name');

    expect(getByTestId('users-empty')).toBeTruthy();
  });

  // THE ROLE CHIPS COME FROM THE DATA, never from a hardcoded list that could drift from what the
  // tenant actually has — a filter offering a role nobody holds is a filter that returns nothing.
  it('offers a chip only for the roles the tenant actually has', async () => {
    api.getUsers.mockResolvedValue([
      user({ user_id: 'u-1', role: 'SITE_ENGINEER' }),
      user({ user_id: 'u-2', role: 'FINANCE' }),
    ]);

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('filter-SITE_ENGINEER')).toBeTruthy());
    expect(getByTestId('filter-FINANCE')).toBeTruthy();
    expect(queryByTestId('filter-TENANT_ADMIN')).toBeNull();
  });

  // One chip per role, however many people hold it — the chips are a vocabulary, not a tally.
  it('offers one chip per role, not one per user', async () => {
    api.getUsers.mockResolvedValue([
      user({ user_id: 'u-1', role: 'SITE_ENGINEER' }),
      user({ user_id: 'u-2', role: 'SITE_ENGINEER' }),
    ]);

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('filter-SITE_ENGINEER')).toHaveLength(1));
  });

  // The two filters COMPOSE: an administrator narrows to a role and then searches within it, which
  // is how a directory of any size is used at all.
  it('narrows by role and search together', async () => {
    api.getUsers.mockResolvedValue([
      user({ user_id: 'u-1', display_name: 'Waraporn Klinhom', role: 'SITE_ENGINEER' }),
      user({ user_id: 'u-2', display_name: 'Waraporn Suksri', role: 'FINANCE' }),
    ]);

    const { getByTestId, queryByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('user-row-u-1')).toBeTruthy());

    await fireEvent.press(getByTestId('filter-FINANCE'));
    await fireEvent.changeText(getByTestId('users-search'), 'waraporn');

    expect(getByTestId('user-row-u-2')).toBeTruthy();
    expect(queryByTestId('user-row-u-1')).toBeNull();
  });

  it('returns the whole list from the ALL chip', async () => {
    api.getUsers.mockResolvedValue([
      user({ user_id: 'u-1', role: 'SITE_ENGINEER' }),
      user({ user_id: 'u-2', role: 'FINANCE' }),
    ]);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('user-row-u-1')).toBeTruthy());

    await fireEvent.press(getByTestId('filter-FINANCE'));
    await fireEvent.press(getByTestId('filter-ALL'));

    expect(getByTestId('user-row-u-1')).toBeTruthy();
    expect(getByTestId('user-row-u-2')).toBeTruthy();
  });

  // ── THE ACTION SHEET ─────────────────────────────────────────────────────────────────────────

  it('stays closed until a user asks for it', async () => {
    api.getUsers.mockResolvedValue([user()]);

    const { getByTestId, queryByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('user-row-u-1')).toBeTruthy());

    expect(queryByTestId('sheet-edit')).toBeNull();
  });

  it('opens on a user own overflow control', async () => {
    api.getUsers.mockResolvedValue([user()]);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('user-actions-u-1')).toBeTruthy());

    await fireEvent.press(getByTestId('user-actions-u-1'));

    expect(getByTestId('user-actions-sheet')).toBeTruthy();
    expect(getByTestId('sheet-edit')).toBeTruthy();
  });

  // It names WHOSE account this is. A sheet of destructive-sounding actions with no name on it is
  // the shape of a mis-tap that deactivates the wrong person.
  it('names the account the actions belong to', async () => {
    api.getUsers.mockResolvedValue([user({ display_name: 'Somchai Prasert' })]);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('user-actions-u-1')).toBeTruthy());

    await fireEvent.press(getByTestId('user-actions-u-1'));

    expect(within(getByTestId('user-actions-sheet')).getByText('Somchai Prasert')).toBeTruthy();
  });

  it('closes on the backdrop', async () => {
    api.getUsers.mockResolvedValue([user()]);

    const { getByTestId, queryByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('user-actions-u-1')).toBeTruthy());
    await fireEvent.press(getByTestId('user-actions-u-1'));

    await fireEvent.press(getByTestId('user-actions-backdrop'));

    expect(queryByTestId('sheet-edit')).toBeNull();
  });

  // The inner surface SWALLOWS taps: a sheet that closed when its own body was pressed would shut
  // under a finger reaching for a row on it.
  it('stays open when the sheet itself is pressed', async () => {
    api.getUsers.mockResolvedValue([user()]);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('user-actions-u-1')).toBeTruthy());
    await fireEvent.press(getByTestId('user-actions-u-1'));

    await fireEvent.press(getByTestId('user-actions-sheet'));

    expect(getByTestId('sheet-edit')).toBeTruthy();
  });

  // ── WHERE THE SHEET GOES ─────────────────────────────────────────────────────────────────────
  //
  // TWO OF THE FOUR ARE REAL and CLOSE BEFORE THEY NAVIGATE — a sheet left mounted over the screen
  // it just opened swallows the first tap on it. The other two say plainly that they are not built,
  // rather than routing somewhere approximate.

  it.each([
    ['sheet-edit', '/edit-permission'],
    ['sheet-reset', '/reset-password'],
  ])('%s opens %s, closing first', async (testID, pathname) => {
    api.getUsers.mockResolvedValue([user()]);

    const { getByTestId, queryByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('user-actions-u-1')).toBeTruthy());
    await fireEvent.press(getByTestId('user-actions-u-1'));

    await fireEvent.press(getByTestId(testID));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls[0][0]).toMatchObject({ pathname });
    expect(queryByTestId('sheet-edit')).toBeNull();
  });

  // The destination is told WHO it is for. Both screens act on one account, and a route that
  // arrived without the user would be a form editing nobody.
  it('carries the user to the permission editor', async () => {
    api.getUsers.mockResolvedValue([user({ user_id: 'u-9', display_name: 'Somchai Prasert' })]);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('user-actions-u-9')).toBeTruthy());
    await fireEvent.press(getByTestId('user-actions-u-9'));

    await fireEvent.press(getByTestId('sheet-edit'));

    expect(mockPush.mock.calls[0][0]).toMatchObject({
      params: { user_id: 'u-9', display_name: 'Somchai Prasert' },
    });
  });

  it.each(['sheet-activity', 'sheet-deactivate'])(
    '%s says it is not built rather than routing somewhere near it',
    async (testID) => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      api.getUsers.mockResolvedValue([user()]);

      const { getByTestId } = await renderScreen();
      await waitFor(() => expect(getByTestId('user-actions-u-1')).toBeTruthy());
      await fireEvent.press(getByTestId('user-actions-u-1'));

      await fireEvent.press(getByTestId(testID));

      expect(alert).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();
      alert.mockRestore();
    },
  );

  // ── THE PROFILE ──────────────────────────────────────────────────────────────────────────────

  // Tapping the CARD opens the profile; the ⋮ opens the sheet. Two targets on one row, and they
  // must not be the same one — a row that opened the sheet everywhere would make the profile
  // unreachable.
  it('opens the profile from the row, not the sheet', async () => {
    api.getUsers.mockResolvedValue([user()]);

    const { getByTestId, queryByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('user-row-u-1')).toBeTruthy());

    await fireEvent.press(getByTestId('user-row-u-1'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls[0][0]).toMatchObject({ pathname: '/user-profile' });
    expect(queryByTestId('sheet-edit')).toBeNull();
  });

  // The profile is handed the record rather than re-fetching it, and the empty fields cross as ''
  // rather than as "null" — a route param is a string, and `String(null)` prints the word.
  it('hands the profile what it already knows, with no nulls stringified', async () => {
    api.getUsers.mockResolvedValue([
      user({ user_id: 'u-1', email: null, phone_number: null, photo_url: null, department: null }),
    ]);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('user-row-u-1')).toBeTruthy());

    await fireEvent.press(getByTestId('user-row-u-1'));

    expect(mockPush.mock.calls[0][0]).toMatchObject({
      params: { email: '', phone_number: '', photo_url: '', department: '' },
    });
  });

  // ── THE INVITE ───────────────────────────────────────────────────────────────────────────────

  it('says the invite flow is not on mobile yet, rather than opening nothing', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    api.getUsers.mockResolvedValue([user()]);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('invite-user-fab')).toBeTruthy());

    await fireEvent.press(getByTestId('invite-user-fab'));

    expect(alert).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});
