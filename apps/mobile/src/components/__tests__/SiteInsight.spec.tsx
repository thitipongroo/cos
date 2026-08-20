// Behaviour of <SiteInsight /> — the binding between the AI panel and the site-summary report.
//
// THIS FILE IS A BINDING, SO WHAT IT BINDS IS ALL THERE IS TO TEST. <InsightPanel /> is covered on
// its own; what has to hold here is that this one calls `generateSiteSummary` and nothing else, and
// that its two defaults are the ones its two callers rely on.
//
// TWO SCREENS CARRY THE SAME REPORT UNDER DIFFERENT HEADINGS (PO 2026-08-12): the issue board's
// drawing says INSIGHT over a list of issues, the reports screen's says INSIGHT over a list of
// reports. The caller names it rather than one word being stretched to cover both — so the title key
// is a prop with a default, and a regression that hardcoded either heading would silently mislabel
// the other screen.
//
// THE GLYPH IS `auto-awesome`, which is what both drawings put on this panel and which MaterialIcons
// does carry (PO 2026-08-12: "ใช้ไอคอนเหมือนใน mockup"). It replaced `memory`, chosen earlier only
// because the reports drawing's `smart_toy` has no MaterialIcons equivalent — the issue board's
// drawing settles it with a glyph that does exist.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import { useAuthStore } from '../../store/authStore';
import { SiteInsight } from '../SiteInsight';

const mockGenerate = jest.fn();
jest.mock('../../api/ai', () => ({
  generateSiteSummary: (params: unknown) => mockGenerate(params),
}));

/** A token carrying the tenant claim every report body requires. */
function tokenWith(claims: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(claims), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return 'eyJhbGciOiJSUzI1NiJ9.' + body + '.sig';
}

function renderPanel(props: Record<string, unknown> = {}) {
  return render(
    <I18nProvider>
      <SiteInsight projectId="proj-1" {...props} />
    </I18nProvider>,
  );
}

describe('SiteInsight', () => {
  beforeEach(() => {
    mockGenerate.mockReset().mockResolvedValue({
      report_id: 'r-1',
      report_type: 'SITE_SUMMARY',
      content: { summary: 'Four issues opened on level three this week.' },
      confidence: 0.9,
      low_confidence: false,
    });
    useAuthStore.setState({ accessToken: tokenWith({ tenant_id: 'tenant-9' }) } as never);
  });

  it('renders the panel under its own testID', async () => {
    const { getByTestId } = await renderPanel();

    expect(getByTestId('site-insight')).toBeTruthy();
  });

  // SITE_SUMMARY is the report behind an issues panel rather than a new report type — see api/ai.ts.
  it('asks for the site summary, on the project it was given', async () => {
    const { getByTestId } = await renderPanel();

    await fireEvent.press(getByTestId('insight-run'));

    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1));
    expect(mockGenerate).toHaveBeenCalledWith({ projectId: 'proj-1', tenantId: 'tenant-9' });
  });

  it('shows what the report said', async () => {
    const { getByTestId, getByText } = await renderPanel();

    await fireEvent.press(getByTestId('insight-run'));

    await waitFor(() =>
      expect(getByText('Four issues opened on level three this week.')).toBeTruthy(),
    );
  });

  // ── THE HEADING, WHICH BELONGS TO THE CALLER ─────────────────────────────────────────────────

  // The issue board's drawing says INSIGHT over a list of issues.
  it('heads the issue board panel by default', async () => {
    const { getByText } = await renderPanel();

    expect(getByText('Site insight')).toBeTruthy();
  });

  // The reports screen's says INSIGHT over a list of reports — and NOT "site insight", because on a
  // screen already headed by the project bar the word "site" was saying it twice.
  it('takes the heading its host names', async () => {
    const { getByText, queryByText } = await renderPanel({ titleKey: 'site.reports.insightTitle' });

    expect(getByText('Insight')).toBeTruthy();
    expect(queryByText('Site insight')).toBeNull();
  });

  // ── THE GLYPH ────────────────────────────────────────────────────────────────────────────────

  // `auto-awesome` is what both drawings put here, and it exists in MaterialIcons — unlike the
  // reports drawing's `smart_toy`, which is why the panel briefly wore `memory` instead.
  it('wears the glyph both drawings put on this panel', async () => {
    const { getByText } = await renderPanel();

    expect(getByText('auto-awesome')).toBeTruthy();
  });

  it('lets a host override the glyph', async () => {
    const { getByText, queryByText } = await renderPanel({ icon: 'memory' });

    expect(getByText('memory')).toBeTruthy();
    expect(queryByText('auto-awesome')).toBeNull();
  });

  // ── NAMING THE SOURCE ────────────────────────────────────────────────────────────────────────

  // The panel names the project the figures came from; without a label that is the raw id, which is
  // thirty-six characters of noise in a sentence meant to say whose findings these are.
  it('passes the project name through to the source line', async () => {
    const { getByText } = await renderPanel({ projectLabel: 'Riverside Tower' });

    expect(getByText(/Riverside Tower/)).toBeTruthy();
  });

  it('falls back to the id when no name was given', async () => {
    const { getByText } = await renderPanel();

    expect(getByText(/proj-1/)).toBeTruthy();
  });
});
