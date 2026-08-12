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
  titleKey = 'site.insight.title',
  icon = 'auto-awesome',
}: {
  projectId: string;
  /** What to call the project on the "Source:" line; defaults to the id. */
  projectLabel?: string;
  /**
   * The panel's own heading. Two screens carry this same SITE_SUMMARY report and their drawings name
   * it differently — the issue board's says INSIGHT over a list of issues, the reports screen's says
   * INSIGHT over a list of reports (PO decision 2026-08-12) — so the caller names it rather than one
   * word being stretched to cover both.
   */
  titleKey?: string;
  icon?: React.ComponentProps<typeof InsightPanel>['icon'];
}): React.JSX.Element {
  return (
    <InsightPanel
      testID="site-insight"
      projectId={projectId}
      projectLabel={projectLabel}
      generate={generateSiteSummary}
      titleKey={titleKey}
      // `auto_awesome`, which IS what both drawings put on this panel and which the MaterialIcons
      // set does carry (PO decision 2026-08-12: "ใช้ไอคอนเหมือนใน mockup"). It replaced `memory`,
      // chosen earlier only because the reports drawing's `smart_toy` has no MaterialIcons
      // equivalent — the issue board's drawing settles it with a glyph that does.
      icon={icon}
    />
  );
}
