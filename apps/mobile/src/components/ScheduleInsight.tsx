// The schedule Insight panel (mockup 03_site_engineer/03_tasks/01_se_tasks "Insight").
//
// Binds <InsightPanel /> to the delay-risk report, and teaches the panel to read a schema that has
// no prose field — see api/ai.ts `generateDelayRisk` for why this report type and not another, and
// InsightPanel's `bodyFrom` for the mismatch that made the props necessary.

import { generateDelayRisk } from '../api/ai';
import { delayFactors, delayLevel } from '../lib/delayInsight';
import { InsightPanel } from './InsightPanel';

export function ScheduleInsight({
  projectId,
  projectLabel,
}: {
  projectId: string;
  /** What to call the project on the "Source:" line; defaults to the id. */
  projectLabel?: string;
}): React.JSX.Element {
  return (
    <InsightPanel
      testID="schedule-insight"
      projectId={projectId}
      projectLabel={projectLabel}
      generate={generateDelayRisk}
      titleKey="tasks.insightTitle"
      icon="memory"
      levelFrom={delayLevel}
      bodyFrom={delayFactors}
      showAdvice={false}
    />
  );
}
