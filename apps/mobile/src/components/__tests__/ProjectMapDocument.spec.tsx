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

  // ── THE 2026-09-11 REDRAW ─────────────────────────────────────────────────────────────────────

  it('carries the state on the pin label itself', async () => {
    const { getByTestId } = await renderMap();

    await waitFor(() => expect(getByTestId('map-pin-0')).toBeTruthy());
    // The redraw folded the pin's state into its label as `Site Alpha · • On track`, so a pin says
    // what it is without the sheet being read. The bare third pin gains nothing.
    expect(getByTestId('map-pin-0')).toHaveTextContent(/Site Alpha/);
    expect(getByTestId('map-pin-0')).toHaveTextContent(/On track/i);
    expect(getByTestId('map-pin-1')).toHaveTextContent(/Delayed/i);
    expect(getByTestId('map-pin-2')).not.toHaveTextContent(/On track/i);
  });

  it('caps the sheet and scrolls its list, which the first capture proved it must', async () => {
    const { getByTestId } = await renderMap();

    await waitFor(() => expect(getByTestId('map-sheet')).toBeTruthy());
    // At the cap the second site row was cut off mid-figure with nothing to reach it. The cap keeps
    // the map above a map; the ScrollView is what makes the cap survivable. Both or neither.
    const sheet = getByTestId('map-sheet').props.style as { maxHeight?: string };
    expect(sheet.maxHeight).toBe('52%');
    expect(getByTestId('map-sheet-list')).toBeTruthy();
  });

  it('makes each site row a control and leaves the sheet’s own chrome ornament', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByTestId } = await renderMap();
    await waitFor(() => expect(getByTestId('map-sheet')).toBeTruthy());

    // A site row carries a round chevron plate, so it is a control and answers on the press — no
    // per-site screen exists for this role. The grab handle and the collapse chevron beside
    // "3 VISIBLE" are the opposite case: ornament on a panel that cannot be dragged, drawn because
    // the drawing draws them, pressable by nothing.
    //
    // Counted rather than asserted one at a time, so the two claims hold together: the number of
    // press handlers ANYWHERE under the sheet must equal the number of rows. A pressable grab
    // handle would push it up; a row that lost its press would pull it down.
    const pressable = hostNodes(getByTestId('map-sheet')).filter(
      (n) => n.props.onResponderRelease !== undefined,
    );
    expect(pressable).toHaveLength(VIEWER_MAP_SITES.value.rows.length);

    fireEvent.press(getByTestId(`map-site-${VIEWER_MAP_SITES.value.rows[0]?.ref}`));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    alert.mockRestore();
  });
});

type HostNode = { type: string; props: Record<string, unknown>; children: unknown[] };

/** Every host element under `node`, flattened. Host elements expose type/props/children only. */
function hostNodes(node: unknown, out: HostNode[] = []): HostNode[] {
  if (typeof node !== 'object' || node === null) return out;
  const host = node as HostNode;
  if (host.props !== undefined) out.push(host);
  for (const child of host.children ?? []) hostNodes(child, out);
  return out;
}
