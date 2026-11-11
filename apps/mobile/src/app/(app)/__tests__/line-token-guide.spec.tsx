// Behaviour of the LINE token guide.
//
// The screen is a set of instructions with two ways out: the COS settings screen where the token is
// pasted, and LINE's own developer console where it is issued. What can go wrong is pointing either
// of them somewhere else, or losing a step — the four steps are the whole procedure, in order.

import { render, fireEvent, within } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { I18nProvider } from '../../../i18n';
import LineTokenGuideScreen from '../line-token-guide';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
}));

function renderScreen() {
  return render(
    <I18nProvider>
      <LineTokenGuideScreen />
    </I18nProvider>,
  );
}

describe('LineTokenGuideScreen', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockBack.mockReset();
  });
  afterEach(() => jest.restoreAllMocks());

  it('shows the guide', async () => {
    const { getByTestId, getByText } = await renderScreen();

    expect(getByTestId('line-token-guide-screen')).toBeTruthy();
    expect(getByText('LINE Token Guide')).toBeTruthy();
    expect(getByText('LINE Messaging API Token Setup')).toBeTruthy();
  });

  // The procedure only works in this order: a provider before a channel, a channel before a token,
  // and the token last into COS.
  it('lists the four steps in order, each with where to do it', async () => {
    const { getByTestId } = await renderScreen();

    const expected = [
      ['Register or Open Provider', 'developers.line.biz > Create Provider'],
      ['Create Messaging API Channel', 'Channel Type: Messaging API'],
      ['Issue Channel Access Token', 'Messaging API Tab > Issue Channel Access Token'],
      ['Save into COS System Settings', 'COS System Settings > LINE Channel Token'],
    ];
    // Each title and hint looked up INSIDE its numbered card, so two steps swapping content fails.
    expected.forEach(([title, hint], i) => {
      const card = within(getByTestId(`guide-step-${i + 1}`));
      expect(card.getByText(title)).toBeTruthy();
      expect(card.getByText(hint)).toBeTruthy();
    });
  });

  it('sends the user to System Settings to paste the token', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('line-guide-settings-btn'));

    expect(mockPush).toHaveBeenCalledWith('/system-settings');
  });

  it("opens LINE's developer console, where the token is issued", async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('line-guide-console-btn'));

    expect(openURL).toHaveBeenCalledWith('https://developers.line.biz/console/');
  });

  it('goes back to where the user came from', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('line-guide-back-btn'));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('labels its buttons for a screen reader', async () => {
    const { getByLabelText } = await renderScreen();

    expect(getByLabelText('Go to System Settings')).toBeTruthy();
    expect(getByLabelText('Open LINE Developers')).toBeTruthy();
  });
});
