// The procurement Insights panel (mockup 06_project_manager/01_home "INSIGHTS · 98% CONFIDENCE",
// and the same panel on 02_procurement).
//
// The panel itself is <InsightPanel />; this file is what binds it to the procurement-summary report.
// It was the whole component until the Finance screen needed the same panel around a different
// report type — see InsightPanel.tsx for why the drawing's figures are never rendered as given.
//
// `summaryText` is re-exported because it moved with the panel and callers should not have to know
// that it did.

import { generateProcurementSummary } from '../api/ai';
import { InsightPanel } from './InsightPanel';

export { summaryText } from './InsightPanel';

export function ProcurementInsight({
  projectId,
  projectLabel,
}: {
  projectId: string;
  /** What to call the project on the "Source:" line; defaults to the id. */
  projectLabel?: string;
}): React.JSX.Element {
  return (
    <InsightPanel
      testID="procurement-insight"
      projectId={projectId}
      projectLabel={projectLabel}
      generate={generateProcurementSummary}
      // The drawing's own heading for this panel, which is more specific than "Insights" and matches
      // the report it actually asks for.
      titleKey="pm.procurement.analysisTitle"
      icon="memory"
    />
  );
}
