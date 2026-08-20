// Behaviour of the header avatar.
//
// Three things in order — photo, then initials, then a person glyph — and each fallback exists
// because the one before it can fail in production: an account may have no photo, a stored URL can
// expire, and a display name can be missing or unreadable. PO 2026-08-20 made that last step the
// app-wide rule, so this is one of the two places it is asserted at the component level.
//
// The accessibility role is behaviour, not decoration: inside the navigation drawer the avatar has
// no handler and must announce as an IMAGE. A screen reader offering to activate something that
// does nothing is worse than a plain graphic (§20.8).

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { useAuthStore } from '../../store/authStore';
import { Avatar } from '../Avatar';

jest.mock('../../api/users', () => ({
  ...jest.requireActual('../../api/users'),
  getMe: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../api/users') as { getMe: jest.Mock };

function renderAvatar(props: Record<string, unknown> = {}) {
  return render(<Avatar testID="avatar" {...props} />);
}

describe('Avatar', () => {
  beforeEach(() => {
    api.getMe.mockReset();
    api.getMe.mockResolvedValue({ photo_url: null });
    useAuthStore.setState({ displayName: 'Waraporn Klinhom' } as never);
  });

  it('shows the photo when the account has one', async () => {
    api.getMe.mockResolvedValue({ photo_url: 'https://example.test/p.jpg' });

    const { getByTestId } = await renderAvatar();

    await waitFor(() => expect(getByTestId('avatar-photo')).toBeTruthy());
  });

  it('falls back to initials when there is no photo', async () => {
    const { getByTestId } = await renderAvatar();

    await waitFor(() => expect(getByTestId('avatar-initials')).toBeTruthy());
    expect(getByTestId('avatar-initials').props.children).toBe('WK');
  });

  // A stored URL that 404s or expires must not leave a blank circle in the header.
  it('falls back to initials when the photo will not load', async () => {
    api.getMe.mockResolvedValue({ photo_url: 'https://example.test/gone.jpg' });

    const { getByTestId, queryByTestId } = await renderAvatar();

    await waitFor(() => expect(getByTestId('avatar-photo')).toBeTruthy());
    await fireEvent(getByTestId('avatar-photo'), 'error');

    await waitFor(() => expect(getByTestId('avatar-initials')).toBeTruthy());
    expect(queryByTestId('avatar-photo')).toBeNull();
  });

  // PO 2026-08-20 — the last step of the chain. `initialsOf` returns '' rather than a placeholder
  // string precisely so the caller can draw this.
  it('falls back to a person glyph when the name yields no initials', async () => {
    useAuthStore.setState({ displayName: '   ' } as never);

    const { queryByTestId } = await renderAvatar();

    await waitFor(() => expect(queryByTestId('avatar-initials')).toBeNull());
    expect(queryByTestId('avatar-photo')).toBeNull();
  });

  it('draws the header even when the profile request fails offline', async () => {
    api.getMe.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderAvatar();

    // The name comes from the persisted session, so nothing about the header waits on the network.
    await waitFor(() => expect(getByTestId('avatar-initials')).toBeTruthy());
  });

  it('announces as a button, and acts, where it navigates', async () => {
    const onPress = jest.fn();

    const { getByTestId } = await renderAvatar({ onPress });

    expect(getByTestId('avatar').props.accessibilityRole).toBe('button');
    await fireEvent.press(getByTestId('avatar'));
    expect(onPress).toHaveBeenCalled();
  });

  // Inside the drawer it is decoration: the drawer IS the profile, so there is nowhere to go.
  it('announces as an image, and is inert, where it does not', async () => {
    const { getByTestId } = await renderAvatar();

    expect(getByTestId('avatar').props.accessibilityRole).toBe('image');
    expect(getByTestId('avatar').props.accessibilityState.disabled).toBe(true);
  });

  it('speaks the name it is showing', async () => {
    const { getByTestId } = await renderAvatar();

    expect(getByTestId('avatar').props.accessibilityLabel).toBe('Waraporn Klinhom');
  });
});
