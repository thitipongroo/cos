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
    client.get.mockResolvedValue([execRow('proj-1', 62, 0), execRow('proj-2', 118, 1)]);
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

  it('reports a failed generation instead of leaving the card blank', async () => {
    client.post.mockRejectedValue(new Error('gateway down'));

    const { getByTestId } = await renderScreen();

    await waitFor(() =>
      expect(getByTestId('exec-reports-prose')).toHaveTextContent(/not produced/i),
    );
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

    await waitFor(() => expect(getAllByTestId(/^exec-reports-row-/)).toHaveLength(2));
    const rows = getAllByTestId(/^exec-reports-row-/);
    // proj-2 is over 100% utilisation, which `executiveSeverityOf` calls CRITICAL.
    expect(rows[0]).toHaveTextContent(/Harbour Works/);
    expect(rows[0]).toHaveTextContent(/CRITICAL/i);
    expect(rows[0]).toHaveTextContent(/18% budget gap/);
    expect(rows[1]).toHaveTextContent(/Riverside Tower/);
    expect(rows[1]).toHaveTextContent(/SECURE/i);
  });

  it('filters to the band the tab asks for, and the two tabs cover every project', async () => {
    // Every row is either "needs attention" or "on track" — a filter a project can hide behind is
    // how something gets missed.
    const { getByTestId, getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId(/^exec-reports-row-/)).toHaveLength(2));
    expect(getByTestId('exec-reports-tab-attention')).toHaveTextContent(/\(1\)/);
    expect(getByTestId('exec-reports-tab-onTrack')).toHaveTextContent(/\(1\)/);

    await fireEvent.press(getByTestId('exec-reports-tab-onTrack'));
    await waitFor(() => expect(getAllByTestId(/^exec-reports-row-/)).toHaveLength(1));
    expect(getAllByTestId(/^exec-reports-row-/)[0]).toHaveTextContent(/Riverside Tower/);
  });

  it('re-analyses on demand, which is the one control that does what it says', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
    await fireEvent.press(getByTestId('exec-reports-reanalyse'));
    await waitFor(() => expect(client.post).toHaveBeenCalledTimes(2));
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
