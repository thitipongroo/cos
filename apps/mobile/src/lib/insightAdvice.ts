// The "Recommendation" block the AI panels draw under their prose
// (mockup 06_project_manager/02_procurement — lightbulb · "Recommendation" · one line of guidance).
//
// IT IS LABELLED FOR WHAT THE REPORT ACTUALLY RETURNED, not for what the drawing captioned. The four
// report types the gateway serves do not all carry advice:
//
//   EXECUTIVE_SUMMARY   → `recommendations: string[]`  — genuinely advice.
//   PROCUREMENT_SUMMARY → `risk_items: string[]`       — things that are WRONG, not what to do.
//   DELAY_RISK          → `risk_factors: string[]`     — same.
//   SITE_SUMMARY        → `key_issues: string[]`       — same.
//
// So the procurement panel, whose drawing shows "Recommendation: Review alternative vendors…", is
// backed by a schema with no recommendations field at all. Printing a risk item under the word
// "Recommendation" would put advice-shaped framing around a finding the model never offered as
// advice — the reader would act on it as a suggested course. The block therefore reports its own
// kind, and the panel prints the matching label.

/** What the block is showing. `recommendation` = the model said to do it; `risk` = it flagged it. */
export type AdviceKind = 'recommendation' | 'risk';

export interface InsightAdvice {
  kind: AdviceKind;
  text: string;
}

/** The first usable string in an array-valued field, or null. */
function firstOf(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    if (typeof item === 'string' && item.trim() !== '') return item.trim();
  }
  return null;
}

/**
 * The one line of guidance to print under the summary, or null when the report carried none.
 *
 * Recommendations outrank risks: if a report offers both, what to DO is more useful under a heading
 * than what is wrong, and the prose above has already said what is wrong.
 *
 * Only the FIRST is shown. The panel is a glance inside a dashboard, and a model that returned six
 * recommendations has not thereby earned six lines of a manager's attention — the full report is
 * what `/ai/reports/history` is for.
 */
export function insightAdvice(content: Record<string, unknown>): InsightAdvice | null {
  const recommendation = firstOf(content['recommendations']);
  if (recommendation !== null) return { kind: 'recommendation', text: recommendation };

  for (const field of ['risk_items', 'risk_flags', 'risk_factors', 'key_issues']) {
    const risk = firstOf(content[field]);
    if (risk !== null) return { kind: 'risk', text: risk };
  }
  return null;
}
