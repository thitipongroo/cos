// Behaviour of the drone reality-capture screen.
//
// A capture console: telemetry, a viewport with a survey state, a start / stop button, two scan
// modes, and the way into the mission detail. The telemetry and the mission are constants in the
// screen (no drone or API behind it yet); what is checked is the survey toggle — its label, its
// accessibility label and the viewport state must agree — and that every way into the mission
// detail goes there.
//
// NOT TESTED: the two scan-mode buttons. Pressing one changes only a style and an icon colour —
// no text, no accessibilityState.selected — so there is nothing a test (or a screen reader) can
// observe; a test that pressed them could not fail (register Open item).
//
// RECORDED AS IT IS, NOT ENDORSED: the link beside "Recent Missions" reads "Close" (common.close)
// yet opens the mission detail, and has no accessibility role. The test pins the current behaviour so
// a change is deliberate (register Open item).

import { render, fireEvent } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import DroneRealityCaptureScreen from '../drone-capture';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
}));

function renderScreen() {
  return render(
    <I18nProvider>
      <DroneRealityCaptureScreen />
    </I18nProvider>,
  );
}

describe('DroneRealityCaptureScreen', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockBack.mockReset();
  });

  it('shows the console in standby', async () => {
    const { getByText, getByLabelText } = await renderScreen();

    expect(getByText('Reality Capture')).toBeTruthy();
    expect(getByText('Live Telemetry')).toBeTruthy();
    expect(getByText('STANDBY READY')).toBeTruthy();
    expect(getByText('START REAL-TIME SURVEY')).toBeTruthy();
    expect(getByLabelText('Start Real-Time Survey')).toBeTruthy();
  });

  it('shows the drone telemetry', async () => {
    const { getByText } = await renderScreen();

    for (const v of ['84%', '122m', '18', '-65dB']) expect(getByText(v)).toBeTruthy();
  });

  // Button text, accessibility label and viewport state are three separate expressions of one flag.
  it('starting a survey switches the button, its label and the viewport together', async () => {
    const { getByTestId, getByText, getByLabelText, queryByText } = await renderScreen();

    await fireEvent.press(getByTestId('toggle-survey-btn'));

    expect(getByText('STOP SURVEY')).toBeTruthy();
    expect(getByLabelText('Stop Survey')).toBeTruthy();
    expect(getByText('SURVEYING 00:14:22')).toBeTruthy();
    expect(queryByText('STANDBY READY')).toBeNull();
  });

  it('stopping it returns to standby', async () => {
    const { getByTestId, getByText, queryByText } = await renderScreen();

    await fireEvent.press(getByTestId('toggle-survey-btn'));
    await fireEvent.press(getByTestId('toggle-survey-btn'));

    expect(getByText('START REAL-TIME SURVEY')).toBeTruthy();
    expect(getByText('STANDBY READY')).toBeTruthy();
    expect(queryByText('STOP SURVEY')).toBeNull();
  });

  it.each([
    ['the layers button in the header', 'drone-detail-nav-btn'],
    ['the recent mission card', 'recent-mission-card-1'],
  ])('%s opens the mission detail', async (_what, testID) => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId(testID));

    expect(mockPush).toHaveBeenCalledWith('/drone-mission-detail');
  });

  it('the link beside "Recent Missions" reads "Close" yet opens the mission detail (as built)', async () => {
    const { getByText } = await renderScreen();

    expect(getByText('Recent Missions')).toBeTruthy();
    await fireEvent.press(getByText('Close'));

    expect(mockPush).toHaveBeenCalledWith('/drone-mission-detail');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('goes back', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('drone-back-btn'));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
