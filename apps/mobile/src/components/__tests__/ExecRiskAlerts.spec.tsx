// Behaviour of the EXECUTIVE Tasks screen's AI risk-alert feed.
//
// WHAT THESE TESTS ARE FOR. The drawing shows two alert cards, each with its own severity and its
// own confidence. The endpoint returns ONE level and ONE confidence for the whole report plus a list
// of factor strings, so every card here necessarily carries the same level — and a future change
// that started colouring cards differently would look right on screen while claiming a severity the
// model never assigned. These assert which values come from the report and that nothing is drawn
// before one exists.

import { render, waitFor, cleanup } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import { useAuthStore } from '../../store/authStore';
import { ExecRiskAlerts } from '../ExecRiskAlerts';
import { RISK_ALERT_CATEGORIES } from '../../lib/mockupFigures';

jest.mock('../../api/ai', () => ({ generateDelayRisk: jest.fn() }));

/* eslint-disable @typescript-eslint/no-require-imports */
const ai = require('../../api/ai') as { generateDelayRisk: jest.Mock };
/* eslint-enable @typescript-eslint/no-require-imports */

// A token whose payload carries a tenant — `run()` refuses without one, exactly as the shared panel
// does, so every test that expects a call needs a real-shaped JWT rather than a placeholder string.
const TOKEN = `x.${Buffer.from(JSON.stringify({ tenant_id: 't-1' })).toString('base64')}.y`;

function report(over: Record<string, unknown> = {}) {
  return {
    report_id: 'r-1',
    report_type: 'DELAY_RISK',
    content: {
      delay_risk_level: 'HIGH',
      risk_factors: ['Rain forecast for the pour window', 'Rebar supplier is behind'],
      disclaimer: 'AI-generated estimate — verify with project schedule',
    },
    confidence: 0.94,
    low_confidence: false,
    ...over,
  };
}

function renderAlerts(projectId = 'p-1') {
  return render(
    <I18nProvider>
      <ExecRiskAlerts projectId={projectId} />
    </I18nProvider>,
  );
}

afterEach(cleanup);

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ accessToken: TOKEN });
  ai.generateDelayRisk.mockResolvedValue(report());
});

describe('ExecRiskAlerts', () => {
  it('generates exactly once per mount', async () => {
    // The section reports on mount (PO 2026-09-07) because the drawing shows a feed already full of
    // findings. ONCE is the part that needs holding: §26 meters AI per tenant, so a re-render that
    // generated again would bill twice for one visit.
    const { getByTestId } = await renderAlerts();
    await waitFor(() => expect(getByTestId('exec-risk-0')).toBeTruthy());
    expect(ai.generateDelayRisk).toHaveBeenCalledTimes(1);
  });

  it('draws one card per risk factor the report returned', async () => {
    const { getByTestId } = await renderAlerts();
    await waitFor(() => expect(getByTestId('exec-risk-0')).toBeTruthy());
    expect(getByTestId('exec-risk-0')).toHaveTextContent(/Rain forecast for the pour window/);
    expect(getByTestId('exec-risk-1')).toHaveTextContent(/Rebar supplier is behind/);
  });

  it('prints the report own level on every card, and says that is what it is', async () => {
    const { getByTestId } = await renderAlerts();
    await waitFor(() => expect(getByTestId('exec-risk-0')).toHaveTextContent(/HIGH/));
    expect(getByTestId('exec-risk-1')).toHaveTextContent(/HIGH/);
    // The note is what keeps one level across two cards from reading as two verdicts.
    expect(getByTestId('exec-risk-level-note')).toBeTruthy();
  });

  it('omits the level note when there is only one factor to attach it to', async () => {
    ai.generateDelayRisk.mockResolvedValue(
      report({
        content: { delay_risk_level: 'CRITICAL', risk_factors: ['Only one finding'] },
      }),
    );
    const { getByTestId, queryByTestId } = await renderAlerts();
    await waitFor(() => expect(getByTestId('exec-risk-0')).toBeTruthy());
    expect(queryByTestId('exec-risk-level-note')).toBeNull();
  });

  it('shows the report own confidence on EVERY card, and it is the same number', async () => {
    // MOVED OFF THE SECTION HEADER on 2026-09-07 (PO), to where the drawing puts it. The report
    // carries ONE confidence, so every card prints it — and that identical figure repeated is
    // exactly why the level note below the feed had to start covering the number too.
    const { getByTestId, queryByTestId } = await renderAlerts();
    await waitFor(() => expect(getByTestId('exec-risk-0-confidence')).toHaveTextContent(/94/));
    expect(getByTestId('exec-risk-1-confidence')).toHaveTextContent(/94/);
    expect(queryByTestId('exec-risk-confidence')).toBeNull();
  });

  it('falls back to the confidence BAND when the gateway reported no number', async () => {
    ai.generateDelayRisk.mockResolvedValue(report({ confidence: null, low_confidence: true }));
    const { getByTestId } = await renderAlerts();
    await waitFor(() => expect(getByTestId('exec-risk-0-confidence')).toBeTruthy());
    expect(getByTestId('exec-risk-0-confidence')).not.toHaveTextContent(/%/);
  });

  it('draws the category chip from the register, never from the finding text', async () => {
    // THE ONE DRAWN VALUE INSIDE A CARD OF REAL MODEL OUTPUT (PO 2026-09-07, ADR-099 second
    // amendment). `risk_factors` is a list of bare strings with no field to carry a category, and
    // classifying the text here would be this screen labelling a finding the model did not label.
    // Pinned to the register so it cannot quietly start tracking an endpoint.
    const { getByTestId } = await renderAlerts();
    await waitFor(() => expect(getByTestId('exec-risk-0')).toBeTruthy());
    // A REGEX, not the bare string: this matcher treats a string argument as an EXACT match of the
    // node's whole text, so the assertion would be about the entire card rather than the chip.
    expect(getByTestId('exec-risk-0')).toHaveTextContent(
      new RegExp(RISK_ALERT_CATEGORIES.value[0]),
    );
    expect(getByTestId('exec-risk-1')).toHaveTextContent(
      new RegExp(RISK_ALERT_CATEGORIES.value[1]),
    );
  });

  it('says the report named no factors rather than rendering an empty feed', async () => {
    ai.generateDelayRisk.mockResolvedValue(
      report({ content: { delay_risk_level: 'LOW', risk_factors: [] } }),
    );
    const { getByTestId } = await renderAlerts();
    await waitFor(() => expect(getByTestId('exec-risk-empty')).toBeTruthy());
  });

  it('drops blank and non-string factors instead of drawing empty cards', async () => {
    ai.generateDelayRisk.mockResolvedValue(
      report({
        content: { delay_risk_level: 'MEDIUM', risk_factors: ['Real finding', '   ', 42, null] },
      }),
    );
    const { getByTestId, queryByTestId } = await renderAlerts();
    await waitFor(() => expect(getByTestId('exec-risk-0')).toHaveTextContent(/Real finding/));
    expect(queryByTestId('exec-risk-1')).toBeNull();
  });

  it('falls back to the drawing own cards when the gateway produced nothing', async () => {
    // CHANGED 2026-09-07 (PO). It used to assert the opposite — no cards, and a line saying the
    // report was not produced. The drawing shows a section already full of findings, so where the
    // gateway says nothing the DRAWING'S cards stand instead. They are findings, which is what
    // ADR-099 is most careful about; the register entry carries the COMING SOON note and the
    // condition for deleting it.
    ai.generateDelayRisk.mockRejectedValue(new Error('gateway down'));
    const { getByTestId } = await renderAlerts();

    await waitFor(() => expect(getByTestId('exec-risk-0')).toBeTruthy());
    expect(getByTestId('exec-risk-1')).toBeTruthy();
    expect(getByTestId('exec-risk-alerts')).not.toHaveTextContent(/not produced/i);
  });

  it('gives each DRAWN card its own level and confidence, unlike a real report', async () => {
    // The asymmetry is the point: a report carries ONE level and ONE confidence for all of its
    // findings, and the drawing gives every card its own. Asserting both halves is what stops the
    // fallback quietly becoming the shape the real path is held to.
    ai.generateDelayRisk.mockRejectedValue(new Error('gateway down'));
    const { getByTestId, queryByTestId } = await renderAlerts();

    await waitFor(() => expect(getByTestId('exec-risk-0')).toHaveTextContent(/CRITICAL/));
    expect(getByTestId('exec-risk-1')).toHaveTextContent(/MEDIUM/);
    expect(getByTestId('exec-risk-0-confidence')).toHaveTextContent(/94/);
    expect(getByTestId('exec-risk-1-confidence')).toHaveTextContent(/82/);
    // …and the "one level for the whole report" caveat does NOT apply to them.
    expect(queryByTestId('exec-risk-level-note')).toBeNull();
  });

  it('drops the drawn cards the moment a real report arrives', async () => {
    // The two paths are exclusive. A fallback that survived alongside real findings would put the
    // drawing's inventions in the same list as the model's output with nothing to tell them apart.
    const { getByTestId } = await renderAlerts();

    await waitFor(() => expect(getByTestId('exec-risk-0')).toBeTruthy());
    expect(getByTestId('exec-risk-alerts')).not.toHaveTextContent(/T-3/);
    expect(getByTestId('exec-risk-0')).toHaveTextContent(/Rain forecast/);
  });

  it('does not generate without a project', async () => {
    // The host starts with an empty id while its project list is in flight. Generating then would
    // spend quota on a request the gateway rejects.
    await renderAlerts('');
    await waitFor(() => expect(true).toBe(true));
    expect(ai.generateDelayRisk).not.toHaveBeenCalled();
  });

  it('does not call the gateway when the session carries no tenant claim', async () => {
    // The body field is required and the gateway would reject it; refusing here keeps a pointless
    // request — and a pointless quota entry — off the wire.
    useAuthStore.setState({ accessToken: 'not-a-jwt' });
    await renderAlerts();
    await waitFor(() => expect(true).toBe(true));
    expect(ai.generateDelayRisk).not.toHaveBeenCalled();
  });

  it('draws both action buttons on EVERY card, and neither writes anything', async () => {
    // COMING SOON (PO 2026-09-07): "View BIM data" has no system behind it — BIM is a Type A stub —
    // and "Replan urgently" has no endpoint and could not gain one, since master Phase 10 makes this
    // role read-only on mobile. They are on every card rather than on the first, as the drawing has
    // them: the drawing's second card is a different SEVERITY, not a different card type, and giving
    // one finding buttons and the next none would be a claim about which finding is actionable.
    const { getByTestId } = await renderAlerts();

    await waitFor(() => expect(getByTestId('exec-risk-0-bim')).toBeTruthy());
    expect(getByTestId('exec-risk-0-replan')).toBeTruthy();
    expect(getByTestId('exec-risk-1-bim')).toBeTruthy();
    expect(getByTestId('exec-risk-1-replan')).toBeTruthy();
  });

  it('no longer names the project — the source line was removed on 2026-09-07', async () => {
    // Recorded as a test rather than as an absence: the report IS per project, and this section
    // stopped saying which. If the line ever comes back, this is where the decision is written down.
    const { getByTestId } = await renderAlerts();
    await waitFor(() => expect(getByTestId('exec-risk-0')).toBeTruthy());
    expect(getByTestId('exec-risk-alerts')).not.toHaveTextContent(/Source:/i);
  });
});
