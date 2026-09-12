// Behaviour of the profile screen (Stitch 7367a779…, read-only — PO decision E5).
//
// THE SCREEN READS. The drawing is an edit form with three inputs, SAVE PROFILE and CANCEL, and
// none of the three has a self-service write: `users/me` carries GET and PATCH me/photo, the
// employee code is the EMPLOYER's identifier, and the phone number is the Path A login identifier
// that §5.4.4 fixes for the life of the account. So the assertions below are as much about what is
// NOT on the screen as about what is — a SAVE button over fields nothing writes is the drawn
// control this project keeps refusing to ship.
//
// EVERY ABSENT VALUE HAS A WORD. A missing employee code is information — office roles have no
// worker record at all — and a blank box is not.
//
// THE PHOTO IS THE ONE EXCEPTION to the read-only rule (decision E5), so its cases sit apart at the
// bottom: pick, upload, point the account at the permanent URL (ADR-105), and say so when it fails.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { I18nProvider } from '../../../i18n';
import { useAuthStore } from '../../../store/authStore';
import ProfileScreen from '../profile';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../../api/users', () => ({ getMe: jest.fn(), uploadMyPhoto: jest.fn() }));

jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const users = require('../../../api/users') as { getMe: jest.Mock; uploadMyPhoto: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const picker = require('expo-image-picker') as { launchImageLibraryAsync: jest.Mock };

const ME = {
  user_id: 'u-1111-aaaa-bbbb-cccc',
  email: '',
  display_name: 'สมชาย ใจดี',
  photo_url: null,
  role: 'SITE_ENGINEER',
  mfa_enabled: true,
  employee_code: 'SE-0942',
  position: 'Site Supervisor',
  phone_number: '+66812345678',
};

function renderScreen() {
  return render(
    <I18nProvider>
      <ProfileScreen />
    </I18nProvider>,
  );
}

describe('ProfileScreen', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    users.getMe.mockReset();
    users.getMe.mockResolvedValue(ME);
    users.uploadMyPhoto.mockReset();
    users.uploadMyPhoto.mockResolvedValue({ photo_url: 'https://api.test/api/v1/files/f-9/image' });
    picker.launchImageLibraryAsync.mockReset();
    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/picked.jpg' }],
    });
    useAuthStore.setState({
      displayName: 'สมชาย ใจดี',
      userId: 'u-1111-aaaa-bbbb-cccc',
    } as never);
  });

  afterEach(() => alert.mockRestore());

  it('shows the three fields the drawing draws, with their real values', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('profile-field-employee-code')).toBeTruthy());
    expect(getByTestId('profile-field-name')).toHaveTextContent(/สมชาย/);
    expect(getByTestId('profile-field-employee-code')).toHaveTextContent(/SE-0942/);
    expect(getByTestId('profile-field-phone')).toHaveTextContent(/\+66812345678/);
  });

  // The drawing's own note, kept verbatim in Thai — the employer issues the code.
  it('keeps the note saying the employee code cannot be changed here', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('profile-field-employee-code')).toBeTruthy());
    expect(getByTestId('profile-field-employee-code')).toHaveTextContent(/cannot be changed/i);
  });

  // E6 — the phone is the Path A login identifier, and §5.4.4 fixes one identifier per account for
  // its lifetime. A field that edited it would be a field that could lock someone out.
  it('says the phone number is what you sign in with', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('profile-field-phone')).toBeTruthy());
    expect(getByTestId('profile-field-phone')).toHaveTextContent(/sign in/i);
  });

  // NOT A CONTROL. None of the four boxes may become an input by accident — the whole screen's
  // premise is that there is nothing behind one.
  it('offers no editable field and no SAVE button', async () => {
    const { getByTestId, queryByText, toJSON } = await renderScreen();
    const queryAllByProp = (prop: string): unknown[] => {
      const found: unknown[] = [];
      const walk = (node: unknown): void => {
        if (node == null || typeof node !== 'object') return;
        const n = node as { props?: Record<string, unknown>; children?: unknown[] };
        if (n.props && prop in n.props) found.push(node);
        for (const child of n.children ?? []) walk(child);
      };
      walk(toJSON());
      return found;
    };

    await waitFor(() => expect(getByTestId('profile-field-name')).toBeTruthy());
    expect(queryByText(/save profile/i)).toBeNull();
    expect(queryByText(/^cancel$/i)).toBeNull();
    // Not one TextInput on the screen: the boxes LOOK like the drawing's inputs and must never
    // quietly become them. `editable` is the prop every RN text input carries, so its total absence
    // is the assertion — a stricter type query would pass on a component that merely wraps one.
    expect(queryAllByProp('editable')).toHaveLength(0);
  });

  // It says WHO can change these instead, which is what a screen owes a user who came to change one.
  it('names who can correct the record', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('profile-change-note')).toBeTruthy());
    expect(getByTestId('profile-change-note')).toHaveTextContent(/tenant admin/i);
  });

  // NULL IS THE COMMON CASE — `workforce.workers.user_id` is nullable and office roles have no
  // worker record. It must read as "no code issued", never as a blank.
  it('says no code issued rather than leaving the box empty', async () => {
    users.getMe.mockResolvedValue({ ...ME, employee_code: null });

    const { getByTestId } = await renderScreen();

    await waitFor(() =>
      expect(getByTestId('profile-field-employee-code')).toHaveTextContent(/No code issued/i),
    );
  });

  it('says not set for a Path B account with no phone number', async () => {
    users.getMe.mockResolvedValue({ ...ME, phone_number: null, email: 'a@b.com' });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('profile-field-phone')).toHaveTextContent(/Not set/i));
  });

  // ADR-101 — a null position draws NOTHING. No placeholder, no dash, no role enum. Null is the
  // ordinary case because no route sets one.
  it('draws no position line when the column is null', async () => {
    users.getMe.mockResolvedValue({ ...ME, position: null });

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('profile-field-name')).toBeTruthy());
    expect(queryByTestId('profile-position')).toBeNull();
  });

  it('draws the position when the column carries one', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() =>
      expect(getByTestId('profile-position')).toHaveTextContent(/Site Supervisor/),
    );
  });

  // §32.7:622 prohibits hard-hat imagery and the drawing's headshot was an externally hosted image.
  // With no photo on the account the avatar is the person's initials, as <Avatar /> has always done.
  it('falls back to initials when the account has no photo', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('profile-initials')).toBeTruthy());
    expect(queryByTestId('profile-photo')).toBeNull();
  });

  it('shows the uploaded photo when the account has one', async () => {
    users.getMe.mockResolvedValue({ ...ME, photo_url: 'https://files.cos.local/f/1/a.jpg' });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('profile-photo')).toBeTruthy());
  });

  // ONE SYNC INDICATOR, ONE PRECEDENCE. The drawing carries two readings — `SYNCED` and `ออนไลน์` —
  // and this shell has one: offline is not a fifth state, it produces pending.
  it('carries a single sync state, from the shared precedence', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('profile-sync-card')).toBeTruthy());
  });

  // The drawer falls back to the persisted session name and the short UUID when the fetch fails;
  // this screen is the same block and must not become a page of blanks.
  it('still names the user when GET /users/me fails', async () => {
    users.getMe.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('profile-name')).toHaveTextContent(/สมชาย/));
    expect(getByTestId('profile-field-user-id')).toBeTruthy();
  });
  // ── แก้ไขรูปภาพ — the one control on this screen (E5, ADR-105) ───────────────────────────────
  describe('change photo', () => {
    it('uploads the picked image and shows it without a reload', async () => {
      const { getByTestId } = await renderScreen();

      await waitFor(() => expect(getByTestId('profile-change-photo')).toBeTruthy());
      await fireEvent.press(getByTestId('profile-change-photo'));

      await waitFor(() =>
        expect(users.uploadMyPhoto).toHaveBeenCalledWith('file:///tmp/picked.jpg'),
      );
      // The new URL replaces the old one in place — a screen that needed a reload to show the photo
      // you just chose reads as a failed upload.
      await waitFor(() => expect(getByTestId('profile-photo')).toBeTruthy());
    });

    // A crop at pick time is the only point where the USER decides which square of their photo is
    // the face — every surface draws this in a circle.
    it('asks for a square crop, because the avatar is always a circle', async () => {
      const { getByTestId } = await renderScreen();

      await waitFor(() => expect(getByTestId('profile-change-photo')).toBeTruthy());
      await fireEvent.press(getByTestId('profile-change-photo'));

      await waitFor(() => expect(picker.launchImageLibraryAsync).toHaveBeenCalled());
      expect(picker.launchImageLibraryAsync.mock.calls[0]?.[0]).toMatchObject({
        allowsEditing: true,
        aspect: [1, 1],
      });
    });

    // CANCELLING IS THE ORDINARY OUTCOME, not an error. Someone who opens the library and thinks
    // better of it gets silence.
    it('says nothing and uploads nothing when the picker is cancelled', async () => {
      picker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });

      const { getByTestId } = await renderScreen();

      await waitFor(() => expect(getByTestId('profile-change-photo')).toBeTruthy());
      await fireEvent.press(getByTestId('profile-change-photo'));

      await waitFor(() => expect(picker.launchImageLibraryAsync).toHaveBeenCalled());
      expect(users.uploadMyPhoto).not.toHaveBeenCalled();
      expect(alert).not.toHaveBeenCalled();
    });

    it('uploads nothing when the picker returns no asset', async () => {
      picker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [] });

      const { getByTestId } = await renderScreen();

      await waitFor(() => expect(getByTestId('profile-change-photo')).toBeTruthy());
      await fireEvent.press(getByTestId('profile-change-photo'));

      await waitFor(() => expect(picker.launchImageLibraryAsync).toHaveBeenCalled());
      expect(users.uploadMyPhoto).not.toHaveBeenCalled();
    });

    it('says the photo was not saved rather than leaving it looking saved', async () => {
      users.uploadMyPhoto.mockRejectedValue(new Error('offline'));

      const { getByTestId } = await renderScreen();

      await waitFor(() => expect(getByTestId('profile-change-photo')).toBeTruthy());
      await fireEvent.press(getByTestId('profile-change-photo'));

      await waitFor(() => expect(alert).toHaveBeenCalled());
      expect(String(alert.mock.calls.at(-1))).toMatch(/not saved|could not be uploaded/i);
    });

    // A second pick mid-upload would race two uploads and leave whichever finished last as the
    // photo — not necessarily the one the user chose last.
    it('ignores a second press while an upload is in flight', async () => {
      let release: (value: { photo_url: string }) => void = () => undefined;
      users.uploadMyPhoto.mockReturnValue(
        new Promise<{ photo_url: string }>((resolve) => {
          release = resolve;
        }),
      );

      const { getByTestId } = await renderScreen();
      await waitFor(() => expect(getByTestId('profile-change-photo')).toBeTruthy());

      await fireEvent.press(getByTestId('profile-change-photo'));
      await waitFor(() => expect(users.uploadMyPhoto).toHaveBeenCalledTimes(1));
      await fireEvent.press(getByTestId('profile-change-photo'));

      expect(users.uploadMyPhoto).toHaveBeenCalledTimes(1);
      release({ photo_url: 'https://api.test/api/v1/files/f-9/image' });
      await waitFor(() => expect(getByTestId('profile-change-photo')).toBeTruthy());
    });
  });
});
