// The VIEWER budget screen (mockup/mobile/role_viewer/07_budget/01_budget).
//
// The tallest screen in this role's set and, until ADR-103's routes are wired in, entirely drawn.
// So the assertions are about the things a later edit breaks invisibly: BOTH money formats going
// through `@cos/financial` (the summary cards are compact, the BOQ rows exact — the drawing itself
// uses both), the absorption bar agreeing with its own legend, the AI card obeying the footer
// standard, and nothing on the screen being able to amend a budget.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { I18nProvider } from '../../i18n';
import { ViewerBudgetDocument } from '../ViewerBudgetDocument';
import {
  VIEWER_BOQ_CATEGORIES,
  VIEWER_BUDGET_ABSORPTION,
  VIEWER_BUDGET_FORECAST,
  VIEWER_BUDGET_LOG,
  VIEWER_BUDGET_SUMMARY,
} from '../../lib/mockupFigures';

function renderScreen() {
  return render(
    <I18nProvider>
      <ViewerBudgetDocument />
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

describe('ViewerBudgetDocument', () => {
  it('draws the context row with the read-only pill', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('budget-context')).toBeTruthy());
    expect(getByTestId('budget-context')).toHaveTextContent(/read only/i);
  });

  it('prints the three summary figures in the compact money format', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('budget-total')).toBeTruthy());
    // `฿ 124.5 M`, `฿ 84.21 M`, `฿ 62.45 M` — `compactMoneyLabel`'s output. Digits and scale, not
    // the symbol: that is the locale's.
    expect(getByTestId('budget-total')).toHaveTextContent(/124[.,]5/);
    expect(getByTestId('budget-committed')).toHaveTextContent(/84[.,]21/);
    expect(getByTestId('budget-actual')).toHaveTextContent(/62[.,]45/);
  });

  it('prints the BOQ rows in the EXACT money format, which is a different one', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('budget-boq-structural')).toBeTruthy());
    // The drawing writes `฿ 45,000,000.00` on these rows and `฿ 124.5 M` above them. A budget line
    // is read to the satang; a headline is not. `formatMoney` and `compactMoneyLabel` are both used
    // deliberately, and this assertion is what stops the two being collapsed into one.
    expect(getByTestId('budget-boq-structural')).toHaveTextContent(/45[,.\s]?000[,.\s]?000/);
  });

  it('sizes each absorption segment from the register, and lists every one in the legend', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('budget-absorption')).toBeTruthy());
    for (const seg of VIEWER_BUDGET_ABSORPTION.value) {
      const style = getByTestId(`budget-segment-${seg.key}`).props.style as { width: string };
      expect(style.width).toBe(`${seg.pct}%`);
      expect(getByTestId('budget-absorption')).toHaveTextContent(new RegExp(`${seg.pct}`));
    }
  });

  it('draws every BOQ division the register holds', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('budget-absorption')).toBeTruthy());
    for (const cat of VIEWER_BOQ_CATEGORIES.value) {
      expect(getByTestId(`budget-boq-${cat.key}`)).toHaveTextContent(
        new RegExp(cat.division.split(' ')[0]?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') ?? ''),
      );
    }
  });

  it('foots the forecast with its confidence and a record set this repository has', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('budget-forecast-foot')).toBeTruthy());
    const foot = getByTestId('budget-forecast-foot');
    expect(foot).toHaveTextContent(new RegExp(`${VIEWER_BUDGET_FORECAST.value.confidence}%`));
    expect(foot).toHaveTextContent(/assigned projects/i);
  });

  it('draws all three audit-log entries', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('budget-log')).toBeTruthy());
    for (const entry of VIEWER_BUDGET_LOG.value) {
      expect(getByTestId(`budget-log-${entry.key}`)).toBeTruthy();
    }
  });

  it('renders nothing that can amend, approve or create', async () => {
    const { getByTestId, root } = await renderScreen();

    await waitFor(() => expect(getByTestId('viewer-budget')).toBeTruthy());

    // §20.7.9, tested on the PROPERTY rather than on the words. Searching the copy for /approve/ was
    // the first attempt and it was wrong: the audit log's own entry reads "Disbursement IPC #08
    // approved" — a record of something that already happened, which is exactly what a VIEWER is
    // here to read.
    //
    // The second attempt was wrong the other way. It asserted the host tree carried ZERO press
    // handlers and called that read-only; the first capture showed what that shipped — `DETAILS ›`,
    // `EXPAND`, a chevron plate on every BOQ card and log row, all answering nothing. READ-ONLY IS
    // NOT UNTAPPABLE: §20.7.9 forbids create, edit and approve, and opening a detail is a read.
    //
    // So the count is now EXACT rather than zero, and it is derived from the register so it cannot
    // drift: the three summary cards, the photo's EXPAND, one per BOQ division and one per log
    // entry. The FINANCE screen behind the same route offers "request an amendment"; a control that
    // did anything but raise the coming-soon dialog would break the test below, and an extra
    // control of any kind breaks this one.
    const expected = 4 + VIEWER_BOQ_CATEGORIES.value.length + VIEWER_BUDGET_LOG.value.length;
    const hosts = hostNodes(root);
    // Guard against a walker that silently finds nothing and passes.
    expect(hosts.filter((n) => n.props.testID === 'budget-total')).toHaveLength(1);
    expect(hosts.filter((n) => n.props.onResponderRelease !== undefined)).toHaveLength(expected);
  });

  it('answers on every drawn affordance rather than leaving one dead', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('budget-total')).toBeTruthy());

    // Every one of these needs a detail view this role has no route to. Drawn, and each says so on
    // the press — asserted across all of them rather than on a sample, because the defect this
    // replaced was exactly one card being missed.
    const ids = [
      'budget-total',
      'budget-committed',
      'budget-actual',
      'budget-expand',
      ...VIEWER_BOQ_CATEGORIES.value.map((c) => `budget-boq-${c.key}`),
      ...VIEWER_BUDGET_LOG.value.map((e) => `budget-log-${e.key}`),
    ];
    for (const id of ids) {
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

  it('keeps the summary arithmetic the drawing itself asserts', async () => {
    // 84.21 / 124.5 = 67.6%, and 62.45 / 124.5 = 50.2% against the drawing's 50.1 — within the
    // rounding it prints. Checked here because the register holds the percentages SEPARATELY from
    // the amounts, so the two can drift silently and a screenshot would not show it.
    const s = VIEWER_BUDGET_SUMMARY.value;
    expect((s.committed / s.total) * 100).toBeCloseTo(s.committedPctOfCap, 0);
    expect((s.actual / s.total) * 100).toBeCloseTo(s.burnedPct, 0);
  });
});
