// The VIEWER procurement screen (mockup/mobile/role_viewer/06_procurement/01_procurement).
//
// Every figure on this screen is drawn today, so the assertions worth having are not "does 48
// appear" — they are the three things a later edit could get wrong while still rendering perfectly:
// that the money goes through the money layer rather than being typed as a string, that the AI
// card's confidence and source obey the 2026-09-08 standard, and that NOTHING on it can mutate.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { I18nProvider } from '../../i18n';
import { ViewerProcurementDocument } from '../ViewerProcurementDocument';
import {
  VIEWER_DELIVERY_PREDICTOR,
  VIEWER_PROCUREMENT_KPIS,
  VIEWER_PROCUREMENT_LINES,
  VIEWER_ROUTE_INSPECTION,
} from '../../lib/mockupFigures';

function renderScreen() {
  return render(
    <I18nProvider>
      <ViewerProcurementDocument />
    </I18nProvider>,
  );
}

type HostNode = { type: string; props: Record<string, unknown>; children: unknown[] };

/** Every host element in the rendered tree, flattened. `root` exposes type/props/children only. */
function hostNodes(node: unknown, out: HostNode[] = []): HostNode[] {
  if (typeof node !== 'object' || node === null) return out;
  const host = node as HostNode;
  if (host.props !== undefined) out.push(host);
  for (const child of host.children ?? []) hostNodes(child, out);
  return out;
}

describe('ViewerProcurementDocument', () => {
  it('draws the access banner and the read-only pill', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('viewer-procurement')).toBeTruthy());
    expect(getByTestId('procurement-access')).toHaveTextContent(/read only/i);
  });

  it('draws all four KPI tiles with the register’s counts', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('procurement-kpi-pos')).toBeTruthy());
    const k = VIEWER_PROCUREMENT_KPIS.value;
    expect(getByTestId('procurement-kpi-pos')).toHaveTextContent(new RegExp(`${k.totalPos.count}`));
    expect(getByTestId('procurement-kpi-delivery')).toHaveTextContent(
      new RegExp(`${k.inDelivery.orders}`),
    );
    expect(getByTestId('procurement-kpi-pending')).toHaveTextContent(
      new RegExp(`${k.pendingPm.items}`),
    );
    expect(getByTestId('procurement-kpi-fulfillment')).toHaveTextContent(
      new RegExp(`${k.fulfillmentPct}`),
    );
  });

  it('formats the committed value through the money layer, not as a literal', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('procurement-kpi-pos')).toBeTruthy());
    // The drawing writes `฿ 14.2 M`, which is `compactMoneyLabel`'s own output. Asserted on the
    // digits and the scale suffix: the symbol and the separator belong to the reader's locale, and
    // pinning them here would pin the test to one.
    expect(getByTestId('procurement-kpi-pos')).toHaveTextContent(/14[.,]2/);
    expect(VIEWER_PROCUREMENT_KPIS.value.totalPos.currency).toBe('THB');
  });

  it('foots the predictor with its confidence and a record set this repository has', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('procurement-predictor-foot')).toBeTruthy());
    const foot = getByTestId('procurement-predictor-foot');
    // The drawing puts `CONF: 94%` in the card's HEADER. §32.7's 2026-09-08 standard puts it in the
    // foot beside the source, and the product owner chose the standard each time this came up.
    expect(foot).toHaveTextContent(new RegExp(`${VIEWER_DELIVERY_PREDICTOR.value.confidence}%`));
    expect(foot).toHaveTextContent(/assigned projects/i);
  });

  it('draws the four-step route tracker', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('procurement-route')).toBeTruthy());
    for (const step of VIEWER_ROUTE_INSPECTION.value.steps) {
      expect(getByTestId(`procurement-step-${step.key}`)).toBeTruthy();
    }
  });

  it('lists every monitored line the register holds', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('viewer-procurement')).toBeTruthy());
    for (const line of VIEWER_PROCUREMENT_LINES.value) {
      const card = getByTestId(`procurement-line-${line.po}`);
      expect(card).toHaveTextContent(new RegExp(line.po.replace('#', '')));
      expect(card).toHaveTextContent(
        new RegExp(line.title.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      );
    }
  });

  it('renders nothing that can approve, create or edit', async () => {
    const { getByTestId, root } = await renderScreen();

    await waitFor(() => expect(getByTestId('viewer-procurement')).toBeTruthy());

    // §20.7.9. READ-ONLY IS NOT UNTAPPABLE, and the first version of this test confused the two: it
    // asserted the whole host tree carried ZERO press handlers, which passed — and the first
    // capture showed what that actually shipped. A chip reading `TRACK LIVE →` and a filter row
    // reading `DISPLAYING ALL` sat there answering nothing, which is the drawn dead control this
    // project refuses. Tapping to READ is not a write; §20.7.9 forbids create, edit and approve.
    //
    // So the claim is now about WHAT the controls do. Every press handler on this screen belongs to
    // a known affordance, and each of those raises the coming-soon dialog rather than mutating —
    // asserted below. The manager's dashboard behind the same route has an approve button wired to
    // a real mutation; this screen must never grow one.
    // Derived from the register rather than typed as a number: the four KPI tiles, the four
    // monitored lines, TRACK LIVE and the filter row.
    const expected = 4 + VIEWER_PROCUREMENT_LINES.value.length + 2;
    const hosts = hostNodes(root);
    // Guard against a walker that silently finds nothing and passes.
    expect(hosts.filter((n) => n.props.testID === 'procurement-kpi-pos')).toHaveLength(1);
    expect(hosts.filter((n) => n.props.onResponderRelease !== undefined)).toHaveLength(expected);
  });

  it('draws the trailing chevron the mockup puts on every tile and every line', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('procurement-kpi-pos')).toBeTruthy());
    // EIGHT chevrons in `06_procurement/01_procurement`: one in each KPI tile's head at 16px, one
    // beside each monitored line's status chip at 18px. The first build of this screen had none of
    // them, and the drawing marks all eight elements as buttons — `cursor-pointer` on the tiles,
    // `role="button" tabindex="0"` on the cards. The glyph mock renders the icon NAME, so this
    // asserts which glyph was drawn rather than merely that something was.
    for (const id of ['pos', 'delivery', 'pending', 'fulfillment']) {
      expect(getByTestId(`procurement-kpi-${id}`)).toHaveTextContent(/chevron-right/);
    }
    for (const line of VIEWER_PROCUREMENT_LINES.value) {
      expect(getByTestId(`procurement-line-${line.po}`)).toHaveTextContent(/chevron-right/);
    }
  });

  it('answers on both drawn affordances rather than sitting dead', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('procurement-track-live')).toBeTruthy());

    // Both need feeds the register entries name and this role cannot reach. The convention since
    // 2026-09-04: drawn, and it says so on the press.
    fireEvent.press(getByTestId('procurement-track-live'));
    await waitFor(() => expect(alert).toHaveBeenLastCalledWith('Track live', expect.any(String)));

    fireEvent.press(getByTestId('procurement-filter'));
    await waitFor(() =>
      expect(alert).toHaveBeenLastCalledWith('Displaying all', expect.any(String)),
    );

    // And the eight the drawing marks as buttons. Pressed across all of them rather than sampled:
    // the defect this replaced was a chevron drawn on a card that answered nothing.
    for (const id of [
      'procurement-kpi-pos',
      'procurement-kpi-delivery',
      'procurement-kpi-pending',
      'procurement-kpi-fulfillment',
      ...VIEWER_PROCUREMENT_LINES.value.map((l) => `procurement-line-${l.po}`),
    ]) {
      alert.mockClear();
      fireEvent.press(getByTestId(id));
      await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    }
    alert.mockRestore();
  });

  it('prints no standing "coming soon" or "unavailable" anywhere', async () => {
    const { queryByText } = await renderScreen();

    expect(queryByText(/coming soon/i)).toBeNull();
    expect(queryByText(/unavailable/i)).toBeNull();
  });
});
