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

  it('shows the report own confidence, never a number of its own', async () => {
    const { getByTestId } = await renderAlerts();
    await waitFor(() => expect(getByTestId('exec-risk-confidence')).toHaveTextContent(/94/));
  });

  it('falls back to the confidence BAND when the gateway reported no number', async () => {
    ai.generateDelayRisk.mockResolvedValue(report({ confidence: null, low_confidence: true }));
    const { getByTestId } = await renderAlerts();
    await waitFor(() => expect(getByTestId('exec-risk-confidence')).toBeTruthy());
    expect(getByTestId('exec-risk-confidence')).not.toHaveTextContent(/%/);
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

  it('reports a failed generation instead of leaving the last state on screen', async () => {
    ai.generateDelayRisk.mockRejectedValue(new Error('gateway down'));
    const { getByTestId, queryByTestId } = await renderAlerts();
    await waitFor(() => expect(queryByTestId('exec-risk-0')).toBeNull());
    expect(getByTestId('exec-risk-alerts')).toHaveTextContent(/not produced/i);
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

  it('no longer names the project — the source line was removed on 2026-09-07', async () => {
    // Recorded as a test rather than as an absence: the report IS per project, and this section
    // stopped saying which. If the line ever comes back, this is where the decision is written down.
    const { getByTestId } = await renderAlerts();
    await waitFor(() => expect(getByTestId('exec-risk-0')).toBeTruthy());
    expect(getByTestId('exec-risk-alerts')).not.toHaveTextContent(/Source:/i);
  });
});
