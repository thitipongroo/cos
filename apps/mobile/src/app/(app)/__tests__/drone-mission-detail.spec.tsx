// Behaviour of the drone mission detail screen.
//
// A survey summary: three map layers to switch between, the cut / fill volumes, the mission
// metadata, and two buttons that "export" the report. The figures are constants in the screen (no
// API behind it yet), so what is checked is that each layer button shows its layer and that the
// volumes on screen agree with each other: cut − fill must equal the net balance it prints.
//
// No export exists behind this screen yet. Both export buttons used to announce a report "generated
// successfully"; since D36 (2026-11-12) they say, in Thai and English, that export is not available
// and nothing was generated. The last tests hold them to that. Their own labels said "Download
// Signed Survey PDF" and "Export Survey Report"; since D37 (2026-11-12) both read "Export report
// (coming soon)", in Thai and English, like the rest of the screen.

import { render, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { I18nProvider } from '../../../i18n';
import { useLocaleStore } from '../../../store/localeStore';
import DroneMissionDetailScreen from '../drone-mission-detail';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn() }),
}));

function renderScreen() {
  return render(
    <I18nProvider>
      <DroneMissionDetailScreen />
    </I18nProvider>,
  );
}

const LAYERS: [label: string, caption: string][] = [
  ['2D Orthophoto', 'High-Resolution 2D Orthomosaic'],
  ['Elevation Heatmap', 'Digital Surface Model (-2.4m to +18.2m)'],
  ['Topo Contours', 'Interpolated Topo Contours (0.5m Intervals)'],
];

describe('DroneMissionDetailScreen', () => {
  beforeEach(() => {
    mockBack.mockReset();
    useLocaleStore.setState({ locale: 'en' });
  });
  afterEach(() => jest.restoreAllMocks());

  it('shows the survey with the orthophoto layer first', async () => {
    const { getByTestId, getByText } = await renderScreen();

    expect(getByTestId('drone-mission-detail-screen')).toBeTruthy();
    expect(getByText('Sector 7B • Earthwork Survey')).toBeTruthy();
    expect(getByText('High-Resolution 2D Orthomosaic')).toBeTruthy();
  });

  it.each(LAYERS)('the "%s" button shows that layer, and only that one', async (label, caption) => {
    const { getByLabelText, getByText, queryByText } = await renderScreen();

    // Start from a different layer so the press is what changes it.
    const other = LAYERS.find(([l]) => l !== label)!;
    await fireEvent.press(getByLabelText(other[0]));
    await fireEvent.press(getByLabelText(label));

    expect(getByText(caption)).toBeTruthy();
    for (const [, c] of LAYERS) if (c !== caption) expect(queryByText(c)).toBeNull();
  });

  // The net balance is printed separately from the two volumes, so it can drift from them.
  it('prints a net balance that is cut minus fill', async () => {
    const { getByText } = await renderScreen();

    const cut = 14250;
    const fill = 8920;
    expect(getByText('14,250 m³')).toBeTruthy();
    expect(getByText('8,920 m³')).toBeTruthy();
    expect(getByText(`+${(cut - fill).toLocaleString('en-US')} m³ Surplus Cut`)).toBeTruthy();
  });

  it('shows the mission metadata', async () => {
    const { getByText } = await renderScreen();

    expect(getByText('Zenmuse P1 (45MP Full Frame)')).toBeTruthy();
    expect(getByText('6 RTK Base Points (RMSE 1.1cm)')).toBeTruthy();
    expect(getByText('WGS84 / UTM Zone 47N (EPSG:32647)')).toBeTruthy();
  });

  it('goes back', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('mission-back-btn'));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it.each(['mission-export-btn', 'download-survey-btn'])(
    '%s says export is not available yet, and that nothing was generated',
    async (testID) => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      const { getByTestId } = await renderScreen();

      await fireEvent.press(getByTestId(testID));

      expect(alert).toHaveBeenCalledTimes(1);
      expect(alert).toHaveBeenCalledWith(
        'Report export not available yet',
        'Exporting the survey report (Civil 3D LandXML and PDF) is not available yet. Nothing has been generated.',
        [{ text: 'OK' }],
      );
      expect(JSON.stringify(alert.mock.calls)).not.toMatch(/success/i);
    },
  );

  it('says the same in Thai', async () => {
    useLocaleStore.setState({ locale: 'th' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('download-survey-btn'));

    expect(alert).toHaveBeenCalledWith(
      'ยังส่งออกรายงานไม่ได้',
      'ระบบยังไม่รองรับการส่งออกรายงานสำรวจ (Civil 3D LandXML และ PDF) ยังไม่มีการสร้างไฟล์ใด ๆ',
      [{ text: 'ตกลง' }],
    );
  });

  // D37: no "Signed", no "PDF", no "Download" — the buttons say export is coming, nothing more.
  it('labels both export buttons "coming soon"', async () => {
    const { getByTestId, getByText, queryByText } = await renderScreen();

    for (const id of ['mission-export-btn', 'download-survey-btn'])
      expect(getByTestId(id).props.accessibilityLabel).toBe('Export report (coming soon)');
    expect(getByText('Export report (coming soon)')).toBeTruthy();
    expect(queryByText(/Signed|PDF|Download/)).toBeNull();
  });

  it('labels the back button for a screen reader', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('mission-back-btn').props.accessibilityLabel).toBe('← Back');
  });

  it('reads in Thai: layers, volumes and the export buttons', async () => {
    useLocaleStore.setState({ locale: 'th' });
    const { getByTestId, getByText, getByLabelText } = await renderScreen();

    expect(getByTestId('mission-back-btn').props.accessibilityLabel).toBe('← กลับ');
    expect(getByText('Sector 7B • สำรวจงานดิน')).toBeTruthy();
    expect(getByText('ดินขุดเหลือ +5,330 m³')).toBeTruthy();
    expect(getByText('จุดฐาน RTK 6 จุด (RMSE 1.1cm)')).toBeTruthy();
    for (const id of ['mission-export-btn', 'download-survey-btn'])
      expect(getByTestId(id).props.accessibilityLabel).toBe('ส่งออกรายงาน (เร็วๆ นี้)');

    await fireEvent.press(getByLabelText('เส้นชั้นความสูง'));
    expect(getByText('เส้นชั้นความสูงจากการประมาณค่า (ช่วง 0.5m)')).toBeTruthy();

    await fireEvent.press(getByLabelText('แผนที่สีระดับความสูง'));
    expect(getByText('แบบจำลองพื้นผิวเชิงเลข (-2.4m ถึง +18.2m)')).toBeTruthy();
  });

  // Pins the screen's English, word for word as it was before the text moved into en.json.
  it('keeps its English text', async () => {
    const { getByText } = await renderScreen();

    for (const text of [
      'RTK Processed • High Precision',
      '2D Ortho',
      'Elevation DSM',
      'Contours (0.5m)',
      'Area: 42,500 m²',
      'Excavation (Cut)',
      'Bedrock & subgrade',
      'Embankment (Fill)',
      'Compacted fill',
      'Net Soil Balance',
      'LandXML Ready',
      'Mission Metadata',
      'Sensor Model',
      'Ground Control (GCP)',
      'Coordinate System',
    ])
      expect(getByText(text)).toBeTruthy();
  });
});
