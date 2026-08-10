// The Finance dashboard's insight panel (mockup 06_project_manager/03_finance "Insight · CONF: 96%").
//
// IT IS NOT LABELLED "BUDGET INSIGHT", and that is deliberate. The drawing's panel reads as a budget
// analysis; the AI gateway serves four report types and none of them is about budget (see
// `generateExecutiveSummary` in api/ai.ts for the full list and the choice). This binds the panel to
// EXECUTIVE_SUMMARY — cross-domain project health written for a project owner, which is the closest
// thing the platform actually produces — and names it for what comes back. Calling it a budget
// analysis would be putting the drawing's caption on someone else's report.
//
// Every money figure on the Finance screen comes from the finance API, never from this text. The
// executive prompt itself forbids the model inventing budget figures, and the screen is built so a
// model that did anyway could not put the number in front of a manager as fact.

import { generateExecutiveSummary } from '../api/ai';
import { InsightPanel } from './InsightPanel';

export function PortfolioInsight({ projectId }: { projectId: string }): React.JSX.Element {
  return (
    <InsightPanel
      testID="portfolio-insight"
      projectId={projectId}
      generate={generateExecutiveSummary}
      titleKey="pm.finance.insightTitle"
    />
  );
}
