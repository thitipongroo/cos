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

/** Every usable string in an array-valued field, in order. Empty when the field is absent or junk. */
function stringsIn(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    .map((item) => item.trim());
}

/** The first usable string in an array-valued field, or null. */
function firstOf(value: unknown): string | null {
  return stringsIn(value)[0] ?? null;
}

/**
 * EVERY recommendation the report carried — the executive Report screen's "Strategic
 * Recommendations" list (mockup 08_executive/04_report/01_ex_report, which draws two bullets).
 *
 * SEPARATE FROM `insightAdvice` ON PURPOSE, and the difference is the whole reason both exist. That
 * function returns ONE line because it feeds a dashboard panel, where a model returning six
 * recommendations has not earned six lines of a manager's attention. This screen IS the report: a
 * page whose subject is what the model advised, where truncating to one would hide advice the reader
 * came to read.
 *
 * `recommendations` is a real field on EXECUTIVE_SUMMARY (api/ai.ts) — nothing here is drawn.
 * Returns [] for every other report type, so a caller that binds this to the wrong report renders an
 * empty section rather than a list of risk items relabelled as advice.
 */
export function recommendationList(content: Record<string, unknown>): string[] {
  return stringsIn(content['recommendations']);
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
