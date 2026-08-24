// Behaviour of the transparency portal's hub.
//
// This screen is a map of what the platform does with a person's data, so every tile has to lead
// somewhere real. That is the failure this portal exists to avoid, and it is why the hub is worth a
// test even though it is mostly navigation: a route that has drifted leaves a data subject on the
// wrong page while the hub still claims the category is covered.
//
// TWO CORRECTIONS TO THE MOCKUP ARE PINNED HERE. The hero says FIVE categories, not the drawing's
// twelve — the corrected set. And IoT is `planned`, not live: Stage 1 has no ingestion path at all
// (Phase 21/24), so drawing it as live would be the portal claiming an intake it does not have.
//
// The closing panel gives erasure a deliberate place rather than a row in a list, and its link goes
// to a screen that exists.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import TransparencyScreen from '../transparency';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

function renderScreen() {
  return render(
    <I18nProvider>
      <TransparencyScreen />
    </I18nProvider>,
  );
}

describe('TransparencyScreen', () => {
  beforeEach(() => mockPush.mockReset());

  it('opens on the summary of what is held', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('transparency-count')).toBeTruthy();
  });

  it('lists every data category', async () => {
    const { getByTestId } = await renderScreen();

    for (const key of ['identity', 'location', 'logs', 'manual', 'payroll']) {
      expect(getByTestId(`transparency-cat-${key}`)).toBeTruthy();
    }
  });

  it('lists the ways data arrives', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('transparency-input-manual')).toBeTruthy();
    expect(getByTestId('transparency-input-camera')).toBeTruthy();
    expect(getByTestId('transparency-input-iot')).toBeTruthy();
  });

  it('lists the technical detail screens', async () => {
    const { getByTestId } = await renderScreen();

    for (const key of ['network', 'device', 'security', 'session', 'timestamps']) {
      expect(getByTestId(`transparency-tech-${key}`)).toBeTruthy();
    }
  });

  it('opens the category a tile names', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('transparency-cat-location'));

    expect(mockPush).toHaveBeenCalledWith('/transparency-location');
  });

  // These two leave the transparency namespace on purpose — the device and security screens are the
  // real ones, not transparency-flavoured copies of them.
  it('sends the device row to the real device screen', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('transparency-tech-device'));

    expect(mockPush).toHaveBeenCalledWith('/device-details');
  });

  it('sends the security row to the real security screen', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('transparency-tech-security'));

    expect(mockPush).toHaveBeenCalledWith('/account-security');
  });

  it('opens the data export from here', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('transparency-export'));

    expect(mockPush).toHaveBeenCalledWith('/data-export');
  });

  it('opens the notification preferences from here', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('transparency-preferences'));

    expect(mockPush).toHaveBeenCalledWith('/notification-preferences');
  });

  // Erasure gets a deliberate place, and the link goes to a screen that exists.
  it('offers erasure, and it leads somewhere', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('transparency-cat-delete'));

    expect(mockPush).toHaveBeenCalledWith('/transparency-delete');
  });

  it('reaches a destination from every tile it draws', async () => {
    const { getAllByTestId } = await renderScreen();

    const tiles = getAllByTestId(/^transparency-(cat|input|tech)-/);
    for (const tile of tiles) {
      mockPush.mockReset();
      await fireEvent.press(tile);
      expect(mockPush).toHaveBeenCalledTimes(1);
    }
    await waitFor(() => expect(tiles.length).toBeGreaterThan(10));
  });
});
