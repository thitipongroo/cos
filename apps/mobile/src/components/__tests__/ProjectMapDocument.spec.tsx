// The VIEWER project map (mockup/mobile/role_viewer/03_map/01_map_viewer).
//
// The screen is drawn whole and reads nothing, so what is worth pinning is the part a later edit
// could quietly get wrong: that every one of the four map controls is present AND says so on a
// press. They are the reason this screen can exist at all with the GIS engine undecided (§28, V2-1
// entry) — a control that silently did nothing instead would be the drawn dead button this project
// keeps refusing to ship.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { I18nProvider } from '../../i18n';
import { ProjectMapDocument } from '../ProjectMapDocument';
import { VIEWER_MAP_PINS, VIEWER_MAP_SITES } from '../../lib/mockupFigures';

const CONTROLS = ['zoom-in', 'zoom-out', 'locate', 'layers'] as const;

function renderMap() {
  return render(
    <I18nProvider>
      <ProjectMapDocument />
    </I18nProvider>,
  );
}

describe('ProjectMapDocument', () => {
  it('draws one pin per registered position', async () => {
    const { getByTestId } = await renderMap();

    await waitFor(() => expect(getByTestId('project-map')).toBeTruthy());
    VIEWER_MAP_PINS.value.forEach((_pin, index) => {
      expect(getByTestId(`map-pin-${index}`)).toBeTruthy();
    });
  });

  it('labels the pins the drawing labels and leaves the third bare', async () => {
    const { getByText, getByTestId } = await renderMap();

    await waitFor(() => expect(getByTestId('project-map')).toBeTruthy());
    expect(getByText('Site Alpha')).toBeTruthy();
    expect(getByText('Metro Exp.')).toBeTruthy();
    // The third pin carries no label in the drawing, so it carries none here.
    expect(VIEWER_MAP_PINS.value[2]?.label).toBeNull();
  });

  it.each(CONTROLS)('says coming soon when the %s control is pressed', async (control) => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByTestId } = await renderMap();
    await waitFor(() => expect(getByTestId(`map-control-${control}`)).toBeTruthy());

    fireEvent.press(getByTestId(`map-control-${control}`));

    // Each of the four needs the GIS engine §28 defers. None prints anything on the page.
    expect(alert).toHaveBeenCalled();
    alert.mockRestore();
  });

  it('lists the sheet rows with their reference, completion and issue count', async () => {
    const { getByTestId } = await renderMap();

    await waitFor(() => expect(getByTestId('map-sheet')).toBeTruthy());
    for (const row of VIEWER_MAP_SITES.value.rows) {
      const node = getByTestId(`map-site-${row.ref}`);
      expect(node).toHaveTextContent(new RegExp(row.ref.replace('#', '')));
      expect(node).toHaveTextContent(new RegExp(`${row.completion}%`));
      expect(node).toHaveTextContent(new RegExp(`${row.issues}`));
    }
  });

  it('draws no standing "coming soon" or "unavailable" text anywhere on the page', async () => {
    const { queryByText } = await renderMap();

    // The product owner's standing rule since 2026-09-10: an unbuilt control says so ON THE PRESS.
    expect(queryByText(/coming soon/i)).toBeNull();
    expect(queryByText(/unavailable/i)).toBeNull();
  });
});
