// Behaviour of the EXECUTIVE half of /reports — the AI strategic brief.
//
// ONE ROUTE, TWO SCREENS. `/reports` is a list of site reports for the engineer and a report for the
// executive, chosen on the role claim. The split is asserted here because the failure is silent: an
// executive who fell through to the engineer's branch would get a working screen — the wrong one,
// listing another role's work under their own tab.
//
// REWRITTEN 2026-09-07 with the screen (mockup 08_executive/04_report/01_ex_report). What it
// replaced was a project picker, a GENERATE button and a paragraph, so the tests that pinned those
// controls are gone with them. WHAT SURVIVED, and had to: the role split, the tenant claim coming
// from the verified token, the attribution of the generation to a real user, one generation per
// mount, and the refusal to render a non-string summary.
//
// REBUILT AGAIN 2026-09-16 (revision R20, product-owner decisions D20–D26): the screen draws what the
// drawing draws, and a report that does not arrive falls to the drawing's own findings rather than a
// failure message. What is pinned below is the line between the two paths — the drawn content never
// sits beside a real report, and the report's own row never carries a drawn finding.
//
// THE ONE REGRESSION WORTH NAMING. The old screen distinguished a 503 — the Phase 11 LLM stub, i.e.
// "not yet" — from a real failure, and said so in different words. This screen reports one failure
// message, the shared `insight.failed`, because it now reads its report through the same helpers as
// the other five AI surfaces and none of them makes that distinction either. It is a real loss of
// nuance on one screen, traded for six surfaces that cannot disagree about what a failed report
// looks like. The test below pins the behaviour that remains rather than pretending the old one is
// still there.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { CosRole } from '@cos/types';
import { I18nProvider } from '../../../i18n';
import { useAuthStore } from '../../../store/authStore';
import ReportsScreen from '../reports';

jest.mock('../../../api/client', () => ({ get: jest.fn(), post: jest.fn(), mutate: jest.fn() }));
jest.mock('../../../api/projects', () => ({
  refreshProjectsCache: () => Promise.resolve(),
  getMyProjects: jest.fn(),
}));
jest.mock('../../../hooks/useCollection', () => ({
  useCollection: () => [{ projectId: 'proj-1', projectCode: 'PRJ-1' }],
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const client = require('../../../api/client') as { get: jest.Mock; post: jest.Mock };
const projectsApi = require('../../../api/projects') as { getMyProjects: jest.Mock };
/* eslint-enable @typescript-eslint/no-require-imports */

/** The token the screen reads `tenant_id` out of — authStore holds no tenant of its own. */
function tokenWith(claims: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(claims), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return 'eyJhbGciOiJSUzI1NiJ9.' + body + '.sig';
}

const PROJECTS = [
  {
    project_id: 'proj-1',
    project_code: 'PRJ-1',
    project_name: 'Riverside Tower',
    status: 'ACTIVE',
  },
  { project_id: 'proj-2', project_code: 'PRJ-2', project_name: 'Harbour Works', status: 'ACTIVE' },
  { project_id: 'proj-3', project_code: 'PRJ-3', project_name: 'Canal Bridge', status: 'ACTIVE' },
  { project_id: 'proj-4', project_code: 'PRJ-4', project_name: 'Depot Yard', status: 'ACTIVE' },
];

/** A full `/analytics/executive` row — the screen reads every one of these fields. */
function execRow(projectId: string, utilizationPct: number, atRisk: 0 | 1) {
  return {
    projectId,
    totalBudget: '1000.0000',
    totalActual: '900.0000',
    totalCommitted: '900.0000',
    utilizationPct,
    atRisk,
    overdueInvoiceCount: 0,
  };
}

function report(over: Record<string, unknown> = {}) {
  return {
    report_id: 'r-1',
    report_type: 'EXECUTIVE_SUMMARY',
    content: {
      executive_summary: 'Riverside is two days ahead.',
      recommendations: ['Approve the night shift', 'Review the Oceanfront BOQ'],
      risk_flags: ['Hold the next disbursement'],
    },
    confidence: 0.98,
    low_confidence: false,
    ...over,
  };
}

function renderScreen() {
  return render(
    <I18nProvider>
      <ReportsScreen />
    </I18nProvider>,
  );
}

describe('ReportsScreen (EXECUTIVE)', () => {
  beforeEach(() => {
    client.get.mockReset();
    client.post.mockReset();
    projectsApi.getMyProjects.mockReset();
    // proj-1 SECURE (the report's subject) · proj-2 CRITICAL (over 100%) · proj-3 MONITOR (at risk)
    // · proj-4 SECURE — one row of every band, and a SECURE row that is not the subject.
    client.get.mockResolvedValue([
      execRow('proj-1', 62, 0),
      execRow('proj-2', 118, 1),
      execRow('proj-3', 80, 1),
      execRow('proj-4', 50, 0),
    ]);
    projectsApi.getMyProjects.mockResolvedValue(PROJECTS);
    client.post.mockResolvedValue(report());
    useAuthStore.setState({
      role: CosRole.EXECUTIVE,
      userId: 'user-exec',
      accessToken: tokenWith({ tenant_id: 'tenant-9' }),
    } as never);
  });

  // The failure this guards is silent: the wrong screen still works.
  it('gives the executive the report, not the engineer list', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    expect(getByTestId('exec-reports-screen')).toBeTruthy();
    expect(queryByTestId('reports-screen')).toBeNull();
  });

  it('gives every other role the list', async () => {
    useAuthStore.setState({ role: CosRole.SITE_ENGINEER } as never);
    // The engineer's half reads a PAGED shape off the same client; the executive rows above would
    // reach it as reports with no date and take the screen down in render.
    client.get.mockResolvedValue({ items: [], total: 0 });

    const { getByTestId, queryByTestId } = await renderScreen();

    expect(getByTestId('reports-screen')).toBeTruthy();
    expect(queryByTestId('exec-reports-screen')).toBeNull();
  });

  it('generates once on mount, for the first project, naming the user who asked', async () => {
    // ONCE is the part that needs holding: §26 meters AI per tenant, so a re-render that generated
    // again would bill twice for one visit. `generated_by` is the audit row — the gateway defaults
    // it to the literal "system", and the previous version of this screen sent the real user, so
    // dropping it would have been a silent regression.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
    expect(client.post).toHaveBeenCalledWith('/ai/reports/executive-summary', {
      project_id: 'proj-1',
      tenant_id: 'tenant-9',
      generated_by: 'user-exec',
    });
    expect(getByTestId('exec-reports-brief')).toBeTruthy();
  });

  it('omits the attribution rather than sending a blank one', async () => {
    // The gateway's own default is what should apply when the client has no user to name;
    // `generated_by: ''` would overwrite it with nothing.
    useAuthStore.setState({ userId: null } as never);

    await renderScreen();

    await waitFor(() => expect(client.post).toHaveBeenCalled());
    expect(client.post.mock.calls[0]![1]).toEqual({
      project_id: 'proj-1',
      tenant_id: 'tenant-9',
    });
  });

  it('does not call the gateway when the token carries no tenant claim', async () => {
    // The body field is required and the gateway would reject it; refusing here keeps a pointless
    // request — and a pointless quota entry — off the wire.
    useAuthStore.setState({ accessToken: tokenWith({ sub: 'u' }) } as never);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('exec-reports-screen')).toBeTruthy());
    expect(client.post).not.toHaveBeenCalled();
  });

  it('names the project the report is about, because it is one project', async () => {
    // `ExecutiveSummaryRequest` requires a project_id, so this brief covers ONE of the portfolio's
    // projects. Saying which is what stops it reading as a statement about all of them.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('exec-reports-prose')).toBeTruthy());
    expect(getByTestId('exec-reports-brief')).toHaveTextContent(/Riverside Tower/);
  });

  it('shows the summary the model returned', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() =>
      expect(getByTestId('exec-reports-prose')).toHaveTextContent(/two days ahead/),
    );
  });

  // "[object Object]" in front of a board member.
  it('says so rather than printing a summary that is not text', async () => {
    client.post.mockResolvedValue(report({ content: { executive_summary: { text: 'nope' } } }));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(client.post).toHaveBeenCalled());
    expect(getByTestId('exec-reports-prose')).not.toHaveTextContent(/object Object/);
  });

  it("draws the drawing's brief when the generation fails, and never names a project for it", async () => {
    // D21: no report falls to the drawn path. The source line belongs to a real report (D26) — the
    // drawn paragraph describes no project this screen asked about.
    client.post.mockRejectedValue(new Error('gateway down'));

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() =>
      expect(getByTestId('exec-reports-prose')).toHaveTextContent(/Across all 14 projects/),
    );
    expect(getByTestId('exec-reports-prose')).toHaveTextContent(/11 projects/);
    // ICU plural (QM-3): the drawn "1 โครงการ" must not read "1 projects" in English.
    expect(getByTestId('exec-reports-prose')).toHaveTextContent(/over budget: 1 project$/);
    expect(queryByTestId('exec-reports-source')).toBeNull();
    expect(getByTestId('exec-reports-confidence')).toHaveTextContent(/CONF: 98%/);
  });

  it("puts the drawing's flag on the first CRITICAL row and its two lines under recommendations", async () => {
    client.post.mockRejectedValue(new Error('gateway down'));

    const { getByTestId, getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('exec-reports-flag')).toHaveLength(1));
    expect(getByTestId('exec-reports-row-proj-2')).toHaveTextContent(
      /holding the next disbursement/,
    );
    expect(getByTestId('exec-reports-recommendations')).toHaveTextContent(/Metro Expressway/);
    expect(getByTestId('exec-reports-recommendations')).toHaveTextContent(/milestone #12/);
    expect(getByTestId('exec-reports-acknowledge').props.accessibilityState.disabled).toBe(false);
  });

  it('never mixes the drawn findings with a real report', async () => {
    const { getByTestId, getAllByTestId } = await renderScreen();

    await waitFor(() =>
      expect(getByTestId('exec-reports-prose')).toHaveTextContent(/two days ahead/),
    );
    expect(getByTestId('exec-reports-prose')).not.toHaveTextContent(/14 projects/);
    expect(getByTestId('exec-reports-recommendations')).not.toHaveTextContent(/Metro Expressway/);
    expect(getAllByTestId('exec-reports-flag')).toHaveLength(1);
    expect(getByTestId('exec-reports-row-proj-2')).not.toHaveTextContent(/disbursement/);
    expect(getByTestId('exec-reports-source')).toHaveTextContent(/Riverside Tower/);
  });

  it('draws SOURCES on both paths, CONF from the report when there is one, and no MODEL chip', async () => {
    // D25. 0.87 so the real figure cannot be mistaken for the drawn 98.
    client.post.mockResolvedValue(report({ confidence: 0.87 }));

    const { getByTestId } = await renderScreen();

    await waitFor(() =>
      expect(getByTestId('exec-reports-confidence')).toHaveTextContent(/CONF: 87%/),
    );
    expect(getByTestId('exec-reports-chips')).toHaveTextContent(/SOURCES: 14\/14 SITES/);
    // Removed by the product owner on 2026-09-17.
    expect(getByTestId('exec-reports-chips')).not.toHaveTextContent(/MODEL/);
    expect(getByTestId('exec-reports-window')).toHaveTextContent('7d Summary');
    // One title line — the "AI Strategic Brief" eyebrow was removed (product owner 2026-09-17).
    expect(getByTestId('exec-reports-brief-title')).toHaveTextContent('Portfolio status summary');
    expect(getByTestId('exec-reports-brief')).not.toHaveTextContent(/strategic brief/i);
  });

  it('shows the band word when the report carries no percentage', async () => {
    client.post.mockResolvedValue(report({ confidence: null }));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(client.post).toHaveBeenCalled());
    await waitFor(() =>
      expect(getByTestId('exec-reports-confidence')).not.toHaveTextContent(/CONF: 98%/),
    );
  });

  it("keeps the report's own row free of drawn copy, and gives it the report's confidence", async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() =>
      expect(getByTestId('exec-reports-row-proj-1')).toHaveTextContent(/Conf: 98%/),
    );
    expect(queryByTestId('exec-reports-summary-proj-1')).toBeNull();
    expect(getByTestId('exec-reports-row-proj-1')).toHaveTextContent(/38% under budget/);
    expect(getByTestId('exec-reports-row-proj-1')).not.toHaveTextContent(/Ahead/);
  });

  it("draws each other row's paragraph and trend by its band, with the real utilisation", async () => {
    // D22. SECURE: "+1.2% Ahead • Budget: 50% Utilized" (utilisation real). MONITOR: "-2.8% Delay
    // Risk • Conf: 94%". CRITICAL: the real budget gap only.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('exec-reports-row-proj-4')).toHaveTextContent(/Ahead/));
    expect(getByTestId('exec-reports-row-proj-4')).toHaveTextContent(/\+1\.2% Ahead/);
    expect(getByTestId('exec-reports-row-proj-4')).toHaveTextContent(/50% Utilized/);
    expect(getByTestId('exec-reports-summary-proj-4')).toHaveTextContent(/Level 24/);
    expect(getByTestId('exec-reports-row-proj-3')).toHaveTextContent(/-2\.8% Delay Risk/);
    expect(getByTestId('exec-reports-row-proj-3')).toHaveTextContent(/Conf: 94%/);
    expect(getByTestId('exec-reports-summary-proj-3')).toHaveTextContent(/P-14/);
    expect(getByTestId('exec-reports-row-proj-2')).toHaveTextContent(/\+18% Budget Gap/);
    expect(getByTestId('exec-reports-summary-proj-2')).toHaveTextContent(/INV-9921/);
  });

  it('keeps every card title on one line, cut with an ellipsis', async () => {
    // Product owner 2026-09-17: a long project name must not push the card onto a second title line.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('exec-reports-title-proj-2')).toBeTruthy());
    const title = getByTestId('exec-reports-title-proj-2');
    expect(title.props.numberOfLines).toBe(1);
    expect(title.props.ellipsizeMode).toBe('tail');
    expect(title.props.accessibilityLabel).toBe('Harbour Works');
  });

  it('marks a CRITICAL row that is not over budget with its headroom', async () => {
    // CRITICAL comes from utilisation above 100 today, but the footer must not print a negative gap
    // if the severity rule ever widens — the headroom wording is the branch that covers it.
    client.get.mockResolvedValue([execRow('proj-1', 62, 0), execRow('proj-2', 100.4, 0)]);

    const { getByTestId } = await renderScreen();

    await waitFor(() =>
      expect(getByTestId('exec-reports-row-proj-2')).toHaveTextContent(/CRITICAL/),
    );
    expect(getByTestId('exec-reports-row-proj-2')).toHaveTextContent(/0% under budget/);
  });

  it('prints EVERY recommendation the model gave, not the first', async () => {
    // The dashboard panels show one — a model returning six has not earned six lines of a manager's
    // glance. This screen IS the report, so truncating would hide advice the reader came to read.
    const { getByTestId } = await renderScreen();

    await waitFor(() =>
      expect(getByTestId('exec-reports-recommendations')).toHaveTextContent(/night shift/),
    );
    expect(getByTestId('exec-reports-recommendations')).toHaveTextContent(/Oceanfront BOQ/);
  });

  it('says the report offered no advice rather than drawing an empty list', async () => {
    client.post.mockResolvedValue(report({ content: { executive_summary: 'Fine.' } }));

    const { getByTestId } = await renderScreen();

    await waitFor(() =>
      expect(getByTestId('exec-reports-recommendations')).toHaveTextContent(/no recommendations/i),
    );
  });

  it('puts the AI flag on the ONE project the report is about', async () => {
    // A flag copied onto every card would attribute a finding to projects the model never looked at.
    const { getByTestId, getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('exec-reports-flag')).toHaveLength(1));
    expect(getByTestId('exec-reports-row-proj-1')).toHaveTextContent(/Hold the next disbursement/);
    expect(getByTestId('exec-reports-row-proj-2')).not.toHaveTextContent(/Hold the next/);
  });

  it('sorts the summaries worst-first and bands them by the shared severity rule', async () => {
    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId(/^exec-reports-row-/)).toHaveLength(4));
    const rows = getAllByTestId(/^exec-reports-row-/);
    // proj-2 is over 100% utilisation, which `executiveSeverityOf` calls CRITICAL; proj-3 is at risk.
    expect(rows[0]).toHaveTextContent(/Harbour Works/);
    expect(rows[0]).toHaveTextContent(/CRITICAL/);
    expect(rows[1]).toHaveTextContent(/Canal Bridge/);
    expect(rows[1]).toHaveTextContent(/MONITOR/);
    expect(rows[2]).toHaveTextContent(/SECURE/);
  });

  it('filters as drawn: Critical is CRITICAL only with its count, On track is SECURE with none', async () => {
    // D24. MONITOR rows are in neither filter and are reached from All.
    const { getByTestId, getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId(/^exec-reports-row-/)).toHaveLength(4));
    expect(getByTestId('exec-reports-tab-critical')).toHaveTextContent('Critical (1)');
    expect(getByTestId('exec-reports-tab-onTrack')).toHaveTextContent('On track');
    expect(getByTestId('exec-reports-tab-onTrack')).not.toHaveTextContent(/\(/);

    await fireEvent.press(getByTestId('exec-reports-tab-critical'));
    await waitFor(() => expect(getAllByTestId(/^exec-reports-row-/)).toHaveLength(1));
    expect(getAllByTestId(/^exec-reports-row-/)[0]).toHaveTextContent(/Harbour Works/);

    await fireEvent.press(getByTestId('exec-reports-tab-onTrack'));
    await waitFor(() => expect(getAllByTestId(/^exec-reports-row-/)).toHaveLength(2));

    await fireEvent.press(getByTestId('exec-reports-tab-all'));
    await waitFor(() => expect(getAllByTestId(/^exec-reports-row-/)).toHaveLength(4));
  });

  it('says there is nothing to report when a filter leaves no rows', async () => {
    client.get.mockResolvedValue([execRow('proj-1', 62, 0)]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('exec-reports-row-proj-1')).toBeTruthy());
    await fireEvent.press(getByTestId('exec-reports-tab-critical'));
    await waitFor(() => expect(getByTestId('exec-reports-empty')).toBeTruthy());
  });

  it('re-analyses on demand, which is the one control that does what it says', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
    await fireEvent.press(getByTestId('exec-reports-reanalyse'));
    await waitFor(() => expect(client.post).toHaveBeenCalledTimes(2));
  });

  it('offers a full-report link on every summary, and it writes nothing', async () => {
    // COMING SOON: `/ai/reports/history` returns metadata only, so no past report's TEXT can be
    // re-displayed and there is no page to open. Drawn because the drawing draws it (PO 2026-09-07).
    const { getAllByTestId, getByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId(/^exec-reports-full-/)).toHaveLength(4));
    // The words are back beside the chevron (D20).
    expect(getByTestId('exec-reports-full-proj-1')).toHaveTextContent(/Full report/);
    await fireEvent.press(getByTestId('exec-reports-full-proj-1'));

    expect(client.post).toHaveBeenCalledTimes(1); // the report on mount, and nothing else
  });

  it('disables Acknowledge until there is a recommendation to acknowledge', async () => {
    client.post.mockResolvedValue(report({ content: { executive_summary: 'Fine.' } }));

    const { getByTestId } = await renderScreen();

    await waitFor(() =>
      expect(getByTestId('exec-reports-acknowledge').props.accessibilityState.disabled).toBe(true),
    );
  });

  it('enables Acknowledge once the model has advised something', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() =>
      expect(getByTestId('exec-reports-acknowledge').props.accessibilityState.disabled).toBe(false),
    );
  });

  it('draws the export and acknowledge controls, and neither writes anything', async () => {
    // Asserting they EXIST is what stops a later tidy-up from silently deleting the drawing; master
    // §Phase 10 makes this role READ-ONLY on mobile, so neither may ever gain a write.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('exec-reports-export')).toBeTruthy());
    await fireEvent.press(getByTestId('exec-reports-export'));
    await fireEvent.press(getByTestId('exec-reports-acknowledge'));

    expect(client.post).toHaveBeenCalledTimes(1); // the report, and nothing else
  });
});
