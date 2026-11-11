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
// The link beside "Recent Missions" read "Close" while opening the mission detail, with no role;
// since D36 (2026-11-12) it reads "View all" in Thai and English and is announced as a button.
// The rest of the screen's text followed into Thai and English the same day.

import { render, fireEvent } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import { useLocaleStore } from '../../../store/localeStore';
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
    useLocaleStore.setState({ locale: 'en' });
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

  it('"View all" beside "Recent Missions" is a button that opens the mission detail', async () => {
    const { getByTestId, getByText, getByRole, queryByText } = await renderScreen();

    expect(getByText('Recent Missions')).toBeTruthy();
    const link = getByTestId('recent-missions-view-all');
    expect(getByRole('button', { name: 'View all' })).toBe(link);
    expect(queryByText('Close')).toBeNull();

    await fireEvent.press(link);

    expect(mockPush).toHaveBeenCalledWith('/drone-mission-detail');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('reads "ดูทั้งหมด" in Thai', async () => {
    useLocaleStore.setState({ locale: 'th' });
    const { getByRole } = await renderScreen();

    expect(getByRole('button', { name: 'ดูทั้งหมด' })).toBeTruthy();
  });

  it('goes back', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('drone-back-btn'));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('labels the back button for a screen reader', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('drone-back-btn').props.accessibilityLabel).toBe('← Back');
  });

  it('reads in Thai, and the survey toggle still keeps its three parts together', async () => {
    useLocaleStore.setState({ locale: 'th' });
    const { getByTestId, getByText, getByLabelText, queryByText } = await renderScreen();

    expect(getByTestId('drone-back-btn').props.accessibilityLabel).toBe('← กลับ');
    expect(getByText('พร้อมทำงาน')).toBeTruthy();
    expect(getByLabelText('เริ่มสำรวจแบบเรียลไทม์')).toBeTruthy();
    expect(getByText('เสาเหล็กเสริม 14 ต้น')).toBeTruthy();

    await fireEvent.press(getByTestId('toggle-survey-btn'));

    expect(getByLabelText('หยุดสำรวจ')).toBeTruthy();
    expect(getByText('กำลังสำรวจ 00:14:22')).toBeTruthy();
    expect(queryByText('พร้อมทำงาน')).toBeNull();
  });

  // Pins the screen's English, word for word as it was before the text moved into en.json.
  it('keeps its English text and labels', async () => {
    const { getByText, getAllByText, getByLabelText } = await renderScreen();

    for (const text of [
      'DJI M300 RTK • CONNECTED',
      'RTK FIX: 1.2cm',
      'Power',
      'Altitude',
      'GPS Sat',
      'Signal',
      'AI EDGE',
      'Edge Confidence',
      'Detected Elements',
      '14 Rebar Columns',
      '12k Polygons',
      'Orthomosaic 2D',
    ])
      expect(getByText(text)).toBeTruthy();
    for (const text of ['Point Cloud', 'Orbit Scan']) expect(getAllByText(text)).toHaveLength(1);
    for (const label of ['Mission Details', 'Point Cloud', 'Orbit Scan'])
      expect(getByLabelText(label)).toBeTruthy();
  });
});
