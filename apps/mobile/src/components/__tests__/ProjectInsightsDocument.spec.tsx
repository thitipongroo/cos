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
});
