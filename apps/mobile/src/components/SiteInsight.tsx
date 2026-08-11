// The site Insight panel (mockup 03_site_engineer/02_issues/02_se_issue_dashboard "Insight").
//
// The panel itself is <InsightPanel />; this file is what binds it to the site-summary report, the
// same way ProcurementInsight binds the procurement one. See api/ai.ts `generateSiteSummary` for why
// SITE_SUMMARY is the report behind an issues panel rather than a new report type, and
// InsightPanel.tsx for why the drawing's own confidence figure is never rendered as given.

import { generateSiteSummary } from '../api/ai';
import { InsightPanel } from './InsightPanel';

export function SiteInsight({
  projectId,
  projectLabel,
}: {
  projectId: string;
  /** What to call the project on the "Source:" line; defaults to the id. */
  projectLabel?: string;
}): React.JSX.Element {
  return (
    <InsightPanel
      testID="site-insight"
      projectId={projectId}
      projectLabel={projectLabel}
      generate={generateSiteSummary}
      titleKey="site.insight.title"
      // `memory`, as on three of the four existing panels — the drawing's `smart_toy` is not in the
      // MaterialIcons set this project standardised on (§32.7), and inventing a fifth glyph for a
      // fourth identical panel would make the same thing look like a different thing.
      icon="memory"
    />
  );
}
