// Behaviour of <InsightPanel /> — the AI panel every manager screen draws.
//
// NOTHING IS DRAWN UNTIL THE SERVER SAYS IT. The mockups print "CONF: 96%" and a finished
// recommendation; both are placeholders in a drawing. This panel renders only what the response
// carries, which is why the tests below spend most of their time on what it does when the response
// carries LESS than the drawing assumed.
//
// THE BUTTON IS THE POINT. No mockup draws one (PO 2026-08-11) because the drawings show a panel
// already full of prose, implying a report produced somewhere out of sight — and this product has
// nowhere out of sight: `POST /ai/reports/*` is the only way to obtain a report's text, and
// `/ai/reports/history` returns metadata with no `content`. Without the button the panel could only
// fill itself by generating on every screen open, and §26 meters AI per tenant against a monthly
// quota. The button is the difference between a report someone asked for and a bill nobody
// authorised — so "it does not generate on mount" is asserted here as a spending rule, not a
// rendering detail.
//
// AND THE ADVICE BLOCK IS LABELLED FOR WHAT THE REPORT RETURNED, not for what the drawing
// captioned. PROCUREMENT_SUMMARY has no recommendations field at all — it has `risk_items`, which
// are things that are WRONG, not things to do. Printing one under the word "Recommendation" would
// put advice-shaped framing around a finding the model never offered as advice, and the reader
// would act on it as a suggested course.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import { useAuthStore } from '../../store/authStore';
import { InsightPanel, summaryText } from '../InsightPanel';

/** A token carrying the tenant claim the report body requires. */
function tokenWith(claims: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(claims), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return 'eyJhbGciOiJSUzI1NiJ9.' + body + '.sig';
}

function report(over: Record<string, unknown> = {}) {
  return {
    report_id: 'r-1',
    report_type: 'PROCUREMENT_SUMMARY',
    content: { summary: 'Three vendors are late on the same package.' },
    confidence: 0.92,
    low_confidence: false,
    ...over,
  };
}

function renderPanel(props: Record<string, unknown> = {}) {
  const generate = jest.fn().mockResolvedValue(report());
  const utils = render(
    <I18nProvider>
      <InsightPanel
        testID="panel"
        projectId="proj-1"
        titleKey="insight.action"
        generate={generate}
        {...props}
      />
    </I18nProvider>,
  );
  return { generate, utils };
}

describe('InsightPanel', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: tokenWith({ tenant_id: 'tenant-9' }) } as never);
  });

  // §26 meters AI per tenant against a monthly quota. A dashboard that reported on load would spend
  // the tenant's allowance every time someone tapped a tab.
  it('generates nothing until it is asked to', async () => {
    const { generate, utils } = renderPanel();
    const { getByTestId, queryByTestId } = await utils;

    expect(getByTestId('panel')).toBeTruthy();
    expect(generate).not.toHaveBeenCalled();
    expect(queryByTestId('insight-body')).toBeNull();
    expect(queryByTestId('insight-confidence')).toBeNull();
  });

  // Both ids, because every report request body requires both — and the tenant comes from the same
  // token the gateway verifies, which is what keeps the body and the credential consistent.
  it('asks for the report on the project and tenant it was given', async () => {
    const { generate, utils } = renderPanel();
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('insight-run'));

    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect(generate).toHaveBeenCalledWith({ projectId: 'proj-1', tenantId: 'tenant-9' });
  });

  it('shows the prose the report carried', async () => {
    const { utils } = renderPanel();
    const { getByTestId, getByText } = await utils;

    await fireEvent.press(getByTestId('insight-run'));

    await waitFor(() => expect(getByTestId('insight-body')).toBeTruthy());
    expect(getByText('Three vendors are late on the same package.')).toBeTruthy();
  });

  // ── HOW SURE, AND HOW BAD ────────────────────────────────────────────────────────────────────

  // A band with the number beside it, never a bare percentage: the band is the platform's own
  // reading of what that number means, and 92% on its own invites the reader to supply their own.
  it('reports the confidence as a band and a number', async () => {
    const { utils } = renderPanel();
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('insight-run'));

    await waitFor(() => expect(getByTestId('insight-confidence')).toBeTruthy());
    expect(String(getByTestId('insight-confidence').props.children)).toBeTruthy();
    expect(within(getByTestId('insight-confidence'))).toContain('92%');
  });

  // The gateway's own verdict outranks the number: a report the gateway called low-confidence is
  // low-confidence whatever figure came with it.
  it('believes the gateway over the figure when it says low confidence', async () => {
    const { generate, utils } = renderPanel();
    generate.mockResolvedValue(report({ confidence: 0.99, low_confidence: true }));
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('insight-run'));

    await waitFor(() => expect(getByTestId('insight-confidence')).toBeTruthy());
    expect(within(getByTestId('insight-confidence'))).toContain('Low');
  });

  // No figure at all is its own answer — "unknown", not a missing chip and not a 0%.
  it('says the confidence is unknown rather than printing nothing', async () => {
    const { generate, utils } = renderPanel();
    generate.mockResolvedValue(report({ confidence: null }));
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('insight-run'));

    await waitFor(() => expect(getByTestId('insight-confidence')).toBeTruthy());
    expect(within(getByTestId('insight-confidence'))).not.toContain('%');
  });

  // BESIDE the confidence, not instead of it: they answer different questions — how bad, and how
  // sure — and a panel showing only one of them answers the wrong one half the time.
  it('shows the report level beside the confidence when the report has one', async () => {
    const { generate, utils } = renderPanel({
      levelFrom: (content: Record<string, unknown>) =>
        typeof content['delay_risk_level'] === 'string' ? content['delay_risk_level'] : null,
    });
    generate.mockResolvedValue(
      report({ content: { summary: 'Rain has cost four days.', delay_risk_level: 'HIGH' } }),
    );
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('insight-run'));

    await waitFor(() => expect(getByTestId('insight-level')).toBeTruthy());
    expect(within(getByTestId('insight-level'))).toBe('HIGH');
    // BOTH chips. The level is not a substitute for the confidence.
    expect(getByTestId('insight-confidence')).toBeTruthy();
  });

  // Rendered as the model returned it, in the panel's ordinary chip: mapping LOW/MEDIUM/HIGH onto
  // colours would be this component inventing a severity scale the report does not define.
  it('shows no level chip when the report defines the field but leaves it empty', async () => {
    const { generate, utils } = renderPanel({
      levelFrom: (content: Record<string, unknown>) =>
        (content['delay_risk_level'] as string) ?? '',
    });
    generate.mockResolvedValue(report({ content: { summary: 'x', delay_risk_level: '' } }));
    const { getByTestId, queryByTestId } = await utils;

    await fireEvent.press(getByTestId('insight-run'));

    await waitFor(() => expect(getByTestId('insight-body')).toBeTruthy());
    expect(queryByTestId('insight-level')).toBeNull();
  });

  it('shows no level chip on a report that defines none', async () => {
    const { utils } = renderPanel();
    const { getByTestId, queryByTestId } = await utils;

    await fireEvent.press(getByTestId('insight-run'));

    await waitFor(() => expect(getByTestId('insight-body')).toBeTruthy());
    expect(queryByTestId('insight-level')).toBeNull();
  });

  // ── READING THE BODY ─────────────────────────────────────────────────────────────────────────

  // `content` is free-form per report type, so the default takes the FIRST string rather than
  // assuming a field name a template change could rename out from under it.
  it('finds the prose without being told the field name', () => {
    expect(summaryText({ headline: 'Vendor A is late' })).toBe('Vendor A is late');
    expect(summaryText({ count: 3, note: 'Second field' })).toBe('Second field');
  });

  it('treats a field of whitespace as no prose at all', () => {
    expect(summaryText({ summary: '   ' })).toBeNull();
  });

  // Nothing readable ⇒ the panel says the report carried no summary, rather than `[object Object]`.
  it('says the report carried no summary rather than rendering an object', async () => {
    const { generate, utils } = renderPanel();
    generate.mockResolvedValue(report({ content: { data_points_used: 42 } }));
    const { getByTestId, queryByText } = await utils;

    await fireEvent.press(getByTestId('insight-run'));

    await waitFor(() => expect(getByTestId('insight-body')).toBeTruthy());
    expect(queryByText(/\[object Object\]/)).toBeNull();
  });

  // THE CASE THAT FORCED `bodyFrom` (PO 2026-08-12): DELAY_RISK has no prose field — its fields are
  // `delay_risk_level`, `risk_factors`, `confidence`, `data_points_used` and a constant disclaimer —
  // so the first-string default prints the word "HIGH" as the panel's paragraph.
  it('reads a report that has no prose field the way its host says to', async () => {
    const { generate, utils } = renderPanel({
      bodyFrom: (content: Record<string, unknown>) =>
        (content['risk_factors'] as string[] | undefined)?.join('; ') ?? null,
      showAdvice: false,
    });
    generate.mockResolvedValue(
      report({
        content: { delay_risk_level: 'HIGH', risk_factors: ['Rain', 'Crane down'] },
      }),
    );
    const { getByTestId, getByText, queryByText } = await utils;

    await fireEvent.press(getByTestId('insight-run'));

    await waitFor(() => expect(getByTestId('insight-body')).toBeTruthy());
    expect(getByText('Rain; Crane down')).toBeTruthy();
    // Not the level word as the paragraph, which is what the default would have printed.
    expect(queryByText('HIGH')).toBeNull();
  });

  // ── THE ADVICE BLOCK, AND ITS LABEL ──────────────────────────────────────────────────────────

  // `recommendations` is genuinely advice: the model said to do it.
  it('labels a recommendation as one', async () => {
    const { generate, utils } = renderPanel();
    generate.mockResolvedValue(
      report({
        content: {
          summary: 'Spend is tracking to plan.',
          recommendations: ['Consolidate the two steel orders'],
        },
      }),
    );
    const { getByTestId, getByText } = await utils;

    await fireEvent.press(getByTestId('insight-run'));

    await waitFor(() => expect(getByTestId('insight-recommendation')).toBeTruthy());
    expect(getByText('Consolidate the two steel orders')).toBeTruthy();
  });

  // A risk item under the word "Recommendation" would be read as a suggested course of action.
  it('labels a risk item as a risk, not as advice', async () => {
    const { generate, utils } = renderPanel();
    generate.mockResolvedValue(
      report({
        content: {
          summary: 'Three vendors are late.',
          risk_items: ['Vendor A has missed two deliveries'],
        },
      }),
    );
    const { getByTestId, queryByTestId } = await utils;

    await fireEvent.press(getByTestId('insight-run'));

    await waitFor(() => expect(getByTestId('insight-risk')).toBeTruthy());
    expect(queryByTestId('insight-recommendation')).toBeNull();
  });

  it('draws no advice block on a report that offered none', async () => {
    const { utils } = renderPanel();
    const { getByTestId, queryByTestId } = await utils;

    await fireEvent.press(getByTestId('insight-run'));

    await waitFor(() => expect(getByTestId('insight-body')).toBeTruthy());
    expect(queryByTestId('insight-risk')).toBeNull();
    expect(queryByTestId('insight-recommendation')).toBeNull();
  });

  // Suppressed where the host's own `bodyFrom` already prints the array the block draws from, so
  // the panel does not say the same thing twice.
  it('holds the advice back when its host already printed it', async () => {
    const { generate, utils } = renderPanel({ showAdvice: false });
    generate.mockResolvedValue(report({ content: { summary: 'x', risk_factors: ['Rain'] } }));
    const { getByTestId, queryByTestId } = await utils;

    await fireEvent.press(getByTestId('insight-run'));

    await waitFor(() => expect(getByTestId('insight-body')).toBeTruthy());
    expect(queryByTestId('insight-risk')).toBeNull();
  });

  // ── FAILING, AND WAITING ─────────────────────────────────────────────────────────────────────

  it('says the report was not produced when the call fails', async () => {
    const { generate, utils } = renderPanel();
    generate.mockRejectedValue(new Error('offline'));
    const { getByTestId, queryByTestId } = await utils;

    await fireEvent.press(getByTestId('insight-run'));

    await waitFor(() => expect(generate).toHaveBeenCalled());
    expect(queryByTestId('insight-body')).toBeNull();
    expect(queryByTestId('insight-confidence')).toBeNull();
    expect(getByTestId('insight-run').props.accessibilityState.disabled).toBe(false);
  });

  // A failed retry must not leave the last successful report on screen under a fresh failure — the
  // reader would take stale prose for the answer to the question they just asked.
  it('clears the last report when a retry fails', async () => {
    const { generate, utils } = renderPanel();
    const { getByTestId, queryByTestId } = await utils;

    await fireEvent.press(getByTestId('insight-run'));
    await waitFor(() => expect(getByTestId('insight-body')).toBeTruthy());

    generate.mockRejectedValue(new Error('offline'));
    await fireEvent.press(getByTestId('insight-run'));

    await waitFor(() => expect(queryByTestId('insight-body')).toBeNull());
    expect(queryByTestId('insight-confidence')).toBeNull();
  });

  // Rule 40 — the loading state goes through <LoadingState />, and the button is shut while it runs
  // so a second press cannot bill the tenant twice for one question.
  it('shows the loading state and shuts the button while it runs', async () => {
    const { generate, utils } = renderPanel();
    generate.mockReturnValue(new Promise(() => undefined));
    const { getByTestId } = await utils;

    void fireEvent.press(getByTestId('insight-run'));
    await waitFor(() => expect(getByTestId('insight-loading')).toBeTruthy());

    expect(getByTestId('insight-run').props.accessibilityState.disabled).toBe(true);

    void fireEvent.press(getByTestId('insight-run'));

    expect(generate).toHaveBeenCalledTimes(1);
  });

  // Every report endpoint is project-scoped: with no project there is nothing to report on, and the
  // control says so rather than sending a request that cannot be answered.
  it('offers nothing to run before a project is chosen', async () => {
    const { generate, utils } = renderPanel({ projectId: '' });
    const { getByTestId } = await utils;

    expect(getByTestId('insight-run').props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(getByTestId('insight-run'));

    expect(generate).not.toHaveBeenCalled();
  });

  // TODAY'S BEHAVIOUR, PINNED RATHER THAN ENDORSED: with a token carrying no `tenant_id` the button
  // stays enabled and the press does nothing at all — no request, no error, no loading state. It
  // cannot happen to a signed-in user (the claim is on every token Keycloak issues), which is why it
  // has not bitten; but if it ever does, this is a control that looks live and is not.
  it('does nothing at all when the token carries no tenant', async () => {
    useAuthStore.setState({ accessToken: tokenWith({ sub: 'u-1' }) } as never);

    const { generate, utils } = renderPanel();
    const { getByTestId, queryByTestId } = await utils;

    await fireEvent.press(getByTestId('insight-run'));

    expect(generate).not.toHaveBeenCalled();
    expect(queryByTestId('insight-loading')).toBeNull();
    expect(getByTestId('insight-run').props.accessibilityState.disabled).toBe(false);
  });

  // ── NAMING THE SOURCE ────────────────────────────────────────────────────────────────────────
  //
  // PER PROJECT AND IT SAYS SO (PO 2026-08-10), taken over choosing a project silently and letting
  // one project's findings read as a tenant-wide statement.

  it('names the project the figures came from', async () => {
    const { utils } = renderPanel({ projectLabel: 'Riverside Tower' });
    const { getByText } = await utils;

    expect(getByText(/Riverside Tower/)).toBeTruthy();
  });

  // The id is the fallback, and it is a poor one — thirty-six characters of noise in a sentence
  // meant to tell the reader whose figures these are — but it is still an answer.
  it('falls back to the id when no name was given', async () => {
    const { utils } = renderPanel();
    const { getByText } = await utils;

    expect(getByText(/proj-1/)).toBeTruthy();
  });

  // ── THE TWO DRAWINGS ─────────────────────────────────────────────────────────────────────────
  //
  // The two mockups do not agree, so neither does this: `plain` is the procurement dashboard's
  // panel, `washed` the finance dashboard's teal field.

  it.each(['plain', 'washed'])('renders the %s drawing', async (variant) => {
    const { utils } = renderPanel({ variant });
    const { getByTestId } = await utils;

    expect(getByTestId('panel')).toBeTruthy();
    expect(getByTestId('insight-run')).toBeTruthy();
  });

  // Optional: the panels whose mockup has no follow-up button do not grow one.
  it('offers the follow-up only where its host asked for one', async () => {
    const onPress = jest.fn();

    const bare = await renderPanel().utils;
    expect(bare.queryByTestId('insight-follow-up')).toBeNull();

    const { utils } = renderPanel({ followUp: { labelKey: 'insight.action', onPress } });
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('insight-follow-up'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

/** Every string inside a node, joined — the chips nest their text one level down. */
function within(node: unknown): string {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  const n = node as { props?: { children?: unknown } };
  return [n.props?.children]
    .flat(3)
    .map((c) => within(c))
    .join('');
}
