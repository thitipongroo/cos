// The VIEWER insights page (mockup/mobile/role_viewer/04_insights/01_analytics).
//
// Every figure on this screen is drawn, so the assertions worth having are about the two things a
// drawn screen can still get wrong: the severity bar must agree with the counts printed above it —
// it is DERIVED from them rather than copied from the drawing's rounded percentages — and the AI
// card must not foot with the drawing's "Logistics Hub", a system this repository does not have.

import { render, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import { ProjectInsightsDocument } from '../ProjectInsightsDocument';
import {
  VIEWER_ISSUE_SEVERITY,
  VIEWER_RISK_FORECAST,
  VIEWER_SAFETY_PERFORMANCE,
} from '../../lib/mockupFigures';

function renderInsights() {
  return render(
    <I18nProvider>
      <ProjectInsightsDocument />
    </I18nProvider>,
  );
}

describe('ProjectInsightsDocument', () => {
  it('draws all four cards', async () => {
    const { getByTestId } = await renderInsights();

    await waitFor(() => expect(getByTestId('insights-screen')).toBeTruthy());
    expect(getByTestId('insights-progress')).toBeTruthy();
    expect(getByTestId('insights-safety')).toBeTruthy();
    expect(getByTestId('insights-risk')).toBeTruthy();
    expect(getByTestId('insights-severity')).toBeTruthy();
  });

  it('prints the safety figures the register holds', async () => {
    const { getByTestId } = await renderInsights();

    await waitFor(() => expect(getByTestId('insights-safety')).toBeTruthy());
    const card = getByTestId('insights-safety');
    // Formatted through Intl (QM-3), so the group separator is the locale's — match the digits.
    expect(card).toHaveTextContent(/42[,.\s]?500/);
    expect(card).toHaveTextContent(
      new RegExp(String(VIEWER_SAFETY_PERFORMANCE.value.zeroIncidentDays)),
    );
  });

  it('prints every severity count', async () => {
    const { getByTestId } = await renderInsights();

    await waitFor(() => expect(getByTestId('insights-severity')).toBeTruthy());
    const card = getByTestId('insights-severity');
    for (const count of Object.values(VIEWER_ISSUE_SEVERITY.value)) {
      expect(card).toHaveTextContent(new RegExp(String(count)));
    }
  });

  it('sizes the severity bar from those counts, so the two cannot disagree', async () => {
    const { getByTestId } = await renderInsights();

    await waitFor(() => expect(getByTestId('insights-bar-critical')).toBeTruthy());
    const counts = VIEWER_ISSUE_SEVERITY.value;
    const total = counts.critical + counts.high + counts.medium + counts.low;

    for (const key of ['critical', 'high', 'medium', 'low'] as const) {
      const style = getByTestId(`insights-bar-${key}`).props.style as { width: string };
      expect(style.width).toBe(`${(counts[key] / total) * 100}%`);
    }
  });

  it('foots the risk card with the model’s confidence and a record set this repository has', async () => {
    const { getByTestId } = await renderInsights();

    await waitFor(() => expect(getByTestId('insights-risk-foot')).toBeTruthy());
    const foot = getByTestId('insights-risk-foot');
    expect(foot).toHaveTextContent(new RegExp(`${VIEWER_RISK_FORECAST.value.confidence}%`));
    expect(foot).toHaveTextContent(/assigned projects/i);
    // The drawing foots this card "Data: Logistics Hub". <AiCardFooter />'s contract forbids naming
    // a system this repository does not have (ADR-098 amendment 2).
    expect(foot).not.toHaveTextContent(/Logistics Hub/);
  });

  it('draws no standing "coming soon" or "unavailable" text anywhere on the page', async () => {
    const { queryByText } = await renderInsights();

    expect(queryByText(/coming soon/i)).toBeNull();
    expect(queryByText(/unavailable/i)).toBeNull();
  });

  // ── THE 2026-09-11 REDRAW ─────────────────────────────────────────────────────────────────────
  //
  // Stitch redrew this screen and the four assertions below are what changed structurally. They are
  // here because a revert to the previous composition still renders, still passes every test above,
  // and would only be caught by looking at a capture.

  it('opens with the five-range filter, one of them already chosen', async () => {
    const { getByTestId } = await renderInsights();

    await waitFor(() => expect(getByTestId('insights-screen')).toBeTruthy());
    for (const range of ['quarter', '7d', '30d', 'ytd', 'all']) {
      expect(getByTestId(`insights-range-${range}`)).toBeTruthy();
    }
    // The chosen chip is a View, not a Pressable — pressing what is already chosen must do nothing,
    // and there is no second range to switch to until this screen is wired to real data.
    expect(getByTestId('insights-range-quarter').props.onStartShouldSetResponder).toBeUndefined();
    expect(getByTestId('insights-range-7d').props.onStartShouldSetResponder).toBeDefined();
  });

  it('carries a named action on each of the four cards', async () => {
    const { getByTestId } = await renderInsights();

    await waitFor(() => expect(getByTestId('insights-screen')).toBeTruthy());
    // The redraw replaced four bare chevrons with labelled pills. A pill that lost its label reads
    // as decoration, which is the state §32.7 had the FINANCE forecast deleted for.
    for (const id of ['detailed-metrics', 'logs', 'view-evidence', 'view-all']) {
      const action = getByTestId(`insights-${id}`);
      expect(action.props.accessibilityRole).toBe('button');
      expect(String(action.props.accessibilityLabel ?? '').length).toBeGreaterThan(0);
    }
  });

  it('totals the severity chip from the rows rather than printing the drawing’s number', async () => {
    const { getByTestId } = await renderInsights();

    await waitFor(() => expect(getByTestId('insights-severity')).toBeTruthy());
    const counts = VIEWER_ISSUE_SEVERITY.value;
    const total = counts.critical + counts.high + counts.medium + counts.low;
    // The drawing writes 275 and 12 + 34 + 87 + 142 is 275. Asserted on the SUM so the chip cannot
    // survive a change to any row.
    expect(getByTestId('insights-severity')).toHaveTextContent(new RegExp(`${total}`));
  });

  it('makes every severity row an affordance, not a line of text', async () => {
    const { getByTestId } = await renderInsights();

    await waitFor(() => expect(getByTestId('insights-severity')).toBeTruthy());
    for (const id of ['critical', 'high', 'medium', 'low']) {
      expect(getByTestId(`insights-severity-${id}`).props.accessibilityRole).toBe('button');
    }
  });
});
