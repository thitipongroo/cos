// Behaviour of the biometric app lock.
//
// A lock is only worth having if it cannot trap anyone. The rule this component exists to keep is
// TWO WAYS OUT, ALWAYS: the prompt can be retried, and "Sign out instead" is offered whatever the
// sensor does. A cracked reader or a wet glove on a site is enough to make the prompt unwinnable,
// and a worker in that state must still be able to hand the handset to a colleague who can sign in.
// Signing out clears the session; it does not bypass it.
//
// The other rule is a guard against the component's own history: `prompt` changes identity on every
// `busy` flip, so putting it in the effect's dependency array re-fires the OS dialog the instant the
// first one settles — an unclosable loop of system prompts. The effect keys on the GATE opening.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import { useAuthStore } from '../../store/authStore';
import { useBiometricStore } from '../../store/biometricStore';
import { BiometricLock } from '../BiometricLock';

function renderLock() {
  return render(
    <I18nProvider>
      <BiometricLock />
    </I18nProvider>,
  );
}

describe('BiometricLock', () => {
  let unlock: jest.Mock;
  let logout: jest.Mock;

  beforeEach(() => {
    unlock = jest.fn().mockResolvedValue(undefined);
    logout = jest.fn().mockResolvedValue(undefined);
    useBiometricStore.setState({ locked: false, unlock } as never);
    useAuthStore.setState({ logout } as never);
  });

  // It costs nothing for the users who never turn it on.
  it('draws nothing while the gate is down', async () => {
    const { queryByTestId } = await renderLock();

    expect(queryByTestId('biometric-lock')).toBeNull();
    expect(unlock).not.toHaveBeenCalled();
  });

  it('covers the app while the gate is up', async () => {
    useBiometricStore.setState({ locked: true, unlock } as never);

    const { getByTestId } = await renderLock();

    await waitFor(() => expect(getByTestId('biometric-lock')).toBeTruthy());
  });

  // The lock is an obstacle, not a screen anyone wants to read, so the fastest way through it is
  // the right default.
  it('prompts as soon as the gate goes up, without a tap', async () => {
    useBiometricStore.setState({ locked: true, unlock } as never);

    await renderLock();

    await waitFor(() => expect(unlock).toHaveBeenCalledTimes(1));
  });

  // THE LOOP THIS GUARDS AGAINST: one prompt per gate opening, not one per re-render.
  it('prompts once, not once per render', async () => {
    useBiometricStore.setState({ locked: true, unlock } as never);

    const { getByTestId } = await renderLock();

    await waitFor(() => expect(getByTestId('biometric-lock-unlock')).toBeTruthy());
    await waitFor(() => expect(unlock).toHaveBeenCalledTimes(1));
  });

  it('retries on demand', async () => {
    useBiometricStore.setState({ locked: true, unlock } as never);

    const { getByTestId } = await renderLock();
    await waitFor(() => expect(unlock).toHaveBeenCalledTimes(1));

    await fireEvent.press(getByTestId('biometric-lock-unlock'));

    await waitFor(() => expect(unlock).toHaveBeenCalledTimes(2));
  });

  // THE SECOND WAY OUT. It is offered whatever the sensor did.
  it('always offers signing out', async () => {
    useBiometricStore.setState({ locked: true, unlock } as never);

    const { getByTestId } = await renderLock();

    await waitFor(() => expect(getByTestId('biometric-lock-signout')).toBeTruthy());
  });

  it('signs out rather than bypassing the lock', async () => {
    useBiometricStore.setState({ locked: true, unlock } as never);

    const { getByTestId } = await renderLock();
    await waitFor(() => expect(getByTestId('biometric-lock-signout')).toBeTruthy());

    await fireEvent.press(getByTestId('biometric-lock-signout'));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });

  // A refused prompt resolves FALSE rather than throwing: lib/biometric.authenticate catches a
  // native throw and reads it as 'unavailable', because the alternative is a signed-in user
  // permanently unable to reach the app. So this is what the component actually sees when the
  // sensor says no — and both exits have to survive it.
  it('still offers both exits when the prompt is refused', async () => {
    unlock.mockResolvedValue(false);
    useBiometricStore.setState({ locked: true, unlock } as never);

    const { getByTestId } = await renderLock();

    await waitFor(() => expect(getByTestId('biometric-lock-signout')).toBeTruthy());
    expect(getByTestId('biometric-lock-unlock')).toBeTruthy();
  });

  it('lets a refused prompt be retried', async () => {
    unlock.mockResolvedValue(false);
    useBiometricStore.setState({ locked: true, unlock } as never);

    const { getByTestId } = await renderLock();
    await waitFor(() => expect(unlock).toHaveBeenCalledTimes(1));

    await fireEvent.press(getByTestId('biometric-lock-unlock'));

    await waitFor(() => expect(unlock).toHaveBeenCalledTimes(2));
    expect(getByTestId('biometric-lock')).toBeTruthy();
  });

  it('lifts the cover once the gate comes down', async () => {
    useBiometricStore.setState({ locked: true, unlock } as never);

    const { getByTestId, queryByTestId } = await renderLock();
    await waitFor(() => expect(getByTestId('biometric-lock')).toBeTruthy());

    useBiometricStore.setState({ locked: false } as never);

    await waitFor(() => expect(queryByTestId('biometric-lock')).toBeNull());
  });
});
